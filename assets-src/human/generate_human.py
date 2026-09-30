"""Generate the CC0 human used by the figure system.
Usage: Blender -b --python-exit-code 1 --python generate_human.py -- <config.json> <out.glb> <meta.json>
Called by scripts/build-human.ts; see docs/figure-pipeline.md."""
import importlib
import json
import sys

import bpy


def dynamic_import(suffix, key):
    """MPFB is a Blender extension with an unknown package prefix; find it by suffix (from MPFB's script samples)."""
    for name in list(sys.modules):
        if name.endswith(suffix):
            return getattr(importlib.import_module(name), key)
    raise ValueError(f"No module ending in {suffix} - is the MPFB extension installed and enabled?")


HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
AssetService = dynamic_import("mpfb.services.assetservice", "AssetService")
ExportService = dynamic_import("mpfb.services.exportservice", "ExportService")
ObjectService = dynamic_import("mpfb.services.objectservice", "ObjectService")
TargetService = dynamic_import("mpfb.services.targetservice", "TargetService")

config_path, out_glb, out_meta = sys.argv[sys.argv.index("--") + 1:][:3]
with open(config_path) as f:
    cfg = json.load(f)

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

basemesh = HumanService.create_human(macro_detail_dict=cfg["macros"])
HumanService.add_builtin_rig(basemesh, "game_engine")

# Stature and skull top from the rigged body, measured before clothes are added: their delete-group masks
# hide the feet under the shoes. Blender Z-up is converted to glTF Y-up (x, z, -y).
depsgraph = bpy.context.evaluated_depsgraph_get()
evaluated = basemesh.evaluated_get(depsgraph)
mesh = evaluated.to_mesh()
points = [basemesh.matrix_world @ v.co for v in mesh.vertices]
top = max(points, key=lambda p: p.z)
bottom = min(p.z for p in points)
evaluated.to_mesh_clear()
with open(out_meta, "w") as f:
    json.dump({"statureM": top.z - bottom, "headTopM": [top.x, top.z, -top.y]}, f)

for subdir, fname, asset_type in cfg["assets"]:
    path = AssetService.find_asset_absolute_path(fname, asset_subdir=subdir)
    if path is None:
        raise RuntimeError(f"{subdir}/{fname} not found - run scripts/setup-mpfb.sh first")
    HumanService.add_mhclo_asset(path, basemesh, asset_type=asset_type, subdiv_levels=0, material_type="GAMEENGINE")

# Bake masks and helpers into a copy so the original stays editable.
export_root = ExportService.create_character_copy(basemesh, name_suffix="_export")
export_body = ObjectService.find_object_of_type_amongst_nearest_relatives(export_root, "Basemesh")
# Bake the macro shape keys into the mesh (as MPFB's own export-copy operator does); otherwise the glTF export,
# which skips morph targets, would ship the unmorphed base shape under the fitted rig and clothes.
TargetService.bake_targets(export_body)
ExportService.bake_modifiers_remove_helpers(export_body, bake_masks=True, bake_subdiv=True, remove_helpers=True, also_proxy=True)

# Stable node names for the web layer.
clothes = 0
for obj in [export_root, *ObjectService.get_list_of_children(export_root)]:
    kind = ObjectService.get_object_type(obj)
    if kind == "Skeleton":
        obj.name = "Armature"
        continue
    if obj.type != "MESH":
        continue
    if kind == "Basemesh":
        name = "Body"
    elif kind == "Clothes":
        clothes += 1
        name = f"Clothes_{clothes}"
    else:
        name = kind
    obj.name = name
    obj.data.name = name

bpy.ops.object.select_all(action="DESELECT")
export_root.select_set(True)
for child in ObjectService.get_list_of_children(export_root):
    child.select_set(True)
bpy.context.view_layer.objects.active = export_root
bpy.ops.export_scene.gltf(
    filepath=out_glb,
    export_format="GLB",
    use_selection=True,
    export_skins=True,
    export_animations=False,
    export_morph=False,
    export_yup=True,
    export_apply=False,
    export_materials="EXPORT",
    export_image_format="WEBP",
)
print(f"Wrote {out_glb} and {out_meta}")
