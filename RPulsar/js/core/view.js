// js/core/view.js
window.App = window.App || {};

App.render = function() {

    // === СОХРАНЕНИЕ UI-СОСТОЯНИЯ ДО ПЕРЕРИСОВКИ ===
    // 1. Запоминаем позицию скролла основного контейнера
    const contentEl = document.querySelector('.content');
    const scrollPos = contentEl ? contentEl.scrollTop : 0;
    const scrollLeft = contentEl ? contentEl.scrollLeft : 0;

    // 1.5. Запоминаем позицию скролла каждой Kanban-колонки
    // (иначе при фоновой синхронизации каждые 5 сек скролл сбрасывается наверх)
    const kanbanScrollPositions = {};
    document.querySelectorAll('.kanban-cards').forEach(el => {
        const status = el.dataset.status;
        if (status) kanbanScrollPositions[status] = el.scrollTop;
    });

    // 2. Запоминаем, на каком элементе был фокус
    const activeEl = document.activeElement;
    const activeTag = activeEl?.tagName;
    const activeId = activeEl?.id;
    const activeTaskId = activeEl?.closest('[data-id]')?.dataset.id;

    // 3. Запоминаем состояние текстовых полей (курсор, выделение, значение)
    const isFormField = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
    let formState = null;
    if (isFormField && activeEl) {
        formState = {
            element: activeEl,
            value: activeEl.value,
            selectionStart: activeEl.selectionStart,
            selectionEnd: activeEl.selectionEnd
        };
    }

// ДОПОЛНИТЕЛЬНО: сохраняем значения ВСЕХ полей формы задачи (не только активного)
// Это защищает от сброса при фоновой синхронизации
    const taskFormState = {};
    if (!App.elements.taskModal.classList.contains('hidden')) {
        taskFormState.title = App.elements.taskTitle.value;
        taskFormState.description = App.elements.taskDescription.value;
        taskFormState.status = App.elements.taskStatus.value;
        taskFormState.priority = App.elements.taskPriority.value;
        taskFormState.assignees = App.getSelectedTaskAssignees();
        taskFormState.dueDate = App.elements.taskDueDate.value;
        taskFormState.isPrivate = App.elements.taskPrivate.checked;
    }

    // === САМА ПЕРЕРИСОВКА ===

    App.renderTableHeader();
    App.renderTasks();
    App.renderKanban();

    // 3.5. Восстанавливаем scrollTop Kanban-колонок после перерисовки
    // (защита от сброса скролла при фоновой синхронизации)
    Object.entries(kanbanScrollPositions).forEach(([status, scrollTop]) => {
        const el = document.querySelector(`.kanban-cards[data-status="${status}"]`);
        if (el && scrollTop > 0) el.scrollTop = scrollTop;
    });

    App.renderCalendar();
    App.populateTaskFormSelects();
    App.updateBulkActionsToolbar();
    App.updateTaskFocus();

// === ВОССТАНОВЛЕНИЕ UI-СОСТОЯНИЯ ===
// 1. Возвращаем скролл на место
// ВАЖНО: восстанавливаем только если пользователь сам не прокрутил
// страницу во время рендера (иначе будет "дёрганье")
    if (contentEl) {
        const currentScrollTop = contentEl.scrollTop;
        const currentScrollLeft = contentEl.scrollLeft;
        // Если пользователь прокрутил более чем на 50px — не возвращаем
        const userScrolled = Math.abs(currentScrollTop - scrollPos) > 50 ||
            Math.abs(currentScrollLeft - scrollLeft) > 50;
        if (!userScrolled) {
            contentEl.scrollTop = scrollPos;
            contentEl.scrollLeft = scrollLeft;
        }
    }

    // 2. Возвращаем фокус (если Drawer не открыт — он сам управляет фокусом)
    if (!App.ui.drawerOpen && activeId) {
        const restored = document.getElementById(activeId);
        if (restored) {
            restored.focus({preventScroll: true});
            // Восстанавливаем значение и позицию курсора в инпутах
            if (formState && formState.element === restored && 'value' in restored) {
                restored.value = formState.value;
                if (typeof formState.selectionStart === 'number') {
                    try {
                        restored.setSelectionRange(formState.selectionStart, formState.selectionEnd);
                    } catch (e) {
                        // Некоторые типы input (например, number) не поддерживают setSelectionRange
                    }
                }
            }
        }
    }

    // 3. Если фокус был на строке таблицы — восстанавливаем через data-id
    if (!App.ui.drawerOpen && !activeId && activeTaskId) {
        const row = document.querySelector(`tr[data-id="${activeTaskId}"]`);
        if (row) row.focus({preventScroll: true});
    }
    // ВОССТАНОВЛЕНИЕ значений формы задачи после перерисовки
    if (taskFormState.title !== undefined && !App.elements.taskModal.classList.contains('hidden')) {
        App.elements.taskTitle.value = taskFormState.title;
        App.elements.taskDescription.value = taskFormState.description;
        App.elements.taskStatus.value = taskFormState.status;
        App.elements.taskPriority.value = taskFormState.priority;
        App.renderTaskAssigneePicker(taskFormState.assignees || []);
        App.elements.taskDueDate.value = taskFormState.dueDate;
        App.elements.taskPrivate.checked = taskFormState.isPrivate;
    }
};

App.applyView = function() {
    const views = [
        App.elements.tableView,
        App.elements.kanbanView,
        App.elements.calendarView,
        App.elements.chatView
    ];
    views.forEach(view => {
        if (view) {
            view.classList.remove('active');
            view.classList.add('hidden');
        }
    });
    App.elements.toolbar.style.display = 'none';
    App.elements.assignmentsSubtabs.classList.add('hidden');
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
        const view = item.dataset.view;
// Активен, если:
// 1. Мы в разделе "tasks" И это текущий вид (table/kanban/calendar)
// 2. ИЛИ это текущий раздел (assignments, chat, statuses и т.д.)
        const isActive = (App.state.currentSection === 'tasks' && view === App.state.view) ||
            view === App.state.currentSection;
        item.classList.toggle('active', isActive);
    });

    if (App.state.currentSection === 'chat') {
        // У чата нет тулбара с поиском/фильтрами задач — просто показываем
        // ленту и рендерим сообщения.
        App.elements.pageTitle.textContent = 'Чат';
        App.elements.chatView.classList.remove('hidden');
        App.elements.chatView.classList.add('active');
        App.renderChat();
        return;
    }

    {
        App.elements.toolbar.style.display = 'flex';
        if (App.state.currentSection === 'assignments') {
            App.elements.pageTitle.textContent = 'Поручения';
            App.elements.assignmentsSubtabs.classList.remove('hidden');
        } else {
            App.elements.pageTitle.textContent = 'Задачи';
        }
if (App.state.view === 'kanban') {
    App.elements.kanbanView.classList.remove('hidden');
    App.elements.kanbanView.classList.add('active');
    App.initialRenderWithSkeleton(App.showKanbanSkeletons, () => App.render());
} else if (App.state.view === 'calendar') {
    App.elements.calendarView.classList.remove('hidden');
    App.elements.calendarView.classList.add('active');
    App.initialRenderWithSkeleton(App.showCalendarSkeletons, () => App.renderCalendar());
} else {
    App.elements.tableView.classList.remove('hidden');
    App.elements.tableView.classList.add('active');
    App.initialRenderWithSkeleton(App.showTableSkeletons, () => App.render());
}

    }
};
