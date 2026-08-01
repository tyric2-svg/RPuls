// js/features/chat/chatRenderer.js
window.App = window.App || {};

/**
 * Форматирует время сообщения как ЧЧ:ММ (локальное время браузера).
 */
App.chatFormatTime = function(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
};

/**
 * "Сегодня" / "Вчера" / "12 июля" — для разделителей дней в ленте.
 */
App.chatFormatDayLabel = function(timestamp) {
    const d = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a, b) => a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    if (sameDay(d, today)) return 'Сегодня';
    if (sameDay(d, yesterday)) return 'Вчера';
    return d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'long'});
};

App.chatRenderDayDivider = function(timestamp) {
    return `
<div class="chat-day-divider">
    <span class="chat-day-divider-line"></span>
    <span class="chat-day-divider-label">${App.chatFormatDayLabel(timestamp)}</span>
    <span class="chat-day-divider-line"></span>
</div>`;
};

/**
 * Подсвечивает @Полное Имя в тексте сообщения, если это имя реально
 * существующего пользователя — остальной текст экранируется как обычно.
 */
App.chatHighlightMentions = function(text) {
    const escaped = App.escapeHtml(text);
    if (!text.includes('@') || !App.state.users || App.state.users.length === 0) {
        return escaped;
    }
    const names = App.state.users
        .map(u => App.escapeHtml(u.name))
        .sort((a, b) => b.length - a.length) // длинные имена сначала — иначе "Иван" в "Иван Иванов" схватится раньше полного совпадения
        .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (names.length === 0) return escaped;
    const pattern = new RegExp(`@(${names.join('|')})`, 'g');
    return escaped.replace(pattern, '<span class="chat-mention">@$1</span>');
};

App.chatRenderMessage = function(msg) {
    if (msg.type === 'system') {
        return `
<div class="chat-system-message">
    <span>${App.chatFormatTime(msg.timestamp)} — ${App.escapeHtml(msg.text)}</span>
</div>`;
    }

    const author = App.state.users.find(u => u.id === msg.authorId);
    const authorName = author ? author.name : 'Бывший сотрудник';
    const authorInitials = authorName.split(' ').map(n => n[0]).join('').toUpperCase();
    const authorColor = App.safeColor(author?.color);

    return `
<div class="chat-message" data-message-id="${msg.id}">
    <div class="chat-message-avatar" style="background: ${authorColor}">${authorInitials}</div>
    <div class="chat-message-body">
        <div class="chat-message-header">
            <span class="chat-message-author">${App.escapeHtml(authorName)}</span>
            <span class="chat-message-time">${App.chatFormatTime(msg.timestamp)}</span>
        </div>
        <div class="chat-message-text">${App.chatHighlightMentions(msg.text)}</div>
    </div>
    <button class="chat-to-task-btn" data-message-id="${msg.id}" title="Создать задачу из сообщения">
        ${App.icon('plus', 'xs')} <span>В задачу</span>
    </button>
</div>`;
};

/**
 * Уведомление, показанное прямо в ленте чата — та же карточка, что и в
 * панели колокольчика, но встроенная в общую хронологию с сообщениями.
 * Клик — помечает прочитанным и открывает задачу (если есть), как и в
 * обычной панели уведомлений.
 */
App.chatRenderNotification = function(notif) {
    return `
<div class="chat-notification ${notif.read ? '' : 'unread'}" data-notification-id="${notif.id}">
    <span class="chat-notification-icon">${App.icon('bell', 'xs')}</span>
    <span class="chat-notification-title">${App.chatHighlightMentions(notif.title)}</span>
    ${notif.taskId ? `<span class="chat-notification-task-link">${App.icon('arrow-right', 'xs')}</span>` : ''}
    ${!notif.read ? '<span class="chat-notification-dot"></span>' : ''}
</div>`;
};

/**
 * Собирает единую хронологию из сообщений чата и уведомлений — панель
 * уведомлений (колокольчик) при этом никуда не делась, это дополнительное,
 * а не замещающее представление.
 */
App.chatBuildTimeline = function() {
    const chatItems = App.chat.messages.map(m => ({
        kind: m.type === 'system' ? 'system' : 'chat',
        ts: m.timestamp, // уже число (Date.now())
        data: m
    }));
    const notifItems = (App.state.notifications || []).map(n => ({
        kind: 'notification',
        ts: new Date(n.timestamp).getTime(), // ISO-строка -> число, для единой сортировки с чатом
        data: n
    }));
    return [...chatItems, ...notifItems].sort((a, b) => a.ts - b.ts);
};

/**
 * Полный рендер ленты чата + шапки (текущий пользователь, статус подключения).
 * Сохраняет прокрутку внизу — сообщения читаются как обычный чат сверху вниз.
 */
App.renderChat = function() {
    if (!App.elements.chatMessages) return;

    const currentUser = App.state.users.find(u => u.id === App.state.currentUser);
    if (App.elements.chatCurrentUserLabel) {
        App.elements.chatCurrentUserLabel.textContent = currentUser ? currentUser.name : '';
    }

    App.chatUpdateConnectionStatus();

    const wasNearBottom = App.chatIsScrolledNearBottom();
    const timeline = App.chatBuildTimeline();

    if (timeline.length === 0) {
        App.elements.chatMessages.innerHTML = '<div class="chat-empty-state">Сообщений пока нет — напишите первым.</div>';
        return;
    }

    let html = '';
    let lastDayKey = null;
    timeline.forEach(item => {
        const dayKey = new Date(item.ts).toDateString();
        if (dayKey !== lastDayKey) {
            html += App.chatRenderDayDivider(item.ts);
            lastDayKey = dayKey;
        }
        if (item.kind === 'notification') {
            html += App.chatRenderNotification(item.data);
        } else {
            html += App.chatRenderMessage(item.data);
        }
    });
    App.elements.chatMessages.innerHTML = html;

    if (wasNearBottom) {
        App.elements.chatMessages.scrollTop = App.elements.chatMessages.scrollHeight;
    }
};

App.chatIsScrolledNearBottom = function() {
    const el = App.elements.chatMessages;
    if (!el || el.children.length === 0) return true;
    const threshold = 80;
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
};

/**
 * Обновляет индикатор подключения в шапке чата: зелёная галочка — доступ к
 * папке есть, красный крестик — соединение потеряно (тот же смысл, что
 * App.syncSetStatus для базы задач, но своя, более компактная иконка).
 */
App.chatUpdateConnectionStatus = function() {
    const el = App.elements.chatConnectionStatus;
    if (!el) return;

    const connected = !!(App.sync.handle && App.chat.fileHandle);
    el.classList.toggle('connected', connected);
    el.classList.toggle('disconnected', !connected);
    el.title = connected ? 'Подключено к общей папке' : 'Нет доступа к общей папке — поллинг на паузе';
    el.innerHTML = App.icon(connected ? 'circle-check' : 'circle-x', 'sm');
};
