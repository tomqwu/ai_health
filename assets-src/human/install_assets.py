"""Extract the MakeHuman system asset pack into MPFB's user data folder.
Usage: Blender -b --python-exit-code 1 --python install_assets.py -- <makehuman_system_assets_cc0.zip>"""
import importlib
import sys
import zipfile


def dynamic_import(suffix, key):
    """MPFB is a Blender extension with an unknown package prefix; find it by suffix (from MPFB's script samples)."""
    for name in list(sys.modules):
        if name.endswith(suffix):
            return getattr(importlib.import_module(name), key)
    raise ValueError(f"No module ending in {suffix} - is the MPFB extension installed and enabled?")


LocationService = dynamic_import("mpfb.services.locationservice", "LocationService")
zip_path = sys.argv[sys.argv.index("--") + 1]
data_dir = LocationService.get_user_data()
with zipfile.ZipFile(zip_path) as z:
    z.extractall(data_dir)
print(f"Installed MakeHuman system assets into {data_dir}")
