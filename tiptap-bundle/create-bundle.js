const fs = require('fs');
const path = require('path');

// Создаем директорию для бандлов
const outputDir = path.join(__dirname, 'bundles');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Функция для чтения и обработки файла
function readAndWrap(filePath, varName) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Оборачиваем в IIFE для создания глобальной переменной
    return `window.${varName} = (function() {
    var module = { exports: {} };
    var exports = module.exports;
    ${content}
    return module.exports || exports;
})();`;
}

// Копируем основные модули Tiptap
const modules = [
    { src: '@tiptap/core/dist/index.umd.js', dest: 'tiptap-core.js', var: 'TiptapCore' },
    { src: '@tiptap/starter-kit/dist/index.umd.js', dest: 'tiptap-starter-kit.js', var: 'TiptapStarterKit' },
    { src: '@tiptap/extension-placeholder/dist/index.umd.js', dest: 'tiptap-extension-placeholder.js', var: 'TiptapExtensionPlaceholder' },
];

// ProseMirror модули
const pmModules = [
    { src: '@tiptap/pm/model/dist/index.cjs', dest: 'prosemirror-model.js', var: 'PMModel' },
    { src: '@tiptap/pm/state/dist/index.cjs', dest: 'prosemirror-state.js', var: 'PMState' },
    { src: '@tiptap/pm/view/dist/index.cjs', dest: 'prosemirror-view.js', var: 'PMView' },
    { src: '@tiptap/pm/transform/dist/index.cjs', dest: 'prosemirror-transform.js', var: 'PMTransform' },
    { src: '@tiptap/pm/keymap/dist/index.cjs', dest: 'prosemirror-keymap.js', var: 'PMKeymap' },
    { src: '@tiptap/pm/commands/dist/index.cjs', dest: 'prosemirror-commands.js', var: 'PMCommands' },
    { src: '@tiptap/pm/schema-list/dist/index.cjs', dest: 'prosemirror-schema-list.js', var: 'PMSchemaList' },
    { src: '@tiptap/pm/schema-basic/dist/index.cjs', dest: 'prosemirror-schema-basic.js', var: 'PMSchemaBasic' },
];

console.log('Копирование Tiptap модулей...');
modules.forEach(mod => {
    const srcPath = path.join(__dirname, 'node_modules', mod.src);
    const destPath = path.join(outputDir, mod.dest);
    if (fs.existsSync(srcPath)) {
        let content = fs.readFileSync(srcPath, 'utf8');
        fs.writeFileSync(destPath, content);
        console.log(`✓ ${mod.dest}`);
    } else {
        console.log(`✗ Не найден: ${mod.src}`);
    }
});

console.log('\nОбработка ProseMirror модулей...');
pmModules.forEach(mod => {
    const srcPath = path.join(__dirname, 'node_modules', mod.src);
    const destPath = path.join(outputDir, mod.dest);
    if (fs.existsSync(srcPath)) {
        let content = fs.readFileSync(srcPath, 'utf8');
        // CJS модули уже имеют правильную структуру
        fs.writeFileSync(destPath, content);
        console.log(`✓ ${mod.dest}`);
    } else {
        console.log(`✗ Не найден: ${mod.src}`);
    }
});

console.log('\nГотово! Бандлы созданы в:', outputDir);
