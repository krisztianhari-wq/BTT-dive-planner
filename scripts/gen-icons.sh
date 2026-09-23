#!/usr/bin/env bash
# Regenerates every app icon from the sources in src-tauri/icons:
#   app-icon-source.png          desktop + iOS (kraken drawing on white, large)
#   app-icon-android-source.png  Android (smaller drawing: adaptive icons show only the central ~60 %)
# Run after `tauri android init` / `tauri ios init` (the generated projects hold the mobile icons).
# Both sources are made from badge-source.png with scripts/mkicon.swift (see the numbers below).
set -euo pipefail
cd "$(dirname "$0")/.."
ANDROID_RES=src-tauri/gen/android/app/src/main/res
if [ -d "$ANDROID_RES" ]; then
  npx tauri icon src-tauri/icons/app-icon-android-source.png --ios-color '#ffffff' >/dev/null
  rm -rf /tmp/btt-android-icons && mkdir -p /tmp/btt-android-icons
  cp -R "$ANDROID_RES"/mipmap-* /tmp/btt-android-icons/
fi
npx tauri icon src-tauri/icons/app-icon-source.png --ios-color '#ffffff' >/dev/null
if [ -d "$ANDROID_RES" ]; then
  cp -R /tmp/btt-android-icons/mipmap-* "$ANDROID_RES"/
fi
echo "icons regenerated"
# sources: swift scripts/mkicon.swift src-tauri/icons/badge-source.png src-tauri/icons/app-icon-source.png 156 440
#          swift scripts/mkicon.swift src-tauri/icons/badge-source.png src-tauri/icons/app-icon-android-source.png 156 300
