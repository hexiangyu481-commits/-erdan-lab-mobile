# R Master Body — Mona × Lapine

Current stage: **v0 proportion mapping / non-destructive preview**.

## Locked roles

- **Mona** = Master Rig / complete body control system.
- **Lapine** = appearance + proportion + face/aesthetic donor.
- R keeps Mona's complete rig/body capabilities; Lapine supplies the visible target language.

## What was measured

Both source files were parsed directly. Mona contains a 505-bone armature. Lapine's `Lapine_BaseBody.fbx` is FBX 7500 and its Unity importer metadata contains 53 explicit Humanoid mappings.

A key finding is that the rest poses differ: Mona is an **A-pose**, while Lapine's humanoid skeleton is effectively a **T-pose**. Therefore world joint coordinates must not be copied directly. v0 transfers dimensions and ratios while preserving Mona's rest-pose directions.

See `analysis/restpose-map-v0.json` for measured values, source hashes, target ratios, protection rules and Lapine's official Unity Humanoid map.

## v0 preview script

`blender/R_Master_ProportionPreview_v0.py` is deliberately non-destructive:

- duplicates Mona's armature and all dependent meshes;
- verifies the primary and protected structures;
- applies only safe pose-space length previews for limbs/torso/neck;
- leaves the original Mona objects untouched;
- does **not** bake a new rest pose;
- deliberately defers the large pelvis-width change, anatomy rebalance, weight correction and VRM export.

The measured hip-joint-width target is only ~66% of Mona's current joint width. That is large enough to require geometry/anatomy validation before it is allowed into the rest rig.

## Hard stops

Do not yet:

- replace production RED;
- export a final VRM;
- bake the v0 preview as rest pose;
- retopologize;
- delete/rename Mona bones;
- independently retarget adult anatomy, face/oral controls, fingers, IK, trackers or stretch/master controls.

This folder is engineering work only. Production `red-mobile-a8-clean`, `red-a8-mind`, and `migration-clean-v1` remain untouched.
