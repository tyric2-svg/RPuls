// js/ui/modal.js
window.App = window.App || {};

App.openTaskModal = function(prefillDescription) {
    App.ui.editingTask = null;
    App.ui.lastFocusedElement = document.activeElement;
    App.elements.modalTitle.textContent = 'Новая задача';
    App.elements.taskForm.reset();
    if (prefillDescription) {
        App.elements.taskDescription.value = prefillDescription;
    }
    // По умолчанию назначаем текущего пользователя исполнителем
    App.renderTaskAssigneePicker(App.state.currentUser ? [App.state.currentUser] : []);
    App.elements.taskPrivate.disabled = false;
    App.updateTaskPrivacyLock();
    App.initDescriptionResizePersistence('taskDescription');
    App.elements.modalBackdrop.classList.remove('hidden');
    App.elements.taskModal.classList.remove('hidden');
    setTimeout(() => App.elements.taskTitle.focus(), 100);
};

App.closeTaskModal = function() {
    App.closeInlineDropdown();
    App.elements.modalBackdrop.classList.add('hidden');
    App.elements.taskModal.classList.add('hidden');
    App.ui.editingTask = null;
    // Сбрасываем флаг "создаю из сообщения чата" при ЛЮБОМ закрытии модалки
    // (отмена или сохранение) — иначе следующее обычное создание задачи
    // (например, через кнопку "+") ошибочно допишет системное сообщение в чат.
    App.ui.creatingTaskFromChat = false;
    if (App.ui.lastFocusedElement) App.ui.lastFocusedElement.focus();
};

App.closeBulkModal = function() {
    App.elements.bulkModalBackdrop.classList.add('hidden');
    App.elements.bulkModal.classList.add('hidden');
    App.elements.bulkModalBody.innerHTML = '';
    if (App.ui.lastFocusedElement) {
        App.ui.lastFocusedElement.focus();
    }
};