#!/usr/bin/env bash
# Builds the encoders File ▸ Export Audio… links: LAME (MP3, LGPL — the app is LGPL-2.1-or-later and open source) and
# libvorbis + libogg (Ogg Vorbis, BSD). Downloads each pinned source release from its official site, checks its
# SHA-256, and builds universal (arm64 + x86_64) static libraries for the app's macOS version into
# macos/ThirdParty/audio-codecs/ (git-ignored; the Xcode target's header and library search paths point there). Needs
# only Xcode's command line tools — no Homebrew. Cached: does nothing when that folder already holds this build.
# Their license texts are in macos/GPEditor-macOS/Licenses/ (shipped in the app). npm run build:macos runs this.
# Usage: scripts/audio-codecs/fetch.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST="${APP_DIR}/macos/ThirdParty/audio-codecs"
MIN_MACOS="14.0"
ARCHS=(arm64 x86_64)

# name|version|url|sha256 (the SHA-256 sums Xiph publishes in releases/*/SHA256SUMS; LAME's matches its SourceForge release).
LAME="lame|3.100|https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz|ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e"
OGG="libogg|1.3.6|https://downloads.xiph.org/releases/ogg/libogg-1.3.6.tar.xz|5c8253428e181840cd20d41f3ca16557a9cc04bad4a3d04cce84808677fa1061"
VORBIS="libvorbis|1.3.7|https://downloads.xiph.org/releases/vorbis/libvorbis-1.3.7.tar.xz|b33cc4934322bcbf6efcbacf49e3ca01aadbea4114ec9589d1b1e9d20f72954b"
STAMP="lame-3.100 libogg-1.3.6 libvorbis-1.3.7 macos-${MIN_MACOS} ${ARCHS[*]}"

if [[ -f "${DEST}/.stamp" && "$(cat "${DEST}/.stamp")" == "$STAMP" ]]; then
    exit 0
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/gp-audio-codecs.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
JOBS="$(sysctl -n hw.ncpu)"
SDK="$(xcrun --sdk macosx --show-sdk-path)"

field() { cut -d'|' -f"$2" <<<"$1"; }
checksum() { shasum -a 256 "$1" | cut -d' ' -f1; }

# fetch <spec> → the unpacked source folder's path
fetch() {
    local name version url sha archive
    name="$(field "$1" 1)" version="$(field "$1" 2)" url="$(field "$1" 3)" sha="$(field "$1" 4)"
    archive="${WORK}/$(basename "$url")"
    echo "[audio-codecs] downloading ${name} ${version}…" >&2
    if ! curl --fail --silent --show-error --location --retry 3 --retry-delay 2 --connect-timeout 20 --output "$archive" "$url"; then
        echo "[audio-codecs] error: could not download ${url} (offline?). Export Audio's MP3 and Ogg encoders need it once." >&2
        exit 1
    fi
    if [[ "$(checksum "$archive")" != "$sha" ]]; then
        echo "[audio-codecs] error: checksum mismatch for ${url}" >&2
        exit 1
    fi
    tar -xf "$archive" -C "$WORK"
    echo "${WORK}/${name}-${version}"
}

# build <source> <arch> <prefix> <configure args…>: configure + make install of one architecture, quietly (the log
# is printed when it fails).
build() {
    local source="$1" arch="$2" prefix="$3"
    shift 3
    local host="${arch/arm64/aarch64}-apple-darwin"
    local log="${WORK}/$(basename "$source")-${arch}.log"
    local flags="-arch ${arch} -isysroot ${SDK} -mmacosx-version-min=${MIN_MACOS} -O2"
    rm -rf "${source}-${arch}"
    cp -R "$source" "${source}-${arch}"
    if ! (cd "${source}-${arch}" &&
        CC="$(xcrun --find clang)" CFLAGS="$flags" LDFLAGS="$flags" CPPFLAGS="-I${prefix}/include" \
            ./configure --host="$host" --prefix="$prefix" --disable-shared --enable-static --disable-dependency-tracking "$@" &&
        make -j"$JOBS" && make install) >"$log" 2>&1; then
        tail -40 "$log" >&2
        echo "[audio-codecs] error: building $(basename "$source") for ${arch} failed (log above)" >&2
        exit 1
    fi
}

LAME_SRC="$(fetch "$LAME")"
OGG_SRC="$(fetch "$OGG")"
VORBIS_SRC="$(fetch "$VORBIS")"
# libvorbis 1.3.7's configure adds -force_cpusubtype_ALL on Darwin, which arm64 linkers reject.
sed -i '' 's/ -force_cpusubtype_ALL//g' "${VORBIS_SRC}/configure"

for arch in "${ARCHS[@]}"; do
    prefix="${WORK}/prefix-${arch}"
    echo "[audio-codecs] building for ${arch}…"
    build "$OGG_SRC" "$arch" "$prefix"
    build "$VORBIS_SRC" "$arch" "$prefix" --with-ogg="$prefix" --disable-oggtest --disable-docs --disable-examples
    # Cross-compiling, LAME's configure cannot run its standard-headers test, and without it machine.h maps memcpy
    # to bcopy without <string.h>: tell it the answer.
    build "$LAME_SRC" "$arch" "$prefix" --disable-frontend --disable-decoder --disable-gtktest ac_cv_header_stdc=yes
done

rm -rf "$DEST"
mkdir -p "${DEST}/lib" "${DEST}/include"
for lib in libmp3lame libogg libvorbis libvorbisenc libvorbisfile; do
    lipo -create "${WORK}/prefix-${ARCHS[0]}/lib/${lib}.a" "${WORK}/prefix-${ARCHS[1]}/lib/${lib}.a" -output "${DEST}/lib/${lib}.a"
done
cp -R "${WORK}/prefix-${ARCHS[0]}/include/lame" "${WORK}/prefix-${ARCHS[0]}/include/ogg" "${WORK}/prefix-${ARCHS[0]}/include/vorbis" "${DEST}/include/"
# ogg/config_types.h is generated per architecture; both are 64-bit LP64 with the same sizes, so one serves both.
cmp -s "${WORK}/prefix-${ARCHS[0]}/include/ogg/config_types.h" "${WORK}/prefix-${ARCHS[1]}/include/ogg/config_types.h" ||
    { echo "[audio-codecs] error: ogg/config_types.h differs between ${ARCHS[*]}" >&2; exit 1; }
echo "$STAMP" > "${DEST}/.stamp"
echo "[audio-codecs] built ${DEST} ($(lipo -archs "${DEST}/lib/libmp3lame.a"))"
