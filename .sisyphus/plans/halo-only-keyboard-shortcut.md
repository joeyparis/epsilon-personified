# Halo-Only Mode Keyboard Shortcut

## TL;DR

> **Quick Summary**: Add a global `H` keyboard shortcut that toggles the existing `#enable_halo_only` checkbox in the monitor-avatar HUD. The per-frame read in `animate()` already picks up the checkbox state, so this is purely a UI affordance - no animation logic changes.
>
> **Deliverables**:
> - `monitor-avatar/src/main.ts` - new `setupHaloOnlyShortcut()` function + one call site
>
> **Estimated Effort**: Tiny (~30 minutes)
> **Parallel Execution**: NO (single implementation task)
> **Critical Path**: Task 1 (shortcut wiring) -> Task 2 (build verification)

---

## Context

### Original Request
Add a keyboard shortcut that toggles the existing "Halo-only mode" checkbox in `/Users/joey/Sites/epsilon/monitor-avatar/src/main.ts`. The checkbox already exists (added by `halo-only-mode.md` plan), is wired to `halo_only_mode` state, and is read every frame in `animate()` via `enable_halo_only_input.checked`. The user wants a faster way to toggle it without expanding the collapsed "Halo 3 animation" HUD section and clicking the checkbox.

### Assumed Decisions (call out if wrong)
- **Key binding**: bare `h` (case-insensitive, no modifiers). Rationale: short, mnemonic, no collision with browser shortcuts (browser-level `h` is unbound), no collision with the only existing keydown listener (element-scoped to h2 collapsibles, not document). If the user prefers `Shift+H` or `Ctrl+H`, swap the predicate in Task 1 - see "Alternative bindings" note in the task body.
- **Scope**: `document`-level listener (works regardless of focus, except when an editable element is focused).
- **Input-focus guard**: skip toggle when `event.target` is `INPUT`, `TEXTAREA`, `SELECT`, or `contenteditable` (prevents stealing keystrokes from form fields - the audio file input, range sliders, and `<audio controls>` are all focusable).
- **Modifier guard**: skip if `ctrlKey`, `metaKey`, or `altKey` is set (avoids hijacking system/browser shortcuts).
- **Repeat guard**: skip `event.repeat` to prevent rapid flicker on key-hold.
- **Visual feedback**: brief status update via existing `setStatus()` showing new state ("Halo-only mode: ON" / "Halo-only mode: OFF"). No auto-expansion of the collapsed HUD section, no DOM mutation beyond `checkbox.checked` and `setStatus()`.

### Metis Review (self-review, since task is small)
**Identified gaps addressed**:
- Toggling `.checked` programmatically does NOT fire `change`/`input` events. Currently no listeners depend on those events for halo-only (per-frame read suffices), but dispatching a `change` event is defensive and future-proof for `<= ~1 line` of cost. Decision: dispatch `change` event after toggle.
- The existing collapsible h2 keydown listener uses `Enter` and `Space` only, scoped to focused h2 elements. Document-level `h` will never reach an h2 listener handler before the document handler runs (handlers are independent), so no collision.
- The audio `<audio controls>` element supports keyboard playback control (Space=play/pause, arrow keys=seek). It does not bind `h`, so no collision. Still, the input-focus guard should treat focused audio elements as "in form context" - check `tagName === 'AUDIO'` too.
- Range sliders (many in HUD) bind arrow keys for fine adjustment. They do not bind `h`. The input-focus guard handles them via `tagName === 'INPUT'`.
- Browser may suppress `keydown` events while devtools are focused - irrelevant for normal use.

---

## Work Objectives

### Core Objective
Add a single global keyboard shortcut (`h`) that toggles the `#enable_halo_only` checkbox, providing visual feedback via the existing status line.

### Concrete Deliverables
- `monitor-avatar/src/main.ts` - one new function `setupHaloOnlyShortcut()` and one call site near the other setup calls (`setupCollapsibleHudSections()`).

### Definition of Done
- [ ] `tsc --noEmit` passes with zero errors
- [ ] `vite build` succeeds
- [ ] Pressing `h` (or `H`) with no element focused toggles the checkbox AND the visual halo-only behavior in the canvas
- [ ] Pressing `h` while an `<input>`, `<textarea>`, `<select>`, `<audio>`, or `[contenteditable]` is focused does NOT toggle (keystroke goes to the field)
- [ ] Pressing `Ctrl+H`, `Cmd+H`, or `Alt+H` does NOT toggle (modifiers excluded)
- [ ] Holding `h` does NOT cause rapid toggling (`event.repeat` skipped)
- [ ] Status line briefly shows the new state ("Halo-only mode: ON" / "Halo-only mode: OFF")
- [ ] Checkbox `.checked` state matches `halo_only_mode` runtime state after toggle (via per-frame read)
- [ ] No regression: clicking the checkbox directly still works identically

### Must Have
- Document-level `keydown` listener
- Case-insensitive match on `event.key === 'h' || event.key === 'H'` (or use `event.key.toLowerCase() === 'h'`)
- All four guards: input-focus, modifier, repeat, and (defensive) `event.defaultPrevented` check
- Programmatic `.checked` toggle followed by `dispatchEvent(new Event('change', { bubbles: true }))`
- Status feedback via existing `setStatus()` (matches existing UI vocabulary)

### Must NOT Have (Guardrails)
- DO NOT modify `halo_only_mode` state directly - toggle the checkbox and let the existing per-frame read pick it up
- DO NOT change the existing `setupCollapsibleHudSections()` keydown handler
- DO NOT add `preventDefault()` unconditionally - only call it when we actually toggled (so unrelated `h` presses propagate normally)
- DO NOT auto-expand the collapsed "Halo 3 animation" HUD section on toggle (out of scope - the section's collapsed state is user-controlled)
- DO NOT introduce a separate `halo_only_mode_via_keyboard` flag or duplicate state - single source of truth is `enable_halo_only_input.checked`
- DO NOT add a tooltip, badge, or persistent UI change indicating the shortcut exists (out of scope - if discoverability matters, file a follow-up)
- DO NOT register the listener inside `setupCollapsibleHudSections()` - keep it in its own setup function for separability
- DO NOT use `keypress` (deprecated) or `keyup` (worse UX) - use `keydown`
- DO NOT bind to `document.body` - use `document` (events bubble; body skips events targeted at non-body roots)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO (no test runner configured in `monitor-avatar/`)
- **Automated tests**: None - verify via `tsc --noEmit`, `vite build`, and Playwright-driven manual QA
- **Framework**: Playwright (matches `halo-only-mode.md` precedent)

### QA Policy
Every task includes agent-executed QA. Evidence saved to `.sisyphus/evidence/halo-shortcut-task-{N}-*.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
└── Task 1: Add setupHaloOnlyShortcut() in main.ts [quick]

Wave 2 (After Wave 1):
└── Task 2: Build verification + commit [quick]

Wave FINAL (After ALL tasks - 2 parallel reviews):
├── F1: Plan compliance audit (oracle)
└── F2: Real manual QA via Playwright (unspecified-high + playwright)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | - | 2 | 1 |
| 2 | 1 | F1, F2 | 2 |

### Agent Dispatch Summary

- **Wave 1**: 1 task - T1 `quick`
- **Wave 2**: 1 task - T2 `quick`
- **FINAL**: 2 tasks - F1 `oracle`, F2 `unspecified-high` + `playwright`

---

## TODOs

- [ ] 1. Add Halo-Only Keyboard Shortcut

  **What to do**:
  In `monitor-avatar/src/main.ts`, make three additions:

  **A. New setup function** - Add `setupHaloOnlyShortcut()` defined alongside `setupCollapsibleHudSections()` (after the existing function, around line 405):
  ```typescript
  function setupHaloOnlyShortcut(): void {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'AUDIO') return true
      if (target.isContentEditable) return true
      return false
    }

    document.addEventListener('keydown', (ev) => {
      if (ev.repeat) return
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return
      if (ev.defaultPrevented) return
      if (ev.key.toLowerCase() !== 'h') return
      if (isEditableTarget(ev.target)) return

      ev.preventDefault()

      enable_halo_only_input.checked = !enable_halo_only_input.checked
      enable_halo_only_input.dispatchEvent(new Event('change', { bubbles: true }))

      setStatus(`Halo-only mode: ${enable_halo_only_input.checked ? 'ON' : 'OFF'}`)
    })
  }
  ```

  **B. Call site** - Right after the existing `setupCollapsibleHudSections()` invocation (line 344), add:
  ```typescript
  setupHaloOnlyShortcut()
  ```

  **C. (No state changes)** - The existing per-frame read at line 2526 (`halo_only_mode = enable_halo_only_input.checked`) handles propagation automatically. Do NOT touch.

  **Alternative bindings** (only if user requests):
  - For `Shift+H`: replace `if (ev.key.toLowerCase() !== 'h') return` with `if (!ev.shiftKey || ev.key !== 'H') return`. Drop the case-insensitive check; require explicit `shiftKey`.
  - For `Ctrl/Cmd+H`: replace modifier guard to require `(ev.ctrlKey || ev.metaKey)` and check `ev.key.toLowerCase() === 'h'`. Note: `Cmd+H` on macOS is bound to "Hide Window" by the OS - browser may not receive it. Test before committing.

  **Must NOT do**:
  - Do NOT add the listener inside `setupCollapsibleHudSections()` or any other existing function
  - Do NOT modify `halo_only_mode` directly - go through the checkbox
  - Do NOT call `preventDefault()` outside the matched-key path
  - Do NOT expand the collapsed HUD section on toggle
  - Do NOT add new module-level state variables
  - Do NOT add visible UI hint about the shortcut (out of scope)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: ~25 lines, single file, no logic branches in animate(), no quaternion math, no edge-case animation behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (only task in Wave 1)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `monitor-avatar/src/main.ts:178` - The `<input id="enable_halo_only" type="checkbox" />` markup. Source of truth for the checkbox ID.
  - `monitor-avatar/src/main.ts:275` - `const enable_halo_only_input = mustGetElement<HTMLInputElement>('#enable_halo_only')`. Already in scope at module level.
  - `monitor-avatar/src/main.ts:343-344` - Existing setup-function call site (`setupRangeValueLabels()`, `setupCollapsibleHudSections()`). New call goes here.
  - `monitor-avatar/src/main.ts:346-405` - `setupCollapsibleHudSections()` function. Insert new function definition immediately after this.
  - `monitor-avatar/src/main.ts:395-399` - Existing keydown listener (h2 collapsibles). Confirms it's element-scoped, not document-scoped. No collision with the new global handler.
  - `monitor-avatar/src/main.ts:407-409` - `setStatus()` definition. Used for visual feedback.
  - `monitor-avatar/src/main.ts:756` - `let halo_only_mode = false` declaration. Confirms single source of truth.
  - `monitor-avatar/src/main.ts:2526` - Per-frame read `halo_only_mode = enable_halo_only_input.checked`. Confirms checkbox toggle is sufficient.

  **WHY Each Reference Matters**:
  - The checkbox element reference (line 275) is already module-level, so the new function has access without needing parameters or DOM lookups.
  - The existing setup-function pattern (line 343-344) is the right place to call our new setup - keeps initialization grouped.
  - The existing h2 keydown listener (line 395) confirms there's no document-level keyboard handler to coordinate with.
  - The per-frame read (line 2526) is the integration point - we don't need to push state anywhere else; just toggle the input.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Bare 'h' toggles checkbox when no element focused
    Tool: Playwright
    Preconditions: Dev server running, model loaded
    Steps:
      1. Navigate to http://localhost:5173
      2. Wait for "Loading model..." to clear
      3. Click on canvas (defocus any HUD inputs)
      4. Read initial state: evaluate document.querySelector('#enable_halo_only').checked
      5. Press 'h'
      6. Read state again
      7. Press 'h' again
      8. Read state again
    Expected Result: State flips on each press (false -> true -> false)
    Failure Indicators: State unchanged, console error, page navigation
    Evidence: .sisyphus/evidence/halo-shortcut-task-1-bare-h.png + state log

  Scenario: 'H' (uppercase, Shift+h) also toggles
    Tool: Playwright
    Preconditions: Same as above
    Steps:
      1. Defocus all HUD inputs
      2. Press 'Shift+h'
      3. Verify checkbox state flipped
    Expected Result: Toggle fires (case-insensitive match)
    Evidence: .sisyphus/evidence/halo-shortcut-task-1-shift-h.txt

  Scenario: Modifier combos do NOT toggle
    Tool: Playwright
    Steps:
      1. Note initial checkbox state
      2. Press 'Ctrl+h'
      3. Verify state unchanged
      4. Press 'Alt+h'
      5. Verify state unchanged
      6. (Skip Cmd+h on macOS - OS may intercept before browser sees it)
    Expected Result: Checkbox state unchanged across all modifier combos
    Evidence: .sisyphus/evidence/halo-shortcut-task-1-modifiers.txt

  Scenario: Focused input swallows 'h' (no toggle)
    Tool: Playwright
    Steps:
      1. Note initial checkbox state
      2. Focus an input - e.g. document.querySelector('#idle_glow').focus()
      3. Press 'h'
      4. Verify checkbox state unchanged
      5. Verify focused input did NOT receive a side-effect (range value unchanged)
    Expected Result: Toggle skipped, no preventDefault interference with focused control
    Evidence: .sisyphus/evidence/halo-shortcut-task-1-focused-input.txt

  Scenario: Held 'h' does not flicker
    Tool: Playwright
    Steps:
      1. Defocus inputs, note initial state
      2. Press and hold 'h' for 500ms (use page.keyboard.down then page.waitForTimeout(500) then page.keyboard.up)
      3. Verify checkbox state flipped exactly once (event.repeat skipped)
    Expected Result: Single toggle, not N toggles
    Evidence: .sisyphus/evidence/halo-shortcut-task-1-repeat-guard.txt

  Scenario: Toggle drives the same animation behavior as clicking
    Tool: Playwright
    Steps:
      1. Defocus inputs
      2. Press 'h' to enable halo-only mode
      3. Wait 2s
      4. Take screenshot
      5. Press 'h' again to disable
      6. Wait 2s
      7. Take screenshot
      8. Compare to screenshots from manually clicking the checkbox in halo-only-mode.md QA evidence (or take fresh click-driven screenshots in the same session)
    Expected Result: Visual behavior identical between keyboard-toggle and click-toggle
    Evidence: .sisyphus/evidence/halo-shortcut-task-1-keyboard-vs-click.png (2 panels)

  Scenario: Status line shows feedback
    Tool: Playwright
    Steps:
      1. Press 'h'
      2. Read document.querySelector('#status_el').textContent
    Expected Result: Text contains "Halo-only mode: ON" or "Halo-only mode: OFF"
    Evidence: .sisyphus/evidence/halo-shortcut-task-1-status.txt
  ```

  **Commit**: YES
  - Message: `feat(monitor-avatar): add 'h' keyboard shortcut to toggle halo-only mode`
  - Files: `src/main.ts`
  - Pre-commit: `cd monitor-avatar && npx tsc --noEmit`

- [ ] 2. Build Verification

  **What to do**:
  - Run `cd monitor-avatar && npx tsc --noEmit` - must pass with zero errors
  - Run `cd monitor-avatar && npm run build` (which runs `tsc && vite build`) - must succeed
  - Verify the commit from Task 1 is on the current branch: `git log --oneline -1`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: F1, F2
  - **Blocked By**: Task 1

  **References**:
  - `monitor-avatar/package.json` - `build` script runs `tsc && vite build`

  **Acceptance Criteria**:

  ```
  Scenario: Clean build
    Tool: Bash
    Steps:
      1. cd monitor-avatar && npx tsc --noEmit  -> exit 0
      2. cd monitor-avatar && npm run build      -> exit 0
    Expected Result: Both exit 0, no warnings about unused variables
    Evidence: .sisyphus/evidence/halo-shortcut-task-2-build.txt
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave

> 2 review agents run in PARALLEL. Both must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** - `oracle`
  Read this plan end-to-end. For each "Must Have": verify the diff contains it. For each "Must NOT Have": grep the diff for forbidden patterns (e.g., `halo_only_mode =` outside line 2526; new module-level state additions; new `setStatus` calls in animate(); auto-expansion of HUD section). Confirm all 7 QA scenarios produced evidence files.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | QA Evidence [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Real Manual QA** - `unspecified-high` (+ `playwright` skill)
  Start dev server. Run all 7 QA scenarios from Task 1 fresh. Capture evidence. Additionally probe: rapid-fire 'h' presses (10 in a row, ~50ms apart) - state should match starting state if even count, flipped if odd; pressing 'h' inside a `<select>` (if any exists - check `select_recommended_button` is a button not select, so probably no `<select>` in HUD; skip if absent); pressing 'h' while clicking on canvas (focus is on canvas, not an input - should toggle).
  Output: `Scenarios [N/N pass] | Edge cases [N/N pass] | VERDICT`

---

## Commit Strategy

| After | Message | Files | Pre-commit check |
|-------|---------|-------|-----------------|
| Task 1 | `feat(monitor-avatar): add 'h' keyboard shortcut to toggle halo-only mode` | `src/main.ts` | `tsc --noEmit` |

---

## Success Criteria

### Verification Commands
```bash
cd monitor-avatar && npx tsc --noEmit  # Expected: no errors
cd monitor-avatar && npm run build     # Expected: build succeeds
```

### Final Checklist
- [ ] Pressing `h` (or `H`) anywhere outside an editable element toggles the checkbox AND the visual halo-only behavior
- [ ] Modifier-combo `h` presses (Ctrl/Cmd/Alt) are ignored
- [ ] Holding `h` produces exactly one toggle, not many
- [ ] Focused inputs/textareas/audio still receive their `h` keystrokes normally
- [ ] Status line shows "Halo-only mode: ON" or "Halo-only mode: OFF" on each toggle
- [ ] No regression: mouse-click on the checkbox still works identically to before
- [ ] Build (`tsc --noEmit && vite build`) is clean
