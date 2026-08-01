#!/usr/bin/env python3
import os

base_dir = '/workspace/RPulsar/libs/tiptap'

def read_file(name):
    path = os.path.join(base_dir, name)
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

# Читаем все файлы ProseMirror
pm_files = {
    'state': 'prosemirror-state.js',
    'view': 'prosemirror-view.js',
    'keymap': 'prosemirror-keymap.js',
    'model': 'prosemirror-model.js',
    'transform': 'prosemirror-transform.js',
    'commands$1': 'prosemirror-commands.js',
    'schemaList': 'prosemirror-schema-list.js',
}

# Создаем финальный бандл
bundle = '''/**
 * Tiptap Offline Bundle для RPulsar v2
 * Полностью автономная версия для работы без интернета
 */
(function(global) {
  'use strict';

'''

# Добавляем каждый модуль ProseMirror как глобальную переменную
for var_name, filename in pm_files.items():
    content = read_file(filename)
    bundle += f"  // === ProseMirror: {var_name} ({filename}) ===\n"
    bundle += f"  (function() {{\n"
    bundle += f"    var exports = {{}};\n"
    bundle += f"    var module = {{ exports: exports }};\n"
    bundle += f"    {content}\n"
    bundle += f"    global.{var_name} = module.exports || exports;\n"
    bundle += f"  }})();\n\n"

# Добавляем Tiptap Core
tiptap_core = read_file('tiptap-core-full.js')
bundle += "  // === Tiptap Core ===\n"
bundle += f"  {tiptap_core}\n\n"

# Добавляем Tiptap Starter Kit
tiptap_starter = read_file('tiptap-starter-kit-full.js')
bundle += "  // === Tiptap Starter Kit ===\n"
bundle += f"  {tiptap_starter}\n\n"

# Добавляем Tiptap Placeholder
tiptap_placeholder = read_file('tiptap-extension-placeholder-full.js')
bundle += "  // === Tiptap Extension Placeholder ===\n"
bundle += f"  {tiptap_placeholder}\n\n"

# Добавляем код инициализации
bundle += '''
  // Инициализация после загрузки всех модулей
  setTimeout(function() {
    try {
      var core = global['@tiptap/core'];
      var starterKit = global['@tiptap/starter-kit'];
      var placeholder = global['@tiptap/extension-placeholder'];

      console.log('Tiptap core loaded:', !!core);
      console.log('StarterKit loaded:', !!starterKit);
      console.log('Placeholder loaded:', !!placeholder);

      // Экспортируем в window.Tiptap
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

      console.log('Tiptap успешно инициализирован в window.Tiptap');
      console.log('Editor доступен:', !!global.Tiptap.Editor);
      
      // Событие готовности
      if (typeof document !== 'undefined') {
        var event = new CustomEvent('tiptap-ready', { detail: global.Tiptap });
        document.dispatchEvent(event);
      }
      
    } catch (e) {
      console.error('Критическая ошибка инициализации Tiptap:', e);
      console.error('Stack:', e.stack);
    }
  }, 100);

})(typeof window !== 'undefined' ? window : this);
'''

# Записываем бандл
output_path = os.path.join(base_dir, 'tiptap-offline-bundle.js')
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(bundle)

print(f"\nФинальный бандл создан: {output_path}")
print(f"Размер: {os.path.getsize(output_path)} байт ({os.path.getsize(output_path) / 1024 / 1024:.2f} MB)")
