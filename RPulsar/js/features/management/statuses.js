// js/features/management/statuses.js
window.App = window.App || {};

App.openStatuses = function() {
    App.renderStatusesList();
};

App.renderStatusesList = function() {
    const html = `
<div class="flex justify-between items-center mb-4">
<span class="text-muted">Всего: ${App.state.statuses.length}</span>
<button class="btn btn-primary" id="addStatusBtn">+ Добавить статус</button>
</div>
<div class="list-container">
${App.state.statuses.map(s => `
<div class="list-item">
<div class="list-item-color" style="background: ${App.safeColor(s.color)}"></div>
<div class="list-item-content">
<div class="list-item-title">${App.escapeHtml(s.name)}</div>
</div>
<div class="list-item-actions">
<button class="btn btn-ghost btn-icon edit-status-btn" data-id="${s.id}">${App.icon('pencil', 'sm')}</button>
<button class="btn btn-ghost btn-icon delete-status-btn" data-id="${s.id}">${App.icon('trash-2', 'sm')}</button>n>
</div>
</div>
`).join('')}
</div>
`;
    App.openDrawer('Управление статусами', html);
    document.getElementById('addStatusBtn').addEventListener('click', () => App.editStatus(null));
    document.querySelectorAll('.edit-status-btn').forEach(btn => {
        btn.addEventListener('click', (e) => App.editStatus(e.currentTarget.dataset.id));
    });
    document.querySelectorAll('.delete-status-btn').forEach(btn => {
        btn.addEventListener('click', (e) => App.deleteStatus(e.currentTarget.dataset.id));
    });
};

App.editStatus = function(id) {
    const status = id ? App.state.statuses.find(s => s.id === id) : {
        id: App.generateId(),
        name: '',
        color: App.colors[0]
    };
    const html = `
<div class="form-group">
<label class="form-label">Название статуса</label>
<input type="text" class="form-input" id="statusName" value="${App.escapeHtml(status.name)}" placeholder="Например: В работе" autofocus autocomplete="off">
</div>
<div class="form-group">
<label class="form-label">Цвет</label>
<div class="color-picker" id="statusColorPicker">
${App.colors.map(c => `
<div class="color-option ${c === status.color ? 'selected' : ''}"
style="background: ${c}" data-color="${c}" tabindex="0"></div>
`).join('')}
</div>
</div>
`;
    App.openDrawer(id ? 'Редактировать статус' : 'Новый статус', html, `
<button class="btn btn-secondary" id="cancelStatusBtn">Отмена</button>
<button class="btn btn-primary" id="saveStatusBtn">Сохранить</button>
`);
    let selectedColor = status.color;
    document.querySelectorAll('#statusColorPicker .color-option').forEach(opt => {
        const handler = () => {
            document.querySelectorAll('#statusColorPicker .color-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedColor = opt.dataset.color;
        };
        opt.addEventListener('click', handler);
        opt.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handler();
            }
        });
    });
    document.getElementById('cancelStatusBtn').addEventListener('click', () => App.renderStatusesList());
    document.getElementById('saveStatusBtn').addEventListener('click', () => {
        const name = document.getElementById('statusName').value.trim();
        if (!name) return App.showToast('Введите название', 'error');
        if (id) {
            const index = App.state.statuses.findIndex(s => s.id === id);
            App.state.statuses[index] = {...status, name, color: selectedColor};
        } else {
            App.state.statuses.push({...status, name, color: selectedColor});
        }
        App.saveState();
        App.render();
        App.renderStatusesList();
        App.showToast('Статус сохранен', 'success');
    });
    // Enter в поле названия статуса — сохраняем
    document.getElementById('statusName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('saveStatusBtn').click();
        }
    });
};

App.deleteStatus = async function(id) {
    if (App.state.statuses.length <= 1) return App.showToast('Нельзя удалить последний статус', 'error');
    const confirmed = await App.confirmDialog('Удалить статус?', {danger: true});
    if (!confirmed) return;
    const status = App.state.statuses.find(s => s.id === id);
    App.state.statuses = App.state.statuses.filter(s => s.id !== id);
    App.saveState();
    App.render();
    App.renderStatusesList();
    App.showToast('Статус удален', 'success');
};
