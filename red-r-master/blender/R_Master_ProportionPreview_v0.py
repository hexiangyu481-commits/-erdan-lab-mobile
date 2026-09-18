"""R Master Body proportion preview v0.

Create a NON-DESTRUCTIVE duplicate of Mona and apply a first-pass pose-space
proportion preview derived from measured Lapine humanoid dimensions.

This does NOT bake a new rest pose and does NOT touch the original Mona rig.
The risky pelvis-width change is intentionally deferred until mesh/anatomy
validation can be performed in Blender.
"""

import bpy

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
    return rig, mesh_pairs

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

def clear_pose(rig):
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.transforms_clear()
    bpy.ops.pose.select_all(action="DESELECT")

def apply_safe_preview(rig):
    applied = []
    constrained = []
    for name, ratio in SAFE_SCALE_BONES.items():
        pb = rig.pose.bones.get(name)
        if pb is None:
            continue
        if any(c.influence > 0.0 for c in pb.constraints):
            constrained.append(name)
        pb.scale.y *= ratio
        applied.append((name, ratio))
    bpy.context.view_layer.update()
    return applied, constrained

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

def main():
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    source = get_source_armature()
    rig, mesh_pairs = duplicate_for_preview(source)
    validate_topology(rig)
    clear_pose(rig)
    applied, constrained = apply_safe_preview(rig)
    mark_preview(rig)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    print("\n[R Master v0] preview created")
    print("  armature:", rig.name)
    print("  duplicated meshes:", len(mesh_pairs))
    print("  scaled bones:", len(applied))
    print("  constrained scaled bones (inspect visually):", constrained)
    print("  IMPORTANT: hip width ratio 0.6601185034 is measured but NOT applied in v0")
    print("  IMPORTANT: original Mona objects were not modified")

if __name__ == "__main__":
    main()
