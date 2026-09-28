#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SDK=/tmp/androidsdk
BT="$SDK/android-14"
AJAR="$SDK/android-34/android.jar"
AAPT2="$BT/aapt2"
D8="$BT/d8"
ZIPALIGN="$BT/zipalign"
APKSIGNER="$BT/apksigner"
export PATH="$BT:$PATH"

SRC="$ROOT/app/src/main"
WORK="$ROOT/build"
OUT="$ROOT/dist"
rm -rf "$WORK" "$OUT"
mkdir -p "$WORK/res" "$WORK/gen" "$WORK/classes" "$OUT"

echo "== compile resources"
mkdir -p "$WORK/flat"
"$AAPT2" compile --dir "$SRC/res" -o "$WORK/flat"
FLAT_ZIP="$WORK/compiled.zip"
rm -f "$FLAT_ZIP"
python3 - << PY
import os, zipfile
src = "$WORK/flat"
out = "$FLAT_ZIP"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for name in os.listdir(src):
        z.write(os.path.join(src, name), name)
print("flat zip", os.path.getsize(out))
PY

echo "== link"
"$AAPT2" link \
  -o "$WORK/app-unsigned.apk" \
  -I "$AJAR" \
  --manifest "$SRC/AndroidManifest.xml" \
  --java "$WORK/gen" \
  --auto-add-overlay \
  -A "$SRC/assets" \
  "$WORK/flat"/*.flat

echo "== javac"
find "$SRC/java" -name '*.java' > "$WORK/sources.list"
javac --release 8 \
  -cp "$AJAR" \
  -d "$WORK/classes" \
  @"$WORK/sources.list"

echo "== d8"
find "$WORK/classes" -name '*.class' > "$WORK/classes.list"
"$D8" --lib "$AJAR" --min-api 24 --output "$WORK" @"$WORK/classes.list"

echo "== inject dex"
python3 - << PY
import zipfile
apk = "$WORK/app-unsigned.apk"
with zipfile.ZipFile(apk, "a", zipfile.ZIP_DEFLATED) as z:
    z.write("$WORK/classes.dex", "classes.dex")
print("dex injected")
PY

echo "== zipalign"
"$ZIPALIGN" -f -p 4 "$WORK/app-unsigned.apk" "$WORK/app-aligned.apk"

KS="$ROOT/release.keystore"
KSPASS="${RELEASE_STORE_PASS:-goarxyz-release}"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass "$KSPASS" -keypass "$KSPASS" \
    -alias goarxyz -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=goarxyz, OU=release, O=goarxyz, L=Internet, ST=NA, C=US"
fi

echo "== sign release"
"$APKSIGNER" sign \
  --ks "$KS" --ks-key-alias goarxyz \
  --ks-pass pass:"$KSPASS" --key-pass pass:"$KSPASS" \
  --v1-signing-enabled true \
  --v2-signing-enabled true \
  --v3-signing-enabled true \
  --out "$OUT/goarxyz-release.apk" "$WORK/app-aligned.apk"

"$APKSIGNER" verify --verbose "$OUT/goarxyz-release.apk" | head -20
ls -lh "$OUT/goarxyz-release.apk"
echo "OK $OUT/goarxyz-release.apk"
