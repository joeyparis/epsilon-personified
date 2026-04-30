# Halo 3 Monitor Animation Integration

## TL;DR

> **Quick Summary**: Parse Halo 3's text-based JMM/JMO animation files directly in TypeScript and integrate the authentic idle bob + aim overlay rotations into the existing monitor-avatar Three.js app, layering them with the current procedural motion and camera-facing systems.
> 
> **Deliverables**:
> - `src/jma-parser.ts` - Generic JMM/JMO text format parser
> - `src/animation-sampler.ts` - Keyframe interpolation with coordinate system mapping
> - Modified `src/main.ts` - Integrated idle bob + aim overlay + UI controls
> - Animation data files in `public/animations/`
> 
> **Estimated Effort**: Medium (half day)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (parser) -> Task 3 (idle integration) -> Task 5 (aim overlay) -> F1-F4

---

## Context

### Original Request
User wants to bring authentic Halo 3 343 Guilty Spark animations into their existing Three.js monitor-avatar web app. The avatar already has procedural hover/wander motion and audio-reactive glow. Adding real game animation data on top would make the idle feel more authentic.

### Investigation Summary
**Key Findings**:
- JMM/JMO files are **plain text** (not binary) - trivially parseable with string splitting
- Format fully decoded: header (version/frames/rate/nodes) + per-frame per-node position/quaternion/scale
- Monitor skeleton is only 2 bones: `monitor` (root) + `tendril_marker` (static)
- Idle animation: 50 frames at 30fps, **Z-axis sinusoidal bob only** (9.65 -> 10.0 units), no rotation
- Aim overlay: 28 frames at 30fps, **quaternion rotations only** (compass-point look directions), static position
- Existing app uses per-frame procedural transforms (NOT AnimationMixer) - manual sampling integrates cleanly
- No existing JS/TS JMM parsers exist anywhere
- Coordinate system: Halo Z-up, Three.js Y-up - requires axis remapping

**Codebase State**:
- `monitor-avatar/src/main.ts` - 2418 lines, all-in-one Three.js app
- Procedural idle bob at line ~2143: `const idle_offset_y = Math.sin(t * 0.9) * 0.04`
- Camera-facing at lines ~2169-2183: quaternion blending via `talk_camera_face_offset_quat`
- Model loaded via FBXLoader, scaled/centered, wrapped in `monitor_root` Group
- No test infrastructure (visual Vite app)

### Gap Analysis (Self-Conducted)
**Addressed in plan**:
- Coordinate system handedness (Halo Z-up right-hand -> Three.js Y-up right-hand)
- Quaternion axis remapping for coordinate transform
- Graceful fallback if animation fetch fails (keep procedural motion)
- Loop boundary smoothing (frame N-1 -> frame 0 interpolation)
- Slerp (not lerp) for quaternion interpolation
- Aim overlay blending priority vs existing look_rot sliders and camera-facing
- Scale factor for amplitude (Halo game units vs normalized Three.js space)

---

## Work Objectives

### Core Objective
Build a TypeScript JMM/JMO parser and integrate authentic Halo 3 idle + aim animations into the monitor-avatar, layered on top of existing procedural motion.

### Concrete Deliverables
- `monitor-avatar/src/jma-parser.ts` - Text format parser (generic, any JMM/JMO)
- `monitor-avatar/src/animation-sampler.ts` - Keyframe sampler with interpolation + coord mapping
- Modified `monitor-avatar/src/main.ts` - Idle bob replacement + aim overlay blending + UI controls
- `monitor-avatar/public/animations/idle.jmm` - Copied idle animation data
- `monitor-avatar/public/animations/aim_still_up.jmo` - Copied aim overlay data

### Definition of Done
- [ ] `tsc --noEmit` passes with zero errors
- [ ] `vite build` succeeds
- [ ] Monitor bobs with authentic Halo 3 timing (1.667s period) instead of procedural sine
- [ ] Aim overlay rotations visibly influence look direction
- [ ] Existing audio glow, wander, hover/spin/orbit motions still work
- [ ] UI toggle to switch between Halo 3 idle and procedural idle
- [ ] App loads gracefully if animation files are missing (falls back to procedural)

### Must Have
- Generic parser that handles any JMM/JMO file (not hardcoded for idle specifically)
- Halo Z-up to Three.js Y-up coordinate system mapping
- Slerp interpolation for quaternion keyframes
- Seamless loop wrapping at animation boundaries
- Fallback to existing procedural motion if fetch fails
- UI control for animation blend weight

### Must NOT Have (Guardrails)
- DO NOT use Three.js AnimationMixer (conflicts with existing per-frame procedural transforms)
- DO NOT refactor the existing animate() function structure - surgical insertions only
- DO NOT break the audio-reactive talk glow system
- DO NOT break the camera-facing look-at behavior
- DO NOT add cinematic clip browsing (Tier 4 - out of scope)
- DO NOT add JMA/JMT/JMR/JMRX format support (only JMM and JMO)
- DO NOT modify the FBX model loading pipeline
- DO NOT add skeleton visualization or bone debug tools
- DO NOT split main.ts into multiple files (tempting but out of scope)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (Vite + Three.js visual app, no test runner)
- **Automated tests**: None (unit testing a 3D visual app has diminishing returns here)
- **Framework**: None

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Parser correctness**: Bash (bun/node REPL) - import parser, feed known JMM text, assert parsed output
- **Build verification**: Bash - `tsc --noEmit && vite build`
- **Visual verification**: Playwright - open dev server, screenshot monitor in idle, verify motion
- **Fallback verification**: Playwright - load with missing animation files, verify no crash

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - parser + asset setup, independent):
├── Task 1: JMM/JMO text parser (src/jma-parser.ts) [quick]
├── Task 2: Animation sampler (src/animation-sampler.ts) [quick]
└── Task 3: Copy animation files to public/animations/ [quick]

Wave 2 (After Wave 1 - integration, partially parallel):
├── Task 4: Integrate idle bob into animate() loop [deep]
├── Task 5: Integrate aim overlay with look-at system [deep]
└── Task 6: Add UI controls for animation blend [quick]

Wave 3 (After Wave 2 - verification):
├── Task 7: Build verification + visual QA [unspecified-high]

Wave FINAL (After ALL tasks - 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | - | 4, 5, 7 | 1 |
| 2 | - | 4, 5, 7 | 1 |
| 3 | - | 4, 5 | 1 |
| 4 | 1, 2, 3 | 6, 7 | 2 |
| 5 | 1, 2, 3 | 6, 7 | 2 |
| 6 | 4, 5 | 7 | 2 |
| 7 | 4, 5, 6 | F1-F4 | 3 |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks - T1 `quick`, T2 `quick`, T3 `quick`
- **Wave 2**: 3 tasks - T4 `deep`, T5 `deep`, T6 `quick`
- **Wave 3**: 1 task - T7 `unspecified-high`
- **FINAL**: 4 tasks - F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high` + `playwright`, F4 `deep`

---

## TODOs

- [x] 1. JMM/JMO Text Format Parser

  **What to do**:
  - Create `monitor-avatar/src/jma-parser.ts`
  - Parse the text-based JMM/JMO format (version 16392):
    - Header: version (line 1), frame_count (line 2), frame_rate (line 3), actor_count (line 4), actor_name (line 5), node_count (line 6), checksum (line 7)
    - Per node: name, first_child_index (-1 = none), next_sibling_index (-1 = none)
    - Per frame, per node: position (3 tab-separated floats), quaternion (4 tab-separated floats: i, j, k, w), scale (1 float)
  - Export types: `JmaNode`, `JmaFrame` (position + rotation + scale), `JmaAnimation` (full parsed result)
  - Export function: `parseJma(text: string): JmaAnimation`
  - Handle: empty lines, trailing whitespace, scientific notation in floats (e.g. `4.37E-08`)
  - Throw descriptive errors for malformed input

  **Must NOT do**:
  - Do NOT handle binary/tag formats - text only
  - Do NOT add JMA/JMT/JMR support - only what JMM/JMO text files contain
  - Do NOT import Three.js in this file - keep it pure data parsing

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Well-defined text parsing, single file, clear input/output contract
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction needed for parser

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `HaloAnimationRepository/Halo3-Xbox/data/objects/characters/monitor/monitor/any any idle.JMM` - The actual idle animation file (50 frames, 2 nodes). Use as primary test input. The format is: lines 1-7 = header, lines 8-13 = node defs (2 nodes), lines 14+ = frame data (6 lines per frame: 3 lines per node [pos, quat, scale])
  - `HaloAnimationRepository/Halo3-Xbox/data/objects/characters/monitor/monitor/any any aim_still_up.JMO` - Aim overlay (28 frames, 2 nodes). Same format. Contains scientific notation in quaternion values (e.g. `1.67E-08`). Use as secondary test input.

  **WHY Each Reference Matters**:
  - The JMM file IS the format spec - read it to understand the exact line-by-line layout
  - The JMO file tests scientific notation float parsing, which `parseFloat()` handles natively but must not be forgotten

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Parse idle JMM correctly
    Tool: Bash (bun/node)
    Preconditions: jma-parser.ts compiled, idle.jmm available
    Steps:
      1. Create a small test script that imports parseJma and reads the idle JMM file text
      2. Call parseJma(text) and log: version, frame_count, frame_rate, node_count, nodes[0].name, nodes[1].name
      3. Log frames[0][0].position (first frame, first node position)
      4. Log frames[25][0].position (midpoint frame, peak of bob)
      5. Log frames[0][0].rotation (should be identity-ish: 0,0,0,-1)
    Expected Result:
      - version === 16392
      - frame_count === 50, frame_rate === 30
      - node_count === 2
      - nodes[0].name === "monitor", nodes[1].name === "tendril_marker"
      - frames[0][0].position ~= [0, 0, 9.650198]
      - frames[25][0].position ~= [0, 0, 9.999999]
      - frames[0][0].rotation ~= [0, 0, 0, -1]
    Failure Indicators: Any assertion mismatch, parseFloat returning NaN, wrong frame/node count
    Evidence: .sisyphus/evidence/task-1-parse-idle.txt

  Scenario: Parse aim JMO with scientific notation
    Tool: Bash (bun/node)
    Preconditions: jma-parser.ts compiled, aim JMO available
    Steps:
      1. Import parseJma, read aim_still_up.jmo text
      2. Call parseJma(text), log frame_count, frame_rate
      3. Log frames[1][0].rotation (frame 1 has scientific notation: 0.3826835, 1.67E-08, -0.9238795, 4.37E-08)
    Expected Result:
      - frame_count === 28, frame_rate === 30
      - frames[1][0].rotation[1] approximately 1.67e-8 (not NaN, not 0)
    Failure Indicators: NaN values in parsed quaternion, incorrect frame count
    Evidence: .sisyphus/evidence/task-1-parse-aim.txt

  Scenario: Reject malformed input
    Tool: Bash (bun/node)
    Preconditions: jma-parser.ts compiled
    Steps:
      1. Call parseJma("") - empty string
      2. Call parseJma("not a jma file") - garbage
    Expected Result: Both throw descriptive Error (not undefined/NaN silently)
    Failure Indicators: Returns without error, returns object with NaN fields
    Evidence: .sisyphus/evidence/task-1-parse-error.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3)
  - Message: `feat(monitor-avatar): add JMM/JMO parser and animation sampler`
  - Files: `src/jma-parser.ts`
  - Pre-commit: `cd monitor-avatar && npx tsc --noEmit`

- [x] 2. Animation Sampler with Coordinate Mapping

  **What to do**:
  - Create `monitor-avatar/src/animation-sampler.ts`
  - Import `JmaAnimation` type from `./jma-parser`
  - Implement `AnimationSampler` class:
    - Constructor: takes `JmaAnimation`, target node name (string), options `{ loop: boolean }`
    - `sample(time_s: number)`: returns `{ position: THREE.Vector3, rotation: THREE.Quaternion, scale: number }` at the given time
    - Internally: compute frame index from `time_s * frame_rate`, get integer frame + fractional part, linearly interpolate position/scale, SLERP interpolate quaternion
    - Loop wrapping: when `loop === true` and time exceeds duration, wrap using modulo. Interpolate between last frame and first frame at the boundary.
    - `get duration()`: returns `frame_count / frame_rate` in seconds
    - `get frame_rate()`: returns animation frame rate
  - Implement coordinate system conversion (Halo Z-up to Three.js Y-up):
    - Position: `(halo_x, halo_y, halo_z)` -> `(halo_x, halo_z, -halo_y)` (standard right-hand Z-up to Y-up)
    - Quaternion: `(qi, qj, qk, qw)` -> `(qi, qk, -qj, qw)` (same axis remapping applied to imaginary components)
    - Apply this mapping during `sample()`, not during parsing (keep parser output in raw Halo coordinates)
  - Export a helper: `function createIdleBobSampler(animation: JmaAnimation): { sampleOffset(time_s: number): number }` that extracts just the vertical (Y in Three.js) offset as a normalized value centered at 0 (subtract the midpoint of the bob range). This is what the idle integration needs - a simple float, not a full transform.

  **Must NOT do**:
  - Do NOT use Three.js AnimationMixer, AnimationClip, or KeyframeTrack
  - Do NOT modify the parser output - coordinate conversion happens at sample time
  - Do NOT handle interpolation beyond linear/slerp (no cubic, no easing)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, math-focused, clear API contract
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5, 7
  - **Blocked By**: None (depends on types from Task 1 but can be written simultaneously using the same type definitions)

  **References**:

  **Pattern References**:
  - `monitor-avatar/src/main.ts:636-637` - Existing THREE.Quaternion temp variables pattern (reuse scratch objects to avoid GC)
  - `monitor-avatar/src/main.ts:741-743` - `dampNumber()` function showing the existing interpolation style

  **API/Type References**:
  - Three.js `Quaternion.slerp()` - https://threejs.org/docs/#api/en/math/Quaternion.slerp
  - Three.js `Vector3.lerp()` - https://threejs.org/docs/#api/en/math/Vector3.lerp

  **External References**:
  - Halo CE coordinate system: right-handed, Z-up. Three.js: right-handed, Y-up. Standard conversion: swap Y and Z, negate new Z.

  **WHY Each Reference Matters**:
  - The scratch quaternion pattern in main.ts shows the project prefers pre-allocated temp objects over creating new ones each frame (performance)
  - Slerp is critical for correct quaternion interpolation (lerp produces non-unit quaternions)
  - The coordinate mapping is the most error-prone part - getting the axis swap wrong will make the monitor bob sideways or rotate on the wrong axis

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Sample idle bob at key times
    Tool: Bash (bun/node)
    Preconditions: Both parser and sampler compiled, idle JMM available
    Steps:
      1. Parse idle JMM, create AnimationSampler for "monitor" node with loop=true
      2. Sample at time=0.0 - log position.y (should be near bottom of bob in Three.js Y-up)
      3. Sample at time=0.833 (half period, ~frame 25) - log position.y (should be near peak)
      4. Sample at time=1.667 (full period) - log position.y (should wrap back to start)
      5. Sample at time=0.5 (between frames) - verify interpolated value is between neighbors
    Expected Result:
      - position.y at t=0 ~= mapped value of 9.650198
      - position.y at t=0.833 ~= mapped value of 9.999999 (peak)
      - position.y at t=1.667 wraps to ~= position.y at t=0
      - Interpolated value at t=0.5 is between frame neighbors (not snapping)
    Failure Indicators: NaN, position.y constant (not animating), wrong axis (x or z moving instead of y)
    Evidence: .sisyphus/evidence/task-2-sample-idle.txt

  Scenario: Sample aim overlay quaternions with slerp
    Tool: Bash (bun/node)
    Preconditions: Parser and sampler compiled, aim JMO available
    Steps:
      1. Parse aim JMO, create AnimationSampler for "monitor" node with loop=true
      2. Sample at t=0 - log rotation (should be identity-ish after coord mapping)
      3. Sample at t=0.5 (between keyframes) - verify quaternion is unit length (length ~= 1.0)
      4. Sample multiple times across duration - verify all quaternions have length within 0.001 of 1.0
    Expected Result:
      - All sampled quaternions have magnitude ~1.0 (proves slerp, not lerp)
      - Rotation at t=0 is approximately identity
    Failure Indicators: Quaternion magnitude != 1.0 (indicates lerp not slerp), NaN values
    Evidence: .sisyphus/evidence/task-2-sample-aim.txt

  Scenario: createIdleBobSampler returns centered offset
    Tool: Bash (bun/node)
    Preconditions: Parser and sampler compiled, idle JMM available
    Steps:
      1. Parse idle JMM, call createIdleBobSampler()
      2. Sample offset at t=0 (should be negative - below center)
      3. Sample offset at t=0.833 (should be positive - above center)
      4. Verify the range is symmetric around 0 (min ~= -max)
    Expected Result:
      - Offset at t=0 is negative (approximately -0.175 in Halo units, rescaled)
      - Offset at t=0.833 is positive (approximately +0.175)
      - |min + max| < 0.01 (centered)
    Failure Indicators: Offset always positive (not centered), offset always 0, wrong amplitude
    Evidence: .sisyphus/evidence/task-2-idle-bob-sampler.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3)
  - Message: `feat(monitor-avatar): add JMM/JMO parser and animation sampler`
  - Files: `src/animation-sampler.ts`
  - Pre-commit: `cd monitor-avatar && npx tsc --noEmit`

- [x] 3. Copy Animation Data Files

  **What to do**:
  - Create directory `monitor-avatar/public/animations/`
  - Copy `HaloAnimationRepository/Halo3-Xbox/data/objects/characters/monitor/monitor/any any idle.JMM` to `monitor-avatar/public/animations/idle.jmm`
  - Copy `HaloAnimationRepository/Halo3-Xbox/data/objects/characters/monitor/monitor/any any aim_still_up.JMO` to `monitor-avatar/public/animations/aim_still_up.jmo`
  - Verify both files are valid text (not corrupted by copy)

  **Must NOT do**:
  - Do NOT copy any cinematic animation files
  - Do NOT modify the animation file contents
  - Do NOT add the entire HaloAnimationRepository to the public directory

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File copy operation, 2 files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `monitor-avatar/public/assets/` - Existing public asset directory structure. New animations go in `public/animations/` alongside `public/assets/` and `public/audio/`.
  - `monitor-avatar/src/main.ts:27-28` - How existing assets are referenced: `const model_url = '/assets/halo-reach-forge-monitor/source/NewMonitor11.fbx'`. Animation URLs should follow same pattern: `/animations/idle.jmm`

  **WHY Each Reference Matters**:
  - The public directory structure shows the convention for static assets served by Vite
  - The URL pattern shows how main.ts references public assets (root-relative paths)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Files copied and valid
    Tool: Bash
    Preconditions: None
    Steps:
      1. Check file exists: ls -la monitor-avatar/public/animations/idle.jmm
      2. Check file exists: ls -la monitor-avatar/public/animations/aim_still_up.jmo
      3. Verify idle.jmm starts with "16392" (first line): head -1 monitor-avatar/public/animations/idle.jmm
      4. Verify aim_still_up.jmo starts with "16392": head -1 monitor-avatar/public/animations/aim_still_up.jmo
      5. Compare file sizes match originals
    Expected Result:
      - Both files exist in public/animations/
      - Both start with "16392"
      - File sizes match originals exactly
    Failure Indicators: File not found, corrupted content, wrong first line
    Evidence: .sisyphus/evidence/task-3-files-copied.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2)
  - Message: `feat(monitor-avatar): add JMM/JMO parser and animation sampler`
  - Files: `public/animations/idle.jmm`, `public/animations/aim_still_up.jmo`
  - Pre-commit: N/A (data files)

- [x] 4. Integrate Idle Bob into Animate Loop

  **What to do**:
  - In `monitor-avatar/src/main.ts`:
  - Add imports for `parseJma` from `./jma-parser` and `createIdleBobSampler` from `./animation-sampler`
  - Add module-level state:
    - `let idle_bob_sampler: ReturnType<typeof createIdleBobSampler> | null = null`
    - `let halo_idle_enabled = true` (toggled by UI)
    - `let idle_bob_amplitude = 0.04` (tunable - matches current procedural amplitude as default)
  - After FBX model loads successfully (inside the `fbx_loader.load` success callback, after `setStatus`), add an async fetch block:
    ```
    fetch('/animations/idle.jmm')
      .then(r => r.text())
      .then(text => {
        const anim = parseJma(text)
        idle_bob_sampler = createIdleBobSampler(anim)
      })
      .catch(err => {
        console.warn('Failed to load idle animation, using procedural fallback:', err)
      })
    ```
  - In the `animate()` function, find the line `const idle_offset_y = Math.sin(t * 0.9) * 0.04` (~line 2143)
  - Replace with:
    ```
    const idle_offset_y = (halo_idle_enabled && idle_bob_sampler)
      ? idle_bob_sampler.sampleOffset(t) * idle_bob_amplitude
      : Math.sin(t * 0.9) * 0.04
    ```
  - This preserves the exact same variable name and downstream usage - everything else in animate() stays untouched

  **Must NOT do**:
  - Do NOT change the variable name `idle_offset_y` - downstream code depends on it
  - Do NOT move or restructure the animate() function
  - Do NOT change how idle_offset_y is applied to monitor_root.position (line ~2155)
  - Do NOT remove the procedural fallback (Math.sin path must remain for when sampler is null)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful reading of 2418-line file to find exact insertion points without breaking existing logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (partially - can run alongside Task 5 since they edit different sections of main.ts)
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `monitor-avatar/src/main.ts:2143` - The exact line to replace: `const idle_offset_y = Math.sin(t * 0.9) * 0.04`
  - `monitor-avatar/src/main.ts:2153-2157` - Where `idle_offset_y` is consumed in position calculation:
    ```
    tmp_base_pos.set(
      monitor_root_base_position.x + model_pos_offset_x + wander_x + talk_offset_x,
      monitor_root_base_position.y + model_pos_offset_y + idle_offset_y + wander_y + talk_offset_y,
      monitor_root_base_position.z + model_pos_offset_z + wander_z + talk_offset_z,
    )
    ```
  - `monitor-avatar/src/main.ts:1445-1701` - FBX load success callback where animation fetch should be added
  - `monitor-avatar/src/main.ts:1681-1684` - After `setStatus(...)` and `start_button.disabled = false` - good insertion point for animation fetch

  **API/Type References**:
  - The `createIdleBobSampler` returns `{ sampleOffset(time_s: number): number }` - a simple float
  - The sampler's output is already in Three.js Y-up space and centered at 0

  **WHY Each Reference Matters**:
  - Line 2143 is THE surgical replacement point - change only this line's right-hand side
  - Lines 2153-2157 show that `idle_offset_y` feeds directly into `tmp_base_pos.y` - the interface contract is "a float offset in Y"
  - The FBX load callback is the right place to chain the animation fetch (model must be loaded first for timing to make sense)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Halo idle bob active after model loads
    Tool: Playwright
    Preconditions: Dev server running (npm run dev in monitor-avatar/)
    Steps:
      1. Navigate to http://localhost:5173 (or whatever port Vite uses)
      2. Wait for model to load (status text changes from "Loading model...")
      3. Wait 3 seconds for animation fetch to complete
      4. Take screenshot at t=0
      5. Wait 0.8 seconds (approximately half the 1.667s Halo period)
      6. Take screenshot at t=0.8
      7. Compare the monitor's Y position between screenshots - it should have moved up
    Expected Result:
      - Model loads without errors
      - Monitor visibly bobs up and down
      - Bob period is noticeably faster than the old ~7s procedural sine (should be ~1.67s)
    Failure Indicators: Monitor static (no bob), model fails to load, console errors about animation fetch
    Evidence: .sisyphus/evidence/task-4-idle-bob-active.png

  Scenario: Fallback to procedural when animation missing
    Tool: Playwright
    Preconditions: Dev server running, temporarily rename/remove public/animations/idle.jmm
    Steps:
      1. Navigate to page
      2. Wait for model load
      3. Open browser console, check for warning message "Failed to load idle animation"
      4. Verify monitor still bobs (procedural fallback)
      5. Take screenshot showing motion
    Expected Result:
      - Console shows warning (not error/crash)
      - Monitor still bobs with procedural sine motion
      - No unhandled promise rejection
    Failure Indicators: Page crash, unhandled error, monitor frozen
    Evidence: .sisyphus/evidence/task-4-fallback.png
  ```

  **Commit**: YES (groups with Task 5)
  - Message: `feat(monitor-avatar): integrate Halo 3 idle bob and aim overlay`
  - Files: `src/main.ts`
  - Pre-commit: `cd monitor-avatar && npx tsc --noEmit`

- [x] 5. Integrate Aim Overlay with Look-At System

  **What to do**:
  - In `monitor-avatar/src/main.ts`:
  - Add import for `AnimationSampler` from `./animation-sampler`
  - Add module-level state:
    - `let aim_overlay_sampler: AnimationSampler | null = null`
    - `let halo_aim_enabled = true` (toggled by UI)
    - `let aim_overlay_blend = 0.3` (0.0 = no aim influence, 1.0 = full aim influence. Default 0.3 for subtle effect)
  - After the idle animation fetch block (added in Task 4), add a chained fetch:
    ```
    fetch('/animations/aim_still_up.jmo')
      .then(r => r.text())
      .then(text => {
        const anim = parseJma(text)
        aim_overlay_sampler = new AnimationSampler(anim, 'monitor', { loop: true })
      })
      .catch(err => {
        console.warn('Failed to load aim overlay, camera-facing only:', err)
      })
    ```
  - In the `animate()` function, find the section where `monitor_root.quaternion` is composed (~lines 2162-2196). After the line `tmp_quat_c.multiply(talk_camera_face_offset_quat)` (line ~2183), ADD (do not replace):
    ```
    // Blend in Halo 3 aim overlay rotation if available.
    if (halo_aim_enabled && aim_overlay_sampler) {
      const aim_sample = aim_overlay_sampler.sample(t)
      // The aim overlay quaternion represents a "look direction" offset.
      // Blend it into the current orientation using slerp with the configured weight.
      // Only apply when not in debug_home_pose mode.
      tmp_quat_a.copy(tmp_quat_c)
      tmp_quat_b.copy(tmp_quat_c).multiply(aim_sample.rotation)
      tmp_quat_c.copy(tmp_quat_a).slerp(tmp_quat_b, aim_overlay_blend * attention_amount)
    }
    ```
  - The key insight: multiply the aim rotation AFTER the camera-facing offset, and scale its influence by `attention_amount` so it only affects the monitor when it's "active" (talking/attending). During idle wander, the aim overlay adds subtle look variation. During talk, it's suppressed by the stronger camera-facing drive.

  **Must NOT do**:
  - Do NOT remove or replace the existing camera-facing quaternion logic (lines 2169-2183)
  - Do NOT modify `talk_camera_face_offset_quat` behavior
  - Do NOT apply aim overlay during `debug_home_pose` mode
  - Do NOT change the existing `tmp_quat_a/b/c` usage patterns in ways that break earlier computations in the same frame

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Quaternion math in a 2400-line file with complex existing rotation composition. Must understand the full quaternion pipeline to insert safely.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (can run alongside Task 4 - they edit different sections of animate())
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `monitor-avatar/src/main.ts:2162-2196` - The full quaternion composition pipeline:
    ```
    tmp_quat_c.copy(monitor_root_base_quaternion)     // Start with base orientation
    updateLookRotQuat(tmp_quat_look_rot)               // User look rotation offset
    tmp_quat_c.multiply(tmp_quat_look_rot)             // Apply look rot
    // ... camera facing offset computed ...
    tmp_quat_c.multiply(talk_camera_face_offset_quat)  // Apply camera facing
    // >>> AIM OVERLAY GOES HERE <<<
    // ... then idle rot + wander bank applied via tmp_euler_a ...
    tmp_quat_b.setFromEuler(tmp_euler_a)
    monitor_root.quaternion.copy(tmp_quat_c).multiply(tmp_quat_b)
    ```
  - `monitor-avatar/src/main.ts:2100-2108` - `attention_amount` computation (0 = idle, 1 = talking). Used to modulate aim overlay influence.
  - `monitor-avatar/src/main.ts:634-638` - Existing scratch quaternion pattern: `tmp_quat_a`, `tmp_quat_b`, `tmp_quat_c` are pre-allocated and reused

  **WHY Each Reference Matters**:
  - The quaternion pipeline must be understood end-to-end to know WHERE to insert the aim overlay. It goes: base -> look_rot -> camera_face -> (aim overlay here) -> idle_rot + wander. Inserting at the wrong point would break everything.
  - `attention_amount` is the existing blend factor between idle and talking states - reusing it for aim overlay blend scaling means the aim effect naturally fades when the monitor isn't active
  - Scratch quaternions must be used carefully - `tmp_quat_a` and `tmp_quat_b` are potentially already in use above this insertion point. Read the surrounding code to confirm they're safe to reuse at the insertion point.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Aim overlay adds visible look rotation during audio playback
    Tool: Playwright
    Preconditions: Dev server running, default audio loaded
    Steps:
      1. Navigate to http://localhost:5173
      2. Wait for model + animations to load
      3. Click "Enable audio + start" button (#start_button)
      4. Wait 2 seconds for talk_needed_active to engage
      5. Take 3 screenshots spaced 0.3s apart
      6. Compare monitor orientation across screenshots - it should show subtle rotational variation
    Expected Result:
      - Monitor faces generally toward camera (existing behavior preserved)
      - Subtle rotational variation visible between screenshots (aim overlay influence)
      - No jerky snapping or unnatural rotation
    Failure Indicators: Monitor spinning wildly, monitor locked in one direction, rotation on wrong axis
    Evidence: .sisyphus/evidence/task-5-aim-overlay-talking.png

  Scenario: Aim overlay respects attention_amount (fades during idle)
    Tool: Playwright
    Preconditions: Dev server running, audio NOT playing
    Steps:
      1. Navigate to page, wait for load
      2. Do NOT start audio (attention_amount stays near 0)
      3. Take 3 screenshots 1s apart
      4. The monitor should still have its idle wander rotation, but aim overlay should have minimal influence (scaled by attention_amount ~= 0)
    Expected Result:
      - Idle wander motion still visible
      - No dramatic aim rotations when not talking (aim_overlay_blend * attention_amount ~= 0)
    Failure Indicators: Strong aim rotations when idle (attention scaling not working)
    Evidence: .sisyphus/evidence/task-5-aim-idle-suppressed.png

  Scenario: Camera-facing still works (not broken by aim overlay)
    Tool: Playwright
    Preconditions: Dev server running, audio playing
    Steps:
      1. Navigate to page, start audio
      2. Use OrbitControls to move camera to the side (drag canvas)
      3. Wait 3 seconds for camera-facing to engage
      4. Take screenshot - monitor should be facing generally toward camera position
    Expected Result:
      - Monitor tracks camera position (existing camera-facing preserved)
      - Aim overlay adds variation but doesn't override camera-facing
    Failure Indicators: Monitor ignores camera position, faces fixed direction
    Evidence: .sisyphus/evidence/task-5-camera-facing-preserved.png
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `feat(monitor-avatar): integrate Halo 3 idle bob and aim overlay`
  - Files: `src/main.ts`
  - Pre-commit: `cd monitor-avatar && npx tsc --noEmit`

- [x] 6. Add UI Controls for Animation Blend

  **What to do**:
  - In `monitor-avatar/src/main.ts`, add a new HUD section for Halo animation controls.
  - Find the HUD HTML template string (starts at line ~38, the `app_el.innerHTML` assignment). After the "Lights" section div (closes at ~line 167), add a new section:
    ```html
    <div class="section" data-section-id="halo_anim">
      <h2>Halo 3 animation</h2>
      <div class="row stack">
        <label><input id="enable_halo_idle" type="checkbox" checked /> Halo idle bob (replaces procedural)</label>
        <label><input id="enable_halo_aim" type="checkbox" checked /> Aim overlay (look variation)</label>
        <label>Idle amplitude <input id="halo_idle_amplitude" type="range" min="0" max="0.15" step="0.001" value="0.04" /></label>
        <label>Aim blend <input id="halo_aim_blend" type="range" min="0" max="1" step="0.01" value="0.3" /></label>
      </div>
    </div>
    ```
  - Add element references after the existing `mustGetElement` calls:
    ```
    const enable_halo_idle_input = mustGetElement<HTMLInputElement>('#enable_halo_idle')
    const enable_halo_aim_input = mustGetElement<HTMLInputElement>('#enable_halo_aim')
    const halo_idle_amplitude_input = mustGetElement<HTMLInputElement>('#halo_idle_amplitude')
    const halo_aim_blend_input = mustGetElement<HTMLInputElement>('#halo_aim_blend')
    ```
  - In the `animate()` function, read the UI values at the top of the frame (near where other inputs are read):
    ```
    halo_idle_enabled = enable_halo_idle_input.checked
    halo_aim_enabled = enable_halo_aim_input.checked
    idle_bob_amplitude = parseNumberInput(halo_idle_amplitude_input)
    aim_overlay_blend = parseNumberInput(halo_aim_blend_input)
    ```

  **Must NOT do**:
  - Do NOT add complex UI (dropdowns, file pickers, animation browsers)
  - Do NOT add more than these 4 controls
  - Do NOT change the existing HUD styling or layout

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: HTML template insertion + 4 element references + 4 value reads. Straightforward.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (edits same file sections as Tasks 4, 5)
  - **Parallel Group**: Wave 2 (after Tasks 4, 5 complete)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - `monitor-avatar/src/main.ts:141-167` - Existing "Lights" HUD section. New section goes after this. Follow exact same HTML structure: `<div class="section" data-section-id="..."><h2>...</h2><div class="row stack">...</div></div>`
  - `monitor-avatar/src/main.ts:228-238` - Existing `mustGetElement` calls for checkbox inputs. Follow same pattern.
  - `monitor-avatar/src/main.ts:2285-2286` - Where existing per-frame input reads happen (`parseNumberInput(idle_glow_input)` etc). New reads go in same area.
  - `monitor-avatar/src/main.ts:317-376` - `setupCollapsibleHudSections()` - automatically makes all `.section` elements collapsible. New section will be auto-collapsible with no extra code.

  **WHY Each Reference Matters**:
  - The existing HUD sections follow a rigid pattern - matching it exactly means the collapsible behavior, slider value labels, and CSS all work automatically
  - `mustGetElement` pattern is used throughout - consistent error handling
  - Per-frame input reading is done at a specific point in animate() - must be in the same area

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: UI controls visible and functional
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to page, wait for load
      2. Find the "Halo 3 animation" section heading (h2 text)
      3. Click to expand the section (it starts collapsed)
      4. Verify 2 checkboxes present: #enable_halo_idle (checked), #enable_halo_aim (checked)
      5. Verify 2 sliders present: #halo_idle_amplitude, #halo_aim_blend
      6. Uncheck #enable_halo_idle
      7. Wait 2 seconds
      8. Verify monitor still bobs (should fall back to procedural)
    Expected Result:
      - Section appears in HUD, collapses/expands correctly
      - All 4 controls present with correct defaults
      - Unchecking idle checkbox switches to procedural bob
    Failure Indicators: Section missing, controls not found, unchecking has no effect
    Evidence: .sisyphus/evidence/task-6-ui-controls.png

  Scenario: Slider values affect animation in real-time
    Tool: Playwright
    Preconditions: Dev server running, audio playing
    Steps:
      1. Navigate to page, start audio
      2. Set #halo_aim_blend slider to 0 (drag to minimum)
      3. Observe: aim overlay should have no effect
      4. Set #halo_aim_blend slider to 1.0 (drag to maximum)
      5. Observe: aim overlay should be very pronounced
      6. Set #halo_idle_amplitude to 0.15 (maximum)
      7. Observe: idle bob should be much larger
    Expected Result:
      - Blend=0 means no aim rotation variation
      - Blend=1 means strong aim rotation
      - Amplitude=0.15 means very tall bob
    Failure Indicators: Slider changes have no visible effect, values not read each frame
    Evidence: .sisyphus/evidence/task-6-slider-effect.png
  ```

  **Commit**: YES (separate commit)
  - Message: `feat(monitor-avatar): add Halo animation blend UI controls`
  - Files: `src/main.ts`
  - Pre-commit: `cd monitor-avatar && npx tsc --noEmit && npx vite build`

- [x] 7. Build Verification and Integration QA

  **What to do**:
  - Run `cd monitor-avatar && npx tsc --noEmit` - must pass with zero errors
  - Run `cd monitor-avatar && npx vite build` - must succeed
  - Start dev server and perform visual verification of all features working together
  - Verify: idle bob + aim overlay + talk glow + wander + hover/spin/orbit all coexist
  - Verify: debug home pose mode still works correctly
  - Verify: recording feature still works

  **Must NOT do**:
  - Do NOT fix issues by modifying the plan scope (report back if something is broken)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration testing across multiple features, needs Playwright for visual verification
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (solo)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 4, 5, 6

  **References**:

  **Pattern References**:
  - `monitor-avatar/package.json:7-9` - Build scripts: `"dev": "vite"`, `"build": "tsc && vite build"`
  - `monitor-avatar/src/main.ts:79-87` - Hover/spin/orbit buttons. Click each and verify motion still works.
  - `monitor-avatar/src/main.ts:1943-1944` - `debug_home_pose` checkbox. Toggle and verify camera lock + frozen pose.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full build passes
    Tool: Bash
    Preconditions: All code changes complete
    Steps:
      1. cd monitor-avatar && npx tsc --noEmit
      2. cd monitor-avatar && npx vite build
    Expected Result: Both commands exit 0, no errors
    Failure Indicators: Type errors, import errors, build failures
    Evidence: .sisyphus/evidence/task-7-build.txt

  Scenario: All motion systems coexist
    Tool: Playwright
    Preconditions: Dev server running, audio playing
    Steps:
      1. Navigate to page, start audio
      2. Verify idle bob active (monitor moves up/down with ~1.67s period)
      3. Click "Run hover" button - verify hover motion overlays on bob
      4. Click "Stop preview" - verify bob resumes cleanly
      5. Click "Run spin" - verify spin motion works
      6. Click "Stop preview"
      7. Verify talk glow still pulses with audio
      8. Take final screenshot showing monitor with all systems active
    Expected Result:
      - Idle bob, hover, spin, orbit, talk glow all still function
      - No freezing, no NaN poisoning, no visual artifacts
    Failure Indicators: Any motion system broken, monitor frozen, console errors
    Evidence: .sisyphus/evidence/task-7-all-systems.png

  Scenario: Debug home pose unaffected
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to page, wait for load
      2. Check "Debug home pose (freeze)" checkbox (#debug_home_pose)
      3. Verify monitor is frozen in place (no bob, no wander)
      4. Verify camera is locked head-on
      5. Uncheck debug pose
      6. Verify normal motion resumes with Halo idle bob
    Expected Result:
      - Debug pose freezes all motion including Halo animations
      - Unfreezing restores Halo idle bob
    Failure Indicators: Halo animation plays during debug freeze, motion doesn't resume after unfreeze
    Evidence: .sisyphus/evidence/task-7-debug-pose.png
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** - `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns - reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** - `unspecified-high`
  Run `tsc --noEmit` + `vite build`. Review all changed/new files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** - `unspecified-high` (+ `playwright` skill)
  Start dev server. Execute EVERY QA scenario from EVERY task - follow exact steps, capture evidence. Test cross-task integration (idle bob + aim overlay + talk glow all active simultaneously). Test edge cases: rapid toggle of Halo animation, resize window during animation, start/stop audio while aim overlay active. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** - `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 - everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect changes to existing behavior (talk glow, hover/spin/orbit). Flag unaccounted files.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After | Message | Files | Pre-commit check |
|-------|---------|-------|-----------------|
| Tasks 1-3 | `feat(monitor-avatar): add JMM/JMO parser and animation sampler` | `src/jma-parser.ts`, `src/animation-sampler.ts`, `public/animations/*` | `tsc --noEmit` |
| Tasks 4-5 | `feat(monitor-avatar): integrate Halo 3 idle bob and aim overlay` | `src/main.ts` | `tsc --noEmit && vite build` |
| Task 6 | `feat(monitor-avatar): add animation blend UI controls` | `src/main.ts` | `tsc --noEmit && vite build` |

---

## Success Criteria

### Verification Commands
```bash
cd monitor-avatar && npx tsc --noEmit  # Expected: no errors
cd monitor-avatar && npx vite build    # Expected: build succeeds
```

### Final Checklist
- [ ] All "Must Have" items present and verified
- [ ] All "Must NOT Have" items absent (no AnimationMixer, no main.ts restructure, glow intact)
- [ ] Idle bob uses authentic Halo 3 data (1.667s period, sampled from JMM)
- [ ] Aim overlay rotations blend with camera-facing
- [ ] Fallback to procedural motion works when animations unavailable
- [ ] UI controls for blend weight present and functional
- [ ] Build passes cleanly
