// js/features/chat/chat.js
window.App = window.App || {};

/**
 * Слой данных чата RPulsar.
 *
 * Архитектурные решения (зафиксированы в обсуждении ТЗ перед реализацией):
 * - Отдельный от базы задач набор файлов, в той же рабочей папке
 *   (App.sync.handle — directory handle после миграции на Этапе 1).
 * - Файл на каждый календарный месяц: chat-YYYY-MM.json. Переход на новый
 *   месяц — автоматически в фоне, с системным сообщением о переходе.
 * - Сообщения только добавляются, не редактируются и не удаляются
 *   (append-only) — поэтому слияние гораздо проще версионирования задач:
 *   объединение по id (union), сортировка по timestamp, без конфликтов версий.
 * - Автор хранится как authorId (id из App.state.users), а не как готовая
 *   строка с именем — так переименование сотрудника не оставляет старые
 *   сообщения с устаревшим именем; имя резолвится в момент рендера.
 * - Сообщения, которые не удалось записать в файл, остаются в локальной
 *   очереди в localStorage — переживают перезагрузку страницы и повторно
 *   отправляются, когда доступ к папке снова доступен.
 */

App.chat = {
    monthKey: null,          // '2026-07'
    fileHandle: null,        // FileSystemFileHandle текущего месяца
    messages: [],            // Сообщения текущего месяца (после слияния)
    pushing: false,          // Идёт ли сейчас запись (простая сериализация, как в App._pushChain)
};

const CHAT_QUEUE_KEY = 'rpulsar_chat_pending_queue';

/**
 * Возвращает ключ месяца по UTC-дате — чтобы переход на новый файл не
 * зависел от часового пояса конкретного пользователя.
 */
App.chatGetMonthKey = function(date = new Date()) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
};

App.chatGetFileName = function(monthKey) {
    return `chat-${monthKey}.json`;
};

/**
 * Гарантирует, что App.chat.fileHandle указывает на файл ТЕКУЩЕГО месяца.
 * Если месяц сменился с последней проверки — создаёт (или открывает, если
 * его уже создал коллега) файл нового месяца и добавляет в него системное
 * сообщение о переходе. Вызывается перед каждым чтением/записью.
 */
App.chatEnsureCurrentMonthHandle = async function() {
    if (!App.sync.handle) return false;

    const currentMonthKey = App.chatGetMonthKey();

    if (App.chat.fileHandle && App.chat.monthKey === currentMonthKey) {
        return true; // Уже на нужном месяце — ничего делать не нужно
    }

    const isRollover = App.chat.monthKey !== null && App.chat.monthKey !== currentMonthKey;
    const previousMonthKey = App.chat.monthKey;

    try {
        const fileName = App.chatGetFileName(currentMonthKey);
        // create: true — идемпотентно: если коллега уже создал файл нового
        // месяца на секунду раньше, мы просто откроем тот же файл, а не затрём его.
        const handle = await App.sync.handle.getFileHandle(fileName, {create: true});

        const file = await handle.getFile();
        const text = await file.text();
        const isNewFile = !text.trim();

        App.chat.fileHandle = handle;
        App.chat.monthKey = currentMonthKey;
        App.chat.messages = isNewFile ? [] : (JSON.parse(text).messages || []);

        if (isNewFile) {
            const systemMessage = {
                id: App.generateId(),
                authorId: null,
                text: previousMonthKey
                    ? `Начат новый месяц. История за предыдущий период — в архиве (${previousMonthKey}).`
                    : 'Чат создан.',
                type: 'system',
                timestamp: Date.now()
            };
            App.chat.messages.push(systemMessage);
            await App.chatWriteCurrentFile(App.chat.messages);
        }

        return true;
    } catch (e) {
        console.error('chatEnsureCurrentMonthHandle failed:', e);
        return false;
    }
};

/**
 * Объединяет два массива сообщений по id (без конфликтов версий — сообщения
 * не редактируются) и сортирует по времени отправки.
 */
App.chatMergeMessages = function(localMessages, remoteMessages) {
    const byId = new Map();
    [...(localMessages || []), ...(remoteMessages || [])].forEach(msg => {
        if (msg && msg.id) byId.set(msg.id, msg);
    });
    return Array.from(byId.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
};

/**
 * Читает текущий файл месяца заново и сливает с тем, что уже в памяти —
 * используется и при обычном поллинге, и перед записью (чтобы не потерять
 * сообщения, которые появились в файле уже после последнего чтения).
 */
App.chatPullMerge = async function() {
    const ok = await App.chatEnsureCurrentMonthHandle();
    if (!ok) return false;

    try {
        const file = await App.chat.fileHandle.getFile();
        const text = await file.text();
        const remoteMessages = text.trim() ? (JSON.parse(text).messages || []) : [];
        const merged = App.chatMergeMessages(App.chat.messages, remoteMessages);
        const changed = merged.length !== App.chat.messages.length;
        App.chat.messages = merged;
        return changed;
    } catch (e) {
        console.error('chatPullMerge failed:', e);
        return false;
    }
};

App.chatWriteCurrentFile = async function(messages) {
    const writable = await App.chat.fileHandle.createWritable();
    await writable.write(JSON.stringify({messages}, null, 2));
    await writable.close();
};

// === Локальная очередь неотправленных сообщений (переживает перезагрузку) ===

App.chatLoadQueue = function() {
    try {
        const raw = localStorage.getItem(CHAT_QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.warn('chatLoadQueue: не удалось прочитать очередь', e);
        return [];
    }
};

App.chatSaveQueue = function(queue) {
    try {
        localStorage.setItem(CHAT_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
        console.warn('chatSaveQueue: не удалось сохранить очередь', e);
    }
};

App.chatAddToQueue = function(message) {
    const queue = App.chatLoadQueue();
    queue.push(message);
    App.chatSaveQueue(queue);
};

App.chatRemoveFromQueue = function(messageId) {
    const queue = App.chatLoadQueue().filter(m => m.id !== messageId);
    App.chatSaveQueue(queue);
};

/**
 * Полностью очищает локальную очередь неотправленных сообщений — вызывается
 * при подключении к другому рабочему пространству, чтобы сообщения,
 * адресованные СТАРОЙ папке, не улетели в чат НОВОЙ.
 */
App.chatClearQueue = function() {
    App.chatSaveQueue([]);
};

/**
 * Отправляет одно сообщение: читает-сливает-дописывает-пишет. При неудаче —
 * кладёт сообщение в локальную очередь на повтор (переживает reload) вместо
 * молчаливой потери.
 */
App.chatPushMessage = async function(message) {
    const run = async () => {
        const ok = await App.chatEnsureCurrentMonthHandle();
        if (!ok) {
            App.chatAddToQueue(message);
            return false;
        }
        try {
            // Свежее чтение прямо перед записью — чтобы не затереть то, что
            // коллеги успели добавить между последним поллингом и этой отправкой.
            await App.chatPullMerge();
            const merged = App.chatMergeMessages(App.chat.messages, [message]);
            await App.chatWriteCurrentFile(merged);
            App.chat.messages = merged;
            App.chatRemoveFromQueue(message.id);
            return true;
        } catch (e) {
            console.error('chatPushMessage failed, ставим в очередь:', e);
            App.chatAddToQueue(message);
            return false;
        }
    };
    // Сериализация записей — тот же паттерн, что App._pushChain у задач,
    // чтобы два быстрых сообщения подряд не гонялись за одним write.
    App._chatPushChain = (App._chatPushChain || Promise.resolve()).then(run, run);
    return App._chatPushChain;
};

/**
 * Отправляет текст как новое сообщение текущего пользователя.
 */
App.chatSend = async function(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;

    const message = {
        id: App.generateId(),
        authorId: App.state.currentUser,
        text: trimmed,
        type: 'chat',
        timestamp: Date.now()
    };

    // Оптимистично добавляем в память сразу — не ждём записи в файл,
    // чтобы автор увидел своё сообщение мгновенно (UI подключим на Этапе 3).
    App.chat.messages = App.chatMergeMessages(App.chat.messages, [message]);

    await App.chatPushMessage(message);
    return message;
};

/**
 * Пытается повторно отправить всё, что скопилось в локальной очереди —
 * вызывается при восстановлении доступа к папке / возврате фокуса на вкладку.
 */
App.chatRetryQueue = async function() {
    const queue = App.chatLoadQueue();
    if (queue.length === 0) return;

    for (const message of queue) {
        await App.chatPushMessage(message);
    }
};

/**
 * Читает текст из поля ввода, отправляет как сообщение и сразу перерисовывает
 * ленту — оптимистичное добавление в App.chat.messages происходит синхронно
 * в начале App.chatSend (до первого await), поэтому к моменту вызова
 * App.renderChat() сообщение уже есть в памяти, даже не дожидаясь записи в файл.
 */
App.chatSendFromInput = function() {
    const input = App.elements.chatInput;
    const text = input.value;
    if (!text.trim()) return;
    input.value = '';
    App.chatSend(text);
    App.renderChat();
};

/**
 * Добавляет системное сообщение (не от конкретного пользователя) — используется
 * и для перехода на новый месяц, и для отметки "задача создана из сообщения".
 */
App.chatAppendSystemMessage = async function(text) {
    const message = {
        id: App.generateId(),
        authorId: null,
        text,
        type: 'system',
        timestamp: Date.now()
    };
    App.chat.messages = App.chatMergeMessages(App.chat.messages, [message]);
    await App.chatPushMessage(message);
    return message;
};

/**
 * Привязывает обработчики поля ввода и кнопки отправки чата.
 */
// === @упоминания: автодополнение при вводе ===

App._chatMention = {open: false, startIndex: -1, activeIndex: 0, matches: []};

App.chatCloseMentionAutocomplete = function() {
    const popup = document.getElementById('chatMentionPopup');
    if (popup) popup.remove();
    App._chatMention.open = false;
};

/**
 * Проверяет текст перед курсором на @частичное_имя и открывает/обновляет/
 * закрывает попап автодополнения. Вызывается на каждый ввод символа.
 */
App.chatUpdateMentionAutocomplete = function() {
    const input = App.elements.chatInput;
    const cursor = input.selectionStart;
    const textBeforeCursor = input.value.slice(0, cursor);
    const match = textBeforeCursor.match(/@([^\s@]*)$/);

    if (!match) {
        App.chatCloseMentionAutocomplete();
        return;
    }

    const query = match[1].toLowerCase();
    const startIndex = cursor - match[0].length;
    const matches = App.state.users.filter(u => u.name.toLowerCase().includes(query));

    if (matches.length === 0) {
        App.chatCloseMentionAutocomplete();
        return;
    }

    App._chatMention = {open: true, startIndex, activeIndex: 0, matches};
    App.chatRenderMentionPopup();
};

App.chatRenderMentionPopup = function() {
    let popup = document.getElementById('chatMentionPopup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'chatMentionPopup';
        popup.className = 'chat-mention-popup';
        document.body.appendChild(popup);
    }

    const {matches, activeIndex} = App._chatMention;
    popup.innerHTML = matches.map((u, i) => {
        const initials = u.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        return `
<div class="chat-mention-popup-item ${i === activeIndex ? 'active' : ''}" data-index="${i}">
<span class="chat-mention-popup-avatar" style="background: ${App.safeColor(u.color)};">${initials}</span>
<span>${App.escapeHtml(u.name)}</span>
</div>`;
    }).join('');

    popup.querySelectorAll('.chat-mention-popup-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
            // mousedown, а не click — иначе inputField успевает потерять фокус
            // раньше, чем сработает выбор, и popup закроется сам без выбора.
            e.preventDefault();
            App.chatSelectMention(matches[parseInt(item.dataset.index)]);
        });
    });

    // Позиционируем над полем ввода (попап растёт вверх, поле — внизу экрана)
    const rect = App.elements.chatInput.getBoundingClientRect();
    popup.style.left = `${rect.left}px`;
    popup.style.width = `${Math.min(rect.width, 260)}px`;
    popup.style.bottom = `${window.innerHeight - rect.top + 6}px`;
};

App.chatSelectMention = function(user) {
    const input = App.elements.chatInput;
    const {startIndex} = App._chatMention;
    const cursor = input.selectionStart;
    const before = input.value.slice(0, startIndex);
    const after = input.value.slice(cursor);
    const insertion = `@${user.name} `;
    input.value = before + insertion + after;
    const newCursor = before.length + insertion.length;
    input.setSelectionRange(newCursor, newCursor);
    input.focus();
    App.chatCloseMentionAutocomplete();
};

/**
 * Возвращает true, если клавиша была обработана попапом упоминаний
 * (и, значит, не должна восприниматься как отправка сообщения).
 */
App.chatMentionHandleKeydown = function(e) {
    if (!App._chatMention.open) return false;
    const state = App._chatMention;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.activeIndex = (state.activeIndex + 1) % state.matches.length;
        App.chatRenderMentionPopup();
        return true;
    }
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.activeIndex = (state.activeIndex - 1 + state.matches.length) % state.matches.length;
        App.chatRenderMentionPopup();
        return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        App.chatSelectMention(state.matches[state.activeIndex]);
        return true;
    }
    if (e.key === 'Escape') {
        e.preventDefault();
        App.chatCloseMentionAutocomplete();
        return true;
    }
    return false;
};

App.bindChatEvents = function() {
    App.elements.chatSendBtn.addEventListener('click', () => App.chatSendFromInput());
    App.elements.chatInput.addEventListener('keydown', (e) => {
        // Если открыт попап @упоминаний — стрелки/Enter/Tab/Escape управляют
        // им, а не отправкой сообщения (тот же порядок проверки, что и в
        // референсной реализации).
        if (App.chatMentionHandleKeydown(e)) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            App.chatSendFromInput();
        }
    });
    App.elements.chatInput.addEventListener('input', () => App.chatUpdateMentionAutocomplete());
    App.elements.chatInput.addEventListener('keyup', (e) => {
        // Клавиши, не меняющие текст (стрелки влево/вправо, Home/End),
        // тоже двигают курсор — пересчитываем состояние автодополнения.
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            App.chatUpdateMentionAutocomplete();
        }
    });

    // Кнопка "В задачу" и клик по уведомлению — делегирование, так как лента
    // перерисовывается целиком при каждом App.renderChat().
    App.elements.chatMessages.addEventListener('click', (e) => {
        const btn = e.target.closest('.chat-to-task-btn');
        if (btn) {
            const msg = App.chat.messages.find(m => m.id === btn.dataset.messageId);
            if (msg) {
                App.ui.creatingTaskFromChat = true;
                App.openTaskModal(msg.text);
            }
            return;
        }
        const notifRow = e.target.closest('.chat-notification');
        if (notifRow) {
            const notif = App.state.notifications.find(n => String(n.id) === notifRow.dataset.notificationId);
            if (!notif) return;
            if (!notif.read) {
                notif.read = true;
                App.saveState();
                App.updateNotificationBell();
            }
            if (notif.taskId) {
                App.openTaskDetail(notif.taskId);
            } else {
                App.renderChat();
            }
        }
    });

    App.bindChatActivityTracking();
};

// === Адаптивный поллинг чата ===
//
// Активный режим (5с): было движение мышкой/тач/скролл чата/набор текста
// в последние 2 минуты.
// Умеренный режим (30с): активности не было 2+ минуты, но вкладка видима.
// Спящий режим (2мин): вкладка неактивна (свёрнута/в фоне).
// Мгновенный триггер: возврат фокуса на вкладку или любая активность после
// периода бездействия — сразу сбрасывает на активный режим и опрашивает
// немедленно, не дожидаясь текущего таймера.

App.chat.pollTimer = null;
App.chat.lastActivityAt = Date.now();

const CHAT_POLL_ACTIVE_MS = 5000;
const CHAT_POLL_MODERATE_MS = 30000;
const CHAT_POLL_SLEEP_MS = 120000;
const CHAT_IDLE_THRESHOLD_MS = 120000; // 2 минуты без активности -> умеренный режим

App.chatGetPollInterval = function() {
    if (document.hidden) return CHAT_POLL_SLEEP_MS;
    const idleMs = Date.now() - App.chat.lastActivityAt;
    return idleMs < CHAT_IDLE_THRESHOLD_MS ? CHAT_POLL_ACTIVE_MS : CHAT_POLL_MODERATE_MS;
};

/**
 * Отмечает активность пользователя. Если до этого таймер был в умеренном/
 * спящем режиме — мгновенно пересобирает поллинг на активный режим и
 * опрашивает файл прямо сейчас, не дожидаясь текущего запланированного тика.
 */
App.chatMarkActivity = function() {
    const wasSlowMode = document.hidden || (Date.now() - App.chat.lastActivityAt) >= CHAT_IDLE_THRESHOLD_MS;
    App.chat.lastActivityAt = Date.now();
    if (wasSlowMode && App.chat.pollTimer) {
        App.chatRestartPolling(true);
    }
};

App.chatPollTick = async function() {
    const changed = await App.chatPullMerge();
    if (changed && App.state.currentSection === 'chat') {
        App.renderChat();
    } else if (App.state.currentSection === 'chat') {
        // Даже без новых сообщений статус подключения мог измениться
        App.chatUpdateConnectionStatus();
    }
    App.chat.pollTimer = setTimeout(App.chatPollTick, App.chatGetPollInterval());
};

App.chatStartPolling = function() {
    App.chatStopPolling();
    App.chat.lastActivityAt = Date.now();
    // Опрашиваем сразу при старте, дальше — по адаптивному интервалу
    App.chat.pollTimer = setTimeout(App.chatPollTick, 0);
};

App.chatStopPolling = function() {
    if (App.chat.pollTimer) {
        clearTimeout(App.chat.pollTimer);
        App.chat.pollTimer = null;
    }
};

App.chatRestartPolling = function(immediate = false) {
    App.chatStopPolling();
    App.chat.pollTimer = setTimeout(App.chatPollTick, immediate ? 0 : App.chatGetPollInterval());
};

/**
 * Привязывает глобальные признаки активности для адаптивного поллинга.
 * Throttled до 1 раза в секунду — mousemove/touchmove стреляют слишком часто,
 * чтобы обрабатывать каждое событие без ограничения частоты.
 */
App.bindChatActivityTracking = function() {
    let lastProcessed = 0;
    const onActivity = () => {
        const now = Date.now();
        if (now - lastProcessed < 1000) return;
        lastProcessed = now;
        App.chatMarkActivity();
    };

    document.addEventListener('mousemove', onActivity, {passive: true});
    document.addEventListener('keydown', onActivity, {passive: true});
    document.addEventListener('touchstart', onActivity, {passive: true});
    document.addEventListener('touchmove', onActivity, {passive: true});
    if (App.elements.chatMessages) {
        App.elements.chatMessages.addEventListener('scroll', onActivity, {passive: true});
    }

    // Возврат на вкладку — мгновенный триггер, без троттлинга (редкое событие)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            App.chatMarkActivity();
        }
    });
};
