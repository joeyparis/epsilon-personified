# Halo-Only Animation Mode

## TL;DR

> **Quick Summary**: Fix the amplitude normalization bug making Halo bob invisible, then add a single "Halo-only mode" toggle that disables all 5 procedural motion systems (idle bob/tilt, wander, hover/spin/orbit, camera-facing) so the monitor is driven solely by Halo 3 animation data.
> 
> **Deliverables**:
> - Fixed `animation-sampler.ts` - normalized ±1.0 output from `createIdleBobSampler`
> - Modified `main.ts` - master toggle checkbox + conditional suppression in animate()
> 
> **Estimated Effort**: Short (2-3 hours)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (amplitude fix) -> Task 2 (toggle) -> Task 3 (build + commit)

---

## Context

### Original Request
User noticed Halo idle bob looks identical to procedural bob (amplitude bug: ±0.007 vs ±0.04). Wants a toggle to disable ALL procedural/self-made animations and rely solely on Halo repo data. Goal: establish a clean Halo-only baseline, then layer custom effects on top later.

### Interview Summary
**Key Decisions**:
- Disable in Halo-only mode: idle bob, idle rotation, wander, hover/spin/orbit, camera-facing
- Keep in Halo-only mode: talk glow (audio-reactive emissive - not motion)
- Fix amplitude: normalize sampler output to ±1.0
- UI: single master toggle "Halo-only mode"
- Talk approach offset: disabled with camera-facing (coupled)

### Metis Review
**Identified Gaps** (addressed):
- `wander_bank_z` and `wander_tilt_x` have independent Math.sin oscillations beyond wander_offset - must zero those too
- `talk_camera_face_offset_quat` is persistent - must damp toward identity (not snap) when toggling on mid-talk
- `talk_camera_approach_offset` is persistent - must damp toward zero
- Aim overlay uses `attention_amount` gating - in halo-only mode, bypass gating so aim overlay is always active
- `halfRange === 0` guard needed in normalization to prevent division by zero
- Preview buttons compute motion that gets suppressed in halo-only - acceptable, no UI disable needed

---

## Work Objectives

### Core Objective
Fix the amplitude bug and add a master toggle for Halo-only animation mode that cleanly suppresses all procedural motion.

### Concrete Deliverables
- `monitor-avatar/src/animation-sampler.ts` - `createIdleBobSampler` output normalized to ±1.0
- `monitor-avatar/src/main.ts` - "Halo-only mode" checkbox + conditional suppression of 5 procedural systems

### Definition of Done
- [ ] `tsc --noEmit` passes with zero errors
- [ ] `vite build` succeeds
- [ ] With Halo-only OFF: identical behavior to current (regression-free)
- [ ] With Halo-only ON: monitor bobs with Halo timing, aim overlay provides subtle look rotation, no procedural drift/tilt/wander/camera-facing
- [ ] Amplitude slider at 0.04 produces visible ±0.04 bob (not ±0.007)
- [ ] Toggle ON mid-talk: smooth transition (damp, no snap)
- [ ] Toggle OFF: procedural motion resumes smoothly
- [ ] Talk glow still works in both modes
- [ ] Debug home pose overrides regardless

### Must Have
- Normalized sampler output (±1.0 range) with halfRange === 0 guard
- Single master toggle checkbox in "Halo 3 animation" HUD section
- Suppression of ALL procedural motion: idle_rot_y, idle_rot_x, wander_x/y/z, wander_bank_z, wander_tilt_x, talk_offset_x/y/z, talk_rot_x/y/z, talk_camera_face_offset_quat, talk_camera_approach_offset
- Aim overlay bypasses attention_amount gating in halo-only mode (always active)
- Damped transitions for persistent state (camera-facing quat, approach offset) when toggling
- Force sampler path for idle bob when halo-only is true (regardless of halo_idle_enabled)

### Must NOT Have (Guardrails)
- DO NOT modify `AnimationSampler.sample()` method - only fix `createIdleBobSampler`
- DO NOT touch glow/emissive code (lines ~2343-2460)
- DO NOT add per-system toggles - ONE master toggle only
- DO NOT change slider ranges or defaults (0.04 is now correct post-normalization)
- DO NOT refactor animate() structure - surgical guard-clause changes only
- DO NOT suppress `attention_amount` computation itself (still needed for glow)
- DO NOT suppress `debug_home_pose` path - it takes priority regardless
- DO NOT disable preview buttons in UI when halo-only is on (they just have no visible effect)
- DO NOT suppress `model_pos_offset_*` user debug sliders or `look_rot` orientation

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None
- **Framework**: None

### QA Policy
Every task includes agent-executed QA. Evidence saved to `.sisyphus/evidence/task-{N}-*.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
└── Task 1: Fix amplitude normalization in animation-sampler.ts [quick]

Wave 2 (After Wave 1):
└── Task 2: Add halo-only toggle in main.ts [unspecified-high]

Wave 3 (After Wave 2):
└── Task 3: Build verification + commits [quick]

Wave FINAL (After ALL tasks - 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | - | 2, 3 | 1 |
| 2 | 1 | 3 | 2 |
| 3 | 1, 2 | F1-F4 | 3 |

### Agent Dispatch Summary

- **Wave 1**: 1 task - T1 `quick`
- **Wave 2**: 1 task - T2 `unspecified-high`
- **Wave 3**: 1 task - T3 `quick`
- **FINAL**: 4 tasks - F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high` + `playwright`, F4 `deep`

---

## TODOs

- [x] 1. Fix Idle Bob Amplitude Normalization

  **What to do**:
  - In `monitor-avatar/src/animation-sampler.ts`, modify `createIdleBobSampler` (lines 142-173):
  - After computing `midpoint = (minY + maxY) / 2`, also compute `halfRange = (maxY - minY) / 2`
  - Guard: if `halfRange === 0` (degenerate animation), return `{ sampleOffset: () => 0 }`
  - Change return to: `return (sample.position.y - midpoint) / halfRange` (normalizes to ±1.0)
  - This means `idle_bob_amplitude = 0.04` now produces ±0.04 visible bob (matching the procedural `Math.sin * 0.04`)

  **Must NOT do**:
  - Do NOT modify `AnimationSampler.sample()` - aim overlay uses raw coordinates
  - Do NOT change slider defaults or ranges

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (first task)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `monitor-avatar/src/animation-sampler.ts:142-173` - The `createIdleBobSampler` function. Lines 152-159 compute minY/maxY. Line 162 computes midpoint. Line 170 returns the raw offset. Only line 170 needs to change (divide by halfRange), plus add halfRange computation and guard.
  - `monitor-avatar/src/main.ts:2186-2188` - Where `idle_bob_sampler.sampleOffset(t) * idle_bob_amplitude` is used. After normalization, `sampleOffset` returns ±1.0, so `* 0.04` gives ±0.04.

  **WHY Each Reference Matters**:
  - The sampler function is small (30 lines). The fix is 3-4 lines of change. But the downstream effect is significant - the Halo bob becomes actually visible.
  - The main.ts reference confirms the multiplication chain works correctly after normalization (no second fix needed there).

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Normalized output range
    Tool: Bash (bun)
    Preconditions: animation-sampler.ts modified
    Steps:
      1. Write test script that imports parseJma and createIdleBobSampler
      2. Parse idle.jmm, create bob sampler
      3. Sample at t=0 (should be near -1.0)
      4. Sample at t=0.833 (should be near +1.0)
      5. Verify absolute values are within [0.95, 1.05]
    Expected Result: sampleOffset returns values in [-1.0, +1.0] range
    Failure Indicators: Values still in [-0.175, +0.175] range (not normalized)
    Evidence: .sisyphus/evidence/task-1-normalized.txt

  Scenario: Division by zero guard
    Tool: Bash (bun)
    Preconditions: animation-sampler.ts modified
    Steps:
      1. Create a mock JmaAnimation where all frames have identical Z position
      2. Call createIdleBobSampler with it
      3. Call sampleOffset(0) - should return 0, not NaN/Infinity
    Expected Result: Returns 0 without error
    Evidence: .sisyphus/evidence/task-1-zero-guard.txt
  ```

  **Commit**: YES
  - Message: `fix(animation-sampler): normalize idle bob output to +/-1.0 range`
  - Files: `src/animation-sampler.ts`
  - Pre-commit: `cd monitor-avatar && npx tsc --noEmit`

- [x] 2. Add Halo-Only Mode Toggle

  **What to do**:
  - In `monitor-avatar/src/main.ts`:

  **A. HTML checkbox** - Inside the `data-section-id="halo_anim"` section (after the existing "Aim blend" label, before the closing `</div></div>`), add:
  ```html
  <label><input id="enable_halo_only" type="checkbox" /> Halo-only mode (disable procedural)</label>
  ```

  **B. Element reference** - After the existing `halo_aim_blend_input` mustGetElement call, add:
  ```typescript
  const enable_halo_only_input = mustGetElement<HTMLInputElement>('#enable_halo_only')
  ```

  **C. State variable** - Near the existing `aim_overlay_blend` declaration (~line 714), add:
  ```typescript
  let halo_only_mode = false
  ```

  **D. Per-frame read** - In the animate() frame-read section (after `aim_overlay_blend = parseNumberInput(...)` ~line 2302), add:
  ```typescript
  halo_only_mode = enable_halo_only_input.checked
  ```

  **E. Suppress procedural motion** - In animate(), after all the procedural values are computed but BEFORE they're applied to the transform, add conditional overrides. Specifically:

  After `idle_rot_x` is computed (line ~2190), add:
  ```typescript
  if (halo_only_mode) {
    idle_rot_y = 0
    idle_rot_x = 0
  }
  ```

  After `wander_z` is computed (line ~2195), add:
  ```typescript
  if (halo_only_mode) {
    wander_x = 0
    wander_y = 0
    wander_z = 0
  }
  ```

  For the idle bob ternary (line ~2186), modify to force sampler path when halo-only:
  ```typescript
  const idle_offset_y = ((halo_only_mode || halo_idle_enabled) && idle_bob_sampler)
    ? idle_bob_sampler.sampleOffset(t) * idle_bob_amplitude
    : halo_only_mode ? 0 : Math.sin(t * 0.9) * 0.04
  ```
  This means: halo-only + no sampler = zero bob (not procedural). halo-only + sampler = Halo bob. Normal mode = existing behavior.

  For talk offsets - after the preview motion block computes `talk_offset_x/y/z` and `talk_rot_x/y/z`, add:
  ```typescript
  if (halo_only_mode) {
    talk_offset_x = 0
    talk_offset_y = 0
    talk_offset_z = 0
    talk_rot_x = 0
    talk_rot_y = 0
    talk_rot_z = 0
  }
  ```

  For `wander_bank_z` and `wander_tilt_x` (lines ~2237-2238), add after their computation:
  ```typescript
  if (halo_only_mode) {
    wander_bank_z = 0
    wander_tilt_x = 0
  }
  ```

  **F. Damp persistent state** - For `talk_camera_face_offset_quat` and `talk_camera_approach_offset`:

  Find where `talk_camera_face_offset_quat` is slerped toward the camera direction (line ~2224). Wrap in an else:
  ```typescript
  if (halo_only_mode) {
    // Damp toward identity when in halo-only mode (smooth transition, no snap)
    talk_camera_face_offset_quat.slerp(identity_quat_for_damp, 1 - Math.exp(-3.0 * dt_s))
  } else {
    // existing camera-facing slerp code
    talk_camera_face_offset_quat.slerp(target_quat, ...)
  }
  ```
  Note: you'll need a pre-allocated identity quaternion. Add near the existing scratch quaternions:
  ```typescript
  const identity_quat_for_damp = new THREE.Quaternion() // identity = (0,0,0,1)
  ```

  Similarly for `talk_camera_approach_offset` accumulation (~line 2280):
  ```typescript
  if (halo_only_mode) {
    talk_camera_approach_offset.multiplyScalar(Math.exp(-3.0 * dt_s))
  } else {
    // existing approach offset code
  }
  ```

  **G. Aim overlay bypass attention_amount** - Modify the aim overlay block (line ~2234):
  Change `aim_overlay_blend * attention_amount` to:
  ```typescript
  aim_overlay_blend * (halo_only_mode ? 1.0 : attention_amount)
  ```
  This makes the aim overlay always active in halo-only mode.

  **Must NOT do**:
  - Do NOT touch glow/emissive code
  - Do NOT add per-system toggles
  - Do NOT refactor animate() structure
  - Do NOT suppress model_pos_offset or look_rot (user debug sliders)
  - Do NOT suppress debug_home_pose check
  - Do NOT disable preview buttons in UI
  - Do NOT suppress attention_amount computation itself

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple surgical edits in a 2476-line file, quaternion math, edge case handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `monitor-avatar/src/main.ts:171-179` - Existing "Halo 3 animation" HUD section HTML. New checkbox goes inside this section.
  - `monitor-avatar/src/main.ts:259-262` - Existing `mustGetElement` calls for Halo controls. New call goes after.
  - `monitor-avatar/src/main.ts:710-714` - Module-level Halo animation state variables. New `halo_only_mode` goes here.
  - `monitor-avatar/src/main.ts:2186-2190` - Idle bob + idle rotation. Insert suppression after.
  - `monitor-avatar/src/main.ts:2193-2195` - Wander x/y/z. Insert suppression after.
  - `monitor-avatar/src/main.ts:2067-2106` - Preview motion block that computes talk_offset and talk_rot values.
  - `monitor-avatar/src/main.ts:2220-2228` - Camera-facing slerp for `talk_camera_face_offset_quat`. Wrap in halo_only_mode conditional.
  - `monitor-avatar/src/main.ts:2234` - Aim overlay blend line: `aim_overlay_blend * attention_amount`. Replace attention_amount with conditional.
  - `monitor-avatar/src/main.ts:2237-2238` - `wander_bank_z` and `wander_tilt_x` with independent Math.sin terms.
  - `monitor-avatar/src/main.ts:2280` - `talk_camera_approach_offset` accumulation.
  - `monitor-avatar/src/main.ts:2295-2302` - Frame-read section for UI inputs.
  - `monitor-avatar/src/main.ts:634-638` - Pre-allocated scratch quaternions. Add identity_quat_for_damp here.

  **WHY Each Reference Matters**:
  - The suppression points are spread across ~150 lines of animate(). Missing any one procedural contributor leaves a subtle motion artifact in halo-only mode.
  - The persistent state damping (camera-facing quat, approach offset) prevents jarring snaps when toggling mid-talk. The damp rate of 3.0 means ~0.3s transition.
  - The aim overlay attention bypass makes it the sole rotation source in halo-only mode. Without this, the monitor would be rotation-static when not talking.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Halo-only toggle visible in HUD
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:5173
      2. Wait for model load
      3. Find "Halo 3 animation" section, expand it
      4. Verify checkbox #enable_halo_only exists and is unchecked by default
    Expected Result: Checkbox present, labeled "Halo-only mode (disable procedural)"
    Evidence: .sisyphus/evidence/task-2-halo-only-checkbox.png

  Scenario: Halo-only ON suppresses procedural motion
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate, wait for load + animation fetch
      2. Check #enable_halo_only
      3. Wait 3 seconds
      4. Take 3 screenshots 0.5s apart
      5. Compare: monitor should bob vertically (Halo rhythm) but NOT drift sideways, NOT tilt, NOT face camera
    Expected Result: Visible vertical bob only, no lateral drift or rotation variation beyond aim overlay
    Failure Indicators: Monitor drifts sideways (wander not suppressed), tilts (idle_rot not suppressed), snaps to camera (camera-facing not suppressed)
    Evidence: .sisyphus/evidence/task-2-halo-only-on.png

  Scenario: Toggle OFF restores procedural
    Tool: Playwright
    Preconditions: Halo-only was ON
    Steps:
      1. Uncheck #enable_halo_only
      2. Wait 3 seconds for wander to resume
      3. Take screenshot - monitor should be drifting/tilting again
    Expected Result: Procedural wander and tilt resume smoothly
    Evidence: .sisyphus/evidence/task-2-toggle-off.png

  Scenario: Talk glow works in halo-only mode
    Tool: Playwright
    Preconditions: Halo-only ON, audio playing
    Steps:
      1. Check #enable_halo_only
      2. Click "Enable audio + start"
      3. Wait 2 seconds
      4. Take screenshot - monitor should glow reactively
    Expected Result: Emissive glow pulses with audio (glow system untouched by toggle)
    Evidence: .sisyphus/evidence/task-2-glow-with-halo-only.png
  ```

  **Commit**: YES
  - Message: `feat(monitor-avatar): add halo-only mode toggle`
  - Files: `src/main.ts`
  - Pre-commit: `cd monitor-avatar && npx tsc --noEmit && npx vite build`

- [x] 3. Build Verification

  **What to do**:
  - Run `cd monitor-avatar && npx tsc --noEmit` - must pass with zero errors
  - Run `cd monitor-avatar && npx vite build` - must succeed
  - Verify both commits are clean: `git log --oneline -3`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `monitor-avatar/package.json` - Build scripts

  **Acceptance Criteria**:

  ```
  Scenario: Clean build
    Tool: Bash
    Steps:
      1. cd monitor-avatar && npx tsc --noEmit
      2. cd monitor-avatar && npx vite build
    Expected Result: Both exit 0
    Evidence: .sisyphus/evidence/task-3-build.txt
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** - `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** - `unspecified-high`
  Run `tsc --noEmit` + `vite build`. Review changed files for: `as any`, empty catches, console.log in prod, dead code. Check AI slop patterns.
  Output: `Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** - `unspecified-high` (+ `playwright` skill)
  Start dev server. Test: halo-only ON (no procedural motion visible), halo-only OFF (all motion resumes), toggle mid-talk (smooth transition), debug pose overrides, talk glow works in both modes, amplitude slider produces visible bob.
  Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** - `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 compliance. Check glow code untouched. Check no per-system toggles added. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

| After | Message | Files | Pre-commit check |
|-------|---------|-------|-----------------|
| Task 1 | `fix(animation-sampler): normalize idle bob output to +/-1.0 range` | `src/animation-sampler.ts` | `tsc --noEmit` |
| Task 2 | `feat(monitor-avatar): add halo-only mode toggle` | `src/main.ts` | `tsc --noEmit && vite build` |

---

## Success Criteria

### Verification Commands
```bash
cd monitor-avatar && npx tsc --noEmit  # Expected: no errors
cd monitor-avatar && npx vite build    # Expected: build succeeds
```

### Final Checklist
- [ ] Amplitude bug fixed: slider at 0.04 = visible ±0.04 bob
- [ ] Toggle appears in "Halo 3 animation" HUD section
- [ ] Halo-only ON: only Halo bob + aim overlay drive motion
- [ ] Halo-only OFF: all procedural motion resumes (no regression)
- [ ] Smooth transitions when toggling (no snapping)
- [ ] Talk glow works in both modes
- [ ] Debug home pose overrides everything
