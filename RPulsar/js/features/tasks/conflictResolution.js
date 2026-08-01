// js/features/tasks/conflictResolution.js
window.App = window.App || {};

        /**
         * Показывает модальное окно разрешения конфликта версий.
         * Предлагает пользователю: принять свою версию, принять чужую или увидеть различия.
         */
        App.showConflictDialog = function(taskId, remoteTask, localTitle, localDescription) {
            const remoteUser = remoteTask.assignee
                ? (App.state.users.find(u => u.id === remoteTask.assignee)?.name || 'коллегой')
                : 'коллегой';

            const html = `
        <div style="padding: var(--space-4); background: var(--warning-bg); border: 1px solid var(--warning); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
            <div style="font-weight: 600; margin-bottom: var(--space-2);">${App.icon('alert-triangle', 'sm')} Конфликт версий</div>
            <div style="font-size: var(--text-sm); color: var(--text-secondary);">
                Задача «<strong>${App.escapeHtml(remoteTask.title)}</strong>» была изменена пользователем
                <strong>${App.escapeHtml(remoteUser)}</strong>, пока вы её редактировали.
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); margin-bottom: var(--space-4);">
            <div style="padding: var(--space-3); background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                <div style="font-size: var(--text-xs); font-weight: 600; color: var(--accent); margin-bottom: var(--space-2); text-transform: uppercase;">${App.icon('file-text-2', 'xs')} Ваша версия</div>
                <div style="font-weight: 500; margin-bottom: var(--space-2);">${App.escapeHtml(localTitle)}</div>
                <div style="font-size: var(--text-sm); color: var(--text-secondary); max-height: 100px; overflow-y: auto;">${App.escapeHtml(localDescription || '(без описания)')}</div>
            </div>
            <div style="padding: var(--space-3); background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                <div style="font-size: var(--text-xs); font-weight: 600; color: var(--success); margin-bottom: var(--space-2); text-transform: uppercase;">${App.icon('refresh-cw', 'xs')} Версия коллеги</div>
                <div style="font-weight: 500; margin-bottom: var(--space-2);">${App.escapeHtml(remoteTask.title)}</div>
                <div style="font-size: var(--text-sm); color: var(--text-secondary); max-height: 100px; overflow-y: auto;">${App.escapeHtml(remoteTask.description || '(без описания)')}</div>
            </div>
        </div>
    `;

            App.openDrawer('Разрешение конфликта', html, `
        <button class="btn btn-secondary" id="conflictAcceptRemote">${App.icon('refresh-cw', 'sm')} Принять версию коллеги</button>
<button class="btn btn-primary" id="conflictKeepLocal">${App.icon('file-text-2', 'sm')} Перезаписать своей версией</button>
    `);

// Принять чужую версию — просто переоткрыть Drawer с актуальными данными
            document.getElementById('conflictAcceptRemote').addEventListener('click', () => {
                App.closeTaskModal();
                // openTaskDetail сам заполнит Drawer свежими данными из state
                App.openTaskDetail(taskId);
                App.ui.openedTaskVersion = App.state.tasks.find(t => t.id === taskId)?.version || 1;
                App.showToast('Принята версия коллеги', 'info');
            });

// Перезаписать своей версией — принудительно сохранить и переоткрыть Drawer
            document.getElementById('conflictKeepLocal').addEventListener('click', () => {
                const index = App.state.tasks.findIndex(t => t.id === taskId);
                if (index !== -1) {
                    const currentVersion = App.state.tasks[index].version || 1;
                    App.state.tasks[index].title = localTitle;
                    App.state.tasks[index].description = localDescription;
                    App.state.tasks[index].version = currentVersion + 1;
                    App.state.tasks[index].updatedAt = new Date().toISOString();
                    App.saveState();
                    App.render();
                    App.ui.openedTaskVersion = App.state.tasks[index].version;
                }
                App.closeTaskModal();
                App.openTaskDetail(taskId);
                App.showToast('Ваши изменения сохранены (перезаписана версия коллеги)', 'warning');
            });
        };

