const fs = require('fs');
const path = require('path');

// Создаем единый бандл для Tiptap + ProseMirror
const outputDir = path.join(__dirname, 'standalone');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Читаем все зависимости из node_modules prosemirror
const pmPackages = [
    'prosemirror-model',
    'prosemirror-state', 
    'prosemirror-transform',
    'prosemirror-view',
    'prosemirror-keymap',
    'prosemirror-commands',
    'prosemirror-schema-list',
    'prosemirror-schema-basic'
];

let bundledCode = '';

// Сначала добавляем ProseMirror пакеты
pmPackages.forEach(pkg => {
    const pkgPath = path.join(__dirname, 'node_modules', pkg);
    const mainFile = path.join(pkgPath, 'dist', 'index.js');
    
    if (fs.existsSync(mainFile)) {
        let content = fs.readFileSync(mainFile, 'utf8');
        
        // Удаляем import statements
        content = content.replace(/^import\s+.*?;?\s*$/gm, '');
        content = content.replace(/^import\s+'.*?';?\s*$/gm, '');
        
        // Заменяем export на присваивание глобальным переменным
        const varName = pkg.replace(/-/g, '_').toUpperCase();
        
        // Простая эмуляция exports для этого модуля
        content = `
// === ${pkg} ===
(function() {
    var module = { exports: {} };
    var exports = module.exports;
    ${content}
    window.${varName} = module.exports;
})();
`;
        bundledCode += content;
        console.log(`✓ Добавлен ${pkg}`);
    } else {
        console.log(`✗ Не найден ${mainFile}`);
    }
});

// Добавляем Tiptap Core
const tiptapCorePath = path.join(__dirname, 'node_modules', '@tiptap/core/dist/index.umd.js');
if (fs.existsSync(tiptapCorePath)) {
    let content = fs.readFileSync(tiptapCorePath, 'utf8');
    bundledCode += '\n\n// === @tiptap/core ===\n' + content;
    console.log('✓ Добавлен @tiptap/core');
}

// Добавляем Tiptap Starter Kit
const starterKitPath = path.join(__dirname, 'node_modules', '@tiptap/starter-kit/dist/index.umd.js');
if (fs.existsSync(starterKitPath)) {
    let content = fs.readFileSync(starterKitPath, 'utf8');
    bundledCode += '\n\n// === @tiptap/starter-kit ===\n' + content;
    console.log('✓ Добавлен @tiptap/starter-kit');
}

// Добавляем Tiptap Extension Placeholder
const placeholderPath = path.join(__dirname, 'node_modules', '@tiptap/extension-placeholder/dist/index.umd.js');
if (fs.existsSync(placeholderPath)) {
    let content = fs.readFileSync(placeholderPath, 'utf8');
    bundledCode += '\n\n// === @tiptap/extension-placeholder ===\n' + content;
    console.log('✓ Добавлен @tiptap/extension-placeholder');
}

// Сохраняем единый бандл
const outputPath = path.join(outputDir, 'tiptap-bundle.js');
fs.writeFileSync(outputPath, bundledCode);
console.log(`\n✓ Создан единый бандл: ${outputPath}`);
console.log(`Размер: ${(bundledCode.length / 1024).toFixed(2)} KB`);
