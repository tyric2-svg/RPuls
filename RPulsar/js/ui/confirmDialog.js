// js/ui/confirmDialog.js
window.App = window.App || {};

/**
 * Стилизованный диалог подтверждения — замена нативному confirm(), который
 * выглядит как системное окно браузера и выбивается из общего вида
 * приложения. Возвращает Promise<boolean> — true при подтверждении,
 * false при отмене (в т.ч. по Escape или клику по фону).
 *
 * Использование:
 *   const ok = await App.confirmDialog('Удалить задачу?');
 *   if (!ok) return;
 */
App.confirmDialog = function(message, options = {}) {
    const {
        title = 'Подтверждение',
        confirmText = 'Подтвердить',
        cancelText = 'Отмена',
        danger = false
    } = options;

    return new Promise((resolve) => {
        App.elements.confirmDialogTitle.textContent = title;
        App.elements.confirmDialogMessage.textContent = message;
        App.elements.confirmDialogConfirm.textContent = confirmText;
        App.elements.confirmDialogCancel.textContent = cancelText;
        App.elements.confirmDialogConfirm.classList.toggle('btn-danger', danger);
        App.elements.confirmDialogConfirm.classList.toggle('btn-primary', !danger);

        const lastFocused = document.activeElement;

        const cleanup = (result) => {
            App.elements.confirmDialogBackdrop.classList.add('hidden');
            App.elements.confirmDialog.classList.add('hidden');
            App.elements.confirmDialogConfirm.removeEventListener('click', onConfirm);
            App.elements.confirmDialogCancel.removeEventListener('click', onCancel);
            App.elements.confirmDialogBackdrop.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onKeydown);
            if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
            resolve(result);
        };

        const onConfirm = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onKeydown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
            }
        };

        App.elements.confirmDialogConfirm.addEventListener('click', onConfirm);
        App.elements.confirmDialogCancel.addEventListener('click', onCancel);
        App.elements.confirmDialogBackdrop.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKeydown);

        App.elements.confirmDialogBackdrop.classList.remove('hidden');
        App.elements.confirmDialog.classList.remove('hidden');
        setTimeout(() => App.elements.confirmDialogConfirm.focus(), 50);
    });
};
