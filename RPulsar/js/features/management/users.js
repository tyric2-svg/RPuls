// js/features/management/users.js
window.App = window.App || {};

App.openUsers = function() {
    App.renderUsersList();
};

App.renderUsersList = function() {
    const html = `
<div class="flex justify-between items-center mb-4">
    <span class="text-muted">Всего: ${App.state.users.length}</span>
    <button class="btn btn-primary" id="addUserBtn">+ Добавить пользователя</button>
</div>
<div class="list-container">
    ${App.state.users.map(u => `
<div class="list-item">
    <div class="list-item-color" style="background: ${App.safeColor(u.color)}; border-radius: 50%;"></div>
    <div class="list-item-content">
        <div class="list-item-title">${App.escapeHtml(u.name)}</div>
        <div class="list-item-subtitle">${App.escapeHtml(App.getRoleLabel(u.role))}</div>
    </div>
    <div class="list-item-actions">
  <button class="btn btn-ghost btn-icon edit-user-btn" data-id="${u.id}">${App.icon('pencil', 'sm')}</button>
${App.can('delete_user') ? `<button class="btn btn-ghost btn-icon delete-user-btn" data-id="${u.id}">${App.icon('trash-2', 'sm')}</button>` : ''}
    </div>
</div>
    `).join('')}
</div>
    `;
    App.openDrawer('Управление пользователями', html);
    document.getElementById('addUserBtn').addEventListener('click', () => App.editUser(null));
    document.querySelectorAll('.edit-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => App.editUser(e.currentTarget.dataset.id));
    });
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => App.deleteUser(e.currentTarget.dataset.id));
    });
};

App.editUser = function(id) {
    // === ПРОВЕРКА ПРАВ ===
    // Раньше editUser был доступен всем без проверки — это позволяло любому
    // сотруднику создать/редактировать пользователя с role='admin' (privilege escalation).
    if (!App.can('manage_users')) {
        App.showToast('Нет прав на управление пользователями', 'error');
        return;
    }

    const editingSelf = id && id === App.state.currentUser;
    const currentUserRole = (App.state.users.find(u => u.id === App.state.currentUser) || {}).role;
    const isAdmin = currentUserRole === 'admin';

    const user = id ? App.state.users.find(u => u.id === id) : {
        id: App.generateId(),
        name: '',
        role: 'manager',
        color: App.colors[4]
    };

    // Роль для отображения в форме: только admin/manager. Старые значения
    // типа 'Администратор' нормализуем — пользователь видит только корректные варианты.
    const normalizeRoleForDisplay = function(r) {
        return (r === 'admin' || r === 'manager') ? r : 'manager';
    };
    const displayRole = normalizeRoleForDisplay(user.role);

    // select с whitelist'ом — вместо свободного text input.
    // admin видит оба варианта; manager при редактировании себя видит только 'manager'
    // (не может повысить себя до admin через UI).
    const roleOptions = (isAdmin && !editingSelf)
        ? `<option value="manager" ${displayRole === 'manager' ? 'selected' : ''}>Сотрудник</option>
           <option value="admin" ${displayRole === 'admin' ? 'selected' : ''}>Администратор</option>`
        : `<option value="manager" ${displayRole === 'manager' ? 'selected' : ''}>Сотрудник</option>`;

    const html = `
<div class="form-group">
<label class="form-label">Имя</label>
<input type="text" class="form-input" id="userName" value="${App.escapeHtml(user.name)}" placeholder="Иван Иванов" autofocus autocomplete="off">
</div>
<div class="form-group">
<label class="form-label">Роль</label>
<select class="form-input" id="userRole">
${roleOptions}
</select>
${(!isAdmin && editingSelf) ? '<p class="text-muted" style="font-size: 12px; margin-top: 4px;">Повысить себя до администратора может только другой администратор.</p>' : ''}
</div>
<div class="form-group">
<label class="form-label">Цвет аватара</label>
<div class="color-picker" id="userColorPicker">
${App.colors.map(c => `
<div class="color-option ${c === user.color ? 'selected' : ''}"
style="background: ${c}" data-color="${c}" tabindex="0"></div>
`).join('')}
</div>
</div>
`;
    App.openDrawer(id ? 'Редактировать пользователя' : 'Новый пользователь', html, `
<button class="btn btn-secondary" id="cancelUserBtn">Отмена</button>
<button class="btn btn-primary" id="saveUserBtn">Сохранить</button>
`);
    let selectedColor = user.color;
    document.querySelectorAll('#userColorPicker .color-option').forEach(opt => {
        const handler = () => {
            document.querySelectorAll('#userColorPicker .color-option').forEach(o => o.classList.remove('selected'));
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
    document.getElementById('cancelUserBtn').addEventListener('click', () => App.renderUsersList());
    document.getElementById('saveUserBtn').addEventListener('click', () => {
        const name = document.getElementById('userName').value.trim();
        const role = document.getElementById('userRole').value;

        if (!name) return App.showToast('Введите имя', 'error');

        // === WHITELIST РОЛЕЙ (защита от подмены через DevTools) ===
        if (!App.ALLOWED_ROLES.includes(role)) {
            App.showToast('Недопустимая роль', 'error');
            return;
        }

        // === ЗАПРЕТ PRIVILEGE ESCALATION ===
        // manager не может назначить роль admin (никому, включая себя).
        // admin может.
        if (role === 'admin' && !App.can('assign_admin_role')) {
            App.showToast('Недостаточно прав для назначения роли администратора', 'error');
            return;
        }

        if (id) {
            const index = App.state.users.findIndex(u => u.id === id);
            if (index === -1) {
                App.showToast('Пользователь не найден', 'error');
                return;
            }
            App.state.users[index] = {...user, name, role, color: selectedColor};
        } else {
            App.state.users.push({...user, name, role, color: selectedColor});
        }
        App.saveState();
        App.render();
        App.updateCurrentUserDisplay();
        App.renderUsersList();
        App.showToast('Пользователь сохранен', 'success');
    });
    // Enter в поле имени пользователя — сохраняем
    document.getElementById('userName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('saveUserBtn').click();
        }
    });
};

App.deleteUser = async function(id) {
    if (App.state.users.length <= 1) return App.showToast('Нельзя удалить последнего', 'error');
    if (id === App.state.currentUser) return App.showToast('Нельзя удалить текущего', 'error');

    // ПРОВЕРКА ПРАВ: только Admin может удалять пользователей
    if (!App.can('delete_user')) {
        App.showToast('Только администратор может удалять пользователей', 'error');
        return;
    }

    const confirmed = await App.confirmDialog('Удалить пользователя?', {danger: true});
    if (!confirmed) return;
    const user = App.state.users.find(u => u.id === id);
    App.state.users = App.state.users.filter(u => u.id !== id);
    App.saveState();
    App.render();
    App.renderUsersList();
    App.showToast('Пользователь удален', 'success');
};

App.updateCurrentUserDisplay = function() {
    const user = App.state.users.find(u => u.id === App.state.currentUser);
    if (user) {
        const initials = App.escapeHtml(user.name).split(' ').map(n => n[0]).join('').toUpperCase();
        App.elements.currentUserDisplay.innerHTML = `
        <div class="user-avatar" style="background: ${App.safeColor(user.color)}">${initials}</div>
        <div>
            <div class="user-name">${App.escapeHtml(user.name)}</div>
            <div class="user-role">${App.escapeHtml(App.getRoleLabel(user.role))}</div>
        </div>
    `;
    }
};
