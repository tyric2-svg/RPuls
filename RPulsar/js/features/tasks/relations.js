// js/features/tasks/relations.js
window.App = window.App || {};

// Упрощённая модель связей: один тип — простая двусторонняя связь между
// задачами ("Связана с"), без блокировок и иерархии (parent/child).
// Раньше здесь было 4 типа связи (blocks/blocked_by/parent/child/related) с
// вычислением App.canCompleteTask, но эта проверка нигде не применялась при
// смене статуса (баг), а сама функциональность блокировок не нужна — поэтому
// упрощено до одного понятного типа связи.

App.getTaskRelations = function(taskId) {
    return (App.state.relations || []).filter(r => r.taskId1 === taskId || r.taskId2 === taskId);
};

App.renderRelations = function(taskId) {
    const relations = App.getTaskRelations(taskId);
    const items = relations
        .map(rel => {
            const otherTaskId = rel.taskId1 === taskId ? rel.taskId2 : rel.taskId1;
            const otherTask = App.state.tasks.find(t => t.id === otherTaskId);
            if (!otherTask) return null;
            return {...rel, otherTask};
        })
        .filter(Boolean);

    let html = '<div class="relations-section collapsible-section" data-field="relations">';
    html += `<div class="task-detail-label-row"><div class="task-detail-label">${App.icon('link-2', 'sm')} Связи с задачами</div><button type="button" class="field-collapse-toggle" data-field-toggle="relations" aria-label="Свернуть/развернуть «Связи с задачами»">${App.icon('chevron-down', 'xs')}</button></div>`;

    if (items.length > 0) {
        html += `
<div class="relation-group">
<div class="relation-list">
${items.map(item => {
            const status = App.state.statuses.find(s => s.id === item.otherTask.status);
            return `
<div class="relation-item" data-task-id="${item.otherTask.id}">
<div class="relation-icon">${App.icon('link-2', 'sm')}</div>
<div class="relation-content">
<div class="relation-title">${App.escapeHtml(item.otherTask.title)}</div>
<div class="relation-meta">
<span class="badge" style="background: ${App.safeColor(status?.color)}20; color: ${App.safeColor(status?.color)};">${App.escapeHtml(status?.name || '')}</span>
</div>
</div>
<button class="btn btn-ghost btn-icon relation-remove" data-relation-id="${item.id}" title="Удалить связь">✕</button>
</div>
`;
        }).join('')}
</div>
</div>
`;
    }

    html += `
<button class="relation-add-btn" id="addRelationBtn">
${App.icon('plus', 'sm')}
<span>Добавить связь</span>
</button>
`;
    html += '</div>';
    return html;
};

App.openRelationPicker = function(taskId) {
    const existingRelations = App.getTaskRelations(taskId);
    const relatedTaskIds = existingRelations.map(r => r.taskId1 === taskId ? r.taskId2 : r.taskId1);
    const availableTasks = App.visibleTasks().filter(t => t.id !== taskId && !relatedTaskIds.includes(t.id));
    const html = `
<div class="form-group">
<label class="form-label">Выберите задачу</label>
<input type="text" class="form-input" id="relationSearch" placeholder="Поиск задачи..." autofocus>
</div>
<div class="relation-picker" id="relationTaskList">
${availableTasks.length === 0 ? '<div class="text-muted" style="text-align:center; padding:20px;">Нет доступных задач</div>' : availableTasks.map(task => {
        const status = App.state.statuses.find(s => s.id === task.status);
        return `
<div class="relation-item" data-task-id="${task.id}" style="margin-bottom: var(--space-2);">
<div class="relation-content">
<div class="relation-title">${App.escapeHtml(task.title)}</div>
<div class="relation-meta">
<span class="badge" style="background: ${App.safeColor(status?.color)}20; color: ${App.safeColor(status?.color)};">${App.escapeHtml(status?.name || '')}</span>
</div>
</div>
</div>
`;
    }).join('')}
</div>
`;
    App.openDrawer('Добавить связь', html, `
<button class="btn btn-secondary" id="cancelRelationBtn">Отмена</button>
<button class="btn btn-primary" id="confirmRelationBtn" disabled>Добавить</button>
`);
    let selectedTaskId = null;

    // Enter в поиске связей — ничего не делаем (предотвращаем submit)
    document.getElementById('relationSearch').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
        }
    });
    document.getElementById('relationSearch').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('#relationTaskList .relation-item').forEach(item => {
            const title = item.querySelector('.relation-title').textContent.toLowerCase();
            item.style.display = title.includes(query) ? 'flex' : 'none';
        });
    });
    document.querySelectorAll('#relationTaskList .relation-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('#relationTaskList .relation-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedTaskId = App.parseId(item.dataset.taskId);
            document.getElementById('confirmRelationBtn').disabled = !selectedTaskId;
        });
    });
    document.getElementById('cancelRelationBtn').addEventListener('click', () => {
        App.closeDrawer();
        App.openTaskDetail(taskId);
    });
    document.getElementById('confirmRelationBtn').addEventListener('click', () => {
        App.state.relations.push({
            id: App.generateId(),
            taskId1: taskId,
            taskId2: selectedTaskId,
            type: 'related'
        });
        App.saveState();
        App.closeDrawer();
        App.openTaskDetail(taskId);
        App.showToast('Связь добавлена', 'success');
    });
};

App.removeRelation = async function(relationId, taskId) {
    const confirmed = await App.confirmDialog('Удалить связь?', {danger: true});
    if (!confirmed) return;
    App.state.relations = App.state.relations.filter(r => r.id !== relationId);
    App.saveState();
    App.openTaskDetail(taskId);
    App.showToast('Связь удалена', 'success');
};
