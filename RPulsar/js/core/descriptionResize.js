// js/core/descriptionResize.js
window.App = window.App || {};

App.getDescriptionSizeKey = function(textareaId = 'detailDescription') {
    return `rtasks_description_size_${textareaId}_${App.state.currentUser || 'anon'}`;
};

/**
 * Восстанавливает и сохраняет размер (ширина/высота) поля описания —
 * per-textarea (drawer и модалка создания/редактирования хранят размер
 * раздельно — это разные по контексту поля, разумный размер для боковой
 * панели и для центрального модального окна обычно отличается) и per-user
 * (у каждого сотрудника свой сохранённый размер).
 */
App.initDescriptionResizePersistence = function(textareaId = 'detailDescription') {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;

    const storageKey = App.getDescriptionSizeKey(textareaId);

    // Восстанавливаем сохранённый размер этого пользователя (если есть)
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (saved && saved.width && saved.height) {
            textarea.style.width = saved.width;
            textarea.style.height = saved.height;
        }
    } catch (e) {
        console.error('Не удалось восстановить размер поля описания:', e);
    }

    // Отслеживаем изменение размера (пользователь тянет за уголок textarea)
    // и сохраняем его — с debounce, чтобы не писать в localStorage на
    // каждый пиксель перетаскивания.
    if (!App._descriptionResizeObservers) App._descriptionResizeObservers = {};
    if (App._descriptionResizeObservers[textareaId]) {
        App._descriptionResizeObservers[textareaId].disconnect();
    }
    let debounceTimer = null;
    const observer = new ResizeObserver(entries => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const el = entries[0]?.target;
            if (!el) return;
            try {
                localStorage.setItem(storageKey, JSON.stringify({
                    width: el.style.width || `${el.offsetWidth}px`,
                    height: el.style.height || `${el.offsetHeight}px`
                }));
            } catch (e) {
                console.error('Не удалось сохранить размер поля описания:', e);
            }
        }, 300);
    });
    observer.observe(textarea);
    App._descriptionResizeObservers[textareaId] = observer;
};
