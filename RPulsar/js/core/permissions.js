// js/core/permissions.js
window.App = window.App || {};

/**
 * Проверяет, имеет ли текущий пользователь право на выполнение действия.
 * Двойная защита: UI скрывает недоступные действия + эта функция блокирует выполнение.
 *
 * @param {string} action - Тип действия: 'delete_task', 'delete_user', 'edit_user', etc.
 * @param {object} target - Объект, к которому применяется действие (задача, пользователь)
 * @returns {boolean}
 */
App.can = function(action, target = null) {
    const user = App.state.users.find(u => u.id === App.state.currentUser);
    if (!user) return false;

    const role = user.role || 'manager';

    switch (action) {
        case 'delete_task':
            if (role === 'admin') return true;
            if (target) {
                return target.owner === App.state.currentUser ||
                    target.creator === App.state.currentUser;
            }
            return false;

        case 'delete_user':
            return role === 'admin';

        case 'edit_user':
            return role === 'admin' || role === 'manager';

        case 'manage_users':
            // Создание/редактирование пользователей.
            // admin может всё; manager может только редактировать себя (не роль, не admin).
            // Это действие дополнительно ограничивается в users.js:editUser
            // через whitelist ролей и запрет повышения до admin.
            return role === 'admin' || role === 'manager';

        case 'assign_admin_role':
            // Только admin может назначать роль admin другому пользователю.
            return role === 'admin';

        case 'edit_status':
            return role === 'admin' || role === 'manager';

        case 'delete_status':
            return role === 'admin' || role === 'manager';

        case 'bulk_delete':
            if (!Array.isArray(target)) return false;
            return target.every(task => App.can('delete_task', task));

        // fail-closed: неизвестное действие по умолчанию запрещено.
        // Раньше было `return true`, что превращало любую забытую ветку
        // в автоматическое разрешение для всех.
        default:
            console.warn('App.can: неизвестное действие:', action);
            return false;
    }
};

/**
 * Whitelist допустимых значений роли пользователя.
 * Любое иное значение должно отбрасываться на этапе сохранения.
 */
App.ALLOWED_ROLES = ['admin', 'manager'];

/**
 * Возвращает читаемое название роли для UI
 */
App.getRoleLabel = function(role) {
    const labels = {
        'admin': 'Администратор',
        'manager': 'Сотрудник'
    };
    return labels[role] || 'Сотрудник';
};
