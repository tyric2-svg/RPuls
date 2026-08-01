import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

// Экспортируем все необходимое в глобальный объект window.TiptapBundle
if (typeof window !== 'undefined') {
  window.TiptapBundle = {
    Editor: Editor,
    StarterKit: StarterKit,
    Placeholder: Placeholder
  };
  
  console.log('TiptapBundle загружен успешно!');
  console.log('Доступные классы:', Object.keys(window.TiptapBundle));
}

export { Editor, StarterKit, Placeholder };
