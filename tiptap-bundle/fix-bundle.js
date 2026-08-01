const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, 'standalone', 'tiptap-bundle.js');
const outputPath = path.join(__dirname, 'standalone', 'tiptap-bundle-fixed.js');

let content = fs.readFileSync(inputPath, 'utf8');

// Добавляем обертку для установки глобальных переменных в конце
const wrapper = `
// Экспортируем глобальные переменные для Tiptap
window.TiptapCore = (typeof exports !== 'undefined' && exports.Editor) ? exports : (function() {
    if (typeof window['@tiptap/core'] !== 'undefined') return window['@tiptap/core'];
    return {};
})();

window.TiptapStarterKit = (typeof exports !== 'undefined' && exports.StarterKit) ? exports : (function() {
    if (typeof window['@tiptap/starter-kit'] !== 'undefined') return window['@tiptap/starter-kit'];
    return {};
})();

window.TiptapExtensionPlaceholder = (typeof exports !== 'undefined' && exports.Placeholder) ? exports : (function() {
    if (typeof window['@tiptap/extension-placeholder'] !== 'undefined') return window['@tiptap/extension-placeholder'];
    return {};
})();
`;

fs.writeFileSync(outputPath, content + wrapper);
console.log('✓ Создан исправленный бандл');
