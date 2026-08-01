// js/features/management/tableEditor.js
window.App = window.App || {};

App.openTableEditor = function() {
    const html = `
    <style>
        .col-visible-toggle {
            width: 18px;
            height: 18px;
            cursor: pointer;
            accent-color: var(--accent);
            flex-shrink: 0;
        }
        .column-width-input {
            width: 70px;
            padding: var(--space-2) var(--space-3);
            background: var(--bg-primary);
            border: 1px solid var(--border-default);
            border-radius: var(--radius-sm);
            font-size: var(--text-sm);
            text-align: right;
            font-family: var(--font-mono);
            flex-shrink: 0;
            transition: all var(--duration-fast) var(--ease-out);
        }
        .column-width-input:focus {
            border-color: var(--accent);
            box-shadow: var(--focus-ring);
            outline: none;
        }
        .column-width-label {
            font-size: var(--text-xs);
            color: var(--text-muted);
            font-family: var(--font-mono);
            flex-shrink: 0;
            min-width: 20px;
        }
                /* === ОПИСАНИЕ В ОТДЕЛЬНОМ СТОЛБЦЕ === */
.table td .task-description-cell {
display: -webkit-box;
-webkit-line-clamp: 2;
-webkit-box-orient: vertical;
overflow: hidden;
white-space: normal !important;
word-wrap: break-word;
word-break: break-word;
line-height: 1.5;
font-size: 12.5px;
color: var(--text-secondary);
margin: 0;
}
.table td[data-col-id="description"] {
vertical-align: top;
padding-top: 16px !important;
}
    </style>
    <p class="text-muted mb-4">Настройте видимость и ширину столбцов в таблице задач.</p>
    <div class="list-container" id="columnsList">
    ${App.state.columns.map(col => `
        <div class="list-item">
            <input type="checkbox" ${col.visible ? 'checked' : ''} class="col-visible-toggle" data-id="${col.id}">
            <div class="list-item-content">
                <div class="list-item-title">${App.escapeHtml(col.name)} ${col.system ? '<span class="text-muted">(системный)</span>' : ''}</div>
            </div>
            <input type="number" class="column-width-input" data-id="${col.id}" value="${col.width || 50}" min="10" max="600" step="5">
            <span class="column-width-label">px</span>
        </div>
    `).join('')}
    </div>
    <div class="mt-4">
        <input type="text" class="form-input" id="newColName" placeholder="Название нового столбца">
        <button class="btn btn-secondary mt-4" id="addColBtn" style="width:100%">+ Добавить столбец</button>
    </div>
    `;
    App.openDrawer('Редактор таблицы', html, `
        <button class="btn btn-secondary" id="resetColsBtn">Сбросить</button>
        <button class="btn btn-primary" id="saveColsBtn">Сохранить</button>
    `);
    document.getElementById('addColBtn').addEventListener('click', () => {
        const name = document.getElementById('newColName').value.trim();
        if (!name) return;
        App.state.columns.push({id: App.generateId(), name, visible: true, system: false, width: 50});
        App.saveState();
        App.openTableEditor();
    });
    document.getElementById('resetColsBtn').addEventListener('click', () => {
        // КОПИРУЕМ дефолты, а не присваиваем ссылку — иначе App.defaults.columns
        // будет мутировать при последующих изменениях state.columns.
        App.state.columns = App.cloneDefaults('columns');
        App.saveState();
        App.openTableEditor();
    });
    document.getElementById('saveColsBtn').addEventListener('click', () => {
        document.querySelectorAll('.col-visible-toggle').forEach(toggle => {
            const id = toggle.dataset.id;
            const col = App.state.columns.find(c => c.id === id);
            if (col) col.visible = toggle.checked;
        });
        document.querySelectorAll('.column-width-input').forEach(input => {
            const id = input.dataset.id;
            const col = App.state.columns.find(c => c.id === id);
            if (col) {
                const width = parseInt(input.value, 10);
                // Защита от NaN/пустого поля: parseInt('') === NaN,
                // а Math.max/min(NaN) даёт NaN → ломает рендер ширины столбца.
                if (Number.isFinite(width)) {
                    col.width = Math.max(10, Math.min(600, width));
                } else {
                    col.width = 50;
                }
            }
        });
        App.saveState();
        App.render();
        App.closeDrawer();
        App.showToast('Настройки сохранены', 'success');
    });
};

/**
 * Выход из текущего пользователя.
 * Останавливает синхронизацию, очищает выбор пользователя,
 * но сохраняет подключение к общей базе данных.
 */
App.logout = function() {
    // 1. Останавливаем автоматическую синхронизацию
    App.syncStopPolling();
    App.chatStopPolling();

    // 2. Очищаем сохранённый выбор пользователя
    try {
        localStorage.removeItem('rtasks_current_user');
    } catch (e) {
        console.warn('Не удалось очистить localStorage:', e);
    }

    // 3. Сбрасываем текущего пользователя в state
    App.state.currentUser = null;

    // 4. Скрываем основное приложение
    if (App.elements.appMain) {
        App.elements.appMain.classList.add('hidden');
    }

    // 5. Показываем экран входа
    if (App.elements.loginScreen) {
        App.elements.loginScreen.classList.remove('hidden');
    }

    // 6. Если база подключена — сразу показываем выбор пользователя
    // Если нет — показываем шаг выбора базы
    if (App.sync.handle) {
        App.showUserSelectionStep();
    } else {
        App.showDatabaseStep('no-database');
    }

    // 7. Уведомляем пользователя
    App.showToast('Вы вышли из системы', 'info');
};
