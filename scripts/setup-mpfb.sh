#!/usr/bin/env bash
# One-time local setup for regenerating the human model. Requires Blender >= 4.2.
set -euo pipefail
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
ZIP=".cache/makehuman_system_assets_cc0.zip"
# --online-mode: allow the extension sync even when Blender's "Allow Online Access" preference is off.
EXTENSIONS="$("$BLENDER" -b --command extension list 2>/dev/null)"
if ! grep -q "mpfb \[installed\]" <<<"$EXTENSIONS"; then
  "$BLENDER" -b --online-mode --command extension install --sync --enable mpfb
fi
mkdir -p .cache
[ -f "$ZIP" ] || curl -fL -o "$ZIP" https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
"$BLENDER" -b --python-exit-code 1 --python assets-src/human/install_assets.py -- "$ZIP"
