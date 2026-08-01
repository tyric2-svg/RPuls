// js/core/skeletons.js
window.App = window.App || {};

App.showSkeletons = function() {
    const view = App.state.view;
    const section = App.state.currentSection;
    if (section === 'tasks') {
        if (view === 'table') {
            App.showTableSkeletons();
        } else if (view === 'kanban') {
            App.showKanbanSkeletons();
        } else if (view === 'calendar') {
            App.showCalendarSkeletons();
        }
    }
};

/**
 * Скрывает все skeleton loaders
 */
App.hideSkeletons = function() {
    // Плавное исчезновение через анимацию, затем полное удаление из DOM —
    // иначе при каждом новом переключении вида накапливались бы
    // спрятанные, но не удалённые overlay-элементы.
    document.querySelectorAll('.skeleton-container').forEach(el => {
        el.style.animation = 'skeletonFadeOut 0.25s ease-out';
        el.addEventListener('animationend', () => {
            el.remove();
        }, {once: true});
    });
};

/**
 * Показывает skeleton для таблицы задач
 */
App.showTableSkeletons = function() {
    const tbody = App.elements.tasksBody;
    if (!tbody) return;

    const visibleCols = App.state.columns.filter(c => c.visible);
    const colCount = visibleCols.length || 8;

    // Создаём skeleton-строки прямо в tbody — render() их перезапишет
    tbody.innerHTML = Array(8).fill(null).map(() => `
        <tr class="skeleton-row-tr">
            <td colspan="${colCount}" style="padding: 0;">
                <div class="skeleton-row">
                    <div class="skeleton-cell" style="width: 40px;"></div>
                    <div class="skeleton-cell" style="width: 30px;"></div>
                    <div class="skeleton-cell" style="width: 50px;"></div>
                    <div class="skeleton-cell" style="flex: 1;"></div>
                    <div class="skeleton-cell" style="width: 80px;"></div>
                    <div class="skeleton-cell" style="width: 80px;"></div>
                    <div class="skeleton-cell" style="width: 100px;"></div>
                    <div class="skeleton-cell" style="width: 100px;"></div>
                </div>
            </td>
        </tr>
    `).join('');
};

/**
 * Показывает skeleton для Kanban
 */
App.showKanbanSkeletons = function() {
    const kanbanView = App.elements.kanbanView;
    if (!kanbanView) return;

    // Вставляем skeleton прямо в kanbanView — renderKanban() перезапишет
    kanbanView.innerHTML = App.state.statuses.map(() => `
        <div class="kanban-column">
            <div class="kanban-column-header">
                <div class="kanban-column-title">
                    <div class="skeleton" style="width: 12px; height: 12px; border-radius: 50%;"></div>
                    <div class="skeleton" style="width: 80px; height: 16px;"></div>
                    <div class="skeleton" style="width: 30px; height: 20px; border-radius: 9999px;"></div>
                </div>
            </div>
            <div class="kanban-cards">
                ${Array(3).fill(null).map(() => `
                    <div class="skeleton-card">
                        <div class="skeleton-card-title"></div>
                        <div class="skeleton-card-text"></div>
                        <div class="skeleton-card-text"></div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');

    // Показываем kanbanView (на случай если он был скрыт)
    kanbanView.classList.remove('hidden');
};

/**
 * Показывает skeleton для календаря
 */
App.showCalendarSkeletons = function() {
    const calendarContent = App.elements.calendarContent;
    if (!calendarContent) return;

    // Вставляем skeleton прямо в calendarContent — renderCalendar() перезапишет
    calendarContent.innerHTML = `
        <div class="calendar-grid">
            ${Array(7).fill(null).map(() => `
                <div class="calendar-weekday">
                    <div class="skeleton" style="height: 16px; width: 40px; margin: 0 auto;"></div>
                </div>
            `).join('')}
            ${Array(35).fill(null).map(() => `
                <div class="skeleton-calendar-day">
                    <div class="skeleton-calendar-day-number"></div>
                    <div class="skeleton-calendar-task" style="width: 80%;"></div>
                    <div class="skeleton-calendar-task" style="width: 60%;"></div>
                </div>
            `).join('')}
        </div>
    `;
};

App.initialRenderWithSkeleton = function(showSkeletonFn, renderFn) {
    if (!App.state._initialRenderDone) {
        showSkeletonFn.call(App);
        setTimeout(() => {
            renderFn.call(App);
            App.hideSkeletons();
            App.state._initialRenderDone = true;
        }, 300);
    } else {
        renderFn.call(App);
    }
};
