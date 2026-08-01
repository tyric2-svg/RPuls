// js/core/utils.js
window.App = window.App || {};

App.escapeHtml = function(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replaceAll('"', '&quot;').replaceAll("'", '&#39;');
};

App.getLocalISODate = function(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

App.formatDate = function(dateStr) {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
};

App.formatRelativeTime = function(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'только что';
    if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} дн назад`;
    return this.formatDate(dateStr);
};

App.getPriorityLabel = function(priority) {
    return {low: 'Низкий', medium: 'Средний', high: 'Высокий'}[priority] || priority;
};

App.parseId = function(value) {
    if (value === null || value === undefined) return null;
    const str = String(value);
    if (str.includes('-') || isNaN(str)) return str;
    return parseInt(str, 10);
};

App.generateId = function() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
};

App.safeColor = function(color) {
    if (typeof color === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)) {
        return color;
    }
    return '#6B6B6B';
};

App.renderMarkdown = function(text) {
    if (!text) return '';
    let safe = this.escapeHtml(text);
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/(^|\s)\*([^*\n]+?)\*(\s|$|[.,!?])/g, '$1<em>$2</em>$3');
    safe = safe.replace(/~~(.+?)~~/g, '<del>$1</del>');
    safe = safe.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
    safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    safe = safe.replace(/\n/g, '<br>');
    return safe;
};

App.renderAvatarStack = function(assigneeIds, includeRemoveBtn = false) {
    const ids = Array.isArray(assigneeIds) && assigneeIds.length > 0
        ? assigneeIds
        : (typeof assigneeIds === 'string' && assigneeIds ? [assigneeIds] : []);

    if (ids.length === 0) {
        return `<span class="user-avatar-pill empty">${this.icon('user-check', 'xs')}</span>`;
    }

    const MAX_VISIBLE = 3;
    const visibleIds = ids.slice(0, MAX_VISIBLE);
    const overflowCount = ids.length - MAX_VISIBLE;

    const avatarsHtml = visibleIds.map(id => {
        const user = this.state.users.find(u => u.id === id);
        if (!user) return '';
        const initials = this.escapeHtml(user.name)
            .split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const removeBtn = includeRemoveBtn 
            ? `<span class="avatar-remove-btn" data-user-id="${user.id}" title="Удалить исполнителя">✕</span>` 
            : '';
        return `<span class="user-avatar-pill" style="background: ${this.safeColor(user.color)};" title="${this.escapeHtml(user.name)}">${initials}${removeBtn}</span>`;
    }).join('');

    const overflowHtml = overflowCount > 0
        ? `<span class="avatar-stack-overflow" title="${this.escapeHtml(ids.slice(MAX_VISIBLE).join(', '))}">+${overflowCount}</span>`
        : '';

    return `<div class="avatar-stack">${avatarsHtml}${overflowHtml}</div>`;
};