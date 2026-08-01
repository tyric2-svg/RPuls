// js/core/sidebar.js
window.App = window.App || {};

App.toggleSidebar = function() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    try {
        localStorage.setItem('rpulsar_sidebar_collapsed', isCollapsed ? 'true' : 'false');
    } catch (e) {
        console.warn('Не удалось сохранить состояние sidebar:', e);
    }
// Обновляем aria-label
    const btn = document.getElementById('sidebarCollapseBtn');
    if (btn) {
        btn.setAttribute('aria-label', isCollapsed ? 'Развернуть панель' : 'Свернуть панель');
        btn.setAttribute('title', isCollapsed ? 'Развернуть' : 'Свернуть');
    }
};

App.loadSidebarState = function() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    try {
        const collapsed = localStorage.getItem('rpulsar_sidebar_collapsed') === 'true';
        if (collapsed) {
            sidebar.classList.add('collapsed');
            const btn = document.getElementById('sidebarCollapseBtn');
            if (btn) {
                btn.setAttribute('aria-label', 'Развернуть панель');
                btn.setAttribute('title', 'Развернуть');
            }
        }
    } catch (e) {
        console.warn('Не удалось загрузить состояние sidebar:', e);
    }
};

/**
 * Привязывает обработчики навигации сайдбара через делегирование на
 * .sidebar-nav — один слушатель вместо цикла по каждому пункту, устойчиво
 * к будущим динамическим изменениям списка пунктов навигации.
 * Вынесено из core/bindEvents.js для декомпозиции God Function.
 */
App.bindSidebarEvents = function() {
    const sidebarNav = document.querySelector('.sidebar-nav');

    if (sidebarNav) {
        sidebarNav.addEventListener('click', (e) => {
            const viewItem = e.target.closest('.nav-item[data-view]');
            const actionItem = e.target.closest('.nav-item[data-action]');

            if (viewItem) {
                const view = viewItem.dataset.view;
                if (['table', 'kanban', 'calendar'].includes(view)) {
                    App.state.currentSection = 'tasks';
                    App.state.view = view;
                } else {
                    App.state.currentSection = view;
                }
                App.saveState();
                App.applyView();
            } else if (actionItem) {
                const action = actionItem.dataset.action;
                if (action && App[action]) App[action]();
            }
        });

        sidebarNav.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const navItem = e.target.closest('.nav-item');
            if (!navItem) return;
            e.preventDefault();
            navItem.click();
        });

        // mouseenter не всплывает — делегирование требует capture-фазы (true)
        sidebarNav.addEventListener('mouseenter', (e) => {
            const item = e.target.closest('.nav-item');
            if (!item) return;
            const tooltip = item.querySelector('.nav-item-tooltip');
            if (!tooltip) return;
            const sidebar = document.querySelector('.sidebar');
            if (!sidebar?.classList.contains('collapsed')) return;
            const rect = item.getBoundingClientRect();
            tooltip.style.top = (rect.top + rect.height / 2) + 'px';
            tooltip.style.transform = 'translateY(-50%)';
        }, true);
    }

    if (App.elements.assignmentsSubtabs) {
        App.elements.assignmentsSubtabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.assignments-subtab');
            if (!btn) return;
            App.ui.assignmentsMode = btn.dataset.mode;
            App.elements.assignmentsSubtabs.querySelectorAll('.assignments-subtab').forEach(b => {
                const isActive = b === btn;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-selected', String(isActive));
            });
            App.render();
        });
    }

    const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
    if (sidebarCollapseBtn) {
        sidebarCollapseBtn.addEventListener('click', () => App.toggleSidebar());
    }
};
