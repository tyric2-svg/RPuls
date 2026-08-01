// js/core/stateFingerprint.js
window.App = window.App || {};

App.getStateFingerprint = function() {
    // Подпись задач: сортируем по ID, чтобы порядок массива не влиял
    const tasksSignature = App.state.tasks
        .map(t => `${t.id}:${t.version || 1}:${t.updatedAt || ''}`)
        .sort()
        .join('|');

    // Подпись конфигурации: ключевые массивы + порядок задач
    const configSignature = [
        App.state.statuses.length,
        App.state.users.length,
        App.state.columns.length,
        App.state.templates.length,
        App.state.relations.length,
        App.state.taskOrder.join(',')
    ].join(':');

    return tasksSignature + '||' + configSignature;
};
