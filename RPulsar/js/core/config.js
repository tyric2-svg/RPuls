// js/core/config.js
window.App = window.App || {};

App.searchDebounceTimer = null;
App.TASK_PAGE_SIZE = 200; // сколько строк подгружаем за раз (виртуализация "по требованию")
App.colors = [
    '#E03E3E', '#E8A700', '#0F7B0F', '#2383E2', '#6B6B6B',
    '#9B59B6', '#E67E22', '#1ABC9C', '#34495E', '#D35400'
];
// Глубоко замораживаем дефолты — это инвариант приложения.
// Любая попытка мутировать App.defaults.* напрямую бросит TypeError в strict mode
// (или молча проигнорируется вне strict mode), что защищает от багов shared-reference.
App.defaults = Object.freeze({
    statuses: Object.freeze([
        Object.freeze({id: 'new', name: 'Новая', color: '#6B6B6B'}),
        Object.freeze({id: 'in-progress', name: 'В работе', color: '#2383E2'}),
        Object.freeze({id: 'review', name: 'Отложено', color: '#E8A700'}),
        Object.freeze({id: 'done', name: 'Выполнено', color: '#0F7B0F'})
    ]),
    users: Object.freeze([
        Object.freeze({id: 'user1', name: 'Иван Иванов', role: 'Администратор', color: '#2383E2'})
    ]),
    columns: Object.freeze([
        Object.freeze({id: 'checkbox', name: '', visible: true, system: true, width: 10}),
        Object.freeze({id: 'drag', name: '', visible: false, system: true, width: 10}),
        Object.freeze({id: 'id', name: 'ID', visible: false, system: true, width: 20}),
        Object.freeze({id: 'title', name: 'Название', visible: true, system: true, width: 150}),
        Object.freeze({id: 'description', name: 'Описание', visible: true, system: true, width: 250}),
        Object.freeze({id: 'status', name: 'Статус', visible: true, system: true, width: 60}),
        Object.freeze({id: 'priority', name: 'Приоритет', visible: true, system: true, width: 70}),
        Object.freeze({id: 'assignee', name: 'Исполнитель', visible: true, system: true, width: 90}),
        Object.freeze({id: 'dueDate', name: 'Срок', visible: true, system: true, width: 70})
    ]),
    templates: Object.freeze([])
});

/**
 * Возвращает глубокую копию массива defaults-объектов.
 * Использовать ВСЕГДА вместо прямого присваивания App.defaults.* в state —
 * иначе state.* будет ссылаться на тот же массив, что и defaults,
 * и любая мутация state испортит глобальные дефолты.
 *
 * @param {'statuses'|'users'|'columns'|'templates'} key
 * @returns {Array}
 */
App.cloneDefaults = function(key) {
    return App.defaults[key].map(item => ({...item}));
};
