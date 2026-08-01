#!/bin/bash
set -e

TIPTAP_DIR="/workspace/RPulsar/libs/tiptap"
cd "$TIPTAP_DIR"

echo "Скачивание библиотек Tiptap и ProseMirror с unpkg..."

# Версии библиотек
PROSEMIRROR_MODEL_VERSION="1.19.4"
PROSEMIRROR_STATE_VERSION="1.4.3"
PROSEMIRROR_TRANSFORM_VERSION="1.9.2"
PROSEMIRROR_VIEW_VERSION="3.27.0"
PROSEMIRROR_KEYMAP_VERSION="1.2.2"
PROSEMIRROR_COMMANDS_VERSION="1.5.2"
PROSEMIRROR_SCHEMA_BASIC_VERSION="1.2.3"
PROSEMIRROR_SCHEMA_LIST_VERSION="1.4.0"
PROSEMIRROR_DROPCURSOR_VERSION="1.8.1"
PROSEMIRROR_GAPCURSOR_VERSION="1.3.2"
PROSEMIRROR_HISTORY_VERSION="1.4.1"
PROSEMIRROR_INPUTRULES_VERSION="1.4.0"
TIPTAP_CORE_VERSION="2.4.0"
TIPTAP_STARTER_KIT_VERSION="2.4.0"
TIPTAP_EXTENSION_PLACEHOLDER_VERSION="2.4.0"

download_file() {
    local url=$1
    local output=$2
    echo "Загрузка: $output"
    curl -sL "$url" -o "$output" || wget -q "$url" -O "$output"
}

# Скачиваем ProseMirror
download_file "https://unpkg.com/prosemirror-model@${PROSEMIRROR_MODEL_VERSION}/dist/index.js" "prosemirror-model.js"
download_file "https://unpkg.com/prosemirror-state@${PROSEMIRROR_STATE_VERSION}/dist/index.js" "prosemirror-state.js"
download_file "https://unpkg.com/prosemirror-transform@${PROSEMIRROR_TRANSFORM_VERSION}/dist/index.js" "prosemirror-transform.js"
download_file "https://unpkg.com/prosemirror-view@${PROSEMIRROR_VIEW_VERSION}/dist/index.js" "prosemirror-view.js"
download_file "https://unpkg.com/prosemirror-keymap@${PROSEMIRROR_KEYMAP_VERSION}/dist/index.js" "prosemirror-keymap.js"
download_file "https://unpkg.com/prosemirror-commands@${PROSEMIRROR_COMMANDS_VERSION}/dist/index.js" "prosemirror-commands.js"
download_file "https://unpkg.com/prosemirror-schema-basic@${PROSEMIRROR_SCHEMA_BASIC_VERSION}/dist/index.js" "prosemirror-schema-basic.js"
download_file "https://unpkg.com/prosemirror-schema-list@${PROSEMIRROR_SCHEMA_LIST_VERSION}/dist/index.js" "prosemirror-schema-list.js"
download_file "https://unpkg.com/prosemirror-dropcursor@${PROSEMIRROR_DROPCURSOR_VERSION}/dist/index.js" "prosemirror-dropcursor.js"
download_file "https://unpkg.com/prosemirror-gapcursor@${PROSEMIRROR_GAPCURSOR_VERSION}/dist/index.js" "prosemirror-gapcursor.js"
download_file "https://unpkg.com/prosemirror-history@${PROSEMIRROR_HISTORY_VERSION}/dist/index.js" "prosemirror-history.js"
download_file "https://unpkg.com/prosemirror-inputrules@${PROSEMIRROR_INPUTRULES_VERSION}/dist/index.js" "prosemirror-inputrules.js"

# Скачиваем Tiptap
download_file "https://unpkg.com/@tiptap/core@${TIPTAP_CORE_VERSION}/dist/index.umd.js" "tiptap-core.js"
download_file "https://unpkg.com/@tiptap/starter-kit@${TIPTAP_STARTER_KIT_VERSION}/dist/index.umd.js" "tiptap-starter-kit.js"
download_file "https://unpkg.com/@tiptap/extension-placeholder@${TIPTAP_EXTENSION_PLACEHOLDER_VERSION}/dist/index.umd.js" "tiptap-extension-placeholder.js"

echo "Все файлы загружены!"
ls -lh *.js
