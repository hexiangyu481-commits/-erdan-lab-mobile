"""R Master v1 — constraint-neutralized proportion + hip-width preview.

Runs on a COPY of Mona. It never overwrites the input source file.
This is still a diagnostic preview, not the final rest-rig or VRM.

v1 fixes the main v0 problem: Mona's IK / Copy Transforms / Limit Scale
constraints were masking or compounding the requested segment lengths.
The duplicated preview rig has only the relevant deformation constraints
neutralized, and local scale compensation is used so child segments hit
measured Lapine target lengths instead of inheriting unwanted parent scale.

The large hip-width change is also previewed on the duplicate only. Adult
anatomy/control bones are not independently edited; any intersections are
intentional diagnostic evidence for the next anatomy/weight pass.
"""

import bpy
import json
import math
import os
import sys
from mathutils import Vector

SOURCE_ARMATURE = "Mona_Armature"
SOURCE_BODY_MESH = "Mona_Main"
OUTPUT_COLLECTION = "R_MASTER_ALIGN_V1_PREVIEW"
OUTPUT_ARMATURE = "R_Master_Align_v1_PREVIEW"

TARGET = {
    "upper_leg_ratio": 1.1405289929632538,
    "lower_leg_ratio": 1.0076476838602682,
    "foot_ratio": 0.7300896881265233,
    "upper_arm_ratio": 0.835908431129289,
    "lower_arm_ratio": 0.8777449836032585,
    "torso_ratio": 0.9509278038639217,
    "hip_width_m": 0.13743670697774774,
    "mona_hip_width_m": 0.20820005238056188,
    "head_above_shoulder_ratio": 0.9225802119668229,
}

LOCAL_SCALE = {
    "UpperLeg.L": TARGET["upper_leg_ratio"],
    "UpperLeg.R": TARGET["upper_leg_ratio"],
    "LowerLeg.L": TARGET["lower_leg_ratio"] / TARGET["upper_leg_ratio"],
    "LowerLeg.R": TARGET["lower_leg_ratio"] / TARGET["upper_leg_ratio"],
    "Foot.L": TARGET["foot_ratio"] / TARGET["lower_leg_ratio"],
    "Foot.R": TARGET["foot_ratio"] / TARGET["lower_leg_ratio"],
    "UpperArm.L": TARGET["upper_arm_ratio"],
    "UpperArm.R": TARGET["upper_arm_ratio"],
    "LowerArm.L": TARGET["lower_arm_ratio"] / TARGET["upper_arm_ratio"],
    "LowerArm.R": TARGET["lower_arm_ratio"] / TARGET["upper_arm_ratio"],
    "Hand.L": 1.0 / TARGET["lower_arm_ratio"],
    "Hand.R": 1.0 / TARGET["lower_arm_ratio"],
    "UpperBody1": TARGET["torso_ratio"],
    "UpperBody2": 1.0,
    "UpperBody3": 1.0,
    "Neck1": TARGET["head_above_shoulder_ratio"] / TARGET["torso_ratio"],
    "Neck2": 1.0,
    "Head": 1.0 / TARGET["head_above_shoulder_ratio"],
}

MEASURE_BONES = [
    "UpperLeg.L", "UpperLeg.R", "LowerLeg.L", "LowerLeg.R",
    "Foot.L", "Foot.R", "UpperArm.L", "UpperArm.R",
    "LowerArm.L", "LowerArm.R",
]

EXPECTED_GLOBAL_RATIOS = {
    "UpperLeg.L": TARGET["upper_leg_ratio"],
    "UpperLeg.R": TARGET["upper_leg_ratio"],
    "LowerLeg.L": TARGET["lower_leg_ratio"],
    "LowerLeg.R": TARGET["lower_leg_ratio"],
    "Foot.L": TARGET["foot_ratio"],
    "Foot.R": TARGET["foot_ratio"],
    "UpperArm.L": TARGET["upper_arm_ratio"],
    "UpperArm.R": TARGET["upper_arm_ratio"],
    "LowerArm.L": TARGET["lower_arm_ratio"],
    "LowerArm.R": TARGET["lower_arm_ratio"],
}

CONSTRAINT_NEUTRALIZE_BONES = set(LOCAL_SCALE) | {
    "Toe.L", "Toe.R", "Shoulder.L", "Shoulder.R"
}

PROTECTED_EXACT = {
    "Labia.L", "Labia.R", "Rectum", "Asshole", "AssholeSide.L",
    "AssholeSide.R", "Ass.L", "Ass.R", "Assbutt.L", "Assbutt.R",
    "LowerJaw", "MidJaw", "UpperJaw", "UpperTeeth", "LowerTeeth",
    "TongueRoot", "Tongue1", "Tongue2", "Tongue3", "TongueTip",
    "Throat1", "Throat2", "Uvula1", "Uvula2",
}

def argv_after_dashes():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

def parse_args():
    args = argv_after_dashes()
    out_dir = None
    for i, arg in enumerate(args):
        if arg == "--out" and i + 1 < len(args):
            out_dir = args[i + 1]
    if not out_dir:
        base = os.path.dirname(os.path.abspath(bpy.data.filepath or os.getcwd()))
        out_dir = os.path.join(base, "R_Master_v1_Output")
    return os.path.abspath(out_dir)

def fail(msg):
    raise RuntimeError("R Master v1: " + msg)

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

def remove_previous_preview_collections():
    for name in ["R_MASTER_ALIGN_V0_PREVIEW", OUTPUT_COLLECTION]:
        col = bpy.data.collections.get(name)
        if not col:
            continue
        for obj in list(col.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(col)

def duplicate_for_preview(source):
    remove_previous_preview_collections()
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
        dup.name = "R1_" + src.name
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
    return rig, mesh_pairs

def validate_topology(rig):
    names = set(rig.data.bones.keys())
    needed = set(LOCAL_SCALE) | {"UpperLeg.L", "UpperLeg.R"}
    missing = sorted(n for n in needed if n not in names)
    protected_missing = sorted(n for n in PROTECTED_EXACT if n not in names)
    if missing:
        fail("required primary bones missing: " + ", ".join(missing))
    if protected_missing:
        fail("protected Mona subsystem unexpectedly missing: " + ", ".join(protected_missing))
    if len(names) < 500:
        fail(f"unexpected armature bone count {len(names)}; expected Mona's ~505-bone rig")
    return len(names)

def select_pose_rig(rig):
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")

def clear_pose(rig):
    select_pose_rig(rig)
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.transforms_clear()
    bpy.ops.pose.select_all(action="DESELECT")
    bpy.context.view_layer.update()

def neutralize_constraints(rig):
    changed = {}
    for bone_name in sorted(CONSTRAINT_NEUTRALIZE_BONES):
        pb = rig.pose.bones.get(bone_name)
        if not pb:
            continue
        for c in pb.constraints:
            if c.influence == 0.0:
                continue
            changed.setdefault(bone_name, []).append({
                "name": c.name, "type": c.type, "old_influence": float(c.influence)
            })
            c.influence = 0.0
    bpy.context.view_layer.update()
    return changed

def pose_length(pb):
    return float(pb.vector.length)

def measure_lengths(rig):
    return {name: pose_length(rig.pose.bones[name]) for name in MEASURE_BONES}

def apply_local_scales(rig):
    applied = []
    for name, scale_y in LOCAL_SCALE.items():
        pb = rig.pose.bones.get(name)
        if not pb:
            continue
        pb.scale.y = float(scale_y)
        applied.append({"bone": name, "local_scale_y": float(scale_y)})
    bpy.context.view_layer.update()
    return applied

def hip_width(rig):
    l = rig.pose.bones["UpperLeg.L"]
    r = rig.pose.bones["UpperLeg.R"]
    return abs(float(l.head.x - r.head.x))

def move_pose_bone_world_x(pb, delta_x):
    m = pb.matrix.copy()
    m.translation.x += float(delta_x)
    pb.matrix = m

def apply_hip_width_preview(rig):
    bpy.context.view_layer.update()
    l = rig.pose.bones["UpperLeg.L"]
    r = rig.pose.bones["UpperLeg.R"]
    before = hip_width(rig)
    center = (float(l.head.x) + float(r.head.x)) * 0.5
    half = TARGET["hip_width_m"] * 0.5
    l_target = center + (half if l.head.x >= center else -half)
    r_target = center + (half if r.head.x >= center else -half)
    move_pose_bone_world_x(l, l_target - float(l.head.x))
    bpy.context.view_layer.update()
    move_pose_bone_world_x(r, r_target - float(r.head.x))
    bpy.context.view_layer.update()
    after = hip_width(rig)
    return {"before": before, "target": TARGET["hip_width_m"], "after": after}

def mark_preview(rig):
    rig["red_master_stage"] = "R_Master_ProportionPreview_v1"
    rig["red_master_source"] = "Mona.blend-compatible working copy"
    rig["red_master_target_style"] = "Lapine measured proportions / Mona A-pose"
    rig["red_master_restpose_baked"] = False
    rig["red_master_constraints_neutralized_on_preview"] = True
    rig["red_master_hip_width_previewed"] = True
    rig["red_master_notes"] = (
        "Diagnostic duplicate only. Do not export as final VRM. Adult anatomy, face, oral, fingers, IK controls and weights need dedicated validation before rest-rig bake."
    )

def world_bounds(objects):
    pts = []
    for obj in objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        for c in obj.bound_box:
            pts.append(obj.matrix_world @ Vector(c))
    if not pts:
        fail("no visible mesh bounds available")
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx

def ensure_camera():
    cam_data = bpy.data.cameras.get("R_Master_v1_Camera_DATA") or bpy.data.cameras.new("R_Master_v1_Camera_DATA")
    cam = bpy.data.objects.get("R_Master_v1_Camera")
    if not cam:
        cam = bpy.data.objects.new("R_Master_v1_Camera", cam_data)
        bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    cam.data.type = "ORTHO"
    return cam

def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

def setup_workbench(single_color=(0.56, 0.56, 0.60)):
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
    scene.display.shading.color_type = "SINGLE"
    scene.display.shading.single_color = single_color
    scene.display.shading.background_type = "VIEWPORT"
    scene.display.shading.background_color = (0.045, 0.045, 0.055)
    return scene

def set_render_visibility(all_meshes, visible_meshes):
    visible = set(visible_meshes)
    for obj in all_meshes:
        obj.hide_render = obj not in visible

def render_body_views(out_dir, preview_meshes, source, source_meshes):
    preview_body = None
    for src, dup in preview_meshes:
        if src.name == SOURCE_BODY_MESH or src.data.name == SOURCE_BODY_MESH:
            preview_body = dup
            break
    if preview_body is None:
        def volume(obj):
            bb = [Vector(c) for c in obj.bound_box]
            xs, ys, zs = [p.x for p in bb], [p.y for p in bb], [p.z for p in bb]
            return max(1e-9, (max(xs)-min(xs))*(max(ys)-min(ys))*(max(zs)-min(zs)))
        preview_body = max((dup for _, dup in preview_meshes), key=volume)

    source.hide_render = True
    for obj in source_meshes:
        obj.hide_render = True
    set_render_visibility([dup for _, dup in preview_meshes], [preview_body])

    scene = setup_workbench()
    cam = ensure_camera()
    mn, mx = world_bounds([preview_body])
    center = (mn + mx) * 0.5
    height = max(0.5, mx.z - mn.z)
    width = max(0.3, mx.x - mn.x)
    depth = max(0.3, mx.y - mn.y)
    dist = max(height, width, depth) * 2.4
    cam.data.ortho_scale = height * 1.10
    target = Vector((center.x, center.y, center.z))

    views = {
        "front": Vector((center.x, center.y - dist, center.z)),
        "side": Vector((center.x + dist, center.y, center.z)),
        "three_quarter": Vector((center.x + dist * 0.72, center.y - dist * 0.72, center.z)),
    }
    outputs = {}
    for name, pos in views.items():
        cam.location = pos
        look_at(cam, target)
        path = os.path.join(out_dir, f"R_Master_v1_body_{name}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        outputs[name] = path
    return outputs, preview_body.name, {"min": list(mn), "max": list(mx), "center": list(center)}

def ratio_report(before, after):
    rows = {}
    max_rel_error = 0.0
    for name, target_ratio in EXPECTED_GLOBAL_RATIOS.items():
        actual_ratio = after[name] / before[name] if before[name] else None
        rel_error = abs(actual_ratio - target_ratio) / target_ratio if actual_ratio else None
        rows[name] = {
            "before": before[name],
            "after": after[name],
            "target_ratio": target_ratio,
            "actual_ratio": actual_ratio,
            "relative_error": rel_error,
        }
        if rel_error is not None:
            max_rel_error = max(max_rel_error, rel_error)
    return rows, max_rel_error

def main():
    out_dir = parse_args()
    os.makedirs(out_dir, exist_ok=True)
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    source = get_source_armature()
    source_meshes = dependent_meshes(source)
    rig, mesh_pairs = duplicate_for_preview(source)
    bone_count = validate_topology(rig)
    clear_pose(rig)

    before_lengths = measure_lengths(rig)
    constraints_neutralized = neutralize_constraints(rig)
    applied_scales = apply_local_scales(rig)
    hip = apply_hip_width_preview(rig)
    bpy.context.view_layer.update()
    after_lengths = measure_lengths(rig)
    ratios, max_rel_error = ratio_report(before_lengths, after_lengths)
    mark_preview(rig)

    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    renders, body_mesh_name, bounds = render_body_views(out_dir, mesh_pairs, source, source_meshes)

    acceptance = {
        "primary_segment_ratio_max_relative_error": max_rel_error,
        "primary_segment_ratios_pass_2pct": bool(max_rel_error <= 0.02),
        "hip_width_relative_error": abs(hip["after"] - hip["target"]) / hip["target"],
    }
    acceptance["hip_width_pass_2pct"] = acceptance["hip_width_relative_error"] <= 0.02
    acceptance["mechanical_preview_pass"] = bool(
        acceptance["primary_segment_ratios_pass_2pct"] and acceptance["hip_width_pass_2pct"]
    )

    report = {
        "ok": True,
        "stage": "R_Master_ProportionPreview_v1",
        "source_file": os.path.abspath(bpy.data.filepath),
        "source_armature": SOURCE_ARMATURE,
        "output_armature": OUTPUT_ARMATURE,
        "bone_count": bone_count,
        "duplicated_mesh_count": len(mesh_pairs),
        "preview_body_mesh": body_mesh_name,
        "constraints_neutralized": constraints_neutralized,
        "local_scales_applied": applied_scales,
        "segment_validation": ratios,
        "hip_width": hip,
        "rest_pose_baked": False,
        "adult_structure_independently_edited": False,
        "bounds": bounds,
        "renders": renders,
        "acceptance": acceptance,
        "hard_stops": [
            "Do not use v1 as final VRM",
            "Do not bake rest pose before visual/anatomy/weight validation",
            "Do not delete or rename Mona adult anatomy/oral/face/finger/IK/control bones",
            "Hip width is previewed but adult anatomy and weights are not corrected yet",
        ],
    }

    report_path = os.path.join(out_dir, "R_Master_v1_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    out_blend = os.path.join(out_dir, "R_Master_Align_v1_PREVIEW.blend")
    bpy.ops.wm.save_as_mainfile(filepath=out_blend, check_existing=False)

    print("[R Master v1] BUILD_OK")
    print("[R Master v1] mechanical_preview_pass:", acceptance["mechanical_preview_pass"])
    print("[R Master v1] max segment ratio relative error:", max_rel_error)
    print("[R Master v1] hip width:", hip)
    print("[R Master v1] blend:", out_blend)
    print("[R Master v1] report:", report_path)
    for key, value in renders.items():
        print(f"[R Master v1] render {key}: {value}")

if __name__ == "__main__":
    main()
