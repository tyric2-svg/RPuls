// js/core/store.js
window.App = window.App || {};

App.state = {
    tasks: [],
    statuses: [],
    users: [],
    columns: [],
    templates: [],
    taskOrder: [],
    relations: [],
    notifications: [],
    reminders: [],
    currentUser: null,
    theme: 'light',
    view: 'table',
    currentSection: 'tasks',
    filters: {status: [], assignee: [], priority: []},
    sort: null,
    calendar: {year: new Date().getFullYear(), month: new Date().getMonth()},
    _initialRenderDone: false
};

App.ui = {
    currentTask: null,
    editingTask: null,
    openedTaskVersion: null,
    search: '',
    drawerOpen: false,
    draggedTask: null,
    openFilterMenu: null,
    selectedTasks: [],
    focusedTaskIndex: -1,
    renderedTaskLimit: 200,
    assignmentsMode: 'received',
    commandSelectedIndex: 0,
    shortcutsHelpOpen: false,
    lastFocusedElement: null,
    creatingTaskFromChat: false,
};

App.elements = {};

// ================== ЛОГИКА ХРАНИЛИЩА ==================

App.syncTaskOrder = function() {
    const taskIds = App.state.tasks.map(t => t.id);
    App.state.taskOrder = App.state.taskOrder.filter(id => taskIds.includes(id));
    taskIds.forEach(id => {
        if (!App.state.taskOrder.includes(id)) {
            App.state.taskOrder.push(id);
        }
    });
};

// MAX_SAFE_OBJECT_DEPTH: реальные данные (задачи/пользователи/relations) не
// вкладываются глубже 5-6 уровней. 50 — запас с большим отступом, при этом
// достаточно маленький, чтобы не дать стеку упасть на специально
// сконструированном глубоко вложенном JSON (валидный JSON, но с тысячами
// уровней вложенности приводит к RangeError вместо предсказуемого false).
const MAX_SAFE_OBJECT_DEPTH = 50;

App.isObjectSafe = function(obj, depth = 0) {
    if (depth > MAX_SAFE_OBJECT_DEPTH) return false;
    if (obj === null || typeof obj !== 'object') return true;
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    for (const key of Object.keys(obj)) {
        if (dangerousKeys.includes(key)) return false;
        if (!App.isObjectSafe(obj[key], depth + 1)) return false;
    }
    return true;
};

App.loadState = function() {
    const stored = localStorage.getItem('rtasks_state_v4');
    if (stored) {
        try {
            const loaded = JSON.parse(stored);
            if (App.isObjectSafe(loaded)) {
                App.state = {...App.state, ...loaded};
            } else {
                console.warn('Обнаружены подозрительные данные, используется сброс');
                App.resetState();
                return;
            }
            // Миграции (из оригинального кода)
            if (App.state.templates) {
                App.state.templates = App.state.templates.filter(t => !t.id || !/^tpl\d+$/.test(t.id));
            }
            if (App.state.columns) {
                const defaultWidths = { 'checkbox': 10, 'drag': 10, 'id': 10, 'title': 150, 'description': 300, 'status': 50, 'priority': 50, 'assignee': 50, 'dueDate': 50 };
                App.state.columns.forEach(col => { if (!col.width) col.width = defaultWidths[col.id] || 50; });
                const hasDescription = App.state.columns.some(c => c.id === 'description');
                if (!hasDescription) {
                    const titleIndex = App.state.columns.findIndex(c => c.id === 'title');
                    const insertIndex = titleIndex >= 0 ? titleIndex + 1 : App.state.columns.length;
                    App.state.columns.splice(insertIndex, 0, { id: 'description', name: 'Описание', visible: true, system: true, width: 300 });
                }
            }
            delete App.state.tags;
        } catch (e) {
            console.error('Failed to load state:', e);
            App.resetState();
        }
    } else {
        App.resetState();
    }
    if (!App.state.statuses?.length) App.state.statuses = App.cloneDefaults('statuses');
    if (!App.state.users?.length) App.state.users = App.cloneDefaults('users');
    if (!App.state.columns?.length) App.state.columns = App.cloneDefaults('columns');
    if (!App.state.templates) App.state.templates = [];
    if (!App.state.taskOrder) App.state.taskOrder = [];
    if (!App.state.relations) App.state.relations = [];
    if (!App.state._tombstones) App.state._tombstones = [];
    if (!App.state.notifications) App.state.notifications = [];
    if (!App.state.reminders) App.state.reminders = [];
    if (!App.state.changeLog) App.state.changeLog = [];
    if (!App.state.filters) App.state.filters = {status: [], assignee: [], priority: []};
    if (App.state.sort === undefined) App.state.sort = null;
    if (!App.state.view) App.state.view = 'table';
    if (!App.state.currentSection) App.state.currentSection = 'tasks';
    if (!App.state.calendar) App.state.calendar = { year: new Date().getFullYear(), month: new Date().getMonth() };

    App.state.tasks.forEach(task => {
        if (!task.owner) task.owner = task.assignee || App.state.currentUser;
        if (!task.version) task.version = 1;
        if (!Array.isArray(task.assignees)) {
            task.assignees = task.assignee ? [task.assignee] : [];
        }
        task.assignee = task.assignees[0] || '';
    });

    if (App.state.users && App.state.users.length > 0) {
        App.state.users.forEach((user, index) => {
            if (!user) return;
            if (user.role !== 'admin' && user.role !== 'manager') {
                user.role = index === 0 ? 'admin' : 'manager';
            }
        });
    }

    if (App.state.changeLog && App.state.changeLog.length > 0) {
        const lastId = localStorage.getItem('rtasks_last_processed_log_id');
        if (!lastId) {
            const latestEntry = App.state.changeLog[App.state.changeLog.length - 1];
            localStorage.setItem('rtasks_last_processed_log_id', latestEntry.id);
        }
    }
    App.syncTaskOrder();
};

App.resetState = function() {
    App.state = {
        tasks: [],
        statuses: App.cloneDefaults('statuses'),
        users: App.cloneDefaults('users'),
        columns: App.cloneDefaults('columns'),
        templates: [],
        taskOrder: [],
        relations: [],
        _tombstones: [],
        notifications: [],
        reminders: [],
        changeLog: [],
        currentUser: App.defaults.users[0]?.id || null,
        theme: localStorage.getItem('theme') || 'light',
        palette: localStorage.getItem('palette') || 'notion-neutral',
        view: 'table',
        currentSection: 'tasks',
        filters: {status: [], assignee: [], priority: []},
        sort: null,
        calendar: {
            year: new Date().getFullYear(),
            month: new Date().getMonth(),
            viewMode: 'month',
            focusDate: App.getLocalISODate(new Date())
        },
    };
    App.saveState();
};

App.stampChangedTasks = function() {
    const now = new Date().toISOString();
    App._prevTaskHashes = App._prevTaskHashes || new Map();
    const nextHashes = new Map();
    App.state.tasks.forEach(task => {
        const {updatedAt, ...rest} = task;
        const hash = JSON.stringify(rest);
        if (App._prevTaskHashes.get(task.id) !== hash) {
            task.updatedAt = now;
        }
        nextHashes.set(task.id, hash);
    });
    App._prevTaskHashes = nextHashes;
};

App.saveState = async function() {
    App.stampChangedTasks();
    try {
        localStorage.setItem('rtasks_state_v4', JSON.stringify(App.state));
    } catch (e) {
        console.error('Failed to save state:', e);
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            App.showToast('Хранилище переполнено! Сделайте резервное копирование и удалите старые задачи.', 'error');
        } else {
            App.showToast('Ошибка сохранения данных', 'error');
        }
    }
    if (App.sync && App.sync.handle) {
        try {
            await App.syncPush();
        } catch (e) {
            console.error('Auto-sync push failed:', e);
        }
    }
    App.processSmartNotifications();
};