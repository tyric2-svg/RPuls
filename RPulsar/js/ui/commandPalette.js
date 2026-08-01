// js/ui/commandPalette.js
window.App = window.App || {};

        App.openCommandPalette = function() {
            App.ui.lastFocusedElement = document.activeElement;
            App.elements.commandBackdrop.classList.remove('hidden');
            App.elements.commandPalette.classList.remove('hidden');
            App.ui.commandSelectedIndex = 0;
            setTimeout(() => {
                App.elements.commandInput.focus();
                App.elements.commandInput.select();
            }, 100);
            App.renderCommands('');
        };
        App.closeCommandPalette = function() {
            App.elements.commandBackdrop.classList.add('hidden');
            App.elements.commandPalette.classList.add('hidden');
            App.elements.commandInput.value = '';
            App.elements.searchSuggestions.classList.remove('active');
            if (App.ui.lastFocusedElement) App.ui.lastFocusedElement.focus();
        };
        App.renderCommands = function(filter = '') {
            const commands = [
                {
                    icon: App.icon('lightbulb', 'md'),
                    title: 'Новая задача',
                    description: 'Создать новую задачу',
                    shortcut: 'C',
                    action: () => App.openTaskModal()
                },
                {
                    icon: App.icon('table', 'md'),
                    title: 'Таблица',
                    description: 'Табличный вид',
                    shortcut: '1',
                    action: () => {
                        App.state.currentSection = 'tasks';
                        App.state.view = 'table';
                        App.saveState();
                        App.applyView();
                    }
                },
                {
                    icon: App.icon('columns-3', 'md'),
                    title: 'Доска',
                    description: 'Доска',
                    shortcut: '2',
                    action: () => {
                        App.state.currentSection = 'tasks';
                        App.state.view = 'kanban';
                        App.saveState();
                        App.applyView();
                    }
                },
                {
                    icon: App.icon('calendar', 'md'),
                    title: 'Календарь',
                    description: 'Задачи на календаре',
                    shortcut: '3',
                    action: () => {
                        App.state.currentSection = 'tasks';
                        App.state.view = 'calendar';
                        App.saveState();
                        App.applyView();
                    }
                },
                {
                    icon: App.icon('file-text', 'md'),
                    title: 'Шаблоны',
                    description: 'Шаблоны задач',
                    action: () => App.openTemplates()
                },
                {
                    icon: App.icon('message-circle', 'md'),
                    title: 'Статусы',
                    description: 'Управление статусами',
                    action: () => App.openStatuses()
                },
                {
                    icon: App.icon('users', 'md'),
                    title: 'Пользователи',
                    description: 'Управление командой',
                    action: () => App.openUsers()
                },
                {
                    icon: App.icon('download', 'md'),
                    title: 'Экспорт',
                    description: 'Скачать JSON бэкап',
                    shortcut: 'Ctrl+Alt+S',
                    action: () => App.exportData()
                },
                {
                    icon: App.icon('upload', 'md'),
                    title: 'Импорт',
                    description: 'Загрузить JSON бэкап',
                    action: () => App.importData()
                },
                {
                    icon: App.icon('keyboard', 'md'),
                    title: 'Горячие клавиши',
                    description: 'Показать справку',
                    shortcut: '?',
                    action: () => App.showShortcutsHelp()
                }
            ];
            const filteredTasks = filter ? App.visibleTasks().filter(t =>
                t.title.toLowerCase().includes(filter.toLowerCase())
            ).slice(0, 5) : [];
            const filteredCommands = commands.filter(cmd =>
                cmd.title.toLowerCase().includes(filter.toLowerCase()) ||
                cmd.description.toLowerCase().includes(filter.toLowerCase())
            );
            let html = '';
            if (filteredTasks.length > 0) {
                html += '<div class="command-section-title">Задачи</div>';
                html += filteredTasks.map(task => `
<div class="command-item" data-type="task" data-id="${task.id}">
<div class="command-item-icon">📋</div>
<div class="command-item-content">
<div class="command-item-title">${App.escapeHtml(task.title)}</div>
<div class="command-item-description">${task.description ? App.escapeHtml(task.description.substring(0, 50)) : 'Без описания'}</div>
</div>
</div>
`).join('');
            }
            if (filteredCommands.length > 0) {
                html += '<div class="command-section-title">Команды</div>';
                html += filteredCommands.map((cmd, i) => `
<div class="command-item ${filteredTasks.length === 0 && i === 0 ? 'selected' : ''}" data-type="command" data-index="${i}">
<div class="command-item-icon">${cmd.icon}</div>
<div class="command-item-content">
<div class="command-item-title">${cmd.title}</div>
<div class="command-item-description">${cmd.description}</div>
</div>
${cmd.shortcut ? `<div class="command-item-shortcut">${cmd.shortcut}</div>` : ''}
</div>
`).join('');
            }
            if (!html) {
                html = '<div class="command-item"><div class="command-item-content"><div class="command-item-title" style="color: var(--text-muted); text-align: center;">Ничего не найдено</div></div></div>';
            }
            App.elements.commandResults.innerHTML = html;
            App.elements.commandResults.querySelectorAll('.command-item').forEach(item => {
                item.addEventListener('click', () => {
                    const type = item.dataset.type;
                    if (type === 'task') {
                        App.openTaskDetail(App.parseId(item.dataset.id));
                    } else {
                        const index = parseInt(item.dataset.index, 10);
                        filteredCommands[index].action();
                    }
                    App.closeCommandPalette();
                });
            });
        };
        App.filterCommands = function() {
            const filter = App.elements.commandInput.value;
            App.renderCommands(filter);
            App.ui.commandSelectedIndex = 0;
            const items = App.elements.commandResults.querySelectorAll('.command-item');
            App.updateCommandSelection(items);
        };
        App.updateCommandSelection = function(items) {
            items.forEach((item, index) => {
                if (index === App.ui.commandSelectedIndex) {
                    item.classList.add('selected');
                    item.scrollIntoView({block: 'nearest', behavior: 'smooth'});
                } else {
                    item.classList.remove('selected');
                }
            });
        };


/**
 * Привязывает обработчики командной палитры (Ctrl+K).
 * Вынесено из core/bindEvents.js для декомпозиции God Function.
 */
App.bindCommandPaletteEvents = function() {
    App.elements.commandBackdrop.addEventListener('click', () => App.closeCommandPalette());
    App.elements.commandInput.addEventListener('input', () => App.filterCommands());
    App.elements.commandInput.addEventListener('keydown', (e) => {
        const items = App.elements.commandResults.querySelectorAll('.command-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            App.ui.commandSelectedIndex = Math.min(App.ui.commandSelectedIndex + 1, items.length - 1);
            App.updateCommandSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            App.ui.commandSelectedIndex = Math.max(App.ui.commandSelectedIndex - 1, 0);
            App.updateCommandSelection(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            items[App.ui.commandSelectedIndex]?.click();
        }
    });
    App.elements.shortcutsClose.addEventListener('click', () => App.closeShortcutsHelp());
    App.elements.shortcutsBackdrop.addEventListener('click', () => App.closeShortcutsHelp());
    App.renderCommands();
};
