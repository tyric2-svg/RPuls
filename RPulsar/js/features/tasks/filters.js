// js/features/tasks/filters.js
window.App = window.App || {};

App.renderFilters = function() {
    App.renderStatusFilter();
    App.renderAssigneeFilter();
    App.renderPriorityFilter();
    App.renderActiveFilters();
};

App.renderStatusFilter = function() {
    App.elements.statusFilterItems.innerHTML = App.state.statuses.map(s => `
<div class="filter-menu-item ${App.state.filters.status.includes(s.id) ? 'selected' : ''}" data-value="${s.id}" role="menuitem" tabindex="0">
<div class="filter-menu-item-icon" style="background: ${App.safeColor(s.color)}"></div>
<div class="filter-menu-item-label">${App.escapeHtml(s.name)}</div>
${App.state.filters.status.includes(s.id) ? '<div class="filter-menu-item-check">✓</div>' : ''}
</div>
`).join('');
    App.elements.statusFilterItems.querySelectorAll('.filter-menu-item').forEach(item => {
        const handler = (e) => {
            e.stopPropagation();
            App.toggleFilter('status', item.dataset.value);
        };
        item.addEventListener('click', handler);
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handler(e);
            }
        });
    });
};

App.renderAssigneeFilter = function() {
    const items = [
        `<div class="filter-menu-item ${App.state.filters.assignee.includes('') ? 'selected' : ''}" data-value="" role="menuitem" tabindex="0">
<div class="filter-menu-item-label">Не назначен</div>
${App.state.filters.assignee.includes('') ? '<div class="filter-menu-item-check">✓</div>' : ''}
</div>`
    ].concat(App.state.users.map(u => `
<div class="filter-menu-item ${App.state.filters.assignee.includes(u.id) ? 'selected' : ''}" data-value="${u.id}" role="menuitem" tabindex="0">
<div class="filter-menu-item-icon" style="background: ${App.safeColor(u.color)}"></div>
<div class="filter-menu-item-label">${App.escapeHtml(u.name)}</div>
${App.state.filters.assignee.includes(u.id) ? '<div class="filter-menu-item-check">✓</div>' : ''}
</div>
`));
    App.elements.assigneeFilterItems.innerHTML = items.join('');
    App.elements.assigneeFilterItems.querySelectorAll('.filter-menu-item').forEach(item => {
        const handler = (e) => {
            e.stopPropagation();
            App.toggleFilter('assignee', item.dataset.value);
        };
        item.addEventListener('click', handler);
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handler(e);
            }
        });
    });
};

App.renderPriorityFilter = function() {
    const priorities = [
        {id: 'low', name: 'Низкий'},
        {id: 'medium', name: 'Средний'},
        {id: 'high', name: 'Высокий'}
    ];
    App.elements.priorityFilterItems.innerHTML = priorities.map(p => `
<div class="filter-menu-item ${App.state.filters.priority.includes(p.id) ? 'selected' : ''}" data-value="${p.id}" role="menuitem" tabindex="0">
<div class="filter-menu-item-label">${App.escapeHtml(p.name)}</div>
${App.state.filters.priority.includes(p.id) ? '<div class="filter-menu-item-check">✓</div>' : ''}
</div>
`).join('');
    App.elements.priorityFilterItems.querySelectorAll('.filter-menu-item').forEach(item => {
        const handler = (e) => {
            e.stopPropagation();
            App.toggleFilter('priority', item.dataset.value);
        };
        item.addEventListener('click', handler);
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handler(e);
            }
        });
    });
};

App.toggleFilterMenu = function(type) {
    const menu = App.elements[type + 'FilterMenu'];
    const btn = App.elements[type + 'FilterBtn'];
    if (App.ui.openFilterMenu === type) {
        menu.classList.remove('open');
        btn.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
        App.ui.openFilterMenu = null;
    } else {
        App.closeAllFilterMenus();
        menu.classList.add('open');
        btn.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
        App.ui.openFilterMenu = type;
        setTimeout(() => {
            const firstItem = menu.querySelector('.filter-menu-item');
            if (firstItem) firstItem.focus();
        }, 50);
    }
};

App.closeAllFilterMenus = function() {
    ['status', 'assignee', 'priority'].forEach(type => {
        App.elements[type + 'FilterMenu'].classList.remove('open');
        App.elements[type + 'FilterBtn'].classList.remove('active');
        App.elements[type + 'FilterBtn'].setAttribute('aria-expanded', 'false');
    });
    App.ui.openFilterMenu = null;
};

App.toggleSortMenu = function() {
    const menu = App.elements.sortMenu;
    const btn = App.elements.sortButton;
    const isOpen = menu.classList.contains('open');

    if (isOpen) {
        menu.classList.remove('open');
        btn.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
    } else {
        App.closeAllFilterMenus();
        menu.classList.add('open');
        btn.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
        App.updateSortMenuSelection();
        setTimeout(() => {
            const firstItem = menu.querySelector('.sort-menu-item');
            if (firstItem) firstItem.focus();
        }, 50);
    }
};

App.updateSortMenuSelection = function() {
    const currentSort = App.state.sort;
    App.elements.sortMenu.querySelectorAll('.sort-menu-item').forEach(item => {
        const isSelected = (item.dataset.sort === 'manual' && !currentSort) ||
            (item.dataset.sort === currentSort);
        item.classList.toggle('selected', isSelected);
    });
};

App.setSort = function(sortType) {
    App.state.sort = sortType === 'manual' ? null : sortType;
    App.saveState();
    App.render();
    App.updateSortButtonLabel();
    App.elements.sortMenu.classList.remove('open');
    App.elements.sortButton.classList.remove('active');
    App.elements.sortButton.setAttribute('aria-expanded', 'false');

    const labels = {
        'manual': 'Ручной порядок',
        'priority': 'По приоритету',
        'dueDate': 'По сроку'
    };
    App.showToast(`Сортировка: ${labels[sortType]}`, 'info');
};

App.updateSortButtonLabel = function() {
    const labels = {
        'priority': 'По приоритету',
        'dueDate': 'По сроку'
    };
    const label = App.state.sort ? labels[App.state.sort] : 'Ручной порядок';
    App.elements.sortButtonLabel.textContent = label;
    App.updateSortMenuSelection();
};

App.toggleFilter = function(type, value) {
    const index = App.state.filters[type].indexOf(value);
    if (index === -1) App.state.filters[type].push(value);
    else App.state.filters[type].splice(index, 1);
    App.ui.renderedTaskLimit = App.TASK_PAGE_SIZE;
    App.saveState();
    App.render();
    App.renderFilters();
};

App.renderActiveFilters = function() {
    const chips = [];
    App.state.filters.status.forEach(id => {
        const status = App.state.statuses.find(s => s.id === id);
        if (status) {
            chips.push(`
<div class="filter-chip" data-type="status" data-value="${id}">
<span>${App.escapeHtml(status.name)}</span>
<button class="filter-chip-remove" data-type="status" data-value="${id}">✕</button>
</div>
`);
        }
    });
    App.state.filters.assignee.forEach(id => {
        if (id === '') {
            chips.push(`
<div class="filter-chip" data-type="assignee" data-value="">
<span>Не назначен</span>
<button class="filter-chip-remove" data-type="assignee" data-value="">✕</button>
</div>
`);
        } else {
            const user = App.state.users.find(u => u.id === id);
            if (user) {
                chips.push(`
<div class="filter-chip" data-type="assignee" data-value="${id}">
<span>${App.escapeHtml(user.name)}</span>
<button class="filter-chip-remove" data-type="assignee" data-value="${id}">✕</button>
</div>
`);
            }
        }
    });
    App.state.filters.priority.forEach(id => {
        chips.push(`
<div class="filter-chip" data-type="priority" data-value="${id}">
<span>${App.getPriorityLabel(id)}</span>
<button class="filter-chip-remove" data-type="priority" data-value="${id}">✕</button>
</div>
`);
    });
    App.elements.activeFilters.innerHTML = chips.join('');
    App.elements.activeFilters.querySelectorAll('.filter-chip-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            App.toggleFilter(btn.dataset.type, btn.dataset.value);
        });
    });
};
