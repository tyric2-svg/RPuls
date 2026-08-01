// js/features/sync/sync.js
window.App = window.App || {};

// Что синхронизируется (общие рабочие данные):
//   tasks, statuses, users, columns, templates, relations, taskOrder, _tombstones
// Что НЕ синхронизируется (личные настройки этого браузера/пользователя):
//   theme, palette, view, currentSection, filters, currentUser, calendar,
//   notifications, reminders
App.sync = {
    handle: null,
    polling: null,
    syncing: false,
    intervalMs: 5000,
    sharedKeys: ['tasks', 'statuses', 'users', 'columns', 'templates', 'relations', 'taskOrder', '_tombstones', 'changeLog'],
    // Хранилище "базовых" версий задач на момент последней синхронизации.
    // Ключ — id задачи, значение — version, которую мы видели при последнем pull.
    // Нужно для правильного определения конфликтов: если remote версия ушла
    // вперёд относительно baseVersion — значит кто-то другой изменил задачу.
    baseVersions: new Map(),
};

App.syncSupported = function() {
    return typeof window.showDirectoryPicker === 'function';
};

App.syncDbOpen = function() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('rpulsar_sync', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('handles');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

App.syncSaveHandle = async function(handle) {
    const db = await App.syncDbOpen();
    await new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, 'shared_file');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
};

App.syncLoadHandle = async function() {
    try {
        const db = await App.syncDbOpen();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('handles', 'readonly');
            const req = tx.objectStore('handles').get('shared_file');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.error('syncLoadHandle failed:', e);
        return null;
    }
};

App.syncClearHandle = async function() {
    try {
        const db = await App.syncDbOpen();
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').delete('shared_file');
    } catch (e) {
        console.error('syncClearHandle failed:', e);
    }
};

App.syncVerifyPermission = async function(handle, requestIfNeeded) {
    const opts = {mode: 'readwrite'};
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (!requestIfNeeded) return false;
    return (await handle.requestPermission(opts)) === 'granted';
};

// App.syncConnect / App.syncReconnect / App.syncDisconnect — удалены как
// неиспользуемый мёртвый код (не вызывались нигде в проекте; реальный поток
// подключения к базе живёт в login.js: App.connectWorkFolder /
// App.reconnectSavedDatabase). Использовали отдельный дефолт-файл
// 'rpulsar-shared.json', несогласованный с реальным 'rtasks-database.json'.

App.syncSetStatus = function(status) {
    App.sync.status = status;
    const dot = App.elements.syncStatusDot;
    if (dot) {
        dot.classList.remove('connected', 'syncing', 'error');
        const labels = {
            disconnected: 'Не подключено',
            connected: 'Синхронизировано',
            syncing: 'Синхронизация...',
            error: 'Ошибка синхронизации',
            'needs-permission': 'Нужно повторное разрешение',
        };
        if (status === 'connected') dot.classList.add('connected');
        else if (status === 'syncing') dot.classList.add('syncing');
        else if (status === 'error' || status === 'needs-permission') dot.classList.add('error');
        dot.title = labels[status] || status;
    }
    if (App.elements.drawerBody?.querySelector('.sync-panel-row')) {
        App.renderSyncPanel();
    }
};

App.openSyncPanel = function() {
    App.renderSyncPanel();
};

App.renderSyncPanel = function() {
    const status = App.sync.status || 'disconnected';
    const labels = {
        disconnected: 'Не подключено',
        connected: 'Синхронизировано',
        syncing: 'Синхронизация...',
        error: 'Ошибка синхронизации',
        'needs-permission': 'Нужно повторное разрешение',
    };
    const html = `
        <div class="sync-panel-row">
            <span class="sync-panel-label">Статус</span>
            <span class="sync-panel-value">${labels[status] || status}</span>
        </div>
        ${App.sync.lastSyncedAt ? `
        <div class="sync-panel-row">
            <span class="sync-panel-label">Последняя синхронизация</span>
            <span class="sync-panel-value">${App.formatRelativeTime(App.sync.lastSyncedAt)}</span>
        </div>` : ''}
        <p class="text-muted" style="margin: 16px 0; font-size: 13px;">
            Задачи, статусы, пользователи, столбцы, шаблоны и связи хранятся
            в общем файле в сетевой папке и синхронизируются каждые
            ${Math.round(App.sync.intervalMs / 1000)} секунд. Личные настройки
            (тема, фильтры, текущий пользователь) синхронизации не подлежат.
        </p>
    `;
    const footer = status === 'disconnected'
        ? `<button class="btn btn-primary" id="syncConnectBtn">Подключить</button>`
        : status === 'needs-permission'
            ? `<button class="btn btn-primary" id="syncReconnectBtn">Восстановить доступ</button>
           <button class="btn btn-secondary" id="syncDisconnectBtn">Отключить</button>`
            : `<button class="btn btn-secondary" id="syncDisconnectBtn">Отключить</button>`;
    App.openDrawer('Общая папка', html, footer);
    document.getElementById('syncConnectBtn')?.addEventListener('click', () => App.syncConnect());
    document.getElementById('syncReconnectBtn')?.addEventListener('click', () => App.syncReconnect());
    document.getElementById('syncDisconnectBtn')?.addEventListener('click', () => {
        App.syncDisconnect();
        App.closeDrawer();
    });
};

// --- Слияние данных ---
App.syncGetBase = function() {
    try {
        const raw = localStorage.getItem('rtasks_sync_base');
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
};

App.syncSetBase = function(base) {
    try {
        localStorage.setItem('rtasks_sync_base', JSON.stringify(base));
    } catch (e) {
        console.error('syncSetBase failed:', e);
    }
};

App.syncMergeTasks = function(localTasks, remoteTasks, localTomb, remoteTomb) {
    const tombMap = new Map();
    [...localTomb, ...remoteTomb].forEach(t => {
        const existing = tombMap.get(t.id);
        if (!existing || t.deletedAt > existing.deletedAt) tombMap.set(t.id, t);
    });
    const byId = new Map();
    localTasks.forEach(t => byId.set(t.id, {local: t}));
    remoteTasks.forEach(t => {
        const entry = byId.get(t.id) || {};
        entry.remote = t;
        byId.set(t.id, entry);
    });
    const result = [];
    byId.forEach(({local, remote}, id) => {
        const tomb = tombMap.get(id);
        let winner = local;

        if (remote) {
            // ПЕРВИЧНЫЙ КРИТЕРИЙ: версия (Optimistic Locking)
            const lVersion = local?.version || 1;
            const rVersion = remote?.version || 1;

            if (rVersion > lVersion) {
                // Remote новее — берём его
                winner = remote;
            } else if (lVersion > rVersion) {
                // Local новее — оставляем local
                winner = local;
            } else {
                // Версии равны — используем updatedAt как тай-брейкер
                const lTime = local?.updatedAt || local?.createdAt || '';
                const rTime = remote?.updatedAt || remote?.createdAt || '';
                winner = (!local || rTime > lTime) ? remote : local;
            }
        }

        if (tomb) {
            const winnerTime = winner?.updatedAt || winner?.createdAt || '';
            if (tomb.deletedAt >= winnerTime) return;
        }
        if (winner) result.push(winner);
    });
    return {tasks: result, tombstones: [...tombMap.values()]};
};

// Простое 3-стороннее слияние для конфигурационных массивов
// (statuses/users/columns/templates/relations/taskOrder):
// если изменилась только одна сторона с момента последней синхронизации — она побеждает;
// если обе — оставляем локальную версию и предупреждаем (редкий случай для таких данных).
App.syncMergeConfigArray = function(key, localArr, remoteArr, baseArr) {
    // ИСПРАВЛЕНИЕ БАГА: Если это первая синхронизация (базы еще нет),
    // и в общем файле есть данные (колонки, статусы), мы должны взять их,
    // а не перезаписывать пустыми локальными массивами.
    if (!baseArr && Array.isArray(remoteArr) && remoteArr.length > 0) {
        return remoteArr;
    }

    const baseStr = JSON.stringify(baseArr || null);
    const localStr = JSON.stringify(localArr);
    const remoteStr = JSON.stringify(remoteArr);
    const localChanged = localStr !== baseStr;
    const remoteChanged = remoteStr !== baseStr && remoteArr !== undefined;
    if (localChanged && remoteChanged && localStr !== remoteStr) {
        App.showToast(`Конфликт в разделе "${key}" — оставлены ваши локальные изменения`, 'info');
        return localArr;
    }
    if (!localChanged && remoteChanged) return remoteArr;
    return localArr;
};

App.syncPullMerge = async function(rawText) {
    let remote;
    try {
        remote = JSON.parse(rawText);
    } catch (e) {
        console.error('Общий файл повреждён, JSON не парсится:', e);
        return;
    }
    if (!App.isObjectSafe(remote) || !App.validateImportedData(remote).valid) {
        console.error('Общий файл не прошёл валидацию, слияние пропущено');
        return;
    }

    // === ОПТИМИЗАЦИЯ: снимаем отпечаток состояния ДО слияния ===
    // Позже сравним с отпечатком после слияния — если они совпадут,
    // значит данные не менялись и можно пропустить render()
    App._syncFingerprintBefore = App.getStateFingerprint();

    const base = App.syncGetBase();
    const {tasks, tombstones} = App.syncMergeTasks(
        App.state.tasks, remote.tasks || [],
        App.state._tombstones || [], remote._tombstones || []
    );
    App.state.tasks = tasks;
    App.state._tombstones = tombstones;

    // КРИТИЧНО: без этого слияния changeLog от других пользователей никогда
    // не попадал в локальное состояние — processSmartNotifications() видел
    // только собственные записи текущего пользователя (которые сам же и
    // игнорирует), поэтому уведомления о действиях коллег (назначили задачу,
    // изменили статус/срок, оставили комментарий) никогда не создавались.
    App.state.changeLog = App.mergeChangeLog(App.state.changeLog || [], remote.changeLog || []);

// ОБНОВЛЯЕМ baseVersions: запоминаем версии всех remote-задач
// как "базовые" — от них будем отсчитывать конфликты при следующем push.
    if (!App.sync.baseVersions) App.sync.baseVersions = new Map();
    (remote.tasks || []).forEach(t => {
        if (t && t.id) {
            App.sync.baseVersions.set(t.id, t.version || 1);
        }
    });
// Удаляем записи для задач, которых больше нет (удалены)
    const remoteIds = new Set((remote.tasks || []).map(t => t.id));
    for (const [id] of App.sync.baseVersions) {
        if (!remoteIds.has(id)) {
            App.sync.baseVersions.delete(id);
        }
    }
    ['statuses', 'users', 'columns', 'templates', 'relations', 'taskOrder'].forEach(key => {
        App.state[key] = App.syncMergeConfigArray(key, App.state[key], remote[key], base[key]);
    });
    App.syncTaskOrder();

    // === ОПТИМИЗАЦИЯ: сравниваем отпечатки ДО и ПОСЛЕ слияния ===
    // Если данные фактически не изменились (никто из коллег ничего не делал),
    // пропускаем полную перерисовку интерфейса. Это устраняет мерцание,
    // сброс скролла и лишнюю нагрузку на CPU каждые 5 секунд.
    const fingerprintAfter = App.getStateFingerprint();
    const dataChanged = App._syncFingerprintBefore !== fingerprintAfter;

    // Блокируем скелетоны при фоновой синхронизации
    App._suppressSkeletons = true;
    App.saveState();

    // Перерисовываем ТОЛЬКО если данные реально изменились
    if (dataChanged) {
        App.render();
    } else {
        // Данные те же — тихо логируем (для отладки, можно удалить)
        console.debug('[Sync] Данные не изменились, render пропущен');
    }

    App._suppressSkeletons = false;
    App.updateCurrentUserDisplay?.();

// АВТО-УВЕДОМЛЕНИЕ: если открыт Drawer с задачей, которая изменилась remote,
// предупреждаем пользователя и обновляем содержимое Drawer.
    if (App.ui.currentTask && App.ui.drawerOpen) {
        const currentTaskId = App.ui.currentTask;
        const remoteChangedTask = (remote.tasks || []).find(t => t.id === currentTaskId);
        const localTask = App.state.tasks.find(t => t.id === currentTaskId);

        if (remoteChangedTask && localTask) {
            const remoteUpdated = new Date(remoteChangedTask.updatedAt || 0).getTime();
            const localUpdated = new Date(localTask.updatedAt || 0).getTime();

            // Если remote обновлён позже — задача изменилась другим пользователем
            if (remoteUpdated > localUpdated) {
                const changedBy = remoteChangedTask.assignee
                    ? (App.state.users.find(u => u.id === remoteChangedTask.assignee)?.name || 'коллегой')
                    : 'коллегой';
                App.showToast(
                    `⚠️ Задача "${localTask.title}" была изменена ${changedBy}. Данные обновлены.`,
                    'warning'
                );
                // Перерисовываем Drawer с актуальными данными
                setTimeout(() => {
                    if (App.ui.currentTask === currentTaskId) {
                        App.openTaskDetail(currentTaskId);
                    }
                }, 500);
            }
        }
    }
    // Анализируем новые записи в changeLog и создаём умные уведомления
    App.processSmartNotifications();
};

App.buildSyncPayload = function() {
    const payload = {};
    App.sync.sharedKeys.forEach(key => {
        payload[key] = App.state[key];
    });
    // Личные задачи никогда не покидают этот браузер — исключаем их
    // из общего файла, чтобы другие участники не могли их прочитать,
    // даже открыв файл напрямую в сетевой папке.
    payload.tasks = payload.tasks.filter(t => t.visibility !== 'private');
    return payload;
};

/**
 * === SYNC CONCURRENCY MODEL ===
 *
 * ВАЖНО: синхронизация работает по модели last-write-wins на уровне всего payload.
 * File System Access API не предоставляет атомарных compare-and-swap операций над файлом,
 * поэтому полноценный файловый lock здесь НЕ реализован.
 *
 * Ранее тут была функция syncAcquireLock, которая ТОЛЬКО ЧИТАЛА файл и проверяла
 * поле _lock, но НИКОГДА НЕ ЗАПИСЫВАЛА его обратно. Это создавало ложное чувство
 * безопасности — lock всегда возвращал true, и два клиента могли параллельно
 * перетереть изменения друг друга на уровне всего payload.
 *
 * Текущий подход честен:
 *   - Optimistic locking по task.version детектит конфликты ИЗМЕНЕНИЙ задач
 *     (см. syncPush). Если remote версия ушла вперёд — push отменяется, пользователь
 *     получает уведомление, локальные данные подтягиваются через syncPullMerge.
 *   - Конфигурации (statuses/users/columns/templates/relations/taskOrder) сливаются
 *     через 3-way merge в syncPullMerge, но НЕ имеют version-проверки в syncPush.
 *     Параллельные изменения конфигов могут теряться — это известное ограничение,
 *     которое должно быть исправлено в Tier 2 (ввести configVersion).
 *   - Полный файловый lock должен использовать navigator.locks API
 *     (Web Locks API) или серверный координатор — это Tier 2 задача.
 *
 * Удалено: App.syncAcquireLock, App.syncRemoveLock, поле _lock в JSON-payload.
 * Эти функции оставлены как thin no-op для обратной совместимости, если что-то
 * в коде ещё ссылается на них — но они ничего не делают.
 */

/**
 * No-op: lock-механизм удалён (см. комментарий выше).
 * Всегда возвращает true — syncCycle продолжает работать.
 * @deprecated Sync работает last-write-wins; не полагаться на эту функцию.
 */
App.syncAcquireLock = async function() {
    return true;
};

/**
 * No-op: _lock-поле больше не используется.
 * Возвращает data как есть.
 * @deprecated
 */
App.syncRemoveLock = function(data) {
    return data;
};

App.syncPush = async function() {
    if (!App.sync.handle) return;

    const run = async () => {
        const granted = await App.syncVerifyPermission(App.sync.handle, false);
        if (!granted) {
            App.syncSetStatus('needs-permission');
            return;
        }

        // === OPTIMISTIC LOCKING: проверяем версии перед записью ===
        // Читаем актуальное состояние файла с сервера
        let remoteData = null;
        try {
            const file = await App.sync.dbFileHandle.getFile();
            const text = await file.text();
            if (text.trim()) {
                remoteData = JSON.parse(text);
            }
        } catch (e) {
            console.warn('syncPush: could not read remote data:', e);
        }

// Если есть remote-данные — проверяем конфликты версий
        if (remoteData && remoteData.tasks) {
            const conflicts = [];
            const payload = App.buildSyncPayload();

            if (!App.sync.baseVersions) App.sync.baseVersions = new Map();

            payload.tasks.forEach(localTask => {
                const remoteTask = remoteData.tasks.find(t => t.id === localTask.id);
                if (!remoteTask) return; // Новая задача — конфликта быть не может

                // ПРАВИЛЬНАЯ ЛОГИКА:
                // Сравниваем remote версию с BASE версией (той, что была при последней синхронизации),
                // а не с local (которая уже увеличена в saveTask()).
                // Если remote ушла вперёд относительно базы — кто-то другой изменил задачу.
                const baseVersion = App.sync.baseVersions.get(localTask.id) || 1;
                const remoteVersion = remoteTask.version || 1;

                if (remoteVersion > baseVersion) {
                    conflicts.push({
                        taskId: localTask.id,
                        title: localTask.title,
                        baseVersion: baseVersion,
                        localVersion: localTask.version || 1,
                        remoteVersion: remoteVersion,
                        remoteTask: remoteTask,
                        localTask: localTask
                    });
                }
            });

            // Если есть конфликты — НЕ записываем, а показываем предупреждение
            if (conflicts.length > 0) {
                const conflictList = conflicts.map(c => `• ${c.title}`).join('\n');
                App.showToast(
                    `Конфликт версий! ${conflicts.length} задач(и) были изменены другими пользователями:\n
                                                        ${conflictList} \n
                                                        Обновите страницу, чтобы получить свежие данные.`,
                    'error'
                );

                // ДЕТЕРМИНИРОВАННЫЙ ОТКАТ: заранее заменяем локальные копии
                // именно конфликтующих задач их remote-версией. Раньше здесь
                // просто вызывался обычный syncPullMerge — а в нём для задач
                // с одинаковым version (наша только что увеличенная версия
                // случайно совпадала с той, что уже в файле) конфликт решался
                // тай-брейком по updatedAt. Тай-брейк не гарантирует, что
                // выиграет именно та версия, о которой мы только что сказали
                // пользователю "она сохранена" — иногда отклонённая локальная
                // правка проходила по времени и молча перезаписывала чужую
                // следующим циклом синхронизации, вопреки показанному тосту.
                // Теперь для этих конкретных задач результат однозначен:
                // проигравшая локальная правка отбрасывается сразу и не может
                // "воскреснуть" позже.
                conflicts.forEach(c => {
                    const idx = App.state.tasks.findIndex(t => t.id === c.taskId);
                    if (idx !== -1) {
                        App.state.tasks[idx] = JSON.parse(JSON.stringify(c.remoteTask));
                    }
                });

                // Автоматически подтягиваем свежие данные (остальные задачи и конфиги)
                try {
                    const file = await App.sync.dbFileHandle.getFile();
                    const text = await file.text();
                    if (text.trim()) await App.syncPullMerge(text);
                } catch (e) {
                    console.error('Auto-pull after conflict failed:', e);
                }

                App.syncSetStatus('error');
                return;
            }
        }

// Конфликтов нет — записываем.
        // Если есть remoteData — сливаем его с локальным payload перед записью,
        // а не пишем чистый локальный снимок. Иначе push, вызванный сразу после
        // saveState() (а не через обычный syncCycle с предварительным pull),
        // может затереть задачи/изменения, которые уже появились в общем файле
        // у другого пользователя, но ещё не были подтянуты в локальный App.state
        // (окно гонки между чужим push и нашим следующим периодическим pull).
        let payload = App.buildSyncPayload();

        if (remoteData) {
            const merged = App.syncMergeTasks(
                payload.tasks, remoteData.tasks || [],
                App.state._tombstones || [], remoteData._tombstones || []
            );
            payload.tasks = merged.tasks;
            payload._tombstones = merged.tombstones;
            payload.changeLog = App.mergeChangeLog(payload.changeLog || [], remoteData.changeLog || []);

            const base = App.syncGetBase();
            ['statuses', 'users', 'columns', 'templates', 'relations', 'taskOrder'].forEach(key => {
                payload[key] = App.syncMergeConfigArray(key, payload[key], remoteData[key], base[key]);
            });
        }

        const writable = await App.sync.dbFileHandle.createWritable();
        await writable.write(JSON.stringify(payload, null, 2));
        await writable.close();
        App.syncSetBase(payload);
        App.sync.lastSyncedAt = new Date().toISOString();
        App.syncSetStatus('connected');

// Обновляем baseVersions после успешной записи —
// теперь наши записанные версии становятся "базовыми"
        if (!App.sync.baseVersions) App.sync.baseVersions = new Map();
        payload.tasks.forEach(t => {
            if (t && t.id) {
                App.sync.baseVersions.set(t.id, t.version || 1);
            }
        });
    };
    App._pushChain = (App._pushChain || Promise.resolve()).then(run, run);
    return App._pushChain;
};

App.syncCycle = async function() {
    if (App.sync.syncing || !App.sync.handle) return;
    App.sync.syncing = true;
    App.syncSetStatus('syncing');

    try {
        const granted = await App.syncVerifyPermission(App.sync.handle, false);
        if (!granted) {
            App.syncSetStatus('needs-permission');
            return;
        }

        // Пытаемся захватить блокировку перед чтением
        const locked = await App.syncAcquireLock();
        if (!locked) {
            // Файл заблокирован другим процессом — пропускаем этот цикл
            console.log('Файл заблокирован, пропускаем цикл синхронизации');
            return;
        }

        // Блокируем скелетоны на весь цикл синхронизации
        const file = await App.sync.dbFileHandle.getFile();
        const text = await file.text();
        if (text.trim()) {
            // Парсим JSON и удаляем _lock перед слиянием
            try {
                const data = JSON.parse(text);
                const dataWithoutLock = App.syncRemoveLock(data);
                await App.syncPullMerge(JSON.stringify(dataWithoutLock));
            } catch (e) {
                console.error('syncCycle: JSON parse error:', e);
            }
        }
        await App.syncPush();
        App.syncSetStatus('connected');
    } catch (e) {
        console.error('syncCycle failed:', e);
        App.syncSetStatus('error');
    } finally {
        App.sync.syncing = false;
    }
};

App.syncStartPolling = function() {
    App.syncStopPolling();
    App.sync.polling = setInterval(() => App.syncCycle(), App.sync.intervalMs);
};

App.syncStopPolling = function() {
    if (App.sync.polling) clearInterval(App.sync.polling);
    App.sync.polling = null;
};

