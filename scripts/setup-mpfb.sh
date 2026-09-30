#!/usr/bin/env bash
# One-time local setup for regenerating the human model. Requires Blender >= 4.2.
# Idempotent: every step verifies and skips when already done.
#
# Pinned toolchain (the versions used to build the committed public/models/human.glb, 2026-09-29):
#   MPFB 2.0.17 extension zip (content-addressed URL, verified by sha256 before install)
#   makehuman_system_assets_cc0.zip (verified by sha256 before use)
set -euo pipefail
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"

MPFB_VERSION="2.0.17"
MPFB_SHA256="4f0a879d64a39bf646fbf5f53601ac678855da329d650617dca5737548239a87"
MPFB_URL="https://extensions.blender.org/download/sha256:${MPFB_SHA256}/add-on-mpfb-v${MPFB_VERSION}.zip"
MPFB_ZIP=".cache/mpfb-${MPFB_VERSION}.zip"

ASSETS_SHA256="b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107"
ASSETS_URL="https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip"
ASSETS_ZIP=".cache/makehuman_system_assets_cc0.zip"

sha256_of() { shasum -a 256 "$1" | cut -d' ' -f1; }

# fetch_verified URL DEST SHA256: download to DEST.part, verify the hash, then move into place.
# An existing DEST with the wrong hash is discarded and downloaded again.
fetch_verified() {
  local url="$1" dest="$2" want="$3"
  if [ -f "$dest" ]; then
    if [ "$(sha256_of "$dest")" = "$want" ]; then
      echo "ok: $dest (sha256 verified)"
      return 0
    fi
    echo "$dest does not match the pinned sha256 $want; downloading it again." >&2
    rm -f "$dest"
  fi
  rm -f "$dest.part"
  curl -fL -o "$dest.part" "$url"
  local got
  got="$(sha256_of "$dest.part")"
  if [ "$got" != "$want" ]; then
    echo "sha256 mismatch for $url: expected $want, got $got" >&2
    rm -f "$dest.part"
    exit 1
  fi
  mv "$dest.part" "$dest"
  echo "downloaded: $dest (sha256 verified)"
}

# Prints the installed MPFB version, or nothing if MPFB is not installed.
installed_mpfb_version() {
  "$BLENDER" -b --python-exit-code 1 --python-expr '
import addon_utils, pathlib, tomllib
for m in addon_utils.modules():
    if m.__name__.split(".")[-1] == "mpfb":
        manifest = pathlib.Path(m.__file__).parent / "blender_manifest.toml"
        print("MPFB_VERSION=" + tomllib.loads(manifest.read_text())["version"])
        break
' | sed -n 's/^MPFB_VERSION=//p'
}

mkdir -p .cache

have="$(installed_mpfb_version)"
if [ -z "$have" ]; then
  fetch_verified "$MPFB_URL" "$MPFB_ZIP" "$MPFB_SHA256"
  # Installs the exact pinned zip into the user repository; no online sync needed, so no --online-mode.
  "$BLENDER" -b --python-exit-code 1 --command extension install-file -r user_default --enable "$MPFB_ZIP"
  have="$(installed_mpfb_version)"
fi
if [ "$have" != "$MPFB_VERSION" ]; then
  echo "MPFB $MPFB_VERSION is required but '${have:-none}' is installed. Remove the installed MPFB extension in Blender (Preferences > Get Extensions) and rerun." >&2
  exit 1
fi
echo "ok: MPFB $have installed"

fetch_verified "$ASSETS_URL" "$ASSETS_ZIP" "$ASSETS_SHA256"
"$BLENDER" -b --python-exit-code 1 --python assets-src/human/install_assets.py -- "$ASSETS_ZIP"
