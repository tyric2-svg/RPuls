// js/features/tasks/historyService.js
window.App = window.App || {};

App.mergeChangeLog = function(localLog, remoteLog) {
    const byId = new Map();
    [...localLog, ...remoteLog].forEach(entry => {
        if (entry && entry.id) byId.set(entry.id, entry);
    });
    const merged = [...byId.values()].sort((a, b) =>
        new Date(a.timestamp) - new Date(b.timestamp)
    );
    const MAX_LOG_SIZE = 1000;
    return merged.length > MAX_LOG_SIZE ? merged.slice(-MAX_LOG_SIZE) : merged;
};

App.logChange = function(taskId, action, oldValue = null, newValue = null, field = null) {
    if (!App.state.currentUser) return;
    if (!App.state.changeLog) App.state.changeLog = [];

    const entry = {
        id: App.generateId(),
        taskId: taskId,
        userId: App.state.currentUser,
        action: action,
        field: field,
        oldValue: oldValue,
        newValue: newValue,
        timestamp: new Date().toISOString()
    };

    App.state.changeLog.push(entry);

    const MAX_LOG_SIZE = 1000;
    if (App.state.changeLog.length > MAX_LOG_SIZE) {
        App.state.changeLog = App.state.changeLog.slice(-MAX_LOG_SIZE);
    }
};

App.getTaskHistory = function(taskId) {
    if (!App.state.changeLog) return [];
    return App.state.changeLog
        .filter(entry => entry.taskId === taskId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

App.renderHistoryEntry = function(entry) {
    const user = App.state.users.find(u => u.id === entry.userId);
    const userName = user ? App.escapeHtml(user.name) : 'Неизвестно';
    const userColor = user?.color || '#6B6B6B';
    const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase();

    let actionText = '';
    let badgeClass = 'history-badge-updated';
    let badgeIcon = '✏️';
    let detailsHtml = '';

    switch (entry.action) {
        case 'created':
            actionText = 'создал(а) задачу';
            badgeClass = 'history-badge-created';
            badgeIcon = App.icon('sparkles', 'sm');
            break;
        case 'deleted':
            actionText = 'удалил(а) задачу';
            badgeClass = 'history-badge-deleted';
            badgeIcon = App.icon('trash-2', 'sm');
            if (entry.oldValue?.title) {
                detailsHtml = `<div class="history-details">«${App.escapeHtml(entry.oldValue.title)}»</div>`;
            }
            break;
        case 'title_changed':
            actionText = 'изменил(а) название';
            badgeIcon = App.icon('pencil', 'sm');
            detailsHtml = `<div class="history-details"><div class="history-change"><span class="history-old-value">${App.escapeHtml(entry.oldValue || '')}</span><span>→</span><span class="history-new-value">${App.escapeHtml(entry.newValue || '')}</span></div></div>`;
            break;
        case 'description_changed':
            actionText = 'изменил(а) описание';
            badgeIcon = App.icon('file-text-2', 'sm');
            detailsHtml = `<div class="history-details" style="max-height: 60px; overflow-y: auto;">Описание обновлено</div>`;
            break;
        case 'status_changed':
            actionText = 'изменил(а) статус';
            badgeClass = 'history-badge-status';
            badgeIcon = App.icon('refresh-cw', 'sm');
            detailsHtml = `<div class="history-details"><div class="history-change"><span class="history-old-value">${App.escapeHtml(entry.oldValue || '')}</span><span>→</span><span class="history-new-value">${App.escapeHtml(entry.newValue || '')}</span></div></div>`;
            break;
        case 'priority_changed':
            actionText = 'изменил(а) приоритет';
            badgeIcon = App.icon('zap', 'sm');
            detailsHtml = `<div class="history-details"><div class="history-change"><span class="history-old-value">${App.getPriorityLabel(entry.oldValue)}</span><span>→</span><span class="history-new-value">${App.getPriorityLabel(entry.newValue)}</span></div></div>`;
            break;
        case 'assignee_changed':
            actionText = 'изменил(а) исполнителя';
            badgeIcon = App.icon('user-check', 'sm');
            detailsHtml = `<div class="history-details"><div class="history-change"><span class="history-old-value">${App.escapeHtml(entry.oldValue || 'Не назначен')}</span><span>→</span><span class="history-new-value">${App.escapeHtml(entry.newValue || 'Не назначен')}</span></div></div>`;
            break;
        case 'assignee_added':
            actionText = 'добавил(а) исполнителя';
            badgeIcon = App.icon('user-check', 'sm');
            detailsHtml = `<div class="history-details">Назначен: <strong>${App.escapeHtml(entry.newValue || '')}</strong></div>`;
            break;
        case 'assignee_removed':
            actionText = 'удалил(а) исполнителя';
            badgeIcon = App.icon('user-check', 'sm');
            detailsHtml = `<div class="history-details">Снят: <strong>${App.escapeHtml(entry.oldValue || '')}</strong></div>`;
            break;
        case 'due_date_changed':
            actionText = 'изменил(а) срок';
            badgeIcon = App.icon('calendar-clock', 'sm');
            detailsHtml = `<div class="history-details"><div class="history-change"><span class="history-old-value">${entry.oldValue ? App.formatDate(entry.oldValue) : '—'}</span><span>→</span><span class="history-new-value">${entry.newValue ? App.formatDate(entry.newValue) : '—'}</span></div></div>`;
            break;
        case 'comment_added':
            actionText = 'добавил(а) комментарий';
            badgeClass = 'history-badge-comment';
            badgeIcon = App.icon('message-square', 'sm');
            if (entry.newValue) {
                detailsHtml = `<div class="history-details" style="max-height: 80px; overflow-y: auto;">${App.escapeHtml(entry.newValue)}</div>`;
            }
            break;
        case 'subtask_added':
            actionText = 'добавил(а) подзадачу';
            badgeIcon = App.icon('clipboard-list', 'sm');
            if (entry.newValue) {
                detailsHtml = `<div class="history-details">«${App.escapeHtml(entry.newValue)}»</div>`;
            }
            break;
        case 'subtask_toggled':
            actionText = 'обновил(а) подзадачу';
            badgeIcon = App.icon('check-circle-2', 'sm');
            const completed = entry.newValue === 'completed';
            detailsHtml = `<div class="history-details">«${App.escapeHtml(entry.field || '')}» — ${completed ? 'выполнена' : 'возобновлена'}</div>`;
            break;
        case 'subtask_deleted':
            actionText = 'удалил(а) подзадачу';
            badgeIcon = App.icon('trash-2', 'sm');
            if (entry.oldValue) {
                detailsHtml = `<div class="history-details">«${App.escapeHtml(entry.oldValue)}»</div>`;
            }
            break;
        case 'updated':
        default:
            actionText = 'обновил(а) задачу';
            badgeIcon = App.icon('pencil', 'sm');
            break;
    }

    return `
        <div class="history-item">
            <div class="history-avatar" style="background: ${App.safeColor(userColor)}">${userInitials}</div>
            <div class="history-content">
                <div class="history-header">
                    <span class="history-user">${userName}</span>
                    <span class="history-badge ${badgeClass}">${badgeIcon}</span>
                    <span class="history-action">${actionText}</span>
                    <span class="history-time">${App.formatRelativeTime(entry.timestamp)}</span>
                </div>
                ${detailsHtml}
            </div>
        </div>
    `;
};

App.showFullHistory = function(taskId) {
    const task = App.state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const history = App.getTaskHistory(taskId);
    let html = '<div class="history-timeline">';
    html += history.map(entry => App.renderHistoryEntry(entry)).join('');
    html += '</div>';

    App.openDrawer(`${App.icon('scroll-text', 'md')} История: ${App.escapeHtml(task.title)}`, html);
};