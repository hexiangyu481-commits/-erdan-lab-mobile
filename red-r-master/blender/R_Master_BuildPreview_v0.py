"""Build + render a non-destructive R Master proportion preview from Mona.blend.

Run from Blender 4.4+ in background mode. The script duplicates Mona's armature and
armature-driven meshes, applies only the v0 safe proportion preview, renders neutral
front/side/three-quarter diagnostic images, writes a JSON report, then saves a NEW
.blend file. It never overwrites the source file.
"""

import bpy
import json
import math
import os
import sys
from mathutils import Vector

SOURCE_ARMATURE = "Mona_Armature"
OUTPUT_COLLECTION = "R_MASTER_ALIGN_V0_PREVIEW"
OUTPUT_ARMATURE = "R_Master_Align_v0_PREVIEW"

R = {
    "upper_leg": 1.1405289929632538,
    "lower_leg": 1.0076476838602682,
    "foot": 0.7300896881265233,
    "upper_arm": 0.835908431129289,
    "lower_arm": 0.8777449836032585,
    "torso": 0.9509278038639217,
    "neck_head": 0.9446817081669817,
}

SAFE_SCALE_BONES = {
    "UpperLeg.L": R["upper_leg"],
    "UpperLeg.R": R["upper_leg"],
    "LowerLeg.L": R["lower_leg"],
    "LowerLeg.R": R["lower_leg"],
    "Foot.L": R["foot"],
    "Foot.R": R["foot"],
    "UpperArm.L": R["upper_arm"],
    "UpperArm.R": R["upper_arm"],
    "LowerArm.L": R["lower_arm"],
    "LowerArm.R": R["lower_arm"],
    "UpperBody1": R["torso"],
    "UpperBody2": R["torso"],
    "UpperBody3": R["torso"],
    "Neck1": R["neck_head"],
    "Neck2": R["neck_head"],
}

PROTECTED_EXACT = {
    "Labia.L", "Labia.R", "Rectum", "Asshole", "AssholeSide.L",
    "AssholeSide.R", "Ass.L", "Ass.R", "Assbutt.L", "Assbutt.R",
    "LowerJaw", "MidJaw", "UpperJaw", "UpperTeeth", "LowerTeeth",
    "TongueRoot", "Tongue1", "Tongue2", "Tongue3", "TongueTip",
    "Throat1", "Throat2", "Uvula1", "Uvula2",
}


def argv_after_dashes():
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1:]


def parse_args():
    args = argv_after_dashes()
    out_dir = None
    for i, arg in enumerate(args):
        if arg == "--out" and i + 1 < len(args):
            out_dir = args[i + 1]
    if not out_dir:
        base = os.path.dirname(os.path.abspath(bpy.data.filepath or os.getcwd()))
        out_dir = os.path.join(base, "R_Master_v0_Output")
    return os.path.abspath(out_dir)


def fail(msg):
    raise RuntimeError("R Master v0: " + msg)


def get_source_armature():
    obj = bpy.data.objects.get(SOURCE_ARMATURE)
    if not obj or obj.type != "ARMATURE":
        fail(f"armature object '{SOURCE_ARMATURE}' not found")
    return obj


def dependent_meshes(source):
    out = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        uses_source = any(m.type == "ARMATURE" and m.object == source for m in obj.modifiers)
        if uses_source or obj.parent == source:
            out.append(obj)
    return out


def remove_old_preview_collection():
    col = bpy.data.collections.get(OUTPUT_COLLECTION)
    if not col:
        return
    for obj in list(col.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(col)


def duplicate_for_preview(source):
    remove_old_preview_collection()
    col = bpy.data.collections.new(OUTPUT_COLLECTION)
    bpy.context.scene.collection.children.link(col)

    rig = source.copy()
    rig.data = source.data.copy()
    rig.name = OUTPUT_ARMATURE
    rig.data.name = OUTPUT_ARMATURE + "_DATA"
    rig.animation_data_clear()
    col.objects.link(rig)

    mesh_pairs = []
    for src in dependent_meshes(source):
        dup = src.copy()
        dup.data = src.data.copy()
        dup.name = "R0_" + src.name
        dup.animation_data_clear()
        col.objects.link(dup)
        dup.matrix_world = src.matrix_world.copy()
        if dup.parent == source:
            dup.parent = rig
        for mod in dup.modifiers:
            if mod.type == "ARMATURE" and mod.object == source:
                mod.object = rig
        mesh_pairs.append((src, dup))

    rig.matrix_world = source.matrix_world.copy()
    rig.show_in_front = True
    return rig, mesh_pairs, col


def validate_topology(rig):
    names = set(rig.data.bones.keys())
    missing = [n for n in SAFE_SCALE_BONES if n not in names]
    missing_protected = [n for n in PROTECTED_EXACT if n not in names]
    if missing:
        fail("required primary bones missing: " + ", ".join(sorted(missing)))
    if missing_protected:
        fail("protected Mona subsystem unexpectedly missing: " + ", ".join(sorted(missing_protected)))
    if len(names) < 500:
        fail(f"unexpected armature bone count {len(names)}; expected Mona's ~505-bone rig")
    return len(names)


def clear_pose(rig):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.transforms_clear()
    bpy.ops.pose.select_all(action="DESELECT")


def pose_length(pb):
    try:
        return float((pb.tail - pb.head).length)
    except Exception:
        return None


def apply_safe_preview(rig):
    before = {}
    for name in SAFE_SCALE_BONES:
        pb = rig.pose.bones.get(name)
        before[name] = pose_length(pb) if pb else None

    applied = []
    constrained = {}
    for name, ratio in SAFE_SCALE_BONES.items():
        pb = rig.pose.bones.get(name)
        if pb is None:
            continue
        live_constraints = [c.name for c in pb.constraints if c.influence > 0.0]
        if live_constraints:
            constrained[name] = live_constraints
        pb.scale.y *= ratio
        applied.append({"bone": name, "ratio": ratio})

    bpy.context.view_layer.update()
    after = {}
    for name in SAFE_SCALE_BONES:
        pb = rig.pose.bones.get(name)
        after[name] = pose_length(pb) if pb else None
    return applied, constrained, before, after


def mark_preview(rig):
    rig["red_master_stage"] = "R_Master_ProportionPreview_v0"
    rig["red_master_source"] = "Mona.blend"
    rig["red_master_target_style"] = "Lapine dimensions / Mona A-pose"
    rig["red_master_restpose_baked"] = False
    rig["red_master_hip_width_deferred"] = True
    rig["red_master_notes"] = (
        "Non-destructive pose preview. Do not export as final VRM. "
        "Pelvis width, anatomy rebalance, rest-pose bake and weights remain deferred."
    )


def world_bounds(objects):
    pts = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        for c in obj.bound_box:
            pts.append(obj.matrix_world @ Vector(c))
    if not pts:
        fail("no mesh bounds available for preview")
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def ensure_camera():
    cam_data = bpy.data.cameras.new("R_Master_v0_Camera_DATA")
    cam = bpy.data.objects.new("R_Master_v0_Camera", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    cam.data.lens = 70
    return cam


def setup_workbench():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.display.shading.light = "STUDIO"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "WORLD"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.background_type = "VIEWPORT"
    scene.display.shading.background_color = (0.055, 0.055, 0.065)
    return scene


def render_views(out_dir, preview_meshes, source, source_meshes):
    for obj in source_meshes:
        obj.hide_render = True
    source.hide_render = True

    scene = setup_workbench()
    cam = ensure_camera()
    mn, mx = world_bounds(preview_meshes)
    center = (mn + mx) * 0.5
    height = max(0.5, mx.z - mn.z)
    width = max(0.5, mx.x - mn.x)
    depth = max(0.5, mx.y - mn.y)
    radius = max(height, width, depth) * 0.75
    target = Vector((center.x, center.y, center.z + height * 0.02))

    views = {
        "front": Vector((center.x, center.y - radius * 3.0, center.z)),
        "side": Vector((center.x + radius * 3.0, center.y, center.z)),
        "three_quarter": Vector((center.x + radius * 2.15, center.y - radius * 2.15, center.z)),
    }

    outputs = {}
    for name, pos in views.items():
        cam.location = pos
        look_at(cam, target)
        cam.data.lens = 65
        path = os.path.join(out_dir, f"R_Master_v0_{name}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        outputs[name] = path
    return outputs, {"min": list(mn), "max": list(mx), "center": list(center)}


def main():
    out_dir = parse_args()
    os.makedirs(out_dir, exist_ok=True)

    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    source = get_source_armature()
    source_meshes = dependent_meshes(source)
    rig, mesh_pairs, _ = duplicate_for_preview(source)
    bone_count = validate_topology(rig)
    clear_pose(rig)
    applied, constrained, before, after = apply_safe_preview(rig)
    mark_preview(rig)
    bpy.ops.object.mode_set(mode="OBJECT")

    preview_meshes = [dup for _, dup in mesh_pairs]
    render_outputs, bounds = render_views(out_dir, preview_meshes, source, source_meshes)

    report = {
        "ok": True,
        "stage": "R_Master_ProportionPreview_v0",
        "source_file": os.path.abspath(bpy.data.filepath),
        "source_armature": SOURCE_ARMATURE,
        "output_armature": OUTPUT_ARMATURE,
        "bone_count": bone_count,
        "duplicated_mesh_count": len(mesh_pairs),
        "applied": applied,
        "constrained_scaled_bones": constrained,
        "pose_lengths_before": before,
        "pose_lengths_after": after,
        "hip_width_change_applied": False,
        "rest_pose_baked": False,
        "bounds": bounds,
        "renders": render_outputs,
        "hard_stops": [
            "Do not use this v0 as final VRM",
            "Do not bake rest pose before visual/anatomy validation",
            "Hip width target 0.6601185034 remains deferred",
            "Do not delete/rename adult anatomy, oral, face, finger, IK or control bones",
        ],
    }

    report_path = os.path.join(out_dir, "R_Master_v0_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    out_blend = os.path.join(out_dir, "R_Master_Align_v0_PREVIEW.blend")
    bpy.ops.wm.save_as_mainfile(filepath=out_blend, check_existing=False)

    print("[R Master v0] BUILD_OK")
    print("[R Master v0] blend:", out_blend)
    print("[R Master v0] report:", report_path)
    for k, v in render_outputs.items():
        print(f"[R Master v0] render {k}: {v}")


if __name__ == "__main__":
    main()
