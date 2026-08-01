// js/features/tasks/bindEvents.js
window.App = window.App || {};

/**
 * Привязывает обработчики событий для таблицы задач: поиск, модалка задачи,
 * drag & drop строк, сортировка, фильтры, выбор строки клавиатурой/мышью.
 * Вынесено из core/bindEvents.js для декомпозиции God Function.
 */
App.bindTaskTableEvents = function() {
    const debouncedSearch = App.debounce((value) => {
        App.ui.search = value;
        App.ui.renderedTaskLimit = App.TASK_PAGE_SIZE;
        App.render();
    }, 200);
    App.elements.searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        if (query.includes(':')) {
            App.showSearchSuggestions(query);
        } else {
            App.elements.searchSuggestions.classList.remove('active');
        }
        debouncedSearch(query);
    });
    App.elements.searchInput.addEventListener('blur', () => {
        setTimeout(() => {
            App.elements.searchSuggestions.classList.remove('active');
        }, 200);
    });
    App.elements.themeToggle.addEventListener('click', () => App.toggleTheme());
    App.elements.newTaskBtn.addEventListener('click', () => App.openTaskModal());
    App.elements.taskAssigneeTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        App.openTaskAssigneeDropdown();
    });
    App.elements.emptyNewTaskBtn.addEventListener('click', () => App.openTaskModal());
    App.elements.modalClose.addEventListener('click', () => App.closeTaskModal());
    App.elements.modalCancel.addEventListener('click', () => App.closeTaskModal());
    App.elements.modalSave.addEventListener('click', () => App.saveTask());
    App.elements.modalBackdrop.addEventListener('click', () => App.closeTaskModal());

    // ПРЕДОТВРАЩАЕМ отправку формы при нажатии Enter в input-полях.
    // Без этого браузер перезагружает страницу, так как <form> отправляется по умолчанию.
    App.elements.taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        // Вместо отправки формы — сохраняем задачу
        App.saveTask();
    });
    // Аккордеон (сворачивание полей) для модалки создания/редактирования задачи
    // убран — компактная сетка 2 колонки сделала его ненужным. Для drawer
    // (панель деталей задачи) сворачивание полей остаётся без изменений.
    App.elements.drawerBody.addEventListener('click', (e) => {
        const toggle = e.target.closest('.field-collapse-toggle');
        if (!toggle) return;
        e.preventDefault();
        App.toggleFieldCollapse('drawer', toggle.dataset.fieldToggle, App.elements.drawerBody);
    });
    App.elements.tasksBody.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        const checkbox = e.target.closest('.checkbox');
        const loadMoreBtn = e.target.closest('.load-more-tasks-btn');

        if (loadMoreBtn) {
            App.ui.renderedTaskLimit += App.TASK_PAGE_SIZE;
            App.renderTasks();
            return;
        }
        // Кнопка раскрытия/сворачивания секции "Выполненные"
        const completedToggle = e.target.closest('.completed-toggle-btn');
        if (completedToggle) {
            e.stopPropagation();
            const current = localStorage.getItem('rpulsar_completed_expanded') === 'true';
            localStorage.setItem('rpulsar_completed_expanded', current ? 'false' : 'true');
            App.renderTasks();
            return;
        }
        if (editBtn) {
            e.stopPropagation();
            App.editTask(App.parseId(editBtn.dataset.id));
        } else if (deleteBtn) {
            e.stopPropagation();
            App.deleteTask(App.parseId(deleteBtn.dataset.id));
        } else if (checkbox) {
            e.stopPropagation();
            App.toggleTaskSelection(App.parseId(checkbox.dataset.id));
        } else if (row && row.dataset.id) {
            // На сенсорных устройствах double-tap ненадёжен и не является
            // стандартным жестом (в отличие от мыши) — открываем задачу сразу
            // по одному тапу, как уже устроено для карточек Kanban. На мыши
            // (pointer: fine) поведение прежнее: клик — фокус, двойной клик — открыть.
            if (window.matchMedia('(pointer: coarse)').matches) {
                App.openTaskDetail(App.parseId(row.dataset.id));
                return;
            }
            // Клик по строке устанавливает фокус (как в Linear/Notion)
            // После клика мышью работают горячие клавиши E, X, D, Enter
            const index = parseInt(row.dataset.index);
            if (!isNaN(index)) {
                App.focusTaskRow(index);
            }
        }
    });

    // === EVENT DELEGATION: Drag & Drop для таблицы ===
    App.elements.tasksBody.addEventListener('dragstart', (e) => {
        const row = e.target.closest('tr[data-id]');
        if (!row) return;

        // Если активна сортировка — автоматически переключаемся в ручной порядок
        // Это удобнее, чем блокировать действие: пользователь сразу видит результат
        if (App.state.sort) {
            App.state.sort = null;
            App.saveState();
            App.updateSortButtonLabel();
            App.showToast('Переключено на ручной порядок', 'info');
            // Небольшая задержка, чтобы DOM обновился перед началом перетаскивания
            setTimeout(() => {
                App.render();
            }, 10);
        }

        App.ui.draggedTask = App.parseId(row.dataset.id);
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    App.elements.tasksBody.addEventListener('dragend', (e) => {
        const row = e.target.closest('tr[data-id]');
        if (row) row.classList.remove('dragging');
        App.ui.draggedTask = null;
        App.elements.tasksBody.querySelectorAll('tr.drag-over').forEach(r =>
            r.classList.remove('drag-over')
        );
    });

    App.elements.tasksBody.addEventListener('dragover', (e) => {
        const row = e.target.closest('tr[data-id]');
        if (!row) return;
        // Не показываем индикатор над самой перетаскиваемой строкой
        if (row.classList.contains('dragging')) return;
        e.preventDefault();
        App.elements.tasksBody.querySelectorAll('tr.drag-over').forEach(r =>
            r.classList.remove('drag-over')
        );
        row.classList.add('drag-over');
    });

    App.elements.tasksBody.addEventListener('dragleave', (e) => {
        const row = e.target.closest('tr[data-id]');
        if (row) row.classList.remove('drag-over');
    });

    App.elements.tasksBody.addEventListener('drop', (e) => {
        const row = e.target.closest('tr[data-id]');
        if (!row) return;
        e.preventDefault();
        const targetId = App.parseId(row.dataset.id);
        if (App.ui.draggedTask && App.ui.draggedTask !== targetId) {
            const draggedIndex = App.state.taskOrder.indexOf(App.ui.draggedTask);
            const targetIndex = App.state.taskOrder.indexOf(targetId);
            App.state.taskOrder.splice(draggedIndex, 1);
            App.state.taskOrder.splice(targetIndex, 0, App.ui.draggedTask);
            App.saveState();
            App.render();
            App.showToast('Порядок изменен', 'success');
        }
        App.elements.tasksBody.querySelectorAll('tr.drag-over').forEach(r =>
            r.classList.remove('drag-over')
        );
    });
    App.elements.tasksBody.addEventListener('dblclick', (e) => {
        const row = e.target.closest('tr');
        if (!row) return;
        if (e.target.closest('.edit-btn, .delete-btn, .checkbox')) return;
        const id = App.parseId(row.dataset.id);
        if (id) {
            App.openTaskDetail(id);
        }
    });
    App.elements.tasksBody.addEventListener('keydown', (e) => {
        const row = e.target.closest('tr');
        if (!row) return;
        const index = parseInt(row.dataset.index);
        const rows = App.elements.tasksBody.querySelectorAll('tr');
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (index < rows.length - 1) App.focusTaskRow(index + 1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (index > 0) App.focusTaskRow(index - 1);
                break;
            case 'Enter':
                e.preventDefault();
                App.openTaskDetail(App.parseId(row.dataset.id));
                break;
        }
    });

    App.elements.assignmentsSubtabs.querySelectorAll('.assignments-subtab').forEach(btn => {
        btn.addEventListener('click', () => {
            App.ui.assignmentsMode = btn.dataset.mode;
            App.elements.assignmentsSubtabs.querySelectorAll('.assignments-subtab').forEach(b => {
                b.classList.toggle('active', b === btn);
                b.setAttribute('aria-selected', String(b === btn));
            });
            App.render();
        });
    });

    // === Сортировка ===
    App.elements.sortButton.addEventListener('click', (e) => {
        e.stopPropagation();
        App.toggleSortMenu();
    });

    App.elements.sortMenu.querySelectorAll('.sort-menu-item').forEach(item => {
        const handler = (e) => {
            e.stopPropagation();
            App.setSort(item.dataset.sort);
        };
        item.addEventListener('click', handler);
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handler(e);
            }
        });
    });
    App.elements.statusFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        App.toggleFilterMenu('status');
    });
    App.elements.assigneeFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        App.toggleFilterMenu('assignee');
    });
    App.elements.priorityFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        App.toggleFilterMenu('priority');
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.filter-dropdown')) {
            App.closeAllFilterMenus();
        }
    });
};
