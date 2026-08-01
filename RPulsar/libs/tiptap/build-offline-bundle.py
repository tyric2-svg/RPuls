#!/usr/bin/env python3
"""
Скрипт для создания офлайн-бандла Tiptap со всеми зависимостями
Правильная версия с установкой глобальных переменных для UMD модулей
"""

import os
import re

# Пути к файлам
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(BASE_DIR, 'tiptap-offline-bundle.js')

# Порядок загрузки файлов (важен!)
FILES_ORDER = [
    'prosemirror-model.js',
    'prosemirror-state.js', 
    'prosemirror-transform.js',
    'prosemirror-view.js',
    'prosemirror-keymap.js',
    'prosemirror-commands.js',
    'prosemirror-schema-basic.js',
    'prosemirror-schema-list.js',
    'prosemirror-history.js',
    'prosemirror-inputrules.js',
    'prosemirror-dropcursor.js',
    'prosemirror-gapcursor.js',
]

TIPTAP_FILES = [
    'tiptap-core.js',
    'tiptap-starter-kit.js',
    'tiptap-extension-placeholder.js'
]

def read_file(filename):
    """Читает файл и возвращает содержимое"""
    filepath = os.path.join(BASE_DIR, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read()

def main():
    print("Начало сборки бандла...")
    
    bundle_content = """/**
 * Tiptap Offline Bundle
 * Автономная версия Tiptap со всеми зависимостями
 * Все экспорты доступны через глобальный объект window.TiptapLibs
 */
(function(global) {
    'use strict';
    
    // Создаем пространство имен для всех библиотек
    global.TiptapLibs = global.TiptapLibs || {};
    const libs = global.TiptapLibs;
    
    // Устанавливаем глобальные переменные для UMD модулей ProseMirror
    // Это необходимо для работы Tiptap который требует их через require()
    
"""
    
    # Читаем и добавляем каждый файл ProseMirror с установкой глобальных переменных
    for filename in FILES_ORDER:
        print(f"Добавляем {filename}...")
        content = read_file(filename)
        
        # Определяем имя глобальной переменной на основе имени файла
        name_map = {
            'prosemirror-model.js': 'model',
            'prosemirror-state.js': 'state', 
            'prosemirror-transform.js': 'transform',
            'prosemirror-view.js': 'view',
            'prosemirror-keymap.js': 'keymap',
            'prosemirror-commands.js': 'commands$1',  # Специальное имя для commands
            'prosemirror-schema-basic.js': 'schemaBasic',
            'prosemirror-schema-list.js': 'schemaList',
            'prosemirror-history.js': 'history',
            'prosemirror-inputrules.js': 'inputrules',
            'prosemirror-dropcursor.js': 'dropcursor',
            'prosemirror-gapcursor.js': 'gapcursor'
        }
        
        global_name = name_map.get(filename, filename.replace('.js', ''))
        
        # Оборачиваем в IIFE с установкой глобальной переменной
        wrapped = f"""
    /* === {filename} === */
    (function() {{
        var moduleExports = {{}};
        var exports = moduleExports;
        {content}
        // Экспортируем в глобальную область
        if (moduleExports && Object.keys(moduleExports).length > 0) {{
            global.{global_name} = moduleExports;
        }}
    }}());
"""
        bundle_content += wrapped
    
    # Теперь загружаем Tiptap файлы
    for filename in TIPTAP_FILES:
        print(f"Добавляем {filename}...")
        content = read_file(filename)
        
        wrapped = f"""
    /* === {filename} === */
    (function() {{
        var moduleExports = {{}};
        var exports = moduleExports;
        {content}
        if (moduleExports && Object.keys(moduleExports).length > 0) {{
            // Сохраняем экспорты модуля
        }}
    }}());
"""
        bundle_content += wrapped
    
    # Добавляем финальную часть с экспортом
    bundle_content += """
    // Экспортируем основные классы после загрузки всех зависимостей
    setTimeout(function() {
        console.log('TiptapLibs: Проверка доступных экспортов...');
        
        // Проверяем что загрузилось из ProseMirror
        if (typeof global.model !== 'undefined') {
            libs.Model = global.model;
            console.log('✓ ProseMirror Model доступен');
        }
        if (typeof global.state !== 'undefined') {
            libs.State = global.state;
            console.log('✓ ProseMirror State доступен');
        }
        if (typeof global.view !== 'undefined') {
            libs.View = global.view;
            console.log('✓ ProseMirror View доступен');
        }
        
        // Tiptap должен быть доступен через @tiptap/core
        if (typeof global['@tiptap/core'] !== 'undefined') {
            const tiptapCore = global['@tiptap/core'];
            libs.core = tiptapCore;
            if (tiptapCore.Editor) {
                libs.Editor = tiptapCore.Editor;
                console.log('✓ Tiptap Editor доступен');
            }
            if (tiptapCore.Node) libs.Node = tiptapCore.Node;
            if (tiptapCore.Mark) libs.Mark = tiptapCore.Mark;
            if (tiptapCore.Extension) libs.Extension = tiptapCore.Extension;
        }
        
        // Starter Kit
        if (typeof global['@tiptap/starter-kit'] !== 'undefined') {
            libs.StarterKit = global['@tiptap/starter-kit'];
            console.log('✓ Tiptap StarterKit доступен');
        }
        
        // Placeholder
        if (typeof global['@tiptap/extension-placeholder'] !== 'undefined') {
            libs.Placeholder = global['@tiptap/extension-placeholder'];
            console.log('✓ Tiptap Placeholder доступен');
        }
        
        if (libs.Editor) {
            console.log('TiptapLibs готов к использованию!');
            console.log('Используйте: new window.TiptapLibs.Editor({...})');
            
            // Событие готовности
            const event = new CustomEvent('tiptap-ready', { detail: libs });
            document.dispatchEvent(event);
        } else {
            console.error('❌ ОШИБКА: Editor не найден!');
            console.error('Доступные глобальные переменные:', Object.keys(global));
        }
        
    }, 100);
    
})(window);
"""
    
    # Записываем бандл
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(bundle_content)
    
    print(f"\n✓ Бандл создан: {OUTPUT_FILE}")
    print(f"Размер: {os.path.getsize(OUTPUT_FILE) / 1024:.1f} KB")

if __name__ == '__main__':
    main()
