#!/bin/sh
# Copy the PWA files (manifest, icons, service worker) next to the built ../index.html and stamp the
# service worker cache version with the build hash so installed copies update. Run after python3 build.py.
set -e
P=$(cd "$(dirname "$0")" && pwd); ROOT="$P/../.."
mkdir -p "$ROOT/icons"
cp "$P/manifest.webmanifest" "$ROOT/"
cp "$P"/icons/*.png "$ROOT/icons/"
B=$(sha1sum "$ROOT/index.html" | cut -c1-12)
sed "s/__BUILD__/$B/" "$P/sw.js" > "$ROOT/sw.js"
echo "PWA staged (build $B)"
