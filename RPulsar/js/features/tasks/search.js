// js/features/tasks/search.js
window.App = window.App || {};

App.parseSearchQuery = function(query) {
    const operators = {
        'status:': 'status',
        'assignee:': 'assignee',
        'priority:': 'priority',
        'due:': 'dueDate'
    };
    const filters = {};
    let searchTerm = query;
    Object.keys(operators).forEach(op => {
        const regex = new RegExp(`${op}([^\\s]+)`, 'gi');
        const matches = query.match(regex);
        if (matches) {
            matches.forEach(match => {
                const value = match.substring(op.length);
                const field = operators[op];
                if (!filters[field]) filters[field] = [];
                filters[field].push(value);
                searchTerm = searchTerm.replace(match, '').trim();
            });
        }
    });
    return {searchTerm, filters};
};

App.applyAdvancedSearch = function(query) {
    const {searchTerm, filters} = App.parseSearchQuery(query);
    let filteredTasks = App.visibleTasks();
    if (searchTerm) {
        filteredTasks = filteredTasks.filter(task =>
            task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (task.description && task.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }
    if (filters.status) {
        filteredTasks = filteredTasks.filter(t =>
            filters.status.some(s => {
                const status = App.state.statuses.find(st => st.id === t.status);
                return status?.id.toLowerCase() === s.toLowerCase() ||
                    status?.name.toLowerCase().includes(s.toLowerCase());
            })
        );
    }
    if (filters.assignee) {
        filteredTasks = filteredTasks.filter(t => {
            const assigneeIds = Array.isArray(t.assignees) && t.assignees.length > 0
                ? t.assignees
                : (t.assignee ? [t.assignee] : []);
            return filters.assignee.some(a => {
                if (a === '@me') return assigneeIds.includes(App.state.currentUser);
                // Поиск по имени среди всех исполнителей задачи
                return assigneeIds.some(id => {
                    const user = App.state.users.find(u => u.id === id);
                    return user?.name.toLowerCase().includes(a.toLowerCase());
                });
            });
        });
    }
    if (filters.priority) {
        filteredTasks = filteredTasks.filter(t =>
            filters.priority.includes(t.priority)
        );
    }
    if (filters.dueDate) {
        const today = App.getLocalISODate(new Date());
        filteredTasks = filteredTasks.filter(t => {
            if (filters.dueDate.includes('today')) return t.dueDate === today;
            if (filters.dueDate.includes('overdue')) return t.dueDate && t.dueDate < today && t.status !== 'done';
            return filters.dueDate.some(d => t.dueDate === d);
        });
    }
    if (App.state.currentSection === 'assignments') {
        filteredTasks = filteredTasks.filter(t => App.matchesAssignmentMode(t));
    }
    const orderMap = new Map(App.state.taskOrder.map((id, index) => [id, index]));
    return filteredTasks.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
};

App.showSearchSuggestions = function(query) {
    const suggestions = [
        {operator: 'status:', description: 'Фильтр по статусу (status:done, status:В работе)'},
        {operator: 'assignee:', description: 'Фильтр по исполнителю (assignee:@me, assignee:Иван)'},
        {operator: 'priority:', description: 'Фильтр по приоритету (priority:high, priority:medium)'},
        {operator: 'due:', description: 'Фильтр по сроку (due:today, due:overdue, due:2026-07-15)'}
    ];
    const filtered = suggestions.filter(s =>
        s.operator.toLowerCase().includes(query.toLowerCase()) || query.includes(':')
    );
    if (filtered.length === 0) {
        App.elements.searchSuggestions.classList.remove('active');
        return;
    }
    const html = filtered.map(s => `
<div class="search-suggestion-item" data-operator="${s.operator}">
<div class="search-suggestion-operator">${s.operator}</div>
<div class="search-suggestion-description">${s.description}</div>
</div>
`).join('') + `
<div class="search-help">
${App.icon('info-circle', 'sm')} Используйте операторы для точного поиска. Например: <code>status:done assignee:@me</code>
</div>
`;
    App.elements.searchSuggestions.innerHTML = html;
    App.elements.searchSuggestions.classList.add('active');
    App.elements.searchSuggestions.querySelectorAll('.search-suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const operator = item.dataset.operator;
            App.elements.searchInput.value = query + ' ' + operator;
            App.elements.searchInput.focus();
            App.elements.searchSuggestions.classList.remove('active');
        });
    });
};
