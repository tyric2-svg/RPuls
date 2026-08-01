#!/bin/bash
set -e

TIPTAP_DIR="/workspace/RPulsar/libs/tiptap"
cd "$TIPTAP_DIR"

echo "Скачивание UMD версий библиотек..."

# Скачиваем UMD версии ProseMirror
curl -sL "https://unpkg.com/prosemirror-model@1.19.4/dist/index.umd.js" -o "prosemirror-model-umd.js"
curl -sL "https://unpkg.com/prosemirror-state@1.4.3/dist/index.umd.js" -o "prosemirror-state-umd.js"
curl -sL "https://unpkg.com/prosemirror-transform@1.9.0/dist/index.umd.js" -o "prosemirror-transform-umd.js"
curl -sL "https://unpkg.com/prosemirror-view@3.24.0/dist/index.umd.js" -o "prosemirror-view-umd.js"
curl -sL "https://unpkg.com/prosemirror-keymap@1.2.2/dist/index.umd.js" -o "prosemirror-keymap-umd.js"
curl -sL "https://unpkg.com/prosemirror-commands@1.5.2/dist/index.umd.js" -o "prosemirror-commands-umd.js"
curl -sL "https://unpkg.com/prosemirror-schema-basic@1.2.3/dist/index.umd.js" -o "prosemirror-schema-basic-umd.js"
curl -sL "https://unpkg.com/prosemirror-schema-list@1.4.0/dist/index.umd.js" -o "prosemirror-schema-list-umd.js"
curl -sL "https://unpkg.com/prosemirror-dropcursor@1.8.1/dist/index.umd.js" -o "prosemirror-dropcursor-umd.js"
curl -sL "https://unpkg.com/prosemirror-gapcursor@1.3.2/dist/index.umd.js" -o "prosemirror-gapcursor-umd.js"
curl -sL "https://unpkg.com/prosemirror-history@1.4.1/dist/index.umd.js" -o "prosemirror-history-umd.js"
curl -sL "https://unpkg.com/prosemirror-inputrules@1.4.0/dist/index.umd.js" -o "prosemirror-inputrules-umd.js"

echo "UMD файлы загружены:"
ls -lh *umd.js
