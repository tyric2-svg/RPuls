// js/features/sync/login.js
window.App = window.App || {};

// ========================================
// ЭКРАН ВХОДА И УПРАВЛЕНИЕ БАЗОЙ ДАННЫХ
// ========================================

        /**
         * Запускает процесс входа. Проверяет наличие сохранённой папки.
         */
        App.startLoginFlow = async function() {
            // Показываем skeleton при первой загрузке
            App.showSkeletons();

            // Скрываем приложение, показываем экран входа
            App.elements.appMain.classList.add('hidden');
            App.elements.loginScreen.classList.remove('hidden');

            // Пробуем восстановить подключение к ранее выбранной папке.
            // Путь к папке запоминается всегда (через IndexedDB, см. syncSaveHandle) —
            // но браузер может сбросить именно РАЗРЕШЕНИЕ на чтение/запись между
            // перезапусками (так работает File System Access API). В этом случае
            // handle всё равно сохраняем в App.sync.handle, чтобы кнопка
            // "Восстановить доступ" могла запросить разрешение повторно одним
            // кликом — без повторного выбора папки через системный диалог.
            const handle = await App.syncLoadHandle();
            if (handle) {
                App.sync.handle = handle;
                const granted = await App.syncVerifyPermission(handle, false);
                if (granted) {
                    await App.enterDatabaseSession(handle);
                    return;
                } else {
                    // Папка была выбрана ранее, но нужно подтверждение доступа
                    App.showDatabaseStep('needs-permission', handle);
                    return;
                }
            }
            // Папка не выбрана — показываем начальный шаг
            App.showDatabaseStep('no-database');
        };

        /**
         * Общая логика после успешного подключения к рабочей папке: получает
         * файл базы данных внутри неё, загружает данные и либо сразу входит
         * под ранее сохранённым пользователем, либо показывает выбор пользователя.
         */
        App.enterDatabaseSession = async function(folderHandle) {
            // Совместимость со старыми сохранёнными подключениями: до перехода
            // на directory picker в IndexedDB мог остаться ФАЙЛОВЫЙ handle
            // (kind === 'file') вместо handle папки. У файла нет getFileHandle —
            // без этой проверки здесь был бы TypeError, а пользователь просто
            // не понимал бы, почему приложение не запускается.
            if (folderHandle.kind !== 'directory' || typeof folderHandle.getFileHandle !== 'function') {
                console.warn('Сохранённый handle — это файл, а не папка (старое подключение). Требуется переподключение.');
                await App.syncClearHandle();
                App.sync.handle = null;
                App.showToast('Способ подключения изменился — пожалуйста, подключите рабочую папку заново', 'info');
                App.showDatabaseStep('no-database');
                return;
            }

            const dbFileHandle = await folderHandle.getFileHandle('rtasks-database.json', {create: true});
            App.sync.dbFileHandle = dbFileHandle;
            await App.loadDatabaseAndShowUserSelection(dbFileHandle);
            const savedUserId = localStorage.getItem('rtasks_current_user');
            if (savedUserId) {
                const userExists = App.state.users.some(u => u.id === savedUserId);
                if (userExists) {
                    await App.selectUserAndEnter(savedUserId);
                }
            }
        };

        /**
         * Восстанавливает доступ к уже сохранённой папке в один клик —
         * запрашивает разрешение заново (нужен user-gesture) на тот же handle,
         * без повторного выбора папки через системный диалог.
         */
        App.reconnectSavedDatabase = async function() {
            if (!App.sync.handle) {
                App.showDatabaseStep('no-database');
                return;
            }
            const granted = await App.syncVerifyPermission(App.sync.handle, true);
            if (!granted) {
                App.showToast('Доступ к папке не предоставлен', 'error');
                return;
            }
            await App.enterDatabaseSession(App.sync.handle);
        };

        /**
         * Показывает шаг выбора базы данных
         */
        App.showDatabaseStep = function(status, handle = null) {
            App.elements.loginStepDatabase.classList.add('active');
            App.elements.loginStepUser.classList.remove('active');
            App.elements.loginStepWorkspaceName.classList.remove('active');

            if (status === 'no-database') {
                App.elements.loginDatabaseStatus.classList.remove('connected');
                App.elements.loginDbName.textContent = 'Папка не выбрана';
                App.elements.loginDbPath.textContent = 'Необходимо выбрать рабочую папку RPulsar';
                App.elements.loginReconnectActions.style.display = 'none';
                App.elements.loginNormalActions.style.display = '';
            } else if (status === 'needs-permission') {
                App.elements.loginDatabaseStatus.classList.remove('connected');
                App.elements.loginDbName.textContent = 'Требуется подтверждение доступа';
                App.elements.loginDbPath.textContent = handle?.name || 'Папка уже была выбрана ранее';
                App.elements.loginReconnectActions.style.display = '';
                App.elements.loginNormalActions.style.display = 'none';
            }
        };

        /**
         * Показывает шаг выбора пользователя после успешного подключения к базе
         */
        App.showUserSelectionStep = function() {
            App.elements.loginStepDatabase.classList.remove('active');
            App.elements.loginStepWorkspaceName.classList.remove('active');
            App.elements.loginStepUser.classList.add('active');
            App.renderLoginUsersGrid();

            // Чат живёт в той же рабочей папке, что и база задач — готовим
            // файл текущего месяца и пробуем досослать то, что скопилось в
            // локальной очереди, пока доступа к папке не было
            // (см. features/chat/chat.js). Эта точка общая для всех трёх
            // сценариев подключения (новая папка, существующая, восстановление
            // доступа), поэтому чат инициализируется ровно один раз.
            App.chatEnsureCurrentMonthHandle().then(() => App.chatRetryQueue());
        };

        /**
         * Загружает данные из базы и показывает выбор пользователя
         */
        App.loadDatabaseAndShowUserSelection = async function(handle) {
            try {
                const file = await handle.getFile();
                const text = await file.text();

                if (text.trim()) {
                    const remote = JSON.parse(text);
                    if (App.isObjectSafe(remote) && App.validateImportedData(remote).valid) {
                        // Загружаем пользователей из базы, но пока не устанавливаем currentUser
                        if (remote.users && remote.users.length > 0) {
                            App.state.users = remote.users;
                        }
                        if (remote.statuses && remote.statuses.length > 0) {
                            App.state.statuses = remote.statuses;
                        }
                        // Загружаем остальные данные в "подвешенном" состоянии
                        App._pendingRemoteData = remote;
                    }
                }

                // Показываем статус подключённой базы
                App.elements.loginDatabaseStatus.classList.add('connected');
                App.elements.loginDbName.textContent = `✓ ${App.sync.handle?.name || handle.name}`;
                App.elements.loginDbPath.textContent = 'Папка подключена. Выберите пользователя.';

                App.showUserSelectionStep();
            } catch (e) {
                console.error('loadDatabaseAndShowUserSelection failed:', e);
                App.showToast('Ошибка чтения базы данных', 'error');
                App.showDatabaseStep('no-database');
            }
        };

        /**
         * Рендерит сетку пользователей на экране входа
         */
        App.renderLoginUsersGrid = function() {
            const html = App.state.users.map(user => {
                const initials = App.escapeHtml(user.name).split(' ').map(n => n[0]).join('').toUpperCase();
                return `
            <button class="login-user-card" data-user-id="${user.id}">
                <div class="login-user-avatar" style="background: ${App.safeColor(user.color)}">
                    ${initials}
                </div>
<div class="login-user-info">
    <div class="login-user-name">${App.escapeHtml(user.name)}</div>
    <div class="login-user-role">${App.escapeHtml(App.getRoleLabel(user.role))}</div>
</div>
            </button>
        `;
            }).join('');

            App.elements.loginUsersGrid.innerHTML = html ||
                '<div class="text-muted" style="grid-column: 1 / -1; text-align: center; padding: 20px;">Пользователей пока нет. Создайте первого ниже.</div>';

            // Навешиваем обработчики на карточки
            App.elements.loginUsersGrid.querySelectorAll('.login-user-card').forEach(card => {
                card.addEventListener('click', () => {
                    App.selectUserAndEnter(card.dataset.userId);
                });
            });
        };

        /**
         * Подключает рабочую папку RPulsar (directory picker) — единая точка
         * входа вместо прежних раздельных "создать"/"открыть". С папкой не
         * нужно различать эти два случая программно: просто получаем файл
         * базы данных внутри неё (create: true создаёт, если его ещё нет,
         * или открывает существующий) и смотрим, пустой он или нет.
         */
        /**
         * Обёртка с таймаутом: если реальный браузер вдруг зависнет на каком-то
         * шаге (например, IndexedDB недоступна в приватном режиме, или
         * потеряна user-activation для requestPermission) — пользователь
         * увидит явную ошибку вместо бесконечно "зависшего" экрана.
         */
        function withTimeout(promise, ms, label) {
            return Promise.race([
                promise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Таймаут: ${label} не ответил за ${ms / 1000}с`)), ms)
                )
            ]);
        }

        /**
         * Полностью сбрасывает состояние задач/чата в памяти перед подключением
         * к папке (новой или другой существующей). Раньше при создании НОВОГО
         * пространства сбрасывались только users/statuses — а tasks/columns/
         * taskOrder/relations могли остаться от предыдущего подключения
         * (localStorage или предыдущая папка в этой же сессии) и утекали
         * в свежесозданный файл. Чат живёт в отдельном App.chat — тоже сбрасываем,
         * включая локальную очередь неотправленных сообщений (иначе они
         * адресованы старому пространству, а улетят в новое).
         */
        App.resetWorkspaceState = function() {
            App.state.tasks = [];
            App.state.taskOrder = [];
            App.state.relations = [];
            App.state._tombstones = [];
            App.state.changeLog = [];
            App.state.notifications = [];
            App.state.columns = App.cloneDefaults('columns');
            App.state.templates = [];

            App.chat.monthKey = null;
            App.chat.fileHandle = null;
            App.chat.messages = [];
            App.chat.pushing = false;
            App.chatClearQueue();
        };

        App.connectWorkFolder = async function() {
            if (!App.syncSupported()) {
                App.showToast('Ваш браузер не поддерживает File System Access API. Используйте Chrome или Edge.', 'error');
                return;
            }

            try {
                const folderHandle = await window.showDirectoryPicker({mode: 'readwrite'});

                const granted = await withTimeout(
                    App.syncVerifyPermission(folderHandle, true), 10000, 'запрос разрешения на папку'
                );
                if (!granted) {
                    App.showToast('Доступ к папке не предоставлен', 'error');
                    return;
                }

                // Сбрасываем состояние ДО того, как что-либо загрузим/создадим —
                // не важно, новая это папка или другая существующая, ни то, ни
                // другое не должно унаследовать данные предыдущего подключения.
                App.resetWorkspaceState();

                App.sync.handle = folderHandle;
                await withTimeout(App.syncSaveHandle(folderHandle), 5000, 'сохранение доступа (IndexedDB)');

                const dbFileHandle = await folderHandle.getFileHandle('rtasks-database.json', {create: true});
                App.sync.dbFileHandle = dbFileHandle;

                const file = await dbFileHandle.getFile();
                const text = await file.text();

                if (!text.trim()) {
                    // Файла ещё не было — папка новая. Не создаём базу сразу,
                    // а сначала спрашиваем название рабочего пространства.
                    App._pendingWorkspaceFolder = folderHandle;
                    App._pendingWorkspaceDbHandle = dbFileHandle;
                    App.showWorkspaceNameStep();
                } else {
                    // Файл базы уже существовал — подключаемся к существующей базе
                    await App.loadDatabaseAndShowUserSelection(dbFileHandle);
                }
            } catch (e) {
                if (e.name !== 'AbortError') {
                    console.error('connectWorkFolder failed:', e);
                    App.showToast(`Не удалось подключить папку: ${e.message || e.name || 'неизвестная ошибка'}`, 'error');
                }
            }
        };

        /**
         * Показывает шаг ввода названия нового рабочего пространства —
         * только для только что созданной (пустой) папки.
         */
        App.showWorkspaceNameStep = function() {
            App.elements.loginStepDatabase.classList.remove('active');
            App.elements.loginStepUser.classList.remove('active');
            App.elements.loginStepWorkspaceName.classList.add('active');
            App.elements.loginWorkspaceName.value = '';
            setTimeout(() => App.elements.loginWorkspaceName.focus(), 100);
        };

        /**
         * Завершает создание нового рабочего пространства: пишет начальную
         * структуру базы (с указанным названием) в файл и переходит к выбору
         * пользователя.
         */
        App.createWorkspaceWithName = async function() {
            const folderHandle = App._pendingWorkspaceFolder;
            const dbFileHandle = App._pendingWorkspaceDbHandle;
            if (!folderHandle || !dbFileHandle) {
                App.showToast('Что-то пошло не так, попробуйте подключить папку заново', 'error');
                App.showDatabaseStep('no-database');
                return;
            }

            const workspaceName = App.elements.loginWorkspaceName.value.trim() || 'Рабочее пространство';

            const initialData = {
                workspaceName,
                tasks: [],
                statuses: App.defaults.statuses,
                users: App.defaults.users,
                columns: App.defaults.columns,
                templates: [],
                taskOrder: [],
                relations: [],
                _tombstones: []
            };

            try {
                const writable = await dbFileHandle.createWritable();
                await writable.write(JSON.stringify(initialData, null, 2));
                await writable.close();
            } catch (e) {
                console.error('createWorkspaceWithName failed:', e);
                App.showToast('Не удалось создать рабочее пространство', 'error');
                return;
            }

            App.state.workspaceName = workspaceName;
            App.state.users = [...App.defaults.users];
            App.state.statuses = [...App.defaults.statuses];
            App._pendingRemoteData = initialData;

            App.elements.loginDatabaseStatus.classList.add('connected');
            App.elements.loginDbName.textContent = `✓ ${workspaceName}`;
            App.elements.loginDbPath.textContent = `Папка: ${folderHandle.name}`;

            App._pendingWorkspaceFolder = null;
            App._pendingWorkspaceDbHandle = null;

            App.showToast(`Рабочее пространство «${workspaceName}» создано!`, 'success');
            App.showUserSelectionStep();
        };

        /**
         * Отмена создания рабочего пространства — возвращает на шаг выбора
         * папки. Пустой файл базы, уже созданный на диске (getFileHandle с
         * create:true создаёт его сразу), останется — при следующем
         * подключении этой же папки снова будет предложено назвать пространство.
         */
        App.cancelWorkspaceCreation = function() {
            App._pendingWorkspaceFolder = null;
            App._pendingWorkspaceDbHandle = null;
            App.sync.handle = null;
            App.sync.dbFileHandle = null;
            App.elements.loginStepWorkspaceName.classList.remove('active');
            App.showDatabaseStep('no-database');
        };

        /**
         * Выбор пользователя и вход в приложение
         */
        App.selectUserAndEnter = async function(userId) {
            const user = App.state.users.find(u => u.id === userId);
            if (!user) {
                App.showToast('Пользователь не найден', 'error');
                return;
            }

            App.state.currentUser = userId;

// Инициализируем baseVersions
            if (!App.sync.baseVersions) App.sync.baseVersions = new Map();

// Если есть незагруженные данные из базы — применяем их
            if (App._pendingRemoteData) {
                await App.syncPullMerge(JSON.stringify(App._pendingRemoteData));
                delete App._pendingRemoteData;
            }

            // Сохраняем выбор пользователя локально
            try {
                localStorage.setItem('rtasks_current_user', userId);
            } catch (e) { /* игнорируем */
            }

            // Скрываем экран входа, показываем приложение
            App.elements.loginScreen.classList.add('hidden');
            App.elements.appMain.classList.remove('hidden');

// Запускаем приложение
            App.render();
            App.updateCurrentUserDisplay();
            App.renderFilters();
            App.applyView();
            App.updateNotificationBell();
// Помечаем, что первая загрузка завершена — дальше skeleton loaders не показываем
            App.state._initialRenderDone = true;
            App.checkReminders();
            setInterval(() => App.checkReminders(), 60 * 1000);

// Запускаем автоматическую синхронизацию для multi-user
            App.syncStartPolling();
            App.chatStartPolling();

// Проверяем changeLog на наличие пропущенных уведомлений
// (например, если пользователь отсутствовал несколько часов)
            App.processSmartNotifications();

// Помечаем, что первая загрузка завершена — при последующих синхронизациях
// skeleton loaders показываться не будут (только при переключении видов)
            setTimeout(() => {
                App.state._initialRenderDone = true;
            }, 500);
// Приветственный онбординг (показывается только при первом входе)
            setTimeout(() => {
                if (!localStorage.getItem('rtasks_welcomed')) {
                    App.showWelcomeModal();
                }
            }, 500);
        };

        /**
         * Создаёт нового пользователя и входит под ним
         */
        App.createNewUserAndEnter = async function() {
            const name = App.elements.loginNewUserName.value.trim();
            const role = App.elements.loginNewUserRole.value.trim() || 'Сотрудник';

            if (!name) {
                App.showToast('Введите имя пользователя', 'error');
                App.elements.loginNewUserName.focus();
                return;
            }

// Нормализуем роль: только 'admin' или 'manager'
            const normalizedRole = (role === 'admin' || role === 'manager') ? role : 'manager';

            const newUser = {
                id: 'user_' + App.generateId(),
                name: name,
                role: normalizedRole,
                color: App.colors[Math.floor(Math.random() * App.colors.length)]
            };

            App.state.users.push(newUser);

            // Если есть подключение к базе — сохраняем туда
            if (App.sync.handle) {
                try {
                    await App.syncPush();
                } catch (e) {
                    console.error('Не удалось сохранить нового пользователя в базу:', e);
                }
            }

            await App.selectUserAndEnter(newUser.id);
            App.showToast(`Пользователь "${name}" создан`, 'success');
        };

        /**
         * Возврат к шагу выбора базы
         */
        /**
         * Позволяет продолжить работу без подключения общей базы —
         * например, в браузере Firefox, или если сотрудник просто хочет вести
         * личные задачи локально. Данные при этом хранятся только
         * в localStorage этого компьютера, синхронизация недоступна.
         */
        App.continueWithoutDatabase = function() {
            App._pendingRemoteData = null;
            App.showUserSelectionStep();
        };

        App.backToDatabaseStep = function() {
            App.showDatabaseStep('no-database');
            App._pendingRemoteData = null;
        };

/**
 * Привязывает обработчики экрана входа (выбор/создание базы, выбор пользователя, выход).
 * Вынесено из core/bindEvents.js для декомпозиции God Function.
 */
App.bindLoginEvents = function() {
    App.elements.loginBtnConnectFolder.addEventListener('click', () => App.connectWorkFolder());
    App.elements.loginBtnSkip.addEventListener('click', () => App.continueWithoutDatabase());
    App.elements.loginBtnReconnect.addEventListener('click', () => App.reconnectSavedDatabase());
    App.elements.loginBtnCreateUser.addEventListener('click', () => App.createNewUserAndEnter());
    App.elements.loginBtnBackToDb.addEventListener('click', () => App.backToDatabaseStep());
    App.elements.loginBtnCreateWorkspace.addEventListener('click', () => App.createWorkspaceWithName());
    App.elements.loginBtnCancelWorkspace.addEventListener('click', () => App.cancelWorkspaceCreation());

    App.elements.loginWorkspaceName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            App.createWorkspaceWithName();
        }
    });

    App.elements.loginNewUserName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            App.createNewUserAndEnter();
        }
    });

    if (App.elements.logoutBtn) {
        App.elements.logoutBtn.addEventListener('click', () => App.logout());
    }
};
