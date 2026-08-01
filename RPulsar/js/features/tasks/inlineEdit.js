// js/features/tasks/inlineEdit.js
window.App = window.App || {};

        /**
         * Закрывает все открытые inline-dropdown (вызывается при клике вне, Esc, открытии нового)
         */
App.closeInlineDropdown = function() {
            const dropdown = document.getElementById('inlineDropdown');
            if (dropdown) dropdown.remove();
            App._inlineDropdownTarget = null;
};
        /**
         * Открывает dropdown для inline-редактирования мета-поля (Linear-style).
         * Позиционирует dropdown под кнопкой-триггером.
         */
App.openInlineDropdown = function(trigger, field, taskId) {
            App.closeInlineDropdown();
            const task = App.state.tasks.find(t => t.id === taskId);
            if (!task) return;
            let items = [];
            let currentSelected = null;
            let isMultiSelect = false;

            switch (field) {
                case 'status':
                    items = App.state.statuses.map(s => ({
                        value: s.id,
                        label: s.name,
                        iconHtml: `<div class="inline-dropdown-item-icon" style="background: ${App.safeColor(s.color)};"></div>`
                    }));
                    currentSelected = task.status;
                    break;
                case 'priority':
                    items = [
                        {
                            value: 'high',
                            label: 'Высокий',
                            iconHtml: `<span style="color: var(--error);">${App.icon('alert-triangle', 'sm')}</span>`
                        },
                        {
                            value: 'medium',
                            label: 'Средний',
                            iconHtml: `<span style="color: var(--warning);">${App.icon('zap', 'sm')}</span>`
                        },
                        {
                            value: 'low',
                            label: 'Низкий',
                            iconHtml: `<span style="color: var(--info);">${App.icon('arrow-down', 'sm')}</span>`
                        }
                    ];
                    currentSelected = task.priority;
                    break;
                case 'assignee':
                    isMultiSelect = true; // ⭐ Мульти-выбор для исполнителей
                    items = App.state.users.map(u => ({
                        value: u.id,
                        label: u.name,
                        iconHtml: `<div class="inline-dropdown-item-avatar" style="background: ${App.safeColor(u.color)};">${App.escapeHtml(u.name).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}</div>`
                    }));
// Для мульти-выбора currentSelected — это массив
                    currentSelected = Array.isArray(task.assignees) ? task.assignees : (task.assignee ? [task.assignee] : []);
                    break;
            }
            const dropdown = document.createElement('div');
            dropdown.id = 'inlineDropdown';
            dropdown.className = 'inline-dropdown' + (isMultiSelect ? ' inline-dropdown-multi' : '');
            dropdown.setAttribute('role', 'listbox');

            if (isMultiSelect) {
// === МУЛЬТИ-ВЫBOR ===
                const selectedCount = currentSelected.length;
                dropdown.innerHTML = `
<div class="inline-dropdown-multi-header">
<span class="inline-dropdown-multi-title">Исполнители</span>
<span class="inline-dropdown-multi-count">${selectedCount} выбрано</span>
</div>
<div class="inline-dropdown-multi-items">
${items.map(item => {
                    const isSelected = currentSelected.includes(item.value);
                    return `
<div class="inline-dropdown-multi-item ${isSelected ? 'selected' : ''}"
data-value="${App.escapeHtml(item.value)}"
role="option"
aria-selected="${isSelected}"
tabindex="0">
<div class="inline-dropdown-multi-checkbox"></div>
${item.iconHtml}
<span>${App.escapeHtml(item.label)}</span>
</div>
`;
                }).join('')}
</div>
<div class="inline-dropdown-multi-footer">
<button class="btn btn-secondary" data-action="cancel">Отмена</button>
<button class="btn btn-primary" data-action="apply">Применить</button>
</div>
`;

// Локальное состояние выбора (до нажатия "Применить")
                let selectedValues = [...currentSelected];

// Обработчики кликов по элементам
                dropdown.querySelectorAll('.inline-dropdown-multi-item').forEach(item => {
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const value = item.dataset.value;
                        const index = selectedValues.indexOf(value);
                        if (index === -1) {
                            selectedValues.push(value);
                            item.classList.add('selected');
                        } else {
                            selectedValues.splice(index, 1);
                            item.classList.remove('selected');
                        }
// Обновляем счётчик
                        dropdown.querySelector('.inline-dropdown-multi-count').textContent = `${selectedValues.length} выбрано`;
                    });
                });

// Кнопка "Применить"
                dropdown.querySelector('[data-action="apply"]').addEventListener('click', (e) => {
                    e.stopPropagation();
                    App.applyInlineChange(taskId, field, selectedValues);
                    App.closeInlineDropdown();
                });

// Кнопка "Отмена"
                dropdown.querySelector('[data-action="cancel"]').addEventListener('click', (e) => {
                    e.stopPropagation();
                    App.closeInlineDropdown();
                });

            } else {
// === ОДИНОЧНЫЙ ВЫБОР (status, priority) ===
                dropdown.innerHTML = items.map(item => `
<div class="inline-dropdown-item ${item.value === currentSelected ? 'selected' : ''}"
data-value="${App.escapeHtml(item.value)}"
role="option"
aria-selected="${item.value === currentSelected}"
tabindex="0">
${item.iconHtml}
<span>${App.escapeHtml(item.label)}</span>
<span class="inline-dropdown-item-check">✓</span>
</div>
`).join('');

// Обработчики кликов по элементам (одиночный выбор)
                dropdown.querySelectorAll('.inline-dropdown-item').forEach(item => {
                    const handler = () => {
                        const newValue = item.dataset.value;
                        App.applyInlineChange(taskId, field, newValue);
                        App.closeInlineDropdown();
                    };
                    item.addEventListener('click', handler);
                    item.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handler();
                        }
                    });
                });
            }
            document.body.appendChild(dropdown);
// Позиционируем dropdown под триггером
            const rect = trigger.getBoundingClientRect();
            const dropdownRect = dropdown.getBoundingClientRect();
            let top = rect.bottom + 4;
            let left = rect.left;
// Защита от выхода за правый край экрана
            if (left + dropdownRect.width > window.innerWidth - 8) {
                left = window.innerWidth - dropdownRect.width - 8;
            }
// Защита от выхода за нижний край — открываем вверх
            if (top + dropdownRect.height > window.innerHeight - 8) {
                top = rect.top - dropdownRect.height - 4;
            }
            dropdown.style.top = `${top}px`;
            dropdown.style.left = `${left}px`;
            App._inlineDropdownTarget = trigger;

// Закрытие по клику вне dropdown
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
         * Применяет inline-изменение мета-поля и сохраняет в ChangeLog.
         * Автоматически ре-рендерит Drawer с актуальными данными.
         */
App.applyInlineChange = function(taskId, field, newValue) {
            const index = App.state.tasks.findIndex(t => t.id === taskId);
            if (index === -1) return;
            const task = App.state.tasks[index];
            const oldValue = task[field];
            if (oldValue === newValue) return;
            // ПРОВЕРКА ПРАВ для назначения
            if (field === 'assignee' && newValue && newValue !== App.state.currentUser) {
                if (task.visibility === 'private') {
                    task.visibility = 'team';
                    App.showToast('Задача назначена другому — сделана командной', 'info');
                }
            }

// Специальная обработка для assignee: работа с массивом
            if (field === 'assignee') {
                const oldAssignees = Array.isArray(task.assignees) ? task.assignees : (task.assignee ? [task.assignee] : []);
                const newAssignees = Array.isArray(newValue) ? newValue : (newValue ? [newValue] : []);

// Обновляем массив и строку (для обратной совместимости)
                task.assignees = newAssignees;
                task.assignee = newAssignees[0] || '';

// CHANGELOG: логируем изменения массива
                const added = newAssignees.filter(id => !oldAssignees.includes(id));
                const removed = oldAssignees.filter(id => !newAssignees.includes(id));

                added.forEach(userId => {
                    const userName = App.state.users.find(u => u.id === userId)?.name || userId;
                    App.logChange(taskId, 'assignee_added', null, userName, 'assignees');
                });

                removed.forEach(userId => {
                    const userName = App.state.users.find(u => u.id === userId)?.name || userId;
                    App.logChange(taskId, 'assignee_removed', userName, null, 'assignees');
                });

// Проверка прав: если назначили другому — делаем задачу командной
                if (newAssignees.length > 0 && !newAssignees.includes(App.state.currentUser)) {
                    if (task.visibility === 'private') {
                        task.visibility = 'team';
                        App.showToast('Задача назначена другим — сделана командной', 'info');
                    }
                }
            } else {
                task[field] = newValue;
            }
            task.version = (task.version || 1) + 1;
            task.updatedAt = new Date().toISOString();
// CHANGELOG: логируем изменения
            const changeActions = {
                status: 'status_changed',
                priority: 'priority_changed',
                assignee: 'assignee_changed',
                dueDate: 'due_date_changed'
            };
            let logOldValue = oldValue;
            let logNewValue = newValue;
            if (field === 'status') {
                logOldValue = App.state.statuses.find(s => s.id === oldValue)?.name || oldValue;
                logNewValue = App.state.statuses.find(s => s.id === newValue)?.name || newValue;
            } else if (field === 'assignee') {
                logOldValue = App.state.users.find(u => u.id === oldValue)?.name || 'Не назначен';
                logNewValue = App.state.users.find(u => u.id === newValue)?.name || 'Не назначен';
            }
            App.logChange(taskId, changeActions[field], logOldValue, logNewValue, field);
            App.saveState();
// Обновляем Drawer и таблицу без мерцания
            App.openTaskDetail(taskId);
            App.renderTasks();
// Локальные toast-уведомления
            const messages = {
                status: `Статус изменён на «${logNewValue}»`,
                priority: `Приоритет изменён на «${logNewValue}»`,
                assignee: `Исполнитель: ${logNewValue}`,
                dueDate: `Срок: ${newValue ? App.formatDate(newValue) : 'не указан'}`
            };
            App.showToast(messages[field], 'success');
};
