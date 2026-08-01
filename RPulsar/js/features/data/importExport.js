// js/features/data/importExport.js
window.App = window.App || {};

        App.exportData = function() {
            const data = JSON.stringify(App.state, null, 2);
            const blob = new Blob([data], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rtasks_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            App.showToast('Бэкап скачан', 'success');
        };
        /**
         * Валидация импортируемых данных (Zero Trust)
         * Проверяет структуру и типы данных перед применением к state
         */
        App.validateImportedData = function(data) {
            // 1. Базовая проверка: это вообще объект?
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                return {valid: false, error: 'файл не содержит объект'};
            }

            // 2. Проверка обязательных массивов
            const requiredArrays = ['tasks', 'statuses', 'users', 'columns'];
            for (const field of requiredArrays) {
                if (!Array.isArray(data[field])) {
                    return {valid: false, error: `отсутствует или некорректен массив "${field}"`};
                }
            }

            // 3. Проверка, что массивы не содержат мусор
            for (const task of data.tasks) {
                if (!task || typeof task !== 'object') {
                    return {valid: false, error: 'одна из задач имеет неверный формат'};
                }
                if (typeof task.id !== 'number' && typeof task.id !== 'string') {
                    return {valid: false, error: 'у задачи отсутствует ID'};
                }
                if (typeof task.title !== 'string' || task.title.trim() === '') {
                    return {valid: false, error: 'у задачи отсутствует название'};
                }
            }

            for (const status of data.statuses) {
                if (!status?.id || typeof status.name !== 'string') {
                    return {valid: false, error: 'некорректный статус'};
                }
            }

            for (const user of data.users) {
                if (!user?.id || typeof user.name !== 'string') {
                    return {valid: false, error: 'некорректный пользователь'};
                }
            }

            // 4. Проверка taskOrder (если есть)
            if (data.taskOrder && !Array.isArray(data.taskOrder)) {
                return {valid: false, error: 'taskOrder должен быть массивом'};
            }

            return {valid: true};
        };
        App.importData = function() {
            App.elements.fileImport.click();
        };
        App.handleFileImport = function(e) {
            const file = e.target.files[0];
            if (!file) return;

            // Защита от слишком больших файлов (>10MB)
            if (file.size > 10 * 1024 * 1024) {
                App.showToast('Файл слишком большой (макс. 10MB)', 'error');
                e.target.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const importedState = JSON.parse(event.target.result);

                    // ← НОВАЯ СТРОКА: вызываем валидацию
                    const validation = App.validateImportedData(importedState);
                    if (!validation.valid) {
                        App.showToast(`Неверный формат: ${validation.error}`, 'error');
                        return;
                    }

                    const confirmed = await App.confirmDialog(
                        `Импортировать ${importedState.tasks.length} задач? Это перезапишет текущие данные.`,
                        {danger: true, confirmText: 'Импортировать'}
                    );
                    if (confirmed) {
                        App.state = {...App.state, ...importedState};
                        App.syncTaskOrder();  // ← Важно: синхронизируем порядок задач
                        App.saveState();
                        App.render();
                        App.updateCurrentUserDisplay();
                        App.applyView();
                        App.showToast('Данные импортированы', 'success');
                    }
                } catch (err) {
                    console.error('Import error:', err);
                    App.showToast('Ошибка чтения файла: поврежденный JSON', 'error');
                }
            };
            reader.onerror = () => {
                App.showToast('Не удалось прочитать файл. Попробуйте другой.', 'error');
                console.error('FileReader error:', reader.error);
            };
            reader.readAsText(file);
            e.target.value = '';
        };
        App.printData = function() {
            const now = new Date();
            const dateStr = now.toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            const timeStr = now.toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            });

// Определяем текущий view
            const currentView = App.state.view; // 'table', 'kanban', или 'calendar'

// Добавляем класс для печати
            document.body.classList.add(`printing-${currentView}`);

// Создаём заголовок для печати
            let printHeader = document.getElementById('printHeader');
            if (!printHeader) {
                printHeader = document.createElement('div');
                printHeader.id = 'printHeader';
                printHeader.className = 'print-header';
                document.body.insertBefore(printHeader, document.body.firstChild);
            }

// Статистика
            const total = App.visibleTasks().length;
            const done = App.visibleTasks().filter(t => t.status === 'done').length;
            const inProgress = App.visibleTasks().filter(t => t.status === 'in-progress').length;

            const viewLabels = {
                'table': 'Таблица',
                'kanban': 'Доска (Kanban)',
                'calendar': 'Календарь'
            };

            printHeader.innerHTML = `
<h1>RPulsar — Отчёт по задачам</h1>
<div class="print-meta">
<span><strong>Дата печати:</strong> ${dateStr} ${timeStr}</span>
<span><strong>Вид:</strong> ${viewLabels[currentView] || 'Таблица'}</span>
</div>
<div class="print-meta" style="margin-top: 8px;">
<span><strong>Всего задач:</strong> ${total}</span>
<span><strong>Выполнено:</strong> ${done}</span>
<span><strong>В работе:</strong> ${inProgress}</span>
</div>
`;

// Если активна виртуализация — временно показываем все задачи (только для таблицы)
            const originalLimit = App.ui.renderedTaskLimit;
            if (currentView === 'table' && App.ui.renderedTaskLimit < App.state.tasks.length) {
                App.ui.renderedTaskLimit = App.state.tasks.length;
                App.renderTasks();
            }

// Задержка для применения стилей перед печатью
            setTimeout(() => {
                window.print();

// Восстанавливаем состояние после печати
                setTimeout(() => {
                    document.body.classList.remove(`printing-${currentView}`);
                    if (currentView === 'table') {
                        App.ui.renderedTaskLimit = originalLimit;
                        App.renderTasks();
                    }
                }, 500);
            }, 100);
        };


/**
 * Привязывает обработчик выбора файла для импорта данных.
 * Вынесено из core/bindEvents.js для декомпозиции God Function.
 */
App.bindImportExportEvents = function() {
    App.elements.fileImport.addEventListener('change', (e) => App.handleFileImport(e));
};
