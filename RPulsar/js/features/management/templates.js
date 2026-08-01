// js/features/management/templates.js
window.App = window.App || {};

App.openTemplates = function() {
    const html = `
<div class="flex justify-between items-center mb-4">
<span class="text-muted">Создавайте свои шаблоны для быстрого создания задач</span>
<button class="btn btn-primary" id="addTemplateBtn">+ Создать шаблон</button>
</div>
<div class="templates-grid">
${App.state.templates.length === 0 ? `
<div class="empty-state" style="grid-column: 1 / -1; padding: 60px 20px;">
<div class="empty-state-icon">${App.icon('file-text-2', 'xl')}</div>
<h2 class="empty-state-title">Шаблонов пока нет</h2>
<p class="empty-state-description">
Создайте свои шаблоны для быстрого создания задач с предзаполненными полями
</p>
</div>
` : App.state.templates.map(t => `
<div class="template-card" data-id="${t.id}">
<div class="template-card-actions">
<button class="btn btn-ghost btn-icon edit-template-btn" data-id="${t.id}">${App.icon('pencil', 'sm')}</button>
<button class="btn btn-ghost btn-icon delete-template-btn" data-id="${t.id}">${App.icon('trash-2', 'sm')}</button>
</div>
<div class="template-card-icon">${App.escapeHtml(t.icon)}</div>
<div class="template-card-title">${App.escapeHtml(t.title)}</div>
<div class="template-card-description">${App.escapeHtml(t.description)}</div>
<div class="template-card-meta">
<span>${App.icon('message-circle', 'xs')} ${App.escapeHtml(App.state.statuses.find(s => s.id === t.data.status)?.name || 'Новая')}</span>
<span>${App.icon('zap', 'xs')} ${App.getPriorityLabel(t.data.priority || 'medium')}</span>
</div>
</div>
`).join('')}
</div>
`;
    App.openDrawer('Шаблоны задач', html);
    document.querySelectorAll('.template-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.template-card-actions')) return;
            App.useTemplate(card.dataset.id);
        });
    });
    document.querySelectorAll('.edit-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            App.editTemplate(btn.dataset.id);
        });
    });
    document.querySelectorAll('.delete-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            App.deleteTemplate(btn.dataset.id);
        });
    });
    document.getElementById('addTemplateBtn').addEventListener('click', () => App.editTemplate(null));
};

App.useTemplate = function(templateId) {
    const template = App.state.templates.find(t => t.id === templateId);
    if (!template) return;
    App.closeDrawer();
    App.openTaskModal();
    setTimeout(() => {
        App.elements.taskTitle.value = template.data.title || '';
        App.elements.taskDescription.value = template.data.description || '';
        if (template.data.status) App.elements.taskStatus.value = template.data.status;
        if (template.data.priority) App.elements.taskPriority.value = template.data.priority;
    }, 100);
    App.showToast(`Шаблон "${template.title}" применен`, 'success');
};

App.editTemplate = function(id) {
    const template = id ? App.state.templates.find(t => t.id === id) : {
        id: App.generateId(),
        icon: '📝',
        title: '',
        description: '',
        data: {title: '', description: '', status: 'new', priority: 'medium'}
    };
    const html = `
<div class="form-group">
<label class="form-label">Иконка (эмодзи)</label>
<input type="text" class="form-input" id="templateIcon" value="${App.escapeHtml(template.icon)}" maxlength="2">
</div>
<div class="form-group">
<label class="form-label">Название шаблона</label>
<input type="text" class="form-input" id="templateTitle" value="${App.escapeHtml(template.title)}" placeholder="Например: Баг-репорт">
</div>
<div class="form-group">
<label class="form-label">Описание</label>
<textarea class="form-input form-textarea" id="templateDescription">${App.escapeHtml(template.description)}</textarea>
</div>
<div class="form-group">
<label class="form-label">Заголовок задачи</label>
<input type="text" class="form-input" id="templateTaskTitle" value="${App.escapeHtml(template.data.title)}">
</div>
<div class="form-group">
<label class="form-label">Описание задачи</label>
<textarea class="form-input form-textarea" id="templateTaskDescription">${App.escapeHtml(template.data.description)}</textarea>
</div>
<div class="form-group">
<label class="form-label">Статус по умолчанию</label>
<select class="form-input" id="templateStatus">
${App.state.statuses.map(s => `<option value="${s.id}" ${template.data.status === s.id ? 'selected' : ''}>${App.escapeHtml(s.name)}</option>`).join('')}
</select>
</div>
<div class="form-group">
<label class="form-label">Приоритет по умолчанию</label>
<select class="form-input" id="templatePriority">
<option value="low" ${template.data.priority === 'low' ? 'selected' : ''}>Низкий</option>
<option value="medium" ${template.data.priority === 'medium' ? 'selected' : ''}>Средний</option>
<option value="high" ${template.data.priority === 'high' ? 'selected' : ''}>Высокий</option>
</select>
</div>
`;
    App.openDrawer(id ? 'Редактировать шаблон' : 'Новый шаблон', html, `
<button class="btn btn-secondary" id="cancelTemplateBtn">Отмена</button>
<button class="btn btn-primary" id="saveTemplateBtn">Сохранить</button>
`);
    document.getElementById('cancelTemplateBtn').addEventListener('click', () => App.openTemplates());
    document.getElementById('saveTemplateBtn').addEventListener('click', () => {
        const rawIcon = document.getElementById('templateIcon').value.trim();
        // Валидация иконки: допускаем 1-2 эмодзи/символа либо короткую строку.
        // Отбрасываем любые HTML-спецсимволы на входе, чтобы рендер был безопасен.
        const icon = rawIcon || '📝';
        // Дополнительная защита: если после trim длина > 2 символа (по code points),
        // обрезаем. Это не панацея, но блокирует типичные XSS-попытки.
        const iconCodePoints = Array.from(icon);
        const safeIcon = iconCodePoints.length > 2 ? iconCodePoints.slice(0, 2).join('') : icon;

        const title = document.getElementById('templateTitle').value.trim();
        if (!title) return App.showToast('Введите название', 'error');
        const newTemplate = {
            id: template.id,
            icon: safeIcon,
            title,
            description: document.getElementById('templateDescription').value.trim(),
            data: {
                title: document.getElementById('templateTaskTitle').value.trim(),
                description: document.getElementById('templateTaskDescription').value.trim(),
                status: document.getElementById('templateStatus').value,
                priority: document.getElementById('templatePriority').value
            }
        };
        if (id) {
            const idx = App.state.templates.findIndex(t => t.id === id);
            App.state.templates[idx] = newTemplate;
        } else {
            App.state.templates.push(newTemplate);
        }
        App.saveState();
        App.openTemplates();
        App.showToast('Шаблон сохранен', 'success');
    });
};

App.deleteTemplate = async function(id) {
    const confirmed = await App.confirmDialog('Удалить шаблон?', {danger: true});
    if (!confirmed) return;
    App.state.templates = App.state.templates.filter(t => t.id !== id);
    App.saveState();
    App.openTemplates();
    App.showToast('Шаблон удален', 'success');
};
