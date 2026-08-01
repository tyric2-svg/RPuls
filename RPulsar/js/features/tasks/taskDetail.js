// js/features/tasks/taskDetail.js
window.App = window.App || {};

App.openTaskDetail = function(id) {
            const task = App.state.tasks.find(t => t.id === id);
            if (!task) return;
            App.ui.currentTask = id;
            App.ui.openedTaskVersion = task.version || 1; // ЗАПОМИНАЕМ версию при открытии
            App.ui.lastFocusedElement = document.activeElement;
            const status = App.state.statuses.find(s => s.id === task.status) || {name: task.status, color: '#6B6B6B'};
            const assignee = App.state.users.find(u => u.id === task.assignee);
            const currentUser = App.state.users.find(u => u.id === App.state.currentUser);
            const html = `
<div class="task-detail-header">
<input type="text" class="task-detail-title" id="detailTitle" value="${App.escapeHtml(task.title)}" aria-label="Название" autocomplete="off">
<button class="btn btn-ghost btn-icon" id="detailEditBtn" title="Редактировать (E)">${App.icon('pencil', 'sm')}</button>
</div>
<div class="task-detail-meta">
<div class="task-detail-meta-item" title="Нажмите, чтобы изменить статус">
<button type="button" class="inline-edit-trigger" data-inline-field="status" data-task-id="${task.id}" aria-haspopup="listbox">
<span class="badge" style="background: ${App.safeColor(status.color)}20; color: ${App.safeColor(status.color)};">${App.escapeHtml(status.name)}</span>
</button>
</div>
<div class="task-detail-meta-item" title="Нажмите, чтобы изменить приоритет">
<button type="button" class="inline-edit-trigger" data-inline-field="priority" data-task-id="${task.id}" aria-haspopup="listbox">
<span class="badge badge-priority-${task.priority}">${App.getPriorityLabel(task.priority)}</span>
</button>
</div>
<div class="task-detail-meta-item" title="Нажмите, чтобы изменить исполнителей">
<button type="button" class="inline-edit-trigger" data-inline-field="assignee" data-task-id="${task.id}" aria-haspopup="listbox">
 ${(() => {
                const ids = Array.isArray(task.assignees) && task.assignees.length > 0
                    ? task.assignees
                    : (task.assignee ? [task.assignee] : []);
                if (ids.length === 0) {
                    return `${App.icon('user-check', 'sm')}<span class="meta-text">Не назначен</span>`;
                }
                const names = ids.map(id => App.state.users.find(u => u.id === id)?.name).filter(Boolean);
                const displayText = names.length <= 2 ? names.join(', ') : `${names[0]} +${names.length - 1}`;
                return `${App.renderAvatarStack(ids, true)}<span class="meta-text">${App.escapeHtml(displayText)}</span>`;
            })()}
</button>
</div>
<div class="task-detail-meta-item" title="Нажмите, чтобы изменить срок">
<input type="date" class="inline-date-input" data-inline-field="dueDate" data-task-id="${task.id}" value="${task.dueDate || ''}" aria-label="Срок выполнения">
</div>
</div>
<div class="task-detail-section collapsible-section" data-field="description">
<div class="task-detail-label-row">
<label class="task-detail-label" for="detailDescription">Описание (поддерживается Markdown)</label>
<button type="button" class="field-collapse-toggle" data-field-toggle="description" aria-label="Свернуть/развернуть «Описание»">${App.icon('chevron-down', 'xs')}</button>
</div>
<div id="detailDescriptionContainer" class="tiptap-editor-container"></div>
<textarea class="task-detail-description" id="detailDescription" style="display: none;">${App.escapeHtml(task.description || '')}</textarea>
</div>
${App.renderRelations(id)}
<div class="subtasks-section collapsible-section" data-field="subtasks">
<div class="task-detail-label-row">
<div class="task-detail-label">Подзадачи (${task.subtasks?.length || 0})</div>
<button type="button" class="field-collapse-toggle" data-field-toggle="subtasks" aria-label="Свернуть/развернуть «Подзадачи»">${App.icon('chevron-down', 'xs')}</button>
</div>
<div class="subtask-list" id="subtaskList">
${task.subtasks?.map((subtask, index) => `
<div class="subtask-item ${subtask.completed ? 'completed' : ''}" data-index="${index}">
<div class="checkbox subtask-checkbox ${subtask.completed ? 'checked' : ''}" data-index="${index}" role="checkbox" aria-checked="${subtask.completed}" tabindex="0"></div>
<div class="subtask-content">
<div class="subtask-title">${App.escapeHtml(subtask.title)}</div>
</div>
<div class="subtask-actions">
<button class="btn btn-ghost btn-icon delete-subtask-btn" data-index="${index}">${App.icon('trash-2', 'sm')}</button>
</div>
</div>
`).join('') || ''}
</div>
<div class="flex gap-2 mt-4">
<input type="text" class="subtask-add-input" id="subtaskInput" placeholder="Добавить подзадачу...">
<button class="btn btn-secondary" id="addSubtaskBtn">+</button>
</div>
</div>
${/* === HISTORY SECTION === */''}
<div class="history-section collapsible-section" data-field="history">
    <div class="task-detail-label-row">
    <div class="task-detail-label">${App.icon('scroll-text', 'sm')} История изменений</div>
    <button type="button" class="field-collapse-toggle" data-field-toggle="history" aria-label="Свернуть/развернуть «История изменений»">${App.icon('chevron-down', 'xs')}</button>
    </div>
    ${(() => {
                const history = App.getTaskHistory(id);
                if (history.length === 0) {
                    return '<div class="history-empty">История изменений пока пуста</div>';
                }
                const maxShow = 10;
                const visibleHistory = history.slice(0, maxShow);
                let html = '<div class="history-timeline">';
                html += visibleHistory.map(entry => App.renderHistoryEntry(entry)).join('');
                html += '</div>';
                if (history.length > maxShow) {
                    html += `
                <div class="history-load-more">
                    <button onclick="App.showFullHistory('${id}')">
                        Показать ещё ${history.length - maxShow} записей
                    </button>
                </div>`;
                }
                return html;
            })()}
</div>
<div class="comments-section collapsible-section" data-field="comments">
<div class="task-detail-label-row">
<div class="task-detail-label">Комментарии (${task.comments?.length || 0})</div>
<button type="button" class="field-collapse-toggle" data-field-toggle="comments" aria-label="Свернуть/развернуть «Комментарии»">${App.icon('chevron-down', 'xs')}</button>
</div>
<div id="commentsList">
${task.comments?.map(comment => {
                const commentUser = App.state.users.find(u => u.id === comment.userId);
                return `
<div class="comment">
<div class="comment-avatar" style="background: ${commentUser?.color || '#6B6B6B'}">
${commentUser ? App.escapeHtml(commentUser.name).split(' ').map(n => n[0]).join('').toUpperCase() : '?'}
</div>
<div class="comment-content">
<div class="comment-header">
<span class="comment-author">${commentUser ? App.escapeHtml(commentUser.name) : 'Неизвестно'}</span>
<span class="comment-time">${App.formatRelativeTime(comment.timestamp)}</span>
</div>
<div class="comment-text">${App.escapeHtml(comment.text)}</div>
</div>
</div>
`;
            }).join('') || '<div class="text-muted" style="text-align: center; padding: 20px;">Комментариев пока нет</div>'}
</div>
<div class="comment-input-container">
<div class="comment-avatar" style="background: ${currentUser?.color || '#2383E2'}">
${currentUser ? App.escapeHtml(currentUser.name).split(' ').map(n => n[0]).join('').toUpperCase() : '?'}
</div>
<textarea class="comment-input" id="commentInput" placeholder="Комментарий... (Enter — перенос строки, Ctrl+Enter — отправить)"></textarea>
</div>
<button class="btn btn-primary mt-4" id="addCommentBtn" style="width: 100%;">Добавить комментарий</button>
</div>
`;
            App.openDrawer('Детали задачи', html, `
<button class="btn btn-secondary" id="detailDeleteBtn">${App.icon('trash-2', 'sm')} Удалить</button>
<button class="btn btn-primary" id="detailSaveBtn" title="Сохранить (Alt+S — скоро добавим)">${App.icon('save', 'sm')} Сохранить</button>
`);
            App.applyCollapsedFields('drawer', App.elements.drawerBody);
            App.initDescriptionResizePersistence();
            
            // Инициализация Tiptap редактора для описания
            const descriptionTextarea = document.getElementById('detailDescription');
            if (descriptionTextarea && window.TiptapCore) {
                const initialContent = App.textToHtml(descriptionTextarea.value);
                setTimeout(() => {
                    App.descriptionEditor = App.initTiptapEditor('detailDescriptionContainer', initialContent, (html) => {
                        // Сохраняем HTML в скрытое textarea при изменении
                        descriptionTextarea.value = html;
                    });
                }, 100);
            }
            
            // Обработчики кликов/ввода внутри drawer теперь висят один раз через
            // делегирование в App.bindDrawerEvents (ui/drawer.js) — привязывать
            // их здесь заново при каждом открытии больше не нужно.
};
