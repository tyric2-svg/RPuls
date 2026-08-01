// js/ui/toast.js
window.App = window.App || {};

App.showToast = function(message, type = 'info') {
    const container = App.elements?.toastContainer;
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Подбираем иконку в зависимости от типа уведомления
    const icons = {
        success: 'check-circle-2',
        error: 'x-circle',
        info: 'info-circle'
    };
    const iconHtml = App.icon ? App.icon(icons[type] || 'info-circle', 'md') : '';

    toast.innerHTML = `
        <span class="toast-icon">${iconHtml}</span>
        <span class="toast-message">${App.escapeHtml ? App.escapeHtml(message) : message}</span>
    `;

    container.appendChild(toast);

    // Автоматическое скрытие через 3 секунды
    setTimeout(() => {
        toast.style.animation = 'skeletonFadeOut 0.25s ease-out';
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, 3000);
};