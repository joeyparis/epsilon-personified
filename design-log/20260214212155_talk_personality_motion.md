# Design Log #20260214212155

## Background
We have a Three.js “Monitor Avatar” (`monitor-avatar/`) that already supports an idle float/rotation animation and audio-driven talk glow (material emissive + local talk spill lights).

## Problem
When the avatar is talking, it feels visually static. We want it to have more personality (motion) during speech while preserving the existing idle animation.

## Questions and Answers
- Q: Should the existing idle animation be replaced?
  - A: No. Keep the existing idle bob + yaw + pitch. Talk motion should be additive on top.
- Q: Should the motion style be consistent or varied?
  - A: Use three motion styles and randomly pick one per “talk session”.
- Q: When does a new “talk session” begin/end?
  - A: Begin when `talk_strength` crosses a threshold from silent -> talking; end when it falls back below threshold (with slight hysteresis).

## Design
We will implement a small talk-motion state machine driven by the existing `talk_strength` value.

### Motion styles
We will implement 3 additive styles:
1) Excited hover
- Increase bob amplitude slightly while talking.
- Add subtle figure‑8 drift in X/Z.
- Add a small roll wobble.
2) Spin bursts
- On talk onset (and/or strong talk_strength rises), add a short yaw spin impulse that damps out.
- Keep displacement small; motion is mostly rotational.
3) Orbit swoop
- While talking, orbit around the idle center with a small radius; return to idle when silent.

### Key animation constraints
- Preserve existing idle animation as baseline.
- Avoid overwriting the model’s centered base offset. Store `monitor_root_base_position` and `monitor_root_base_rotation` at load time and apply idle + talk offsets relative to those.
- Avoid per-frame allocations in the render loop.

## Implementation Plan
See Warp plan doc: "Monitor avatar: random talk personality motion".

## Examples
✅ When talking, the avatar subtly becomes more expressive (drift/spin/orbit), but remains readable and not nauseating.
✅ When silent, motion returns to the current idle bob/yaw/pitch.
❌ Talk motion should not drag the model far from center or break lighting alignment.

## Trade-offs
- Random per talk session improves variety but can feel inconsistent; keep amplitudes conservative.
- Extra motion can change perceived lighting; keep talk lights parented to model root and motion bounded.

## Implementation Results
- Stored `monitor_root_base_position` / `monitor_root_base_rotation` after model centering so animation can be applied as offsets.
- Added a talk-session detector with hysteresis (`talk_on_threshold` / `talk_off_threshold`) and random per-session selection among 3 styles.
- Implemented 3 additive talk motion styles driven by `talk_strength`: excited hover (drift + roll), spin bursts (damped yaw impulse), and orbit swoop (small orbit + bank).
- Preserved the existing idle bob/yaw/pitch by applying it as the baseline offsets, with talk motion added on top.
