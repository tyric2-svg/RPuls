// js/core/init.js
window.App = window.App || {};

// Master initialization function.
// Bootstrap call (App.init()) is invoked via <script> tag in HTML.
App.init = function() {
    App.cacheElements();
    // Очистка от оставшихся skeleton loaders (если были)
    document.querySelectorAll('.skeleton-container').forEach(el => el.remove());
    App.loadState();
    App.renderAllIcons();
    App.bindEvents();
    App.applyTheme();
    App.loadSidebarState();
    // === KEYBOARD FEEDBACK: визуальная реакция на горячие клавиши ===
    // Помогает новичкам запомнить клавиши — кнопка подсвечивается при их нажатии
    App._initKeyboardFeedback();
    App.updateSortButtonLabel();
    App.startLoginFlow();
};

// Polyfill: CanvasRenderingContext2D.prototype.roundRect
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        if (typeof r === 'number') r = [r, r, r, r];
        const [tl, tr, br, bl] = r;
        this.beginPath();
        this.moveTo(x + tl, y);
        this.lineTo(x + w - tr, y);
        this.quadraticCurveTo(x + w, y, x + w, y + tr);
        this.lineTo(x + w, y + h - br);
        this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
        this.lineTo(x + bl, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - bl);
        this.lineTo(x, y + tl);
        this.quadraticCurveTo(x, y, x + tl, y);
        this.closePath();
        return this;
    };
}
   else {        
    }

// Post-init tasks — runs after all modules are loaded.
// Originally placed after the App object definition in the inline script.
setTimeout(() => {
    // Проверяем changeLog на наличие пропущенных уведомлений
    App.processSmartNotifications();
}, 2000);
