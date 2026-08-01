// js/core/collapsibleFields.js
window.App = window.App || {};

/**
 * Свёрнутые поля (модалка создания задачи и панель деталей) — запоминаются
 * отдельно для каждого пользователя через localStorage.
 */
App.getCollapsedFields = function(scope) {
    if (!App.state.currentUser) return [];
    try {
        const raw = localStorage.getItem(`rpulsar_collapsed_${scope}_${App.state.currentUser}`);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
};

App.setFieldCollapsed = function(scope, field, collapsed) {
    if (!App.state.currentUser) return;
    const current = App.getCollapsedFields(scope);
    const next = collapsed
        ? [...new Set([...current, field])]
        : current.filter(f => f !== field);
    localStorage.setItem(`rpulsar_collapsed_${scope}_${App.state.currentUser}`, JSON.stringify(next));
};

App.applyCollapsedFields = function(scope, container) {
    if (!container) return;
    const collapsed = new Set(App.getCollapsedFields(scope));
    container.querySelectorAll('[data-field]').forEach(el => {
        el.classList.toggle('collapsed', collapsed.has(el.dataset.field));
    });
};

App.toggleFieldCollapse = function(scope, field, container) {
    const el = container?.querySelector(`[data-field="${field}"]`);
    if (!el) return;
    const nowCollapsed = !el.classList.contains('collapsed');
    el.classList.toggle('collapsed', nowCollapsed);
    App.setFieldCollapsed(scope, field, nowCollapsed);
};

App.debounce = function(func, wait) {
    return (...args) => {
        clearTimeout(App.searchDebounceTimer);
        App.searchDebounceTimer = setTimeout(() => func.apply(App, args), wait);
    };
};
