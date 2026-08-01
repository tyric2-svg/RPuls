// js/features/tasks/calendar.js
window.App = window.App || {};

App.renderCalendar = function() {
    if (App.state.view !== 'calendar') return;

    const {viewMode} = App.state.calendar;

    // Обновляем активную кнопку режима
    document.querySelectorAll('.calendar-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === viewMode);
        btn.setAttribute('aria-selected', String(btn.dataset.mode === viewMode));
    });

    // Рендерим нужный вид
    if (viewMode === 'week') {
        App.renderWeekView();
    } else if (viewMode === 'quarter') {
        App.renderQuarterView();
    } else {
        App.renderMonthView();
    }

    // После рендера навешиваем drag&drop обработчики
    App.attachCalendarDragHandlers();
    // Рендерим Inbox с задачами без срока
    App.renderCalendarInbox();
};

/**
 * Получает задачи для календаря с учётом всех активных фильтров
 */
App.getCalendarTasks = function() {
    let tasks = App.visibleTasks();
    const searchTerm = App.ui.search.toLowerCase();
    if (searchTerm && !searchTerm.includes(':')) {
        tasks = tasks.filter(t =>
            t.title.toLowerCase().includes(searchTerm) ||
            (t.description && t.description.toLowerCase().includes(searchTerm))
        );
    }
    if (App.state.filters.status.length > 0) {
        tasks = tasks.filter(t => App.state.filters.status.includes(t.status));
    }
    if (App.state.filters.assignee.length > 0) {
        const assigneeFilter = App.state.filters.assignee;
        const includeUnassigned = assigneeFilter.includes('');
        tasks = tasks.filter(t => {
            const assigneeIds = Array.isArray(t.assignees) && t.assignees.length > 0
                ? t.assignees
                : (t.assignee ? [t.assignee] : []);
            if (includeUnassigned && assigneeIds.length === 0) return true;
            return assigneeIds.some(id => assigneeFilter.includes(id));
        });
    }
    if (App.state.filters.priority.length > 0) {
        tasks = tasks.filter(t => App.state.filters.priority.includes(t.priority));
    }
    return tasks;
};

/**
 * Генерирует HTML одного pill'а задачи с индикатором приоритета и поддержкой drag
 */
App.renderCalendarPill = function(task) {
    const status = App.state.statuses.find(s => s.id === task.status);
    const color = status?.color || '#6B6B6B';
    const priority = task.priority || 'medium';
    const priorityIcons = {high: 'alert-triangle', medium: 'zap', low: 'arrow-down'};
    const priorityColors = {high: 'var(--error)', medium: 'var(--warning)', low: 'var(--info)'};
    const priorityIcon = priorityIcons[priority] || 'zap';
    const priorityColor = priorityColors[priority] || 'var(--info)';
    return `<div class="calendar-task-pill"
style="background: ${color}20; color: ${color}; display: flex; align-items: center; gap: 4px; padding: var(--space-1) var(--space-2);"
data-id="${task.id}"
data-priority="${priority}"
draggable="true"
title="${App.escapeHtml(task.title)} — Приоритет: ${App.getPriorityLabel(priority)}">
<span style="color: ${priorityColor}; flex-shrink: 0; display: inline-flex; align-items: center;">${App.icon(priorityIcon, 'xs')}</span>
<span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${App.escapeHtml(task.title)}</span>
</div>`;
};

/**
 * Режим МЕСЯЦ — стандартная сетка 7×6
 */
App.renderMonthView = function() {
    const {year, month} = App.state.calendar;
    const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    App.elements.calendarTitle.textContent = `${months[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const daysInMonth = lastDay.getDate();
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    const today = new Date();
    const isTodayMonth = today.getFullYear() === year && today.getMonth() === month;
    const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const calendarTasks = App.getCalendarTasks();

    let html = '<div class="calendar-grid">';
    html += weekdays.map(d => `<div class="calendar-weekday">${d}</div>`).join('');

    for (let i = startDay - 1; i >= 0; i--) {
        const day = prevMonthLastDay - i;
        html += `<div class="calendar-day other-month"><div class="calendar-day-number">${day}</div></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = isTodayMonth && today.getDate() === day;
        const dayTasks = calendarTasks.filter(t => t.dueDate === dateStr);
        let tasksHtml = '';
        const maxShow = 3;
        dayTasks.slice(0, maxShow).forEach(task => {
            tasksHtml += App.renderCalendarPill(task);
        });
        if (dayTasks.length > maxShow) {
            tasksHtml += `<div class="calendar-task-more">+${dayTasks.length - maxShow} ещё</div>`;
        }
        html += `
            <div class="calendar-day ${isToday ? 'today' : ''}" data-date="${dateStr}">
                <div class="calendar-day-number">${day}</div>
                <div class="calendar-day-tasks">${tasksHtml}</div>
            </div>
        `;
    }

    const totalCells = startDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
        html += `<div class="calendar-day other-month"><div class="calendar-day-number">${i}</div></div>`;
    }
    html += '</div>';

    App.elements.calendarContent.innerHTML = html;
    App.attachCalendarDayHandlers();
};

/**
 * Режим НЕДЕЛЯ — 7 дней с подробным видом
 */
App.renderWeekView = function() {
    const focusDate = new Date(App.state.calendar.focusDate);
    const dayOfWeek = focusDate.getDay() === 0 ? 6 : focusDate.getDay() - 1;
    const monday = new Date(focusDate);
    monday.setDate(focusDate.getDate() - dayOfWeek);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekdays = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    const monthNames = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const calendarTasks = App.getCalendarTasks();

    const endDate = new Date(monday);
    endDate.setDate(monday.getDate() + 6);

    App.elements.calendarTitle.textContent =
        `${monday.getDate()} ${monthNames[monday.getMonth()]} — ${endDate.getDate()} ${monthNames[endDate.getMonth()]} ${endDate.getFullYear()}`;

    let html = '<div class="calendar-week-grid">';
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const isToday = d.getTime() === today.getTime();
        const dayTasks = calendarTasks.filter(t => t.dueDate === dateStr);

        html += `
            <div class="calendar-week-day ${isToday ? 'today' : ''}" data-date="${dateStr}">
                <div class="calendar-week-day-header">
                    <div class="calendar-week-day-name">${weekdays[i]}</div>
                    <div class="calendar-week-day-number">${d.getDate()}</div>
                </div>
                <div class="calendar-week-tasks">
                    ${dayTasks.map(t => App.renderCalendarPill(t)).join('')}
                    ${dayTasks.length === 0 ? '<div style="text-align:center; color: var(--text-muted); font-size: 12px; padding: 20px 0;">Нет задач</div>' : ''}
                </div>
            </div>
        `;
    }
    html += '</div>';

    App.elements.calendarContent.innerHTML = html;
    App.attachCalendarDayHandlers();
};

/**
 * Режим КВАРТАЛ — 3 месяца в ряд
 */
App.renderQuarterView = function() {
    const {year, month} = App.state.calendar;
    const quarterStartMonth = Math.floor(month / 3) * 3;
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const today = new Date();
    const calendarTasks = App.getCalendarTasks();

    const qNum = Math.floor(month / 3) + 1;
    App.elements.calendarTitle.textContent = `Квартал ${qNum}, ${year}`;

    let html = '<div class="calendar-quarter-container">';

    for (let m = 0; m < 3; m++) {
        const currentMonth = quarterStartMonth + m;
        const currentYear = year;
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        const daysInMonth = lastDay.getDate();
        const isTodayMonth = today.getFullYear() === currentYear && today.getMonth() === currentMonth;

        html += `<div class="calendar-quarter-month">`;
        html += `<div class="calendar-quarter-month-title">${monthNames[currentMonth]} ${currentYear}</div>`;
        html += `<div class="calendar-grid" style="border-top: none;">`;
        html += weekdays.map(d => `<div class="calendar-weekday">${d}</div>`).join('');

        for (let i = startDay - 1; i >= 0; i--) {
            html += `<div class="calendar-day other-month"></div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = isTodayMonth && today.getDate() === day;
            const dayTasks = calendarTasks.filter(t => t.dueDate === dateStr);
            const tasksHtml = dayTasks.slice(0, 2).map(t => App.renderCalendarPill(t)).join('');
            const moreCount = dayTasks.length - 2;

            html += `
                <div class="calendar-day ${isToday ? 'today' : ''}" data-date="${dateStr}">
                    <div class="calendar-day-number">${day}</div>
                    <div class="calendar-day-tasks">
                        ${tasksHtml}
                        ${moreCount > 0 ? `<div class="calendar-task-more" style="font-size: 9px;">+${moreCount}</div>` : ''}
                    </div>
                </div>
            `;
        }

        const totalCells = startDay + daysInMonth;
        const remaining = (7 - (totalCells % 7)) % 7;
        for (let i = 1; i <= remaining; i++) {
            html += `<div class="calendar-day other-month"></div>`;
        }

        html += `</div></div>`;
    }

    html += '</div>';
    App.elements.calendarContent.innerHTML = html;
    App.attachCalendarDayHandlers();
};

/**
 * Получает все задачи без срока выполнения (dueDate === null или '')
 */
App.getTasksWithoutDueDate = function() {
    return App.visibleTasks().filter(task => !task.dueDate);
};

/**
 * Рендерит Inbox-панель с задачами без срока
 */
App.renderCalendarInbox = function() {
    const inboxContainer = App.elements.calendarInbox;
    if (!inboxContainer) return;

    // 🛡️ ЗАЩИТА 1: Не рендерим во время фоновой синхронизации
    // (данные не менялись, просто проверяем сервер)
    if (App._suppressSkeletons) return;

    const tasks = App.getTasksWithoutDueDate();

    // 🛡️ ЗАЩИТА 2: Если список задач и их содержимое не изменились — не перерисовываем.
    // Раньше хэш строился только из отсортированных id — это ловило добавление/
    // удаление задач из списка "без срока", но не изменение их полей (название,
    // статус, исполнитель, приоритет), пока сама задача оставалась в списке —
    // панель молча показывала устаревшие данные.
    const currentHash = tasks
        .map(t => [t.id, t.title, t.status, t.priority, t.assignee, (t.assignees || []).join('+')].join('|'))
        .sort()
        .join(',');
    const lastHash = inboxContainer.dataset.inboxHash || '';

    if (tasks.length === 0) {
        if (lastHash !== '') {
            inboxContainer.innerHTML = '';
            inboxContainer.dataset.inboxHash = '';
        }
        return;
    }

    // Если хэш совпадает — данные те же, пропускаем ререндер
    if (currentHash === lastHash) return;

    // Запоминаем новый хэш
    inboxContainer.dataset.inboxHash = currentHash;

    const html = `
        <div class="calendar-inbox" id="calendarInboxPanel">
            <div class="calendar-inbox-header">
                <div class="calendar-inbox-title">
                    ${App.icon('inbox', 'md')}
                    <span>Без срока</span>
                    <span class="calendar-inbox-count">${tasks.length}</span>
                </div>
                <button class="calendar-inbox-collapse-btn" id="inboxCollapseBtn" 
                    aria-label="Свернуть/развернуть" title="Свернуть/развернуть">
                    ${App.icon('chevron-up', 'sm')}
                </button>
            </div>
            <div class="calendar-inbox-body">
                <div class="calendar-inbox-list">
                    ${tasks.map(task => {
                const status = App.state.statuses.find(s => s.id === task.status);
                const statusColor = status?.color || '#6B6B6B';
                const statusName = status?.name || task.status;
                const assignee = App.state.users.find(u => u.id === task.assignee);

                return `
                            <div class="calendar-inbox-item" 
                                data-id="${task.id}" 
                                draggable="true"
                                tabindex="0"
                                title="Перетащите на день календаря">
                                <div class="calendar-inbox-item-priority" 
                                    data-priority="${task.priority || 'medium'}"></div>
                                <div class="calendar-inbox-item-content">
                                    <div class="calendar-inbox-item-title">
                                        ${App.escapeHtml(task.title)}
                                    </div>
                                    <div class="calendar-inbox-item-meta">
                                        <span class="calendar-inbox-item-status">
                                            <span class="calendar-inbox-item-status-dot" 
                                                style="background: ${App.safeColor(statusColor)};"></span>
                                            ${App.escapeHtml(statusName)}
                                        </span>
                                        ${assignee ? `<span>• ${App.escapeHtml(assignee.name)}</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
            }).join('')}
                </div>
            </div>
        </div>
    `;

    inboxContainer.innerHTML = html;
    // 🎯 Помечаем панель как отрендеренную — анимация больше не запустится
    const newPanel = inboxContainer.querySelector('.calendar-inbox');
    if (newPanel) {
        // Даём браузеру отрисовать первый кадр, потом помечаем
        requestAnimationFrame(() => {
            newPanel.setAttribute('data-rendered', 'true');
        });
    }
    App.attachInboxDragHandlers();
    App.attachInboxCollapseHandler();
};

/**
 * Обработчик сворачивания/разворачивания Inbox
 */
App.attachInboxCollapseHandler = function() {
    const collapseBtn = document.getElementById('inboxCollapseBtn');
    const inboxPanel = document.getElementById('calendarInboxPanel');

    if (!collapseBtn || !inboxPanel) return;

    const isCollapsed = localStorage.getItem('rpulsar_inbox_collapsed') === 'true';
    if (isCollapsed) {
        inboxPanel.classList.add('collapsed');
    }

    collapseBtn.addEventListener('click', () => {
        inboxPanel.classList.toggle('collapsed');
        const collapsed = inboxPanel.classList.contains('collapsed');
        localStorage.setItem('rpulsar_inbox_collapsed', collapsed ? 'true' : 'false');
    });
};

/**
 * Drag & Drop для задач из Inbox на дни календаря
 */
App.attachInboxDragHandlers = function() {
    const inboxItems = document.querySelectorAll('.calendar-inbox-item[draggable="true"]');

    inboxItems.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            const taskId = App.parseId(item.dataset.id);
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(taskId));
            e.dataTransfer.setData('source', 'inbox');
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            document.querySelectorAll('.calendar-day.drag-over, .calendar-week-day.drag-over')
                .forEach(el => el.classList.remove('drag-over'));
        });

        item.addEventListener('click', (e) => {
            if (item.classList.contains('dragging')) return;
            const taskId = App.parseId(item.dataset.id);
            if (taskId) {
                App.openTaskDetail(taskId);
            }
        });
    });
};

/**
 * Обработчики двойного клика по дню (создание задачи на эту дату)
 */
App.attachCalendarDayHandlers = function() {
    App.elements.calendarContent.querySelectorAll('.calendar-day:not(.other-month), .calendar-week-day').forEach(day => {
        day.addEventListener('dblclick', (e) => {
            if (e.target.closest('.calendar-task-pill')) return;
            const date = day.dataset.date;
            if (!date) return;
            App.openTaskModal();
            setTimeout(() => {
                App.elements.taskDueDate.value = date;
            }, 100);
        });
    });
};

/**
 * Drag & Drop: перетаскивание задач между днями для смены dueDate
 */
App.attachCalendarDragHandlers = function() {
    const content = App.elements.calendarContent;
    let draggedTaskId = null;

    content.querySelectorAll('.calendar-task-pill[draggable="true"]').forEach(pill => {
        pill.addEventListener('dragstart', (e) => {
            draggedTaskId = App.parseId(pill.dataset.id);
            pill.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(draggedTaskId));
        });
        pill.addEventListener('dragend', () => {
            pill.classList.remove('dragging');
            content.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            draggedTaskId = null;
        });
        pill.addEventListener('click', (e) => {
            e.stopPropagation();
            App.openTaskDetail(App.parseId(pill.dataset.id));
        });
    });

    content.querySelectorAll('.calendar-day, .calendar-week-day').forEach(day => {
        day.addEventListener('dragover', (e) => {
            if (!day.dataset.date) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            day.classList.add('drag-over');
        });
        day.addEventListener('dragleave', (e) => {
            if (!day.contains(e.relatedTarget)) {
                day.classList.remove('drag-over');
            }
        });
        day.addEventListener('drop', (e) => {
            e.preventDefault();
            day.classList.remove('drag-over');
            const newDate = day.dataset.date;
            if (!newDate) return;

            const source = e.dataTransfer.getData('source');
            let taskId = draggedTaskId;

            if (source === 'inbox') {
                taskId = App.parseId(e.dataTransfer.getData('text/plain'));
            }

            if (!taskId) return;

            const task = App.state.tasks.find(t => t.id === taskId);
            if (!task) return;
            if (task.dueDate === newDate) return;

            task.dueDate = newDate;
            App.saveState();
            App.renderCalendar();

            const message = source === 'inbox'
                ? `Задача запланирована на ${App.formatDate(newDate)}`
                : `Срок перенесён на ${App.formatDate(newDate)}`;
            App.showToast(message, 'success');
        });
    });
};

/**
 * Привязывает обработчики навигации и переключения режимов календаря.
 * Вынесено из core/bindEvents.js для декомпозиции God Function.
 */
App.bindCalendarEvents = function() {
    App.elements.calendarPrev.addEventListener('click', () => {
        const mode = App.state.calendar.viewMode;
        if (mode === 'week') {
            const d = new Date(App.state.calendar.focusDate);
            d.setDate(d.getDate() - 7);
            App.state.calendar.focusDate = App.getLocalISODate(d);
            App.state.calendar.year = d.getFullYear();
            App.state.calendar.month = d.getMonth();
        } else if (mode === 'quarter') {
            App.state.calendar.month -= 3;
            if (App.state.calendar.month < 0) {
                App.state.calendar.month += 12;
                App.state.calendar.year--;
            }
        } else {
            App.state.calendar.month--;
            if (App.state.calendar.month < 0) {
                App.state.calendar.month = 11;
                App.state.calendar.year--;
            }
        }
        App.saveState();
        App.renderCalendar();
    });

    App.elements.calendarNext.addEventListener('click', () => {
        const mode = App.state.calendar.viewMode;
        if (mode === 'week') {
            const d = new Date(App.state.calendar.focusDate);
            d.setDate(d.getDate() + 7);
            App.state.calendar.focusDate = App.getLocalISODate(d);
            App.state.calendar.year = d.getFullYear();
            App.state.calendar.month = d.getMonth();
        } else if (mode === 'quarter') {
            App.state.calendar.month += 3;
            if (App.state.calendar.month > 11) {
                App.state.calendar.month -= 12;
                App.state.calendar.year++;
            }
        } else {
            App.state.calendar.month++;
            if (App.state.calendar.month > 11) {
                App.state.calendar.month = 0;
                App.state.calendar.year++;
            }
        }
        App.saveState();
        App.renderCalendar();
    });

    App.elements.calendarToday.addEventListener('click', () => {
        const today = new Date();
        App.state.calendar.year = today.getFullYear();
        App.state.calendar.month = today.getMonth();
        App.state.calendar.focusDate = App.getLocalISODate(today);
        App.saveState();
        App.renderCalendar();
    });

    App.elements.calendarModeSwitcher.addEventListener('click', (e) => {
        const btn = e.target.closest('.calendar-mode-btn');
        if (!btn) return;
        App.state.calendar.viewMode = btn.dataset.mode;
        App.saveState();
        App.renderCalendar();
    });
};
