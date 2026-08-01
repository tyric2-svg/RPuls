// js/features/notifications/notificationService.js
window.App = window.App || {};

App.createNotification = function({type, title, text, taskId = null}) {
    const notification = {
        id: App.generateId(),
        type,
        title,
        text,
        taskId,
        timestamp: new Date().toISOString(),
        read: false
    };
    App.state.notifications.unshift(notification);
    if (App.state.notifications.length > 100) {
        App.state.notifications = App.state.notifications.slice(0, 100);
    }
    App.saveState();
    App.updateNotificationBell();
    const toastMessage = text ? `${title}: ${text}` : title;
    App.showToast(toastMessage, 'info');
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(title, {body: text});
        } catch (e) {}
    }
};

App.updateNotificationBell = function() {
    const bell = App.elements.notificationBell;
    if (!bell) return;
    const unreadCount = App.state.notifications.filter(n => !n.read).length;
    bell.classList.toggle('has-unread', unreadCount > 0);
};

App.toggleNotificationPanel = function() {
    const panel = App.elements.notificationPanel;
    const isActive = panel.classList.contains('active');
    if (isActive) {
        panel.classList.remove('active');
    } else {
        panel.classList.add('active');
        App.renderNotificationPanel();
    }
};

App.renderNotificationPanel = function() {
    const panel = App.elements.notificationList;
    if (!panel) return;
    if (App.state.notifications.length === 0) {
        panel.innerHTML = `
            <div class="notification-empty">
                <div style="opacity: 0.3;">${App.icon('bell', 'xl')}</div>
                <div style="margin-top: 12px;">Уведомлений пока нет</div>
            </div>
        `;
        return;
    }
    const icons = {
        'comment': App.icon('message-square', 'md'),
        'mention': App.icon('megaphone', 'md'),
        'due_soon': App.icon('clock', 'md'),
        'overdue': App.icon('alert-triangle', 'md'),
        'assigned': App.icon('user-check', 'md'),
        'workflow': App.icon('zap', 'md'),
        'relation': App.icon('link-2', 'md'),
        'assigned_to_me': App.icon('target', 'md'),
        'my_task_changed': App.icon('refresh-cw', 'md'),
        'commented_on_my_task': App.icon('message-square', 'md'),
        'due_date_changed': App.icon('calendar-clock', 'md')
    };
    panel.innerHTML = App.state.notifications.slice(0, 20).map(n => `
        <div class="notification-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
            <div class="notification-icon">${icons[n.type] || '🔔'}</div>
            <div class="notification-content">
                <div class="notification-title">${App.escapeHtml(n.title)}</div>
                <div class="notification-text">${App.escapeHtml(n.text)}</div>
                <div class="notification-time">${App.formatRelativeTime(n.timestamp)}</div>
            </div>
        </div>
    `).join('');
    setTimeout(() => {
        App.state.notifications.forEach(n => n.read = true);
        App.saveState();
        App.updateNotificationBell();
    }, 1500);
    panel.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            const notification = App.state.notifications.find(n => String(n.id) === id);
            App.elements.notificationPanel.classList.remove('active');
            if (notification?.taskId) {
                App.openTaskDetail(notification.taskId);
            }
        });
    });
};

App.clearAllNotifications = async function() {
    const confirmed = await App.confirmDialog('Очистить все уведомления?', {danger: true});
    if (!confirmed) return;
    App.state.notifications = [];
    App.saveState();
    App.updateNotificationBell();
    App.renderNotificationPanel();
    App.showToast('Уведомления очищены', 'success');
};

App.checkReminders = function() {
    const now = new Date();
    const today = App.getLocalISODate(now);
    const tomorrow = App.getLocalISODate(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    App.visibleTasks().forEach(task => {
        if (!task.dueDate || task.status === 'done') return;
        if (task.dueDate < today) {
            const notifiedKey = `notified_overdue_${task.id}_${task.dueDate}`;
            if (!localStorage.getItem(notifiedKey)) {
                App.createNotification({
                    type: 'overdue',
                    title: 'Задача просрочена',
                    text: task.title,
                    taskId: task.id
                });
                localStorage.setItem(notifiedKey, 'true');
            }
        } else if (task.dueDate === tomorrow) {
            const notifiedKey = `notified_soon_${task.id}_${task.dueDate}`;
            if (!localStorage.getItem(notifiedKey)) {
                App.createNotification({
                    type: 'due_soon',
                    title: 'Срок завтра',
                    text: task.title,
                    taskId: task.id
                });
                localStorage.setItem(notifiedKey, 'true');
            }
        }
    });
    App.cleanupNotifiedKeys();
};

App.cleanupNotifiedKeys = function() {
    const validIds = new Set(App.state.tasks.map(t => String(t.id)));
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key) continue;
        const match = key.match(/^notified_(overdue|soon)_(.+)_\d{4}-\d{2}-\d{2}$/);
        if (match && !validIds.has(match[2])) {
            localStorage.removeItem(key);
        }
    }
};

App.processSmartNotifications = function() {
    if (!App.state.changeLog || App.state.changeLog.length === 0) return;
    if (!App.state.currentUser) return;

    let processedIds;
    try {
        processedIds = new Set(JSON.parse(localStorage.getItem('rtasks_processed_log_ids') || '[]'));
    } catch (e) {
        processedIds = new Set();
    }

    const newEntries = App.state.changeLog
        .filter(entry => entry.id && !processedIds.has(entry.id))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // ВНИМАНИЕ: В оригинальном коде этот метод был обрезан.
    // Мы не будем добавлять логику, которой не было, просто оставим заглушку,
    // чтобы не ломать то, что уже работает. 
    // (Оригинальный код обрывался на строке .sort((a, b) => new Date(a.time
    // Поэтому просто сохраняем ID как обработанные.
    newEntries.forEach(entry => processedIds.add(entry.id));

    localStorage.setItem('rtasks_processed_log_ids', JSON.stringify([...processedIds]));
};
/**
 * Привязывает обработчики панели уведомлений (колокольчик и закрытие по клику снаружи).
 * Вынесено из core/bindEvents.js для декомпозиции God Function.
 */
App.bindNotificationEvents = function() {
    App.elements.notificationBell.addEventListener('click', () => App.toggleNotificationPanel());
    App.elements.clearNotificationsBtn.addEventListener('click', () => App.clearAllNotifications());
    document.addEventListener('click', (e) => {
        if (App.elements.notificationPanel.classList.contains('active') &&
            !e.target.closest('.notification-panel') &&
            !e.target.closest('.notification-bell')) {
            App.elements.notificationPanel.classList.remove('active');
        }
    });
};
