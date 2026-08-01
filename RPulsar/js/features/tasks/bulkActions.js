// js/features/tasks/bulkActions.js
window.App = window.App || {};

App.toggleTaskSelection = function(id) {
    const index = App.ui.selectedTasks.indexOf(id);
    if (index === -1) App.ui.selectedTasks.push(id);
    else App.ui.selectedTasks.splice(index, 1);
    App.render();
};

App.updateBulkActionsToolbar = function() {
    const count = App.ui.selectedTasks.length;
    if (count > 0) {
        App.elements.bulkActionsToolbar.classList.add('active');
        App.elements.bulkActionsInfo.textContent = `Выбрано: ${count}`;
    } else {
        App.elements.bulkActionsToolbar.classList.remove('active');
    }
};

App.clearBulkSelection = function() {
    App.ui.selectedTasks = [];
    App.render();
};

App.bulkDelete = async function() {
    const selectedTasks = App.ui.selectedTasks.map(id => App.state.tasks.find(t => t.id === id)).filter(Boolean);

    // ПРОВЕРКА ПРАВ: проверяем каждую задачу
    if (!App.can('bulk_delete', selectedTasks)) {
        App.showToast('У вас нет прав на удаление некоторых выбранных задач', 'error');
        return;
    }

    const confirmed = await App.confirmDialog(`Удалить ${App.ui.selectedTasks.length} задач?`, {danger: true});
    if (!confirmed) return;
    const now = new Date().toISOString();

    // Set для O(1) lookup — вместо O(N×M) через Array.includes в filter-циклах.
    const selectedSet = new Set(App.ui.selectedTasks);

    // CHANGELOG: логируем массовое удаление
    App.ui.selectedTasks.forEach(id => {
        const task = App.state.tasks.find(t => t.id === id);
        if (task) {
            App.logChange(id, 'deleted', {title: task.title, status: task.status}, null);
        }
    });

    App.ui.selectedTasks.forEach(id => App.state._tombstones.push({id, deletedAt: now}));
    App.state.tasks = App.state.tasks.filter(t => !selectedSet.has(t.id));
    App.state.taskOrder = App.state.taskOrder.filter(id => !selectedSet.has(id));

    // === ОЧИСТКА ORPHAN REFERENCES ===
    // Раньше bulkDelete не фильтровал relations —
    // оставшиеся ссылки вели к багам:
    //   - renderRelations тихо пропускал (if (!otherTask) return), но счётчик
    //     связей в drawer показывал мусор.
    App.state.relations = App.state.relations.filter(r =>
        !selectedSet.has(r.taskId1) && !selectedSet.has(r.taskId2)
    );

    // Очистка напоминаний для удалённых задач — иначе checkReminders
    // будет бесконечно пытаться найти задачу и плодить overdue-уведомления.
    if (Array.isArray(App.state.reminders)) {
        App.state.reminders = App.state.reminders.filter(r =>
            !selectedSet.has(r.taskId)
        );
    }

    App.ui.selectedTasks = [];
    App.saveState();
    App.render();
    App.showToast('Задачи удалены', 'success');
};

App.bulkChangeStatus = function() {
    const count = App.ui.selectedTasks.length;
    if (count === 0) return;
    App.ui.lastFocusedElement = document.activeElement;
    App.elements.bulkModalTitle.textContent = 'Изменить статус';
    const html = `
<div class="bulk-info">
<span class="bulk-info-icon">${App.icon('clipboard-list', 'md')}</span>
<span>Будет изменено задач: <strong>${count}</strong></span>
</div>
<div class="bulk-options-grid">
${App.state.statuses.map(s => `
<button class="bulk-option" data-status-id="${s.id}">
<div class="bulk-option-color" style="background: ${App.safeColor(s.color)};"></div>
<div class="bulk-option-content">
<div class="bulk-option-title">${App.escapeHtml(s.name)}</div>
</div>
<span class="bulk-option-arrow">→</span>
</button>
`).join('')}
</div>
`;
    App.elements.bulkModalBody.innerHTML = html;
    App.elements.bulkModalBackdrop.classList.remove('hidden');
    App.elements.bulkModal.classList.remove('hidden');
    App.elements.bulkModalBody.querySelectorAll('.bulk-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const statusId = opt.dataset.statusId;
            const statusName = App.state.statuses.find(s => s.id === statusId)?.name || statusId;

            // CHANGELOG: логируем массовое изменение статуса
            App.state.tasks.forEach(task => {
                if (App.ui.selectedTasks.includes(task.id)) {
                    const oldStatusName = App.state.statuses.find(s => s.id === task.status)?.name || task.status;
                    if (task.status !== statusId) {
                        App.logChange(task.id, 'status_changed', oldStatusName, statusName, 'status');
                    }
                    task.status = statusId;
                }
            });

            App.saveState();
            App.render();
            App.closeBulkModal();
            App.showToast(`Статус "${statusName}" применён к ${count} задачам`, 'success');
        });
    });
};

App.bulkChangePriority = function() {
    const count = App.ui.selectedTasks.length;
    if (count === 0) return;
    App.ui.lastFocusedElement = document.activeElement;
    App.elements.bulkModalTitle.textContent = 'Изменить приоритет';
    const priorities = [
        {id: 'high', name: 'Высокий', color: 'var(--error)', bg: 'var(--error-bg)'},
        {id: 'medium', name: 'Средний', color: 'var(--warning)', bg: 'var(--warning-bg)'},
        {id: 'low', name: 'Низкий', color: 'var(--info)', bg: 'var(--info-bg)'}
    ];
    const html = `
<div class="bulk-info">
<span class="bulk-info-icon">${App.icon('zap', 'md')}</span>
<span>Будет изменено задач: <strong>${count}</strong></span>
</div>
<div class="bulk-options-grid">
${priorities.map(p => `
<button class="bulk-option" data-priority-id="${p.id}">
<div class="bulk-option-color" style="background: ${App.safeColor(p.color)};"></div>
<div class="bulk-option-content">
<div class="bulk-option-title">${App.escapeHtml(p.name)}</div>
</div>
<span class="bulk-option-arrow">→</span>
</button>
`).join('')}
</div>
`;
    App.elements.bulkModalBody.innerHTML = html;
    App.elements.bulkModalBackdrop.classList.remove('hidden');
    App.elements.bulkModal.classList.remove('hidden');
    App.elements.bulkModalBody.querySelectorAll('.bulk-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const priorityId = opt.dataset.priorityId;
            const priorityName = App.getPriorityLabel(priorityId);

            // CHANGELOG: логируем массовое изменение приоритета
            App.state.tasks.forEach(task => {
                if (App.ui.selectedTasks.includes(task.id)) {
                    if (task.priority !== priorityId) {
                        App.logChange(task.id, 'priority_changed', task.priority, priorityId, 'priority');
                    }
                    task.priority = priorityId;
                }
            });

            App.saveState();
            App.render();
            App.closeBulkModal();
            App.showToast(`Приоритет "${priorityName}" применён к ${count} задачам`, 'success');
        });
    });
};

App.bulkChangeAssignee = function() {
    const count = App.ui.selectedTasks.length;
    if (count === 0) return;
    App.ui.lastFocusedElement = document.activeElement;
    App.elements.bulkModalTitle.textContent = 'Управление исполнителями';

    const html = `
            <div class="bulk-info">
                <span class="bulk-info-icon">${App.icon('users', 'md')}</span>
                <span>Выбрано задач: <strong>${count}</strong></span>
            </div>
            
            <div style="margin-bottom: var(--space-4);">
                <div class="task-detail-label" style="margin-bottom: var(--space-3);">Режим изменения</div>
                <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
                    <button class="btn btn-secondary bulk-mode-btn active" data-mode="replace" style="flex: 1;">
                        ${App.icon('refresh-cw', 'xs')} Заменить всех
                    </button>
                    <button class="btn btn-secondary bulk-mode-btn" data-mode="add" style="flex: 1;">
                        ${App.icon('plus', 'xs')} Добавить к текущим
                    </button>
                    <button class="btn btn-secondary bulk-mode-btn" data-mode="remove" style="flex: 1;">
                        ${App.icon('x', 'xs')} Удалить выбранного
                    </button>
                </div>
            </div>
            
            <div class="bulk-options-grid">
                <button class="bulk-option bulk-option-empty" data-user-id="">
                    <div class="bulk-option-avatar">—</div>
                    <div class="bulk-option-content">
                        <div class="bulk-option-title">Не назначен</div>
                        <div class="bulk-option-subtitle">Снять всех исполнителей</div>
                    </div>
                    <span class="bulk-option-arrow">→</span>
                </button>
                ${App.state.users.map(u => {
                const initials = u.name.split(' ').map(n => n[0]).join('').toUpperCase();
                return `
                        <button class="bulk-option" data-user-id="${u.id}">
                            <div class="bulk-option-avatar" style="background: ${App.safeColor(u.color)};">${initials}</div>
                            <div class="bulk-option-content">
                                <div class="bulk-option-title">${App.escapeHtml(u.name)}</div>
                                <div class="bulk-option-subtitle">${App.escapeHtml(App.getRoleLabel(u.role))}</div>
                            </div>
                            <span class="bulk-option-arrow">→</span>
                        </button>
                    `;
            }).join('')}
            </div>
        `;

    App.elements.bulkModalBody.innerHTML = html;
    App.elements.bulkModalBackdrop.classList.remove('hidden');
    App.elements.bulkModal.classList.remove('hidden');

    // Локальное состояние режима
    let currentMode = 'replace';

    // Переключатели режимов
    App.elements.bulkModalBody.querySelectorAll('.bulk-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            App.elements.bulkModalBody.querySelectorAll('.bulk-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;
        });
    });

    // Обработчики кликов по пользователям
    App.elements.bulkModalBody.querySelectorAll('.bulk-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const userId = opt.dataset.userId;
            const userName = userId
                ? (App.state.users.find(u => u.id === userId)?.name || userId)
                : null;

            App.state.tasks.forEach(task => {
                if (!App.ui.selectedTasks.includes(task.id)) return;

                // Инициализируем массив исполнителей, если его нет
                if (!Array.isArray(task.assignees)) {
                    task.assignees = task.assignee ? [task.assignee] : [];
                }

                const oldAssignees = [...task.assignees];

                switch (currentMode) {
                    case 'replace':
                        task.assignees = userId ? [userId] : [];
                        break;
                    case 'add':
                        if (userId && !task.assignees.includes(userId)) {
                            task.assignees.push(userId);
                        }
                        break;
                    case 'remove':
                        if (userId) {
                            task.assignees = task.assignees.filter(id => id !== userId);
                        } else {
                            task.assignees = [];
                        }
                        break;
                }

                // Обновляем строку assignee для обратной совместимости
                task.assignee = task.assignees[0] || '';
                task.version = (task.version || 1) + 1;
                task.updatedAt = new Date().toISOString();

                // CHANGELOG: логируем изменения
                const added = task.assignees.filter(id => !oldAssignees.includes(id));
                const removed = oldAssignees.filter(id => !task.assignees.includes(id));

                added.forEach(id => {
                    const name = App.state.users.find(u => u.id === id)?.name || id;
                    App.logChange(task.id, 'assignee_added', null, name, 'assignees');
                });

                removed.forEach(id => {
                    const name = App.state.users.find(u => u.id === id)?.name || id;
                    App.logChange(task.id, 'assignee_removed', name, null, 'assignees');
                });

                // Если режим replace и нет added/removed — логируем как обычное изменение
                if (currentMode === 'replace' && added.length === 0 && removed.length === 0 && oldAssignees.join(',') !== task.assignees.join(',')) {
                    const oldName = oldAssignees.map(id => App.state.users.find(u => u.id === id)?.name).filter(Boolean).join(', ') || 'Не назначен';
                    const newName = userName || 'Не назначен';
                    App.logChange(task.id, 'assignee_changed', oldName, newName, 'assignee');
                }
            });

            const modeLabels = {
                replace: 'Заменены исполнители',
                add: 'Добавлен исполнитель',
                remove: 'Удалён исполнитель'
            };

            App.saveState();
            App.render();
            App.closeBulkModal();
            App.showToast(`${modeLabels[currentMode]} в ${count} задачах`, 'success');
        });
    });
};

/**
 * Привязывает обработчики панели массовых действий (bulk actions).
 * Вынесено из core/bindEvents.js для декомпозиции God Function.
 */
App.bindBulkActionEvents = function() {
    App.elements.bulkDeleteBtn.addEventListener('click', () => App.bulkDelete());
    App.elements.bulkStatusBtn.addEventListener('click', () => App.bulkChangeStatus());
    App.elements.bulkPriorityBtn.addEventListener('click', () => App.bulkChangePriority());
    App.elements.bulkAssigneeBtn.addEventListener('click', () => App.bulkChangeAssignee());
    App.elements.bulkClearBtn.addEventListener('click', () => App.clearBulkSelection());
    App.elements.bulkModalClose.addEventListener('click', () => App.closeBulkModal());
    App.elements.bulkModalBackdrop.addEventListener('click', () => App.closeBulkModal());
};
