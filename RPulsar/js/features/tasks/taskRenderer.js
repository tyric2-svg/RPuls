// js/features/tasks/taskRenderer.js
window.App = window.App || {};

App.visibleTasks = function() {
    return App.state.tasks.filter(t =>
        t.visibility !== 'private' || t.owner === App.state.currentUser
    );
};

App.getFilteredTasks = function() {
    if (App.ui.search.includes(':')) {
        return App.applyAdvancedSearch(App.ui.search);
    }
    let filteredTasks = App.visibleTasks();
    const searchTerm = App.ui.search.toLowerCase();
    if (searchTerm) {
        filteredTasks = filteredTasks.filter(task =>
            task.title.toLowerCase().includes(searchTerm) ||
            (task.description && task.description.toLowerCase().includes(searchTerm))
        );
    }
    if (App.state.filters.status.length > 0) {
        filteredTasks = filteredTasks.filter(t => App.state.filters.status.includes(t.status));
    }
    if (App.state.filters.assignee.length > 0) {
        const assigneeFilter = App.state.filters.assignee;
        const includeUnassigned = assigneeFilter.includes('');
        filteredTasks = filteredTasks.filter(t => {
            const assigneeIds = Array.isArray(t.assignees) && t.assignees.length > 0
                ? t.assignees
                : (t.assignee ? [t.assignee] : []);
            // Фильтр '' означает "без исполнителя". Раньше такая задача
            // исключалась в table-view, потому что [].some(...) = false.
            // Теперь обрабатываем явно: если включён фильтр "unassigned"
            // и у задачи нет исполнителей — она проходит.
            if (includeUnassigned && assigneeIds.length === 0) return true;
            return assigneeIds.some(id => assigneeFilter.includes(id));
        });
    }
    if (App.state.filters.priority.length > 0) {
        filteredTasks = filteredTasks.filter(t => App.state.filters.priority.includes(t.priority));
    }
    if (App.state.currentSection === 'assignments') {
        filteredTasks = filteredTasks.filter(t => App.matchesAssignmentMode(t));
    }
    const sort = App.state.sort;
    if (sort === 'priority') {
        const priorityOrder = {high: 3, medium: 2, low: 1};
        filteredTasks.sort((a, b) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0));
    } else if (sort === 'dueDate') {
        filteredTasks.sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'));
    } else {
        const orderMap = new Map(App.state.taskOrder.map((id, index) => [id, index]));
        filteredTasks.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
    }
    return filteredTasks;
};

App.matchesAssignmentMode = function(t) {
    if (!t.owner || !t.assignee) return false;
    if (App.ui.assignmentsMode === 'given') {
        return t.owner === App.state.currentUser && t.assignee !== App.state.currentUser;
    }
    return t.assignee === App.state.currentUser && t.owner !== App.state.currentUser;
};

App.updateTaskFocus = function() {
    const rows = App.elements.tasksBody.querySelectorAll('tr');
    rows.forEach((row, index) => {
        if (index === App.ui.focusedTaskIndex) {
            row.classList.add('focused');
            row.setAttribute('tabindex', '0');
        } else {
            row.classList.remove('focused');
            row.setAttribute('tabindex', '-1');
        }
    });
};

App.focusTaskRow = function(index) {
    const rows = App.elements.tasksBody.querySelectorAll('tr:not(.load-more-tasks-row)');
    if (index >= 0 && index < rows.length) {
        App.ui.focusedTaskIndex = index;
        App.updateTaskFocus();
        rows[index].focus();
        rows[index].scrollIntoView({block: 'nearest', behavior: 'smooth'});
    }
};

App.renderTableHeader = function() {
    const visibleCols = App.state.columns.filter(c => c.visible);
    App.elements.tableHeader.innerHTML = visibleCols.map(col => {
        const width = col.width ? `width: ${col.width}px;` : '';
        return `<th data-col-id="${col.id}" style="${width}" data-sort="${col.id}" role="columnheader" scope="col">${App.escapeHtml(col.name)}</th>`;
    }).join('');
};

App.renderTasks = function() {
    if ((App.state.currentSection !== 'tasks' && App.state.currentSection !== 'assignments') || App.state.view === 'kanban') return;
    const filteredTasks = App.getFilteredTasks();
    if (filteredTasks.length === 0 && App.state.tasks.length === 0) {
        App.elements.emptyState.classList.remove('hidden');
        App.elements.tasksBody.innerHTML = '';
    } else {
        App.elements.emptyState.classList.add('hidden');
        const visibleCols = App.state.columns.filter(c => c.visible);
        const activeTasks = filteredTasks.filter(t => t.status !== 'done');
        const completedTasks = filteredTasks.filter(t => t.status === 'done');

        const limit = App.ui.renderedTaskLimit || App.TASK_PAGE_SIZE;
        const tasksToRender = activeTasks.slice(0, limit);
        const hasMore = activeTasks.length > limit;

        let html = tasksToRender.map((task, index) => `
            <tr data-id="${task.id}" data-index="${index}"
                class="${App.ui.selectedTasks.includes(task.id) ? 'bulk-selected' : ''} ${App.ui.focusedTaskIndex === index ? 'focused' : ''}"
                draggable="true" role="row"
                tabindex="${App.ui.focusedTaskIndex === index ? '0' : '-1'}"
                aria-selected="${App.ui.focusedTaskIndex === index}"
                title="Двойной клик для открытия">
                ${visibleCols.map(col => App.renderTableCell(task, col)).join('')}
            </tr>
        `).join('');

        if (hasMore) {
            html += `
                <tr class="load-more-tasks-row" aria-hidden="false">
                    <td colspan="${visibleCols.length}" style="padding: 0; border: none;">
                        <button type="button" class="load-more-tasks-btn">
                            Показать ещё ${Math.min(App.TASK_PAGE_SIZE, activeTasks.length - limit)} из ${activeTasks.length - limit} оставшихся
                        </button>
                    </td>
                </tr>
            `;
        }

        if (completedTasks.length > 0) {
            const isExpanded = localStorage.getItem('rpulsar_completed_expanded') === 'true';
            const chevronRotation = isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
            html += `
                <tr class="completed-section-row">
                    <td colspan="${visibleCols.length}" style="padding: 0; border: none; border-top: 2px solid var(--border-default);">
                        <button type="button" class="completed-toggle-btn" style="width: 100%; padding: 10px 16px; background: var(--bg-secondary); border: none; color: var(--text-secondary); font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 8px; font-family: inherit;">
                            <span style="display: inline-flex; transition: transform 150ms ease; transform: ${chevronRotation};">${App.icon('chevron-right', 'xs')}</span>
                            <span>Выполнено</span>
                            <span style="background: var(--bg-primary); border: 1px solid var(--border-default); padding: 1px 8px; border-radius: 9999px; font-size: 11px; color: var(--text-muted); font-weight: 600;">${completedTasks.length}</span>
                        </button>
                    </td>
                </tr>
            `;
            if (isExpanded) {
                html += completedTasks.map((task, index) => {
                    const globalIndex = activeTasks.length + index;
                    return `
                        <tr data-id="${task.id}" data-index="${globalIndex}"
                            class="${App.ui.selectedTasks.includes(task.id) ? 'bulk-selected' : ''}"
                            draggable="true" role="row"
                            tabindex="-1"
                            title="Двойной клик для открытия">
                            ${visibleCols.map(col => App.renderTableCell(task, col)).join('')}
                        </tr>
                    `;
                }).join('');
            }
        }
        App.elements.tasksBody.innerHTML = html;
    }
};

App.renderTableCell = function(task, col) {
    const width = col.width ? `width: ${col.width}px;` : '';
    const label = App.escapeHtml(col.name || '');

    switch (col.id) {
        case 'checkbox':
            const checked = App.ui.selectedTasks.includes(task.id);
            return `<td data-col-id="${col.id}" data-label="${label}" style="${width}" role="gridcell"><div class="checkbox ${checked ? 'checked' : ''}" data-id="${task.id}" role="checkbox" aria-checked="${checked}" tabindex="0"></div></td>`;
        case 'drag':
            return `<td data-col-id="${col.id}" data-label="${label}" style="${width}" role="gridcell"><span class="drag-handle" aria-label="Перетащить">${App.icon('grip-vertical', 'sm')}</span></td>`;
        case 'id':
            return `<td data-col-id="${col.id}" data-label="${label}" style="${width}" class="muted" role="gridcell">#${String(task.id).slice(-4)}</td>`;
        case 'title':
            return `<td data-col-id="${col.id}" data-label="${label}" style="${width}" role="gridcell">
                <div style="font-weight: 500; display: flex; align-items: center; gap: 6px;">
                ${task.visibility === 'private' ? '<span title="Личная задача — видна только вам">' + App.icon('lock', 'xs') + '</span>' : ''}
                ${App.escapeHtml(task.title)}
                </div>
                ${task.subtasks?.length > 0 ? `<div class="muted" style="font-size: 11px; margin-top: 4px;">${App.icon('clipboard-list', 'xs')} ${task.subtasks.filter(s => s.completed).length}/${task.subtasks.length}</div>` : ''}
            </td>`;
        case 'description':
            return `<td data-col-id="${col.id}" data-label="${label}" style="${width}" role="gridcell" class="muted">
                ${task.description ? `<div class="task-description-cell">${App.renderMarkdown(task.description)}</div>` : '<span style="opacity: 0.4;">—</span>'}
            </td>`;
        case 'status':
            const status = App.state.statuses.find(s => s.id === task.status) || { name: task.status, color: '#6B6B6B' };
            return `<td data-col-id="${col.id}" data-label="${label}" style="${width}" role="gridcell"><span class="badge" style="background: ${App.safeColor(status.color)}20; color: ${App.safeColor(status.color)};">${App.escapeHtml(status.name)}</span></td>`;
        case 'priority': {
            const priorityIcons = {high: 'alert-triangle', medium: 'zap', low: 'arrow-down'};
            return `<td data-col-id="${col.id}" data-label="${label}" style="${width}" role="gridcell"><span class="badge badge-priority-${task.priority}" style="display: inline-flex; align-items: center; gap: 4px;">${App.icon(priorityIcons[task.priority] || 'zap', 'xs')}${App.getPriorityLabel(task.priority)}</span></td>`;
        }
        case 'assignee': {
            const assigneeIds = Array.isArray(task.assignees) && task.assignees.length > 0
                ? task.assignees
                : (task.assignee ? [task.assignee] : []);

            const allNames = assigneeIds.map(id => App.state.users.find(u => u.id === id)?.name).filter(Boolean);
            const namesText = allNames.length <= 2 ? allNames.join(', ') : `${allNames[0]} +${allNames.length - 1}`;
            const tooltipText = App.escapeHtml(allNames.join(', '));

            return `<td data-col-id="${col.id}" data-label="${label}" style="${width}" role="gridcell">
                <div class="assignees-cell" title="${tooltipText}">
                    ${App.renderAvatarStack(assigneeIds)}
                    <span class="assignees-names">${App.escapeHtml(namesText) || 'Не назначен'}</span>
                </div>
            </td>`;
        }
        case 'dueDate':
            const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done';
            const overdueStyle = isOverdue ? 'color: var(--error);' : '';
            return `<td data-col-id="${col.id}" data-label="${label}" style="${width}${overdueStyle}" class="muted" role="gridcell">${task.dueDate ? App.formatDate(task.dueDate) : '—'}</td>`;
        default:
            return `<td data-col-id="${col.id}" data-label="${label}" style="${width}" class="muted" role="gridcell">—</td>`;
    }
};