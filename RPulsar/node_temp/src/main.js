// Tiptap Offline Bundle - Entry Point
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

// Экспортируем в глобальный объект
export const TiptapEditor = Editor;
export const TiptapStarterKit = StarterKit;
export const TiptapPlaceholder = Placeholder;

// Инициализация глобального объекта для браузерного использования
if (typeof window !== 'undefined') {
  window.TiptapBundle = {
    Editor: Editor,
    StarterKit: StarterKit,
    Placeholder: Placeholder,
    isReady: true
  };
  
  console.log('TiptapBundle: Успешно загружен и готов к работе!');
  console.log('- Editor:', typeof Editor);
  console.log('- StarterKit:', typeof StarterKit);
  console.log('- Placeholder:', typeof Placeholder);
}
