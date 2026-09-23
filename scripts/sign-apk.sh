#!/usr/bin/env bash
# Signs the release APK produced by `tauri android build --apk`.
# Uses the club keystore from the ANDROID_KEYSTORE_B64 / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS
# secrets; without them a throw-away key is generated (installable, but the next version cannot update in place).
set -euo pipefail
BT="$ANDROID_HOME/build-tools/35.0.0"
IN=$(ls src-tauri/gen/android/app/build/outputs/apk/*/release/*-unsigned.apk | head -1)
mkdir -p dist-android
KS=$(mktemp -d)/release.jks
if [ -n "${ANDROID_KEYSTORE_B64:-}" ]; then
  echo "$ANDROID_KEYSTORE_B64" | base64 -d > "$KS"
  PASS="$ANDROID_KEYSTORE_PASSWORD"; ALIAS="${ANDROID_KEY_ALIAS:-btt}"
else
  echo "::warning::No ANDROID_KEYSTORE_B64 secret – signing with a throw-away key"
  PASS=$(head -c 24 /dev/urandom | base64); ALIAS=ci
  keytool -genkeypair -keystore "$KS" -storepass "$PASS" -keypass "$PASS" -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 3650 -dname "CN=BTT Dive Planner CI" >/dev/null
fi
OUT="dist-android/BTT.Dive.Planner_${VERSION#v}_arm64.apk"
"$BT/zipalign" -p -f 4 "$IN" "$OUT.aligned"
"$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$PASS" --ks-key-alias "$ALIAS" --out "$OUT" "$OUT.aligned"
rm -f "$OUT.aligned" "$KS"
"$BT/apksigner" verify --print-certs "$OUT" | head -3
ls -la dist-android
