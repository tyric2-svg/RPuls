// js/core/keyboardShortcuts.js
window.App = window.App || {};

/**
 * Привязывает глобальные горячие клавиши (Linear-style): однобуквенные
 * команды, Vim-навигация, Ctrl/Alt-комбинации, Escape-цепочка закрытия панелей.
 * Используем e.code (физическая клавиша) — работает на любой раскладке!
 *
 * Вынесено из core/bindEvents.js для декомпозиции God Function. Живёт в core,
 * а не в конкретной feature-папке, так как затрагивает состояние сразу
 * нескольких фич (задачи, модалки, drawer, командная палитра, календарь и т.д.).
 */
App.bindGlobalKeyboardShortcuts = function() {
    document.addEventListener('keydown', (e) => {
        const target = e.target;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        const isModalOpen = !App.elements.taskModal.classList.contains('hidden');
        const isDrawerOpen = App.ui.drawerOpen;
        const isBulkModalOpen = !App.elements.bulkModal.classList.contains('hidden');
        const isCommandPaletteOpen = !App.elements.commandPalette.classList.contains('hidden');
        const ctrl = e.ctrlKey || e.metaKey;
        const alt = e.altKey;
        const shift = e.shiftKey;

        // === ESCAPE — умная очистка поиска + закрытие панелей ===
        if (e.code === 'Escape') {
            // ПРИОРИТЕТ 1: Если фокус в поле поиска И там есть текст — очищаем поиск
            // (Linear/VS Code паттерн: Esc очищает ввод перед закрытием панелей)
            const searchInput = App.elements.searchInput;
            if (searchInput && document.activeElement === searchInput && searchInput.value.trim() !== '') {
                e.preventDefault();
                searchInput.value = '';
                App.ui.search = '';
                App.ui.renderedTaskLimit = App.TASK_PAGE_SIZE;
                App.render();
                App.elements.searchSuggestions?.classList.remove('active');
                // Мягкая визуальная обратная связь
                searchInput.style.transition = 'box-shadow 150ms ease';
                searchInput.style.boxShadow = '0 0 0 2px var(--accent-muted)';
                setTimeout(() => {
                    searchInput.style.boxShadow = '';
                }, 200);
                return;
            }

            // ПРИОРИТЕТ 2: Стандартная цепочка закрытия панелей
            if (App.ui.shortcutsHelpOpen) App.closeShortcutsHelp();
            else if (isCommandPaletteOpen) App.closeCommandPalette();
            else if (isModalOpen) App.closeTaskModal();
            else if (isBulkModalOpen) App.closeBulkModal();
            else if (isDrawerOpen) App.closeDrawer();
            else if (App.ui.openFilterMenu) App.closeAllFilterMenus();
            else if (App.ui.selectedTasks.length > 0) App.clearBulkSelection();
            else if (App.elements.notificationPanel.classList.contains('active')) {
                App.elements.notificationPanel.classList.remove('active');
            }
            return;
        }

        // === Ctrl+K — Командная палитка (стандарт индустрии) ===
        if (ctrl && !alt && !shift && e.code === 'KeyK') {
            e.preventDefault();
            App.openCommandPalette();
            return;
        }

        // === Ctrl+B — Свернуть/развернуть сайдбар ===
        if (ctrl && !alt && !shift && e.code === 'KeyB') {
            e.preventDefault();
            App.toggleSidebar();
            return;
        }

        // === Ctrl+Alt+S — Экспорт (безопасная комбинация) ===
        if (ctrl && alt && e.code === 'KeyS') {
            e.preventDefault();
            App.exportData();
            return;
        }

        // === Alt+S — Сохранить в модалке (работает только когда модалка открыта) ===
        if (alt && !ctrl && !shift && e.code === 'KeyS' && isModalOpen) {
            e.preventDefault();
            App.saveTask();
            return;
        }

        // === Alt+S — Сохранить в Drawer (работает когда открыта панель деталей) ===
        if (alt && !ctrl && !shift && e.code === 'KeyS' && isDrawerOpen && App.ui.currentTask) {
            e.preventDefault();
            const saveBtn = document.getElementById('detailSaveBtn');
            if (saveBtn) {
                saveBtn.click();
            }
            return;
        }

        // === ОДНОБУКВЕННЫЕ КЛАВИШИ — работают только когда фокус НЕ в поле ввода ===
        // и нет открытых модалок/drawer (кроме справки по клавишам)
        if (!isInput && !isModalOpen && !isBulkModalOpen && !isCommandPaletteOpen && !isDrawerOpen && !ctrl && !alt) {

            // C — Create (новая задача)
            if (e.code === 'KeyC') {
                e.preventDefault();
                App.openTaskModal();
                return;
            }

            // E — Edit (редактировать выделенную задачу)
            if (e.code === 'KeyE' && App.ui.focusedTaskIndex >= 0) {
                e.preventDefault();
                const rows = App.elements.tasksBody.querySelectorAll('tr');
                const row = rows[App.ui.focusedTaskIndex];
                if (row) App.editTask(App.parseId(row.dataset.id));
                return;
            }

            // D — Delete (удалить выделенную задачу)
            if (e.code === 'KeyD' && App.ui.focusedTaskIndex >= 0) {
                e.preventDefault();
                const rows = App.elements.tasksBody.querySelectorAll('tr');
                const row = rows[App.ui.focusedTaskIndex];
                if (row) App.deleteTask(App.parseId(row.dataset.id));
                return;
            }

            // X — выделение (toggle bulk selection)
            if (e.code === 'KeyX' && App.ui.focusedTaskIndex >= 0) {
                e.preventDefault();
                const rows = App.elements.tasksBody.querySelectorAll('tr');
                const row = rows[App.ui.focusedTaskIndex];
                if (row) App.toggleTaskSelection(App.parseId(row.dataset.id));
                return;
            }

            // J — вниз по списку (Vim-стиль)
            if (e.code === 'KeyJ') {
                e.preventDefault();
                const rows = App.elements.tasksBody.querySelectorAll('tr');
                if (App.ui.focusedTaskIndex < rows.length - 1) {
                    App.focusTaskRow(App.ui.focusedTaskIndex + 1);
                }
                return;
            }

            // K — вверх по списку (Vim-стиль)
            if (e.code === 'KeyK') {
                e.preventDefault();
                if (App.ui.focusedTaskIndex > 0) {
                    App.focusTaskRow(App.ui.focusedTaskIndex - 1);
                }
                return;
            }

            // ? — справка по горячим клавишам (стандарт GitHub/Linear)
            // ВАЖНО: проверяем Shift ПЕРВЫМ, иначе условие на / перехватит нажатие!
            if (shift && (e.code === 'Slash' || e.code === 'NumpadDivide' || e.key === '?')) {
                e.preventDefault();
                App.toggleShortcutsHelp();
                return;
            }

            // / — фокус на поиск (стандарт GitHub/Slack)
            // Только когда Shift НЕ нажат
            if (!shift && (e.code === 'Slash' || e.code === 'NumpadDivide')) {
                e.preventDefault();
                App.elements.searchInput.focus();
                App.elements.searchInput.select();
                return;
            }

            // 1 — Таблица
            if (e.code === 'Digit1' || e.code === 'Numpad1') {
                e.preventDefault();
                App.state.currentSection = 'tasks';
                App.state.view = 'table';
                App.saveState();
                App.applyView();
                return;
            }

            // 2 — Kanban
            if (e.code === 'Digit2' || e.code === 'Numpad2') {
                e.preventDefault();
                App.state.currentSection = 'tasks';
                App.state.view = 'kanban';
                App.saveState();
                App.applyView();
                return;
            }

            // 3 — Календарь
            if (e.code === 'Digit3' || e.code === 'Numpad3') {
                e.preventDefault();
                App.state.currentSection = 'tasks';
                App.state.view = 'calendar';
                App.saveState();
                App.applyView();
                return;
            }
        }

        // === Enter — открыть задачу (когда фокус на строке) ===
        if (e.code === 'Enter' && !isInput && !isModalOpen && !isDrawerOpen && App.ui.focusedTaskIndex >= 0) {
            const rows = App.elements.tasksBody.querySelectorAll('tr');
            const row = rows[App.ui.focusedTaskIndex];
            if (row) {
                e.preventDefault();
                App.openTaskDetail(App.parseId(row.dataset.id));
            }
        }

        // === Стрелки ↑/↓ — навигация в таблице (работает когда фокус на строке) ===
        if (!isInput && !isModalOpen && !isDrawerOpen) {
            if (e.code === 'ArrowDown' && App.ui.focusedTaskIndex >= 0) {
                e.preventDefault();
                const rows = App.elements.tasksBody.querySelectorAll('tr:not(.load-more-tasks-row)');
                if (App.ui.focusedTaskIndex < rows.length - 1) {
                    App.focusTaskRow(App.ui.focusedTaskIndex + 1);
                } else {
                    // Достигли конца ОТРИСОВАННОГО списка — если есть ещё задачи
                    // за пределами текущего лимита пагинации, подгружаем их и
                    // продолжаем перемещение фокуса, вместо того чтобы просто
                    // "упереться" в невидимую границу.
                    const hasMoreRow = App.elements.tasksBody.querySelector('.load-more-tasks-row');
                    if (hasMoreRow) {
                        App.ui.renderedTaskLimit += App.TASK_PAGE_SIZE;
                        App.renderTasks();
                        App.focusTaskRow(App.ui.focusedTaskIndex + 1);
                    }
                }
                return;
            }
            if (e.code === 'ArrowUp' && App.ui.focusedTaskIndex >= 0) {
                e.preventDefault();
                if (App.ui.focusedTaskIndex > 0) {
                    App.focusTaskRow(App.ui.focusedTaskIndex - 1);
                }
                return;
            }
        }
    });
};
