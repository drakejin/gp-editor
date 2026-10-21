#!/usr/bin/env bash
# Packages the Release build for distribution: an arm64-only zip (Apple silicon) and a universal zip
# (arm64 + x86_64), both ad-hoc signed with the app's own entitlements, plus SHA-256 sums.
# Usage: scripts/release/package.sh   (after npm run build:macos)   → macos/build/release/
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILT_APP="${APP_DIR}/macos/build/DerivedData/Build/Products/Release/GPEditor.app"
OUT="${APP_DIR}/macos/build/release"
STAGE="${OUT}/stage"

[[ -d "$BUILT_APP" ]] || { echo "[release] error: build first (npm run build:macos)" >&2; exit 1; }
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$BUILT_APP/Contents/Info.plist")"
rm -rf "$OUT"
mkdir -p "$STAGE/arm64" "$STAGE/universal"

# The entitlements Xcode signed the app with (App Sandbox, user-selected files).
ENTITLEMENTS="${OUT}/entitlements.plist"
codesign -d --entitlements - --xml "$BUILT_APP" > "$ENTITLEMENTS" 2>/dev/null

# sign_app <app> — frameworks first, then the app with its entitlements (ad-hoc: there is no Developer ID).
sign_app() {
    local app="$1"
    find "$app/Contents/Frameworks" -maxdepth 1 -name "*.framework" -print0 2>/dev/null |
        xargs -0 -I{} codesign --force --sign - --timestamp=none {}
    codesign --force --sign - --timestamp=none --entitlements "$ENTITLEMENTS" "$app"
    codesign --verify --deep --strict "$app"
}

# thin_app <app> <arch> — keep one architecture in every Mach-O file of the bundle.
thin_app() {
    local app="$1" arch="$2"
    while IFS= read -r -d '' file; do
        if lipo -info "$file" 2>/dev/null | grep -q "Architectures in the fat file"; then
            lipo -thin "$arch" "$file" -output "$file.thin" && mv "$file.thin" "$file"
        fi
    done < <(find "$app" -type f -perm +111 -print0)
}

ditto "$BUILT_APP" "$STAGE/universal/GPEditor.app"
ditto "$BUILT_APP" "$STAGE/arm64/GPEditor.app"
thin_app "$STAGE/arm64/GPEditor.app" arm64
sign_app "$STAGE/arm64/GPEditor.app"
sign_app "$STAGE/universal/GPEditor.app"

for variant in arm64 universal; do
    zip="GPEditor-${VERSION}-macos-${variant}.zip"
    (cd "$STAGE/$variant" && ditto -c -k --sequesterRsrc --keepParent GPEditor.app "${OUT}/${zip}")
    echo "[release] ${zip}: $(lipo -archs "$STAGE/$variant/GPEditor.app/Contents/MacOS/GPEditor")"
done
(cd "$OUT" && shasum -a 256 ./*.zip | sed 's#\./##' > SHA256SUMS.txt && cat SHA256SUMS.txt)
