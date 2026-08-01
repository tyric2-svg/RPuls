// js/core/bindEvents.js
window.App = window.App || {};

/**
 * Оркестратор привязки обработчиков событий приложения.
 *
 * Раньше эта функция была God Function (~950 строк) и напрямую навешивала
 * обработчики для всех фич приложения. Разбита по features/*, ui/* и core/*
 * по тому же принципу, по которому уже организован остальной проект — каждая
 * функция bindXxxEvents живёт рядом с рендер-логикой и данными своей фичи.
 */
App.bindEvents = function() {
    // Таблица задач: поиск, модалка задачи, drag & drop строк, сортировка, фильтры
    App.bindTaskTableEvents();

    // Kanban: drag & drop карточек и колонок
    App.bindKanbanEvents();

    // Массовые действия над выделенными задачами
    App.bindBulkActionEvents();

    // Календарь: навигация и переключение режимов
    App.bindCalendarEvents();

    // Командная палитра (Ctrl+K) и справка по горячим клавишам
    App.bindCommandPaletteEvents();

    // Панель уведомлений
    App.bindNotificationEvents();

    // Приветственный онбординг
    App.bindWelcomeEvents();

    // Боковая панель деталей задачи (drawer) — делегированные обработчики
    App.bindDrawerEvents();

    // Импорт/экспорт данных
    App.bindImportExportEvents();

    // Экран входа: выбор/создание базы, выбор пользователя, выход
    App.bindLoginEvents();

    // Навигация сайдбара (делегирование) + сворачивание
    App.bindSidebarEvents();

    // Чат
    App.bindChatEvents();

    // Глобальные горячие клавиши (Linear-style)
    App.bindGlobalKeyboardShortcuts();
};
