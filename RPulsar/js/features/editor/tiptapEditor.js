// js/features/editor/tiptapEditor.js
window.App = window.App || {};

/**
 * Инициализация Tiptap редактора для поля описания задачи
 * @param {string} containerId - ID контейнера для редактора
 * @param {string} content - Начальное содержимое (HTML)
 * @param {function} onChange - Callback при изменении содержимого
 * @returns {object} Экземпляр редактора
 */
App.initTiptapEditor = function(containerId, content = '', onChange = null) {
    // Проверяем наличие TiptapBundle (новый способ) или старых глобальных переменных
    if (!window.TiptapBundle && (!window.TiptapCore || !window.TiptapStarterKit || !window.TiptapExtensionPlaceholder)) {
        console.error('Tiptap библиотеки не загружены');
        console.log('TiptapBundle:', !!window.TiptapBundle);
        console.log('TiptapCore:', !!window.TiptapCore);
        console.log('TiptapStarterKit:', !!window.TiptapStarterKit);
        console.log('TiptapExtensionPlaceholder:', !!window.TiptapExtensionPlaceholder);
        return null;
    }
    
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Контейнер ${containerId} не найден`);
        return null;
    }

    // Очищаем контейнер
    container.innerHTML = '';

    // Создаём элемент для редактора
    const editorElement = document.createElement('div');
    editorElement.className = 'tiptap-editor';
    container.appendChild(editorElement);

    // Используем TiptapBundle если доступен, иначе старые переменные
    let Editor, StarterKit, Placeholder;
    
    if (window.TiptapBundle) {
        Editor = window.TiptapBundle.Editor;
        StarterKit = window.TiptapBundle.StarterKit;
        Placeholder = window.TiptapBundle.Placeholder;
        console.log('Используем TiptapBundle');
    } else {
        Editor = window.TiptapCore.Editor;
        StarterKit = window.TiptapStarterKit.StarterKit;
        Placeholder = window.TiptapExtensionPlaceholder.Placeholder;
        console.log('Используем старые глобальные переменные');
    }

    // Инициализируем редактор
    const editor = new Editor({
        element: editorElement,
        extensions: [
            StarterKit.configure({
                bulletList: {
                    keepMarks: true,
                    keepAttributes: false,
                },
                orderedList: {
                    keepMarks: true,
                    keepAttributes: false,
                },
            }),
            Placeholder.configure({
                placeholder: 'Введите описание задачи... (поддерживается Markdown)',
            }),
        ],
        content: content,
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            if (onChange) {
                onChange(html);
            }
        },
        editorProps: {
            attributes: {
                class: 'tiptap-content',
            },
        },
    });

    // Сохраняем ссылку на редактор в App
    if (!App.editors) {
        App.editors = {};
    }
    App.editors[containerId] = editor;

    return editor;
};

/**
 * Получение содержимого редактора
 * @param {string} containerId - ID контейнера редактора
 * @returns {string} HTML содержимое
 */
App.getTiptapContent = function(containerId) {
    if (App.editors && App.editors[containerId]) {
        return App.editors[containerId].getHTML();
    }
    return '';
};

/**
 * Установка содержимого редактора
 * @param {string} containerId - ID контейнера редактора
 * @param {string} content - HTML содержимое
 */
App.setTiptapContent = function(containerId, content) {
    if (App.editors && App.editors[containerId]) {
        App.editors[containerId].commands.setContent(content);
    }
};

/**
 * Уничтожение редактора
 * @param {string} containerId - ID контейнера редактора
 */
App.destroyTiptapEditor = function(containerId) {
    if (App.editors && App.editors[containerId]) {
        App.editors[containerId].destroy();
        delete App.editors[containerId];
    }
};

/**
 * Конвертация простого текста/Markdown в HTML для Tiptap
 * @param {string} text - Исходный текст
 * @returns {string} HTML
 */
App.textToHtml = function(text) {
    if (!text) return '';
    
    // Простая конвертация Markdown-подобного синтаксиса
    let html = text
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        .replace(/~~(.*)~~/gim, '<s>$1</s>')
        .replace(/`(.*)`/gim, '<code>$1</code>')
        .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
        .replace(/^\- (.*$)/gim, '<li>$1</li>')
        .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
        .replace(/\n/gim, '<br>');
    
    return html;
};

/**
 * Конвертация HTML в простой текст
 * @param {string} html - HTML содержимое
 * @returns {string} Текст
 */
App.htmlToText = function(html) {
    if (!html) return '';
    
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
};
