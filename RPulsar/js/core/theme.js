// js/core/theme.js
window.App = window.App || {};

App.toggleTheme = function() {
    App.state.theme = App.state.theme === 'light' ? 'dark' : 'light';
    App.applyTheme();
    App.saveState();
    App.showToast(`${App.state.theme === 'light' ? 'Светлая' : 'Темная'} тема`, 'info');
    setTimeout(() => {
        if (App.elements.dashboardView && App.elements.dashboardView.classList.contains('active')) {
            App.drawStatusChart();
            App.drawTeamChart();
        }
    }, 100);
};

App.applyTheme = function() {
    document.documentElement.setAttribute('data-theme', App.state.theme);
    const themeIcon = App.elements.themeToggle.querySelector('[data-icon]');
    if (themeIcon) {
        themeIcon.dataset.icon = App.state.theme === 'light' ? 'moon' : 'sun';
        App.renderAllIcons();
    }
    App.elements.themeToggle.setAttribute('aria-label', `Переключить на ${App.state.theme === 'light' ? 'темную' : 'светлую'} тему`);
};
