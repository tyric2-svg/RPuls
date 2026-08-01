#!/usr/bin/env python3
import os
import re

base_dir = '/workspace/RPulsar/libs/tiptap'

# Чтение файлов
def read_file(name):
    path = os.path.join(base_dir, name)
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

files = {
    'prosemirror-model': 'prosemirror-model.js',
    'prosemirror-state': 'prosemirror-state.js',
    'prosemirror-transform': 'prosemirror-transform.js',
    'prosemirror-view': 'prosemirror-view.js',
    'prosemirror-keymap': 'prosemirror-keymap.js',
    'prosemirror-commands': 'prosemirror-commands.js',
    'prosemirror-schema-basic': 'prosemirror-schema-basic.js',
    'prosemirror-schema-list': 'prosemirror-schema-list.js',
    'prosemirror-dropcursor': 'prosemirror-dropcursor.js',
    'prosemirror-gapcursor': 'prosemirror-gapcursor.js',
    'prosemirror-history': 'prosemirror-history.js',
    'prosemirror-inputrules': 'prosemirror-inputrules.js',
    '@tiptap/core': 'tiptap-core.js',
    '@tiptap/starter-kit': 'tiptap-starter-kit.js',
    '@tiptap/extension-placeholder': 'tiptap-extension-placeholder.js',
}

contents = {}
for key, filename in files.items():
    contents[key] = read_file(filename)
    print(f"Загружен {filename}")

# Создаем единый бандл с правильной системой модулей
bundle = '''/**
 * Tiptap Offline Bundle для RPulsar
 * Автогенерируемый файл - содержит все зависимости Tiptap и ProseMirror
 */
(function(global) {
  'use strict';

  var modules = {};
  var cache = {};
  var moduleExports = {};

  function require(id) {
    if (moduleExports[id]) return moduleExports[id];
    if (!modules[id]) {
      console.error('Module not found:', id);
      return {};
    }
    
    var module = { exports: {} };
    var exports = module.exports;
    
    try {
      modules[id](exports, module, require);
      moduleExports[id] = module.exports;
      return module.exports;
    } catch (e) {
      console.error('Error loading module', id, ':', e);
      return {};
    }
  }

  function define(id, factory) {
    modules[id] = factory;
  }

'''

# Добавляем каждый модуль
for key, content in contents.items():
    # Экранируем содержимое для вставки в строку
    bundle += f"  // === Module: {key} ===\n"
    bundle += f"  define('{key}', function(exports, module, require) {{\n"
    bundle += f"    'use strict';\n"
    bundle += f"    {content}\n"
    bundle += f"  }});\n\n"

# Добавляем код инициализации
bundle += '''
  // Инициализация после загрузки всех модулей
  setTimeout(function() {
    try {
      var core = require('@tiptap/core');
      var starterKit = require('@tiptap/starter-kit');
      var placeholder = require('@tiptap/extension-placeholder');

      console.log('Tiptap core loaded:', !!core);
      console.log('StarterKit loaded:', !!starterKit);
      console.log('Placeholder loaded:', !!placeholder);

      // Экспортируем в глобальную область
      global.Tiptap = {
        Editor: core && core.Editor,
        Node: core && core.Node,
        Mark: core && core.Mark,
        Extension: core && core.Extension,
        mergeAttributes: core && core.mergeAttributes,
        findParentNode: core && core.findParentNode,
        findParentNodeClosestToPos: core && core.findParentNodeClosestToPos,
        findChildren: core && core.findChildren,
        findChildrenInRange: core && core.findChildrenInRange,
        findParentNodeOfType: core && core.findParentNodeOfType,
        isActive: core && core.isActive,
        isNodeActive: core && core.isNodeActive,
        isMarkActive: core && core.isMarkActive,
        resolveFocusPosition: core && core.resolveFocusPosition,
        Plugin: core && core.Plugin,
        PluginKey: core && core.PluginKey,
        Fragment: core && core.Fragment,
        Slice: core && core.Slice,
        Schema: core && core.Schema,
        NodeType: core && core.NodeType,
        MarkType: core && core.MarkType,
        Step: core && core.Step,
        Transform: core && core.Transform,
        EditorState: core && core.EditorState,
        TextSelection: core && core.TextSelection,
        NodeSelection: core && core.NodeSelection,
        AllSelection: core && core.AllSelection,
        Transaction: core && core.Transaction,
        EditorView: core && core.EditorView,
        Decoration: core && core.Decoration,
        DecorationSet: core && core.DecorationSet,
        StarterKit: starterKit && starterKit.StarterKit,
        Placeholder: placeholder && placeholder.Placeholder
      };

      // Сохраняем оригинальные модули
      if (core) global['@tiptap/core'] = core;
      if (starterKit) global['@tiptap/starter-kit'] = starterKit;
      if (placeholder) global['@tiptap/extension-placeholder'] = placeholder;

      console.log('Tiptap успешно инициализирован в window.Tiptap');
      console.log('Editor доступен:', !!global.Tiptap.Editor);
      
      // Событие готовности
      var event = new CustomEvent('tiptap-ready', { detail: global.Tiptap });
      document.dispatchEvent(event);
      
    } catch (e) {
      console.error('Критическая ошибка инициализации Tiptap:', e);
      console.error('Stack:', e.stack);
    }
  }, 100);

})(typeof window !== 'undefined' ? window : this);
'''

# Записываем бандл
output_path = os.path.join(base_dir, 'tiptap-bundle-full.js')
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(bundle)

print(f"\nБандл создан: {output_path}")
print(f"Размер: {os.path.getsize(output_path)} байт")
