// js/features/tasks/formHelpers.js
window.App = window.App || {};

App.populateTaskFormSelects = function() {
            // СОХРАНЯЕМ текущие выбранные значения перед перерисовкой
            const currentStatusValue = App.elements.taskStatus.value;
            const currentAssigneeIds = App.getSelectedTaskAssignees();

            // Перерисовываем опции
            App.elements.taskStatus.innerHTML = App.state.statuses.map(s =>
                `<option value="${s.id}">${App.escapeHtml(s.name)}</option>`
            ).join('');

            // ВОССТАНАВЛИВАЕМ выбранные значения (если они всё ещё существуют в списке)
            if (currentStatusValue) {
                const statusExists = App.state.statuses.some(s => s.id === currentStatusValue);
                if (statusExists) {
                    App.elements.taskStatus.value = currentStatusValue;
                }
            }
            // Оставляем только тех выбранных исполнителей, кто всё ещё существует
            // (пользователь мог быть удалён между открытием модалки и перерисовкой)
            const stillValidAssignees = currentAssigneeIds.filter(id =>
                App.state.users.some(u => u.id === id)
            );
            App.renderTaskAssigneePicker(stillValidAssignees);
};
