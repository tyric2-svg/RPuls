// js/core/keyboardFeedback.js
window.App = window.App || {};

/**
 * Инициализирует визуальную обратную связь при нажатии горячих клавиш.
 * Когда пользователь нажимает C, E, Ctrl+K и т.д. — соответствующая кнопка
 * в интерфейсе кратко подсвечивается. Это помогает запоминать клавиши.
 */
App._initKeyboardFeedback = function() {
    // Карта: код клавиши -> селектор элемента для подсветки
    App._keyboardFeedbackMap = {
        'KeyC': '#newTaskBtn',
        'KeyK': null, // Command Palette — отдельная анимация ниже
        'KeyB': '#sidebarCollapseBtn',
    };

    // Обёртка над оригинальным открытием Command Palette — добавим flash
    const originalOpenCP = App.openCommandPalette.bind(App);
    App.openCommandPalette = function () {
        // Подсвечиваем иконку поиска в header
        const searchBox = document.querySelector('.search-shortcut');
        if (searchBox) {
            searchBox.style.background = 'var(--accent)';
            searchBox.style.color = 'var(--text-inverse)';
            searchBox.style.borderColor = 'var(--accent)';
            setTimeout(() => {
                searchBox.style.background = '';
                searchBox.style.color = '';
                searchBox.style.borderColor = '';
            }, 400);
        }
        return originalOpenCP();
    };

    // Обёртка для открытия модалки задачи — flash на кнопке "Новая"
    const originalOpenTask = App.openTaskModal.bind(App);
    App.openTaskModal = function (...args) {
        const btn = App.elements.newTaskBtn;
        if (btn && !App.ui.editingTask) { // только при создании, не редактировании
            btn.classList.add('keyboard-flash');
            setTimeout(() => btn.classList.remove('keyboard-flash'), 400);
        }
        return originalOpenTask(...args);
    };

    // Обёртка для сворачивания sidebar
    const originalToggleSidebar = App.toggleSidebar.bind(App);
    App.toggleSidebar = function () {
        const btn = document.getElementById('sidebarCollapseBtn');
        if (btn) {
            btn.classList.add('keyboard-flash');
            setTimeout(() => btn.classList.remove('keyboard-flash'), 400);
        }
        return originalToggleSidebar();
    };
};
