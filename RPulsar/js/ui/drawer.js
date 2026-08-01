// js/ui/drawer.js
window.App = window.App || {};

App.openDrawer = function(title, contentHtml, footerHtml = '', autoFocus = false) {
    // ОТМЕНЯЕМ отложенную очистку из closeDrawer()
    if (App._drawerCloseTimer) {
        clearTimeout(App._drawerCloseTimer);
        App._drawerCloseTimer = null;
    }
    App.ui.lastFocusedElement = document.activeElement;
    App.elements.drawerTitle.textContent = title;
    App.elements.drawerBody.innerHTML = contentHtml;
    if (footerHtml) {
        App.elements.drawerFooter.innerHTML = footerHtml;
        App.elements.drawerFooter.classList.remove('hidden');
    } else {
        App.elements.drawerFooter.classList.add('hidden');
    }
    App.elements.drawerBackdrop.classList.remove('hidden');
    App.elements.sideDrawer.classList.add('open');
    App.ui.drawerOpen = true;
    if (autoFocus) {
        setTimeout(() => {
            const firstFocusable = App.elements.drawerBody.querySelector('input:not([type="hidden"]), textarea, select');
            if (firstFocusable) firstFocusable.focus();
        }, 300);
    }
};

App.closeDrawer = function() {
    // Уничтожаем Tiptap редактор при закрытии drawer
    if (App.descriptionEditor) {
        App.destroyTiptapEditor('detailDescriptionContainer');
        App.descriptionEditor = null;
    }
    App.elements.sideDrawer.classList.remove('open');
    if (App._descriptionResizeObserver) {
        App._descriptionResizeObserver.disconnect();
        App._descriptionResizeObserver = null;
    }
    // Сохраняем ID таймера
    App._drawerCloseTimer = setTimeout(() => {
        App.elements.drawerBackdrop.classList.add('hidden');
        App.elements.drawerBody.innerHTML = '';
    }, 300);
    App.ui.drawerOpen = false;
    if (App.ui.lastFocusedElement) App.ui.lastFocusedElement.focus();
};
/**
 * Привязывает обработчики боковой панели деталей задачи (drawer).
 *
 * Раньше (в taskDetail.js) обработчики навешивались заново при КАЖДОМ
 * открытии панели через document.getElementById(...).addEventListener(...) —
 * рабочий, но более хрупкий паттерн (17 прямых привязок на пересоздаваемые
 * элементы). Теперь используется делегирование: слушатели вешаются один раз
 * на постоянные контейнеры drawerBody/drawerFooter, а нужная задача берётся
 * из App.ui.currentTask. Вынесено из core/bindEvents.js для декомпозиции
 * God Function.
 */
App.bindDrawerEvents = function() {
    App.elements.drawerBackdrop.addEventListener('click', () => App.closeDrawer());
    App.elements.drawerClose.addEventListener('click', () => App.closeDrawer());

    const body = App.elements.drawerBody;
    const footer = App.elements.drawerFooter;

    // === CLICK delegation на drawerBody ===
    body.addEventListener('click', (e) => {
        const id = App.ui.currentTask;
        if (!id) return;

        const editBtn = e.target.closest('#detailEditBtn');
        if (editBtn) {
            App.closeDrawer();
            App.editTask(id);
            return;
        }

        const checkbox = e.target.closest('.subtask-checkbox');
        if (checkbox) {
            e.stopPropagation();
            App.toggleSubtask(id, parseInt(checkbox.dataset.index));
            return;
        }

        const deleteSubtask = e.target.closest('.delete-subtask-btn');
        if (deleteSubtask) {
            e.stopPropagation();
            App.deleteSubtask(id, parseInt(deleteSubtask.dataset.index));
            return;
        }

        // Связанная задача — клик по строке переходит к ней. ВАЖНО: исключаем
        // #relationTaskList — там тот же класс .relation-item используется в
        // ПИКЕРЕ выбора новой связи (App.openRelationPicker), где клик должен
        // выделять кандидата, а не открывать его карточку.
        const relItem = e.target.closest('.relation-item');
        if (relItem && !relItem.closest('#relationTaskList') && !e.target.closest('.relation-remove')) {
            const taskId = App.parseId(relItem.dataset.taskId);
            if (taskId) App.openTaskDetail(taskId);
            return;
        }

        const relRemove = e.target.closest('.relation-remove');
        if (relRemove) {
            e.stopPropagation();
            App.removeRelation(App.parseId(relRemove.dataset.relationId), id);
            return;
        }

        const inlineTrigger = e.target.closest('.inline-edit-trigger');
        if (inlineTrigger) {
            e.stopPropagation();
            const field = inlineTrigger.dataset.inlineField;
            const taskId = App.parseId(inlineTrigger.dataset.taskId);
            App.openInlineDropdown(inlineTrigger, field, taskId);
            return;
        }

        if (e.target.closest('#addSubtaskBtn')) {
            App.addSubtask(id);
            return;
        }

        if (e.target.closest('#addCommentBtn')) {
            const text = document.getElementById('commentInput').value.trim();
            if (!text) return;
            const idx = App.state.tasks.findIndex(t => t.id === id);
            if (idx !== -1) {
                if (!App.state.tasks[idx].comments) App.state.tasks[idx].comments = [];
                App.state.tasks[idx].comments.push({
                    id: App.generateId(),
                    userId: App.state.currentUser,
                    text,
                    timestamp: new Date().toISOString()
                });
                App.logChange(id, 'comment_added', null, text.substring(0, 100));
                App.saveState();
                App.openTaskDetail(id);
                App.showToast('Комментарий добавлен', 'success');
            }
            return;
        }

        const avatarRemove = e.target.closest('.avatar-remove-btn');
        if (avatarRemove) {
            e.stopPropagation();
            e.preventDefault();
            const userId = avatarRemove.dataset.userId;
            const task = App.state.tasks.find(t => t.id === id);
            if (!task) return;
            const currentAssignees = Array.isArray(task.assignees) ? task.assignees : (task.assignee ? [task.assignee] : []);
            const newAssignees = currentAssignees.filter(uid => uid !== userId);
            App.applyInlineChange(id, 'assignee', newAssignees);
            return;
        }
    });

    // === KEYPRESS delegation на drawerBody ===
    body.addEventListener('keypress', (e) => {
        const id = App.ui.currentTask;
        if (!id) return;

        if (e.target.id === 'detailTitle' && e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('detailSaveBtn')?.click();
            return;
        }

        if (e.target.id === 'subtaskInput' && e.key === 'Enter') {
            e.preventDefault();
            App.addSubtask(id);
            return;
        }

        const checkbox = e.target.closest('.subtask-checkbox');
        if (checkbox && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            App.toggleSubtask(id, parseInt(checkbox.dataset.index));
        }
    });

    // Ctrl+Enter в комментарии — отправить
    body.addEventListener('keydown', (e) => {
        if (e.target.id === 'commentInput' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            document.getElementById('addCommentBtn')?.click();
        }
    });

    // === CHANGE delegation на drawerBody (инлайн-дата) ===
    body.addEventListener('change', (e) => {
        const dateInput = e.target.closest('input.inline-date-input');
        if (dateInput) {
            const taskId = App.parseId(dateInput.dataset.taskId);
            App.applyInlineChange(taskId, 'dueDate', e.target.value);
        }
    });

    // === CLICK delegation на drawerFooter ===
    footer.addEventListener('click', (e) => {
        const id = App.ui.currentTask;
        if (!id) return;

        if (e.target.closest('#detailDeleteBtn')) {
            App.closeDrawer();
            App.deleteTask(id);
            return;
        }

        if (e.target.closest('#detailSaveBtn')) {
            const newTitle = document.getElementById('detailTitle').value.trim();
            // Получаем описание из Tiptap редактора или из textarea
            let newDescription = '';
            if (App.descriptionEditor) {
                newDescription = App.descriptionEditor.getHTML();
            } else {
                newDescription = document.getElementById('detailDescription').value.trim();
            }
            if (!newTitle) return App.showToast('Название не может быть пустым', 'error');
            const index = App.state.tasks.findIndex(t => t.id === id);
            if (index !== -1) {
                const currentTask = App.state.tasks[index];
                if (newTitle !== currentTask.title) {
                    App.logChange(id, 'title_changed', currentTask.title, newTitle, 'title');
                }
                if (newDescription !== currentTask.description) {
                    App.logChange(id, 'description_changed', currentTask.description, newDescription, 'description');
                }
                App.state.tasks[index].title = newTitle;
                App.state.tasks[index].description = newDescription;
                App.state.tasks[index].version = (currentTask.version || 1) + 1;
                App.state.tasks[index].updatedAt = new Date().toISOString();
                App.saveState();
                App.render();
                App.showToast('Сохранено', 'success');
                App.closeDrawer();
            }
            return;
        }

        if (e.target.closest('#addRelationBtn')) {
            App.openRelationPicker(id);
        }
    });
};
