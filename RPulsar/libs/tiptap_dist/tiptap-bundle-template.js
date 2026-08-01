/**
 * Tiptap Offline Bundle v2.10.3
 * Самодостаточный бандл для работы без CDN
 * Включает: ProseMirror + Tiptap Core + Starter Kit
 */

(function(global) {
    'use strict';

    // 1. ProseMirror Model (должен быть первым)
    var ProseMirrorModel = (function() {
        // Код ProseMirror Model будет вставлен сюда сборщиком
        // Это заглушка, реальный код будет в финальном файле
        return null; 
    })();

    // 2. ProseMirror State
    var ProseMirrorState = (function() {
        return null;
    })();

    // 3. ProseMirror Transform
    var ProseMirrorTransform = (function() {
        return null;
    })();

    // 4. ProseMirror View
    var ProseMirrorView = (function() {
        return null;
    })();

    // 5. ProseMirror Schema List
    var ProseMirrorSchemaList = (function() {
        return null;
    })();

    // 6. ProseMirror Schema Basic
    var ProseMirrorSchemaBasic = (function() {
        return null;
    })();

    // 7. ProseMirror Keymap
    var ProseMirrorKeymap = (function() {
        return null;
    })();

    // 8. ProseMirror Commands
    var ProseMirrorCommands = (function() {
        return null;
    })();

    // 9. ProseMirror History
    var ProseMirrorHistory = (function() {
        return null;
    })();

    // 10. ProseMirror InputRules
    var ProseMirrorInputRules = (function() {
        return null;
    })();

    // 11. ProseMirror DropCursor
    var ProseMirrorDropCursor = (function() {
        return null;
    })();

    // 12. ProseMirror GapCursor
    var ProseMirrorGapCursor = (function() {
        return null;
    })();

    // 13. Tiptap Core
    var TiptapCore = (function() {
        return null;
    })();

    // 14. Tiptap Starter Kit
    var TiptapStarterKit = (function() {
        return null;
    })();

    // 15. Tiptap Extension Placeholder
    var TiptapPlaceholder = (function() {
        return null;
    })();

    // Экспорт в глобальный объект
    global.TiptapBundle = {
        Editor: null,
        StarterKit: null,
        Placeholder: null,
        isReady: false,
        
        init: function() {
            console.log('TiptapBundle: Начало инициализации...');
            
            try {
                // Проверяем наличие зависимостей
                if (!global.prosemirrorModel || !global.prosemirrorState) {
                    throw new Error('ProseMirror зависимости не загружены');
                }
                
                // Инициализируем Tiptap
                if (global.TiptapCore && global.TiptapCore.Editor) {
                    this.Editor = global.TiptapCore.Editor;
                    console.log('TiptapBundle: Editor найден');
                }
                
                if (global.TiptapStarterKit && global.TiptapStarterKit.StarterKit) {
                    this.StarterKit = global.TiptapStarterKit.StarterKit;
                    console.log('TiptapBundle: StarterKit найден');
                }
                
                if (global.TiptapPlaceholder && global.TiptapPlaceholder.Placeholder) {
                    this.Placeholder = global.TiptapPlaceholder.Placeholder;
                    console.log('TiptapBundle: Placeholder найден');
                }
                
                if (this.Editor) {
                    this.isReady = true;
                    console.log('TiptapBundle: Готов к работе!');
                    return true;
                } else {
                    throw new Error('Класс Editor не найден после инициализации');
                }
            } catch (e) {
                console.error('TiptapBundle: Ошибка инициализации:', e);
                this.isReady = false;
                return false;
            }
        }
    };

    // Автоматическая инициализация после загрузки всех скриптов
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(function() {
            global.TiptapBundle.init();
        }, 100);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(function() {
                global.TiptapBundle.init();
            }, 100);
        });
    }

})(typeof window !== 'undefined' ? window : this);
