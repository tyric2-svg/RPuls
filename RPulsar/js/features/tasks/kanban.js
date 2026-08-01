// js/features/tasks/kanban.js
window.App = window.App || {};

/**
 * Показывает индикатор вставки между карточками Kanban.
 * Создаёт элемент один раз, дальше только обновляет позицию через transition.
 */
App.showKanbanDropIndicator = function(container, targetCard, position) {
    let indicator = document.getElementById('kanbanDropIndicator');

    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'drop-indicator';
        indicator.id = 'kanbanDropIndicator';
        container.appendChild(indicator);
    }

    // Если индикатор переехал в другой контейнер — переносим
    if (indicator.parentElement !== container) {
        container.appendChild(indicator);
    }

    // Вычисляем позицию
    if (!targetCard) {
        indicator.style.top = '12px';
    } else if (position === 'before') {
        const rect = targetCard.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        indicator.style.top = (rect.top - containerRect.top - 1) + 'px';
    } else if (position === 'after') {
        const rect = targetCard.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        indicator.style.top = (rect.bottom - containerRect.top + 1) + 'px';
    }
};

/**
 * Скрывает индикатор вставки
 */
App.hideKanbanDropIndicator = function() {
    const indicator = document.getElementById('kanbanDropIndicator');
    if (indicator) indicator.remove();
};

/**
 * Показывает вертикальный индикатор вставки между колонками Kanban.
 * @param {HTMLElement} container - контейнер .kanban-container
 * @param {HTMLElement} targetColumn - колонка, перед которой вставляем (null = в конец)
 */
App.showKanbanColumnDropIndicator = function(container, targetColumn) {
    let indicator = document.getElementById('kanbanColumnDropIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'kanban-column-drop-indicator';
        indicator.id = 'kanbanColumnDropIndicator';
        container.style.position = 'relative';
        container.appendChild(indicator);
    }

    // Если индикатор переехал в другой контейнер — переносим
    if (indicator.parentElement !== container) {
        container.appendChild(indicator);
    }

    // Вычисляем позицию
    if (!targetColumn) {
        // Вставка в конец — индикатор справа от последней колонки
        const columns = container.querySelectorAll('.kanban-column:not(.dragging)');
        if (columns.length > 0) {
            const lastColumn = columns[columns.length - 1];
            const rect = lastColumn.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            indicator.style.left = (rect.right - containerRect.left + 4) + 'px';
        } else {
            indicator.style.left = '12px';
        }
    } else {
        // Вставка перед целевой колонкой
        const rect = targetColumn.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        indicator.style.left = (rect.left - containerRect.left - 2) + 'px';
    }
};

/**
 * Скрывает индикатор вставки колонки
 */
App.hideKanbanColumnDropIndicator = function() {
    const indicator = document.getElementById('kanbanColumnDropIndicator');
    if (indicator) indicator.remove();
};

/**
 * Меняет порядок статусов (колонок) в state
 */
App.reorderStatuses = function(draggedStatusId, targetStatusId, position) {
    const statuses = [...App.state.statuses];
    const draggedIndex = statuses.findIndex(s => s.id === draggedStatusId);
    if (draggedIndex === -1) return;

    const [draggedStatus] = statuses.splice(draggedIndex, 1);

    if (!targetStatusId) {
        // Вставка в конец
        statuses.push(draggedStatus);
    } else {
        let targetIndex = statuses.findIndex(s => s.id === targetStatusId);
        if (targetIndex === -1) {
            statuses.push(draggedStatus);
        } else {
            if (position === 'after') {
                targetIndex++;
            }
            statuses.splice(targetIndex, 0, draggedStatus);
        }
    }

    App.state.statuses = statuses;
    App.saveState();
    App.render();
    App.showToast('Порядок колонок изменён', 'success');
};

App.renderKanban = function() {
    if ((App.state.currentSection !== 'tasks' && App.state.currentSection !== 'assignments') || App.state.view !== 'kanban') return;
    const filteredTasks = App.getFilteredTasks();
    // Сортировка колонок по порядку в state.statuses (уже отсортированы)
    const html = App.state.statuses.map(status => {
        let statusTasks = filteredTasks.filter(t => t.status === status.id);

// Сортировка карточек внутри колонки (если выбрана автоматическая сортировка)
        const sort = App.state.sort;
        if (sort === 'priority') {
            const priorityOrder = {high: 3, medium: 2, low: 1};
            statusTasks.sort((a, b) => {
                const aPriority = priorityOrder[a.priority] || 0;
                const bPriority = priorityOrder[b.priority] || 0;
                return bPriority - aPriority;
            });
        } else if (sort === 'dueDate') {
            statusTasks.sort((a, b) => {
                const aDate = a.dueDate || '9999-12-31';
                const bDate = b.dueDate || '9999-12-31';
                return aDate.localeCompare(bDate);
            });
        }
        return `
<div class="kanban-column" data-status="${status.id}" draggable="true">
<div class="kanban-column-header">
<div class="kanban-column-title">
<div style="width: 12px; height: 12px; border-radius: 50%; background: ${App.safeColor(status.color)};" aria-hidden="true"></div>
<span>${App.escapeHtml(status.name)}</span>
<span class="kanban-column-count">${statusTasks.length}</span>
</div>
<button
    class="kanban-column-add"
    data-status="${status.id}"
    title="Добавить задачу"
    type="button"
>+</button>
</div>
<div class="kanban-cards" data-status="${status.id}">
${statusTasks.length > 0 ? statusTasks.map(task => App.renderKanbanCard(task)).join('') : `
<div class="empty-state-compact">
<div class="empty-state-compact-icon">
<svg viewBox="0 0 24 24">
<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
<line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="1.5"/>
<line x1="12" y1="14" x2="12" y2="18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<line x1="10" y1="16" x2="14" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
</div>
<div class="empty-state-compact-title">Пока пусто</div>
<div class="empty-state-compact-hint">
Перетащите сюда задачу или нажмите <strong>+</strong> выше
</div>
</div>
`}
</div>
</div>
`;
    }).join('');
    App.elements.kanbanView.innerHTML = html;
    App.elements.kanbanView.querySelectorAll('.kanban-column-add').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const status = btn.dataset.status;
            App.openTaskModal();
            setTimeout(() => {
                App.elements.taskStatus.value = status;
            }, 100);
        });
    });
};

App.renderKanbanCard = function(task) {
    const assignee = App.state.users.find(u => u.id === task.assignee);
    const status = App.state.statuses.find(s => s.id === task.status);
    return `
<div class="kanban-card"
data-id="${task.id}"
data-priority="${task.priority || 'medium'}"
draggable="true"
tabindex="0">
<div class="kanban-card-title">
<span style="flex: 1; min-width: 0;">
${App.escapeHtml(task.title)}
</span>
</div>
${task.description ? `<div class="kanban-card-description">${App.renderMarkdown(task.description)}</div>` : ''}
<div class="kanban-card-footer">
    <div class="kanban-card-meta">
        ${task.dueDate ? `<span style="display: inline-flex; align-items: center; gap: 4px;">
            ${App.icon('calendar', 'xs')}
            ${App.formatDate(task.dueDate)}
        </span>` : ''}
        ${task.subtasks?.length > 0 ? `<span style="display: inline-flex; align-items: center; gap: 4px;">
            ${App.icon('check-circle-2', 'xs')}
            ${task.subtasks.filter(s => s.completed).length}/${task.subtasks.length}
        </span>` : ''}
    </div>
<span class="kanban-card-priority" data-priority="${task.priority || 'medium'}" style="display: inline-flex; align-items: center; gap: 4px;">
${App.icon({high: 'alert-triangle', medium: 'zap', low: 'arrow-down'}[task.priority] || 'zap', 'xs')}
${App.getPriorityLabel(task.priority || 'medium')}
</span>
 ${(() => {
                const ids = Array.isArray(task.assignees) && task.assignees.length > 0
                    ? task.assignees
                    : (task.assignee ? [task.assignee] : []);
                if (ids.length === 0) return '';
                const names = ids.map(id => App.state.users.find(u => u.id === id)?.name).filter(Boolean).join(', ');
                return `<div class="kanban-card-assignee" title="${App.escapeHtml(names)}">${App.renderAvatarStack(ids)}</div>`;
            })()}
</div>
</div>
`;
};

/**
 * Привязывает обработчики drag & drop для карточек и колонок Kanban.
 * Вынесено из core/bindEvents.js для декомпозиции God Function.
 */
App.bindKanbanEvents = function() {
    App.elements.kanbanView.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.kanban-card');
        if (!card) return;
        App.ui.draggedTask = App.parseId(card.dataset.id);
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    App.elements.kanbanView.addEventListener('dragend', (e) => {
        const card = e.target.closest('.kanban-card');
        if (card) card.classList.remove('dragging');
        App.ui.draggedTask = null;
        App.elements.kanbanView.querySelectorAll('.kanban-cards.drag-over').forEach(col =>
            col.classList.remove('drag-over')
        );
        App.hideKanbanDropIndicator();
    });

    App.elements.kanbanView.addEventListener('dragover', (e) => {
        const container = e.target.closest('.kanban-cards');
        if (!container) return;
        e.preventDefault();

        App.elements.kanbanView.querySelectorAll('.kanban-cards.drag-over').forEach(col =>
            col.classList.remove('drag-over')
        );
        container.classList.add('drag-over');

        if (App._kanbanDragOverThrottle) return;
        App._kanbanDragOverThrottle = true;
        requestAnimationFrame(() => {
            App._kanbanDragOverThrottle = false;

            const card = e.target.closest('.kanban-card');

            if (card && !card.classList.contains('dragging')) {
                const rect = card.getBoundingClientRect();
                const middleY = rect.top + rect.height / 2;
                const position = e.clientY < middleY ? 'before' : 'after';
                App.showKanbanDropIndicator(container, card, position);
            } else {
                const cards = container.querySelectorAll('.kanban-card:not(.dragging)');
                if (cards.length === 0) {
                    App.showKanbanDropIndicator(container, null, 'after');
                } else {
                    const lastCard = cards[cards.length - 1];
                    App.showKanbanDropIndicator(container, lastCard, 'after');
                }
            }
        });
    });

    App.elements.kanbanView.addEventListener('dragleave', (e) => {
        const column = e.target.closest('.kanban-cards');
        if (column && !column.contains(e.relatedTarget)) {
            column.classList.remove('drag-over');
            App.hideKanbanDropIndicator();
        }
    });
    App.hideKanbanDropIndicator();
    App.elements.kanbanView.querySelectorAll('.kanban-cards.drag-over').forEach(col =>
        col.classList.remove('drag-over')
    );
    App.elements.kanbanView.addEventListener('drop', (e) => {
        const column = e.target.closest('.kanban-cards');
        if (!column) return;
        e.preventDefault();

        const newStatus = column.dataset.status;
        if (App.ui.draggedTask) {
            const taskIndex = App.state.tasks.findIndex(t => t.id === App.ui.draggedTask);
            if (taskIndex === -1) return;

            const task = App.state.tasks[taskIndex];
            const oldStatus = task.status;

            if (oldStatus !== newStatus) {
                task.status = newStatus;
                const statusName = App.state.statuses.find(s => s.id === newStatus)?.name || newStatus;
                App.showToast(`Статус изменен на "${statusName}"`, 'success');
            }

            const targetCard = e.target.closest('.kanban-card');
            const taskOrderIndex = App.state.taskOrder.indexOf(App.ui.draggedTask);

            App.state.taskOrder.splice(taskOrderIndex, 1);

            if (targetCard && targetCard.dataset.id) {
                const targetId = App.parseId(targetCard.dataset.id);
                const targetOrderIndex = App.state.taskOrder.indexOf(targetId);
                if (targetOrderIndex !== -1) {
                    App.state.taskOrder.splice(targetOrderIndex, 0, App.ui.draggedTask);
                } else {
                    App.state.taskOrder.push(App.ui.draggedTask);
                }
            } else {
                const columnTasks = App.state.tasks
                    .filter(t => t.status === newStatus && t.id !== App.ui.draggedTask)
                    .map(t => t.id);

                if (columnTasks.length > 0) {
                    const lastTaskId = columnTasks[columnTasks.length - 1];
                    const lastOrderIndex = App.state.taskOrder.indexOf(lastTaskId);
                    if (lastOrderIndex !== -1) {
                        App.state.taskOrder.splice(lastOrderIndex + 1, 0, App.ui.draggedTask);
                    } else {
                        App.state.taskOrder.push(App.ui.draggedTask);
                    }
                } else {
                    App.state.taskOrder.push(App.ui.draggedTask);
                }
            }

            if (App.state.sort) {
                App.state.sort = null;
                App.updateSortButtonLabel();
                App.showToast('Переключено на ручной порядок', 'info');
            }

            App.saveState();
            App.render();
        }

        App.elements.kanbanView.querySelectorAll('.kanban-cards.drag-over, .kanban-cards.drag-over-inside').forEach(col =>
            col.classList.remove('drag-over', 'drag-over-inside')
        );
    });

    App.elements.kanbanView.addEventListener('dragstart', (e) => {
        const column = e.target.closest('.kanban-column');
        const card = e.target.closest('.kanban-card');
        if (card || !column) return;

        App.ui.draggedColumn = column.dataset.status;
        column.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'column');
    });

    App.elements.kanbanView.addEventListener('dragend', (e) => {
        const column = e.target.closest('.kanban-column');
        if (column) column.classList.remove('dragging');

        App.ui.draggedColumn = null;
        App.elements.kanbanView.querySelectorAll('.kanban-column.drag-over-column').forEach(col =>
            col.classList.remove('drag-over-column')
        );
        App.hideKanbanColumnDropIndicator();
    });

    App.elements.kanbanView.addEventListener('dragover', (e) => {
        if (!App.ui.draggedColumn) return;

        const column = e.target.closest('.kanban-column');
        const card = e.target.closest('.kanban-card');

        if (card) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        App.elements.kanbanView.querySelectorAll('.kanban-column.drag-over-column').forEach(col =>
            col.classList.remove('drag-over-column')
        );

        if (column && !column.classList.contains('dragging')) {
            const rect = column.getBoundingClientRect();
            const middleX = rect.left + rect.width / 2;
            const position = e.clientX < middleX ? 'before' : 'after';

            column.classList.add('drag-over-column');
            App.showKanbanColumnDropIndicator(App.elements.kanbanView,
                position === 'before' ? column : column.nextElementSibling);
        } else if (!column || column.classList.contains('dragging')) {
            App.showKanbanColumnDropIndicator(App.elements.kanbanView, null);
        }
    });

    App.elements.kanbanView.addEventListener('dragleave', (e) => {
        if (!App.ui.draggedColumn) return;

        const column = e.target.closest('.kanban-column');
        if (column && !column.contains(e.relatedTarget)) {
            column.classList.remove('drag-over-column');
        }
    });

    App.elements.kanbanView.addEventListener('drop', (e) => {
        if (!App.ui.draggedColumn) return;

        const column = e.target.closest('.kanban-column');
        const card = e.target.closest('.kanban-card');

        if (card) return;

        e.preventDefault();

        App.elements.kanbanView.querySelectorAll('.kanban-column.drag-over-column').forEach(col =>
            col.classList.remove('drag-over-column')
        );
        App.hideKanbanColumnDropIndicator();

        let targetStatusId = null;
        let position = 'after';

        if (column && !column.classList.contains('dragging')) {
            targetStatusId = column.dataset.status;
            const rect = column.getBoundingClientRect();
            const middleX = rect.left + rect.width / 2;
            position = e.clientX < middleX ? 'before' : 'after';
        }

        App.reorderStatuses(App.ui.draggedColumn, targetStatusId, position);

        App.ui.draggedColumn = null;
    });

    App.elements.kanbanView.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.kanban-column-add');
        if (addBtn) {
            e.stopPropagation();
            const status = addBtn.dataset.status;
            App.openTaskModal();
            setTimeout(() => {
                App.elements.taskStatus.value = status;
            }, 100);
            return;
        }
        const card = e.target.closest('.kanban-card');
        if (card && !card.classList.contains('dragging')) {
            App.openTaskDetail(App.parseId(card.dataset.id));
        }
    });
};
