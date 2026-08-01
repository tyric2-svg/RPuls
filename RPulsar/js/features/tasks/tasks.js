// js/features/tasks/tasks.js
window.App = window.App || {};

/**
 * Модалка создания/редактирования задачи ещё не имеет сохранённого task.id —
 * поэтому состояние выбранных исполнителей до нажатия "Сохранить" хранится
 * здесь, а не читается из DOM/задачи напрямую.
 */
App._taskModalAssignees = [];

/**
 * Обновляет закрытый триггер "Исполнитель" — показывает аватар+имя одного
 * выбранного, "Имя +N" при нескольких, либо плейсхолдер "Не назначен".
 */
App.renderTaskAssigneePicker = function(selectedIds) {
    App._taskModalAssignees = [...selectedIds];
    const label = App.elements.taskAssigneeTriggerLabel;
    if (!label) return;

    if (selectedIds.length === 0) {
        label.className = 'assignee-select-trigger-label placeholder';
        label.textContent = 'Не назначен';
        return;
    }

    const first = App.state.users.find(u => u.id === selectedIds[0]);
    if (!first) {
        label.className = 'assignee-select-trigger-label placeholder';
        label.textContent = 'Не назначен';
        return;
    }
    const initials = App.escapeHtml(first.name).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const extra = selectedIds.length > 1 ? ` +${selectedIds.length - 1}` : '';
    label.className = 'assignee-select-trigger-label';
    label.innerHTML = `
<span class="assignee-select-trigger-avatar" style="background: ${App.safeColor(first.color)};">${initials}</span>
<span class="assignee-select-trigger-name">${App.escapeHtml(first.name)}${extra}</span>`;
};

App.getSelectedTaskAssignees = function() {
    return [...App._taskModalAssignees];
};

/**
 * Открывает всплывающий чекбокс-список исполнителей под триггером —
 * переиспользует те же CSS-классы (.inline-dropdown-multi и вложенные),
 * что уже используются для inline-редактирования исполнителей в drawer,
 * визуальная консистентность без дублирования стилей.
 */
App.openTaskAssigneeDropdown = function() {
    App.closeInlineDropdown();
    const trigger = App.elements.taskAssigneeTrigger;
    let selectedValues = [...App._taskModalAssignees];

    const dropdown = document.createElement('div');
    dropdown.id = 'inlineDropdown';
    dropdown.className = 'inline-dropdown inline-dropdown-multi';
    dropdown.setAttribute('role', 'listbox');
    dropdown.innerHTML = `
<div class="inline-dropdown-multi-header">
<span class="inline-dropdown-multi-title">Исполнители</span>
<span class="inline-dropdown-multi-count">${selectedValues.length} выбрано</span>
</div>
<div class="inline-dropdown-multi-items">
${App.state.users.map(u => {
        const isSelected = selectedValues.includes(u.id);
        const initials = App.escapeHtml(u.name).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        return `
<div class="inline-dropdown-item ${isSelected ? 'selected' : ''}" data-value="${u.id}" role="option" aria-selected="${isSelected}" tabindex="0">
<div class="inline-dropdown-item-avatar" style="background: ${App.safeColor(u.color)};">${initials}</div>
<span>${App.escapeHtml(u.name)}</span>
<span class="inline-dropdown-item-check">✓</span>
</div>`;
    }).join('')}
</div>
<div class="inline-dropdown-multi-footer">
<button class="btn btn-secondary" data-action="cancel">Отмена</button>
<button class="btn btn-primary" data-action="apply">Применить</button>
</div>`;

    dropdown.querySelectorAll('.inline-dropdown-item').forEach(item => {
        const toggle = () => {
            const value = item.dataset.value;
            const index = selectedValues.indexOf(value);
            if (index === -1) {
                selectedValues.push(value);
                item.classList.add('selected');
            } else {
                selectedValues.splice(index, 1);
                item.classList.remove('selected');
            }
            item.setAttribute('aria-selected', String(selectedValues.includes(value)));
            dropdown.querySelector('.inline-dropdown-multi-count').textContent = `${selectedValues.length} выбрано`;
        };
        item.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                toggle();
            }
        });
    });

    dropdown.querySelector('[data-action="apply"]').addEventListener('click', (e) => {
        e.stopPropagation();
        App.renderTaskAssigneePicker(selectedValues);
        App.updateTaskPrivacyLock();
        App.closeInlineDropdown();
    });
    dropdown.querySelector('[data-action="cancel"]').addEventListener('click', (e) => {
        e.stopPropagation();
        App.closeInlineDropdown();
    });

    document.body.appendChild(dropdown);
    const rect = trigger.getBoundingClientRect();
    const dropdownRect = dropdown.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;
    if (left + dropdownRect.width > window.innerWidth - 8) {
        left = window.innerWidth - dropdownRect.width - 8;
    }
    if (top + dropdownRect.height > window.innerHeight - 8) {
        top = rect.top - dropdownRect.height - 4;
    }
    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${left}px`;
    dropdown.style.width = `${Math.max(rect.width, 220)}px`;
    App._inlineDropdownTarget = trigger;

    setTimeout(() => {
        const closeHandler = (e) => {
            if (!dropdown.contains(e.target) && e.target !== trigger) {
                App.closeInlineDropdown();
                document.removeEventListener('click', closeHandler, true);
            }
        };
        document.addEventListener('click', closeHandler, true);
    }, 0);
};

/**
 * Приватная задача не может быть назначена кому-то, кроме автора — иначе
 * назначенный человек просто не сможет её увидеть. Синхронизирует блокировку
 * чекбокса "Личная задача" с текущим выбором исполнителей.
 */
App.updateTaskPrivacyLock = function() {
    const selected = App.getSelectedTaskAssignees();
    const isAssignedToOther = selected.some(id => id !== App.state.currentUser);
    if (isAssignedToOther) {
        App.elements.taskPrivate.checked = false;
        App.elements.taskPrivate.disabled = true;
        App.elements.taskPrivate.title = 'Нельзя сделать личной задачу, назначенную другому человеку';
    } else if (!App.ui.editingTask) {
        App.elements.taskPrivate.disabled = false;
        App.elements.taskPrivate.title = '';
    }
};

App.editTask = function(id) {
            const task = App.state.tasks.find(t => t.id === id);
            if (!task) return;
            App.ui.editingTask = id;
            App.ui.openedTaskVersion = task.version || 1; // ЗАПОМИНАЕМ версию при открытии
            App.ui.lastFocusedElement = document.activeElement;
            App.elements.modalTitle.textContent = 'Редактировать задачу';
            App.elements.taskTitle.value = task.title;
            App.elements.taskDescription.value = task.description || '';
            App.elements.taskStatus.value = task.status;
            App.elements.taskPriority.value = task.priority;
            const existingAssignees = Array.isArray(task.assignees) ? task.assignees : (task.assignee ? [task.assignee] : []);
            App.renderTaskAssigneePicker(existingAssignees);
            App.elements.taskDueDate.value = task.dueDate || '';
            App.elements.taskPrivate.checked = task.visibility === 'private';
            // Менять приватность может только автор задачи (или задача ещё без автора —
            // старые задачи, созданные до появления личных пространств).
            const canTogglePrivacy = !task.owner || task.owner === App.state.currentUser;
            App.elements.taskPrivate.disabled = !canTogglePrivacy;
            App.updateTaskPrivacyLock();
            App.initDescriptionResizePersistence('taskDescription');
            App.elements.modalBackdrop.classList.remove('hidden');
            App.elements.taskModal.classList.remove('hidden');
            setTimeout(() => App.elements.taskTitle.focus(), 100);
};

App.saveTask = function() {
            const title = App.elements.taskTitle.value.trim();
            if (!title) {
                App.showToast('Введите название задачи', 'error');
                App.elements.taskTitle.focus();
                return;
            }
            const selectedAssignees = App.getSelectedTaskAssignees();
            const taskData = {
                title,
                description: App.elements.taskDescription.value.trim(),
                status: App.elements.taskStatus.value,
                priority: App.elements.taskPriority.value,
                assignees: selectedAssignees,
                assignee: selectedAssignees[0] || '', // легаси-зеркало первого исполнителя
                dueDate: App.elements.taskDueDate.value,
            };
            const isPrivate = App.elements.taskPrivate.checked;
            // Приватная задача не может быть назначена другому человеку — иначе
            // исполнитель просто не сможет её увидеть. В этом случае приватность
            // принудительно снимается, а пользователь получает уведомление.
            const owner = App.ui.editingTask
                ? (App.state.tasks.find(t => t.id === App.ui.editingTask)?.owner || App.state.currentUser)
                : App.state.currentUser;
            const isPrivateForced = isPrivate && selectedAssignees.some(id => id !== owner);
            if (isPrivateForced) {
                App.showToast('Задача назначена другому человеку — сделана командной, а не личной', 'info');
            }
            const finalIsPrivate = isPrivate && !isPrivateForced;
            if (App.ui.editingTask) {
                const index = App.state.tasks.findIndex(t => t.id === App.ui.editingTask);
                if (index !== -1) {
                    const existing = App.state.tasks[index];

                    // CHANGELOG: фиксируем изменения полей
                    const changes = {};
                    if (taskData.title !== existing.title) {
                        App.logChange(App.ui.editingTask, 'title_changed', existing.title, taskData.title, 'title');
                        changes.title = true;
                    }
                    if (taskData.description !== existing.description) {
                        App.logChange(App.ui.editingTask, 'description_changed', existing.description, taskData.description, 'description');
                        changes.description = true;
                    }
                    if (taskData.status !== existing.status) {
                        const oldStatusName = App.state.statuses.find(s => s.id === existing.status)?.name || existing.status;
                        const newStatusName = App.state.statuses.find(s => s.id === taskData.status)?.name || taskData.status;
                        App.logChange(App.ui.editingTask, 'status_changed', oldStatusName, newStatusName, 'status');
                        changes.status = true;
                    }
                    if (taskData.priority !== existing.priority) {
                        App.logChange(App.ui.editingTask, 'priority_changed', existing.priority, taskData.priority, 'priority');
                        changes.priority = true;
                    }
                    // Сравниваем массивы исполнителей поэлементно (добавленные/убранные),
                    // а не как единое значение — как уже делает inline-редактирование в drawer.
                    const oldAssignees = Array.isArray(existing.assignees) ? existing.assignees : (existing.assignee ? [existing.assignee] : []);
                    const addedAssignees = taskData.assignees.filter(id => !oldAssignees.includes(id));
                    const removedAssignees = oldAssignees.filter(id => !taskData.assignees.includes(id));
                    if (addedAssignees.length > 0 || removedAssignees.length > 0) {
                        addedAssignees.forEach(userId => {
                            const userName = App.state.users.find(u => u.id === userId)?.name || userId;
                            App.logChange(App.ui.editingTask, 'assignee_added', null, userName, 'assignees');
                        });
                        removedAssignees.forEach(userId => {
                            const userName = App.state.users.find(u => u.id === userId)?.name || userId;
                            App.logChange(App.ui.editingTask, 'assignee_removed', userName, null, 'assignees');
                        });
                        changes.assignee = true;
                    }
                    if (taskData.dueDate !== existing.dueDate) {
                        App.logChange(App.ui.editingTask, 'due_date_changed', existing.dueDate, taskData.dueDate, 'dueDate');
                        changes.dueDate = true;
                    }

                    // Если не было точечных изменений — логируем общее обновление
                    if (Object.keys(changes).length === 0) {
                        App.logChange(App.ui.editingTask, 'updated', null, null);
                    }

                    // Приватность меняем только если чекбокс не заблокирован
                    if (!App.elements.taskPrivate.disabled) {
                        taskData.visibility = finalIsPrivate ? 'private' : 'team';
                        if (finalIsPrivate && !existing.owner) taskData.owner = App.state.currentUser;
                    }
                    taskData.version = (existing.version || 1) + 1;
                    App.state.tasks[index] = {...existing, ...taskData};
                    App.showToast('Задача обновлена', 'success');
                }

            } else {
                const newTask = {
                    id: App.generateId(),
                    ...taskData,
                    owner: App.state.currentUser,
                    visibility: finalIsPrivate ? 'private' : 'team',
                    comments: [],
                    subtasks: [],
                    version: 1,
                    createdAt: new Date().toISOString()
                };
                App.state.tasks.push(newTask);
                App.state.taskOrder.push(newTask.id);

                // CHANGELOG: записываем создание задачи
                App.logChange(newTask.id, 'created', null, {
                    title: newTask.title,
                    status: newTask.status,
                    priority: newTask.priority,
                    assignee: newTask.assignee
                });

                App.showToast('Задача создана', 'success');

                // Если задача создана из сообщения чата ("В задачу") —
                // добавляем системное сообщение с названием задачи (не id —
                // короткий #XXXX ничего не говорит человеку, а название сразу
                // понятно, о какой задаче речь).
                if (App.ui.creatingTaskFromChat) {
                    const authorName = App.state.users.find(u => u.id === App.state.currentUser)?.name || 'Кто-то';
                    App.chatAppendSystemMessage(`${authorName} создал(а) задачу «${newTask.title}» из сообщения`);
                    if (App.state.currentSection === 'chat') App.renderChat();
                }
            }
            App.saveState();
            App.render();
            App.closeTaskModal();
};

App.deleteTask = async function(id) {
            const task = App.state.tasks.find(t => t.id === id);
            if (!task) return;

            // ПРОВЕРКА ПРАВ: Manager не может удалять чужие задачи
            if (!App.can('delete_task', task)) {
                App.showToast('У вас нет прав на удаление этой задачи', 'error');
                return;
            }

            const confirmed = await App.confirmDialog(`Удалить «${task.title}»?`, {danger: true});
            if (!confirmed) return;

            // CHANGELOG: записываем удаление задачи
            App.logChange(id, 'deleted', {title: task.title, status: task.status}, null);

            App.state.tasks = App.state.tasks.filter(t => t.id !== id);
            App.state.taskOrder = App.state.taskOrder.filter(tid => tid !== id);
            App.state.relations = App.state.relations.filter(r => r.taskId1 !== id && r.taskId2 !== id);
            App.state._tombstones.push({id, deletedAt: new Date().toISOString()});
            App.saveState();
            App.render();
            App.showToast('Задача удалена', 'success');
};

App.addSubtask = function(taskId) {
            const input = document.getElementById('subtaskInput');
            const title = input.value.trim();
            if (!title) return;
            const index = App.state.tasks.findIndex(t => t.id === taskId);
            if (index !== -1) {
                if (!App.state.tasks[index].subtasks) App.state.tasks[index].subtasks = [];
                App.state.tasks[index].subtasks.push({
                    id: App.generateId(),
                    title,
                    completed: false,
                    createdAt: new Date().toISOString()
                });

                // CHANGELOG: логируем добавление подзадачи
                App.logChange(taskId, 'subtask_added', null, title);

                App.saveState();
                App.openTaskDetail(taskId);
                App.showToast('Подзадача добавлена', 'success');
            }
};

App.toggleSubtask = function(taskId, subtaskIndex) {
            const index = App.state.tasks.findIndex(t => t.id === taskId);
            if (index !== -1 && App.state.tasks[index].subtasks) {
                const subtask = App.state.tasks[index].subtasks[subtaskIndex];
                const wasCompleted = subtask.completed;
                subtask.completed = !wasCompleted;

                // CHANGELOG: логируем завершение/возобновление подзадачи
                App.logChange(taskId, 'subtask_toggled', wasCompleted ? 'completed' : 'pending',
                    wasCompleted ? 'pending' : 'completed', subtask.title);

                App.saveState();
                App.openTaskDetail(taskId);
            }
};

App.deleteSubtask = async function(taskId, subtaskIndex) {
            const confirmed = await App.confirmDialog('Удалить подзадачу?', {danger: true});
            if (!confirmed) return;
            const index = App.state.tasks.findIndex(t => t.id === taskId);
            if (index !== -1 && App.state.tasks[index].subtasks) {
                const subtask = App.state.tasks[index].subtasks[subtaskIndex];

                // CHANGELOG: логируем удаление подзадачи
                App.logChange(taskId, 'subtask_deleted', subtask.title, null);

                App.state.tasks[index].subtasks.splice(subtaskIndex, 1);
                App.saveState();
                App.openTaskDetail(taskId);
                App.showToast('Подзадача удалена', 'success');
            }
};
