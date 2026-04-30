# Multi-Profile OpenCode Migration: Premium Authoring + Cheap Execution

## TL;DR

> **Quick Summary**: Build a multi-profile opencode setup using `OPENCODE_CONFIG_DIR`-based directories (NOT `OPENCODE_CONFIG` single files - that pattern is broken). Use Joey's remaining premium subscription days to author cheap-model-tuned agent prompts for the 5 critical premium-bound agents. Verify architectural assumptions in Wave 0 BEFORE spending premium time.
>
> **Deliverables**:
> - 5 profile directories: `~/.config/opencode/profiles/{premium,glm,kimi,codex,anthropic-metered}/`
> - Re-authored agent prompts for sisyphus, prometheus, metis, oracle, momus (cheap-model compensation patterns)
> - 5-scenario benchmark suite + cross-profile scorecard
> - Shell aliases (oc-premium, oc-glm, oc-kimi, oc-codex, oc-anthropic-metered)
> - Documentation: profile precedence chain, per-agent fallback recipe, rollback procedure
> - Pre-flight verification gate: caching + cost reporting + precedence + auth persistence
>
> **Estimated Effort**: Large (architecture migration with time pressure)
> **Premium Time Window**: 4-7 days remaining (confirmed)
> **Parallel Execution**: YES - 6 waves, max 7 concurrent in Wave 1
> **Critical Path**: Prerequisites (USER signups) -> Wave 0 verifications -> Wave 1 scaffolding+benchmarks -> Wave 2 premium authoring (SEQUENTIAL) -> Wave 3 cross-profile benchmark -> Wave 4 iteration+GPT routing -> Wave 5 docs -> Final review (F1-F4) -> user explicit okay -> create premium-baseline-final tag -> Task 37 verifies tag
> **Manual Prerequisites**: 4 subscription signups required before Sisyphus can fully execute (see Prerequisites section). Joey can run these in parallel with Wave 0 Tasks 1, 2, 6.

---

## Context

### Original Request
Joey's premium Anthropic and OpenAI subscriptions expire in a few days due to a job change. He wants to:
1. Migrate to cheaper subscriptions: GLM 4.6 ($10-18/mo), Kimi K2 ($19/mo unconfirmed), ChatGPT Plus ($20/mo)
2. Use remaining premium time to AUTHOR agent prompts that compensate for cheaper models' weaknesses
3. Keep Anthropic API pay-as-you-go (~$20/mo budget) for planning agents only as a quality safety net
4. Share MCPs and skills across all profiles

### Interview Summary

**Confirmed Decisions**:
- **Cheap profile targets**: All three - GLM 4.6, Kimi K2, Codex (via native `codex mcp-server`)
- **Tuning depth**: HEAVY - aggressive decomposition, more verification loops, smaller turn scopes
- **Agent strategy**: Hybrid - planning agents on Anthropic-metered (~$20 budget cap), execution agents on GLM/Kimi
- **Profile location**: `~/.config/opencode/profiles/{name}/` (directories, NOT single files - corrected per Metis)
- **Switching**: `OPENCODE_CONFIG_DIR`-based aliases + per-project defaults (precedence: profile dir wins because it loads after project)
- **Verification**: 5-scenario benchmark suite, cross-profile scorecard

### Research Findings

**OpenCode Config Mechanics** (from opencode docs + binary inspection):
- Load order (last wins): remote -> global -> `OPENCODE_CONFIG` -> **project** -> **`.opencode/` and `OPENCODE_CONFIG_DIR`** -> `OPENCODE_CONFIG_CONTENT` -> managed
- `OPENCODE_CONFIG` LOSES to project files (Joey's original assumption was wrong)
- `OPENCODE_CONFIG_DIR` WINS over project files (correct mechanism)
- No native `extends`/`$ref`, but merge order makes overlays work
- Skills auto-discovered globally (53 skills, no duplication)
- MCPs in opencode.json merge across configs (1 global + 18 skill MCPs all shared)

**Plugin Behavior** (from `node_modules/oh-my-opencode/dist/index.js:17909`):
- `oh-my-openagent.json` plugin honors `OPENCODE_CONFIG_DIR` but NOT `OPENCODE_CONFIG`
- This forces profile architecture to be DIRECTORY-based

**Provider Configs** (verified):
- GLM 4.6: `https://api.z.ai/api/coding/paas/v4`, model `glm-4.6`, Bearer auth, key format `{API_KEY_ID}.{secret}`
  - PRICING DISCREPANCY: docs show both $10/mo (opencode integration page) and $18/mo (official pricing page)
- Kimi Code: `https://api.kimi.com/coding/v1`, model `kimi-for-coding`, Bearer auth
  - $19 NOT publicly confirmed in docs
- Codex CLI: native `codex mcp-server` mode (no custom wrapper needed), ChatGPT sign-in or API key

**Current Agent Routing** (from `oh-my-openagent.json`):
| Currently on Anthropic Opus (PREMIUM) | Currently on OpenAI GPT-5.4 (PREMIUM) | On Sonnet/Mini |
|---|---|---|
| sisyphus, prometheus, metis | build, plan, hephaestus, oracle, multimodal-looker, momus, church | general, atlas, explore, librarian |

**Wave 1 Critical Path (LOCKED)**: sisyphus, prometheus, metis, oracle, momus
**Deferred (post-expiry tuning)**: build, plan, hephaestus, multimodal-looker, church, general, atlas, explore, librarian

### Metis Review

**Critical findings addressed**:
- Architecture corrected from `OPENCODE_CONFIG`-single-file to `OPENCODE_CONFIG_DIR`-directory
- `oh-my-openagent.json` profile interaction resolved (must be in profile dir)
- Wave 0 pre-flight verifications added (4 cheap tests prevent expensive mistakes)
- Snapshot strategy added before any prompt edit
- Premium-time scope locked to 5 agents (sisyphus, prometheus, metis, oracle, momus)
- Benchmark scope locked to 5 scenarios
- Iteration cap: 2 tuning passes per agent max
- GPT-5.4 expiry impact flagged - 7 affected agents (decision deferred to Wave 4 post-benchmark)
- Anthropic caching verification flagged as #1 highest-leverage test

**Identified Gaps Resolved**:
- Cross-profile delegation behavior documented
- Plugin compatibility (cost-guard, openviking-memory) flagged as known risks
- Codex CLI rate limit unknown -> handled in benchmark scenario design
- Multi-machine sync -> assumed single machine (Joey single-machine confirmed)
- OpenViking memory degradation on cheap models -> known risk, monitor post-migration

---

## Work Objectives

### Core Objective
Migrate from premium-only opencode setup to a multi-profile architecture that lets Joey continue working effectively after premium subscriptions expire, by front-loading premium-time agent authoring during the remaining access window.

### Concrete Deliverables

1. **Profile directories** under `~/.config/opencode/profiles/`:
   - `premium/` (snapshot of current premium state - reference baseline)
   - `glm/` (GLM 4.6 provider, agent overrides, MCP overlay)
   - `kimi/` (Kimi K2/Code provider, agent overrides, MCP overlay)
   - `codex/` (Codex MCP server config, agent overrides for GPT-5/5.1)
   - `anthropic-metered/` (Anthropic API pay-as-you-go for planners only)

2. **Re-authored agent prompts** (5 critical agents) compensating for cheap-model weaknesses:
   - `sisyphus` - executor, MUST work reliably on GLM/Kimi
   - `prometheus` - planner, MUST produce structured output on cheap models
   - `metis` - gap analyzer, requires reasoning depth
   - `oracle` - high-IQ consultant, requires reasoning depth
   - `momus` - critical reviewer, requires nuance

3. **Benchmark suite** with 5 scenarios, runnable cross-profile, with concrete pass criteria

4. **Shell aliases** in `~/.zshrc` (or appropriate shell config):
   - `oc-premium`, `oc-glm`, `oc-kimi`, `oc-codex`, `oc-anthropic-metered`
   - Each uses `OPENCODE_CONFIG_DIR=...` (NOT `OPENCODE_CONFIG`)

5. **Documentation**:
   - Profile precedence chain (corrected from research)
   - Per-agent fallback recipe (cost-per-invocation table)
   - Rollback procedure
   - Anthropic-metered budget reality (post-caching-verification)

6. **Snapshots**:
   - `premium-baseline-pre-migration` (before first edit)
   - `premium-baseline-final` (after all premium-time work, before expiry)

### Definition of Done

- [ ] Wave 0 pre-flight verifications all pass (or plan is reworked if any fail)
- [ ] All 5 profile directories exist and pass smoke test (`opencode run -m {model} "echo ready"` returns within 30s)
- [ ] All 5 critical agents have re-authored prompts saved to their respective profile dirs
- [ ] Benchmark suite runs end-to-end on each profile with documented results
- [ ] All shell aliases work (precedence test passes)
- [ ] `cost-aware-delegation.md` rule updated with cheap-model cost data
- [ ] Documentation written and reviewed
- [ ] Final snapshot tagged before premium expires

### Must Have (Non-Negotiable)

- **MUST**: Use `OPENCODE_CONFIG_DIR`-based profiles (single-file `OPENCODE_CONFIG` is broken)
- **MUST**: Wave 0 verifications complete BEFORE Wave 2 premium-time authoring begins
- **MUST**: Snapshot taken before first agent prompt edit
- **MUST**: Each profile dir contains both `opencode.json` AND `oh-my-openagent.json` (plugin requires latter)
- **MUST**: Skills directory remain shared via auto-discovery (no copying)
- **MUST**: 5-agent Wave 1 critical path (sisyphus, prometheus, metis, oracle, momus) - no scope expansion mid-flight
- **MUST**: After each premium-authored agent, immediately benchmark on target cheap profile (NO BATCHING)
- **MUST**: Hard cap of 2 tuning iterations per agent
- **MUST**: Document `OPENCODE_CONFIG_DIR` precedence chain accurately

### Prerequisites (USER ACTIONS - complete before `/start-work`)

> Sisyphus cannot complete signups or web purchases. These manual steps must happen first.
> Premium-time window confirmed: 4-7 days. Run signups in parallel with Wave 0 verifications to maximize remaining premium time.

- [ ] **P1. GLM Coding Plan signup**
  - Visit: https://docs.z.ai/scenario-example/develop-tools/opencode (or pricing page)
  - **Verify pricing at checkout** - docs show conflicting $10/mo and $18/mo. Abort if not as expected.
  - Generate API key (format: `{API_KEY_ID}.{secret}`)
  - Set env var: `export GLM_API_KEY="..."` in `~/.zshrc` (or `.env` file referenced by opencode)

- [ ] **P2. Kimi subscription signup**
  - Visit: https://www.kimi.com/code/ (Kimi Code) or https://platform.kimi.ai (Kimi K2 pay-per-token)
  - **Verify pricing at checkout** - $19/mo NOT publicly confirmed in docs. Abort if pricing differs significantly.
  - **Decide product**: Kimi K2 API (api.moonshot.ai) OR Kimi Code (api.kimi.com/coding/v1) - plan recommends Kimi Code subscription for predictable cost
  - **Record choice**: After signup, write either `kimi-code` or `kimi-k2` (lowercase, no quotes) to `.sisyphus/evidence/p2-kimi-choice.txt`. Task 4 reads this file to decide which endpoint to test.
  - Generate API key
  - Set env var (use SAME variable name regardless of product choice for consistency): `export KIMI_API_KEY="..."` in `~/.zshrc`

- [ ] **P3. ChatGPT Plus + Codex CLI**
  - Active ChatGPT Plus subscription ($20/mo)
  - Install Codex CLI: `npm install -g @openai/codex` (or per official docs)
  - Authenticate: `codex login` (uses ChatGPT Plus account)
  - Verify: `codex --version` returns successfully

- [ ] **P4. Anthropic API key (pay-as-you-go for metered profile)**
  - Get API key from https://console.anthropic.com
  - This is for the post-expiry planner-only fallback ($20/mo target via prompt caching - validated in Wave 0 Task 2)
  - Set env var: `export ANTHROPIC_API_KEY="..."`

- [ ] **P5. Verify shell env + recorded choices**
  - Run: `echo "GLM=$GLM_API_KEY KIMI=$KIMI_API_KEY ANTHROPIC=$ANTHROPIC_API_KEY" | grep -cE '[a-zA-Z0-9]{16,}'` returns 3 (or 2 if Anthropic key intentionally deferred)
  - Confirm Codex auth: `codex --version && test -f ~/.codex/auth.json` (or equivalent persistent auth artifact)
  - Confirm Kimi product choice recorded: `cat .sisyphus/evidence/p2-kimi-choice.txt | grep -E "^(kimi-code|kimi-k2)$"`
  - All keys must be set (length >= 16 chars) AND choice file present before Wave 0 starts

> **Note**: P1-P4 can be done in parallel by Joey while Sisyphus runs Wave 0 Tasks 1, 2, 6 (which don't require new keys). Wave 0 Tasks 3, 4, 5 are blocked until P1, P2, P3 complete.

---

### Must NOT Have (Guardrails)

- **MUST NOT**: Use `OPENCODE_CONFIG=path/to/file.json` as the profile-switching mechanism (it loses to project files)
- **MUST NOT**: Symlink `node_modules` between profile dirs (each profile's plugin install is independent)
- **MUST NOT**: Re-author agents not in the explicit Wave 1 critical path during premium time
- **MUST NOT**: Design "comprehensive" benchmark suite - exactly 5 scenarios, each a real workflow
- **MUST NOT**: Create multiple alias variants per provider (one alias per profile)
- **MUST NOT**: Add new opencode features during migration ("while I'm here..." scope creep)
- **MUST NOT**: Tune for hypothetical weaknesses - tune for OBSERVED weaknesses from benchmark
- **MUST NOT**: Iterate more than 2 tuning passes per agent
- **MUST NOT**: Use vague acceptance criteria like "Joey verifies output is good" - all criteria must be agent-executable
- **MUST NOT**: Tune skills (53 skills, out of scope)
- **MUST NOT**: Tune custom plugins (cost-guard, opencode-monitor, openviking-memory, tmux-title-sync - out of scope)
- **MUST NOT**: Spend premium time on documentation or benchmarking - those use cheap-tier models

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: NO (this is config/migration work, not application code)
- **Automated tests**: NO unit tests - benchmark suite IS the verification mechanism
- **Framework**: Bash + opencode CLI for benchmark scenarios
- **Approach**: Each task includes agent-executable QA scenarios that run real opencode commands and verify outputs

### QA Policy

Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

- **Profile config tasks**: Use Bash - `opencode run --config-dir=... -m model "prompt"` and parse output
- **Agent re-authoring tasks**: Use Bash - run benchmark scenario assigned to that agent, compare against expected output
- **Verification tasks**: Use Bash - deterministic shell scripts with `exit 0`/`exit 1`
- **Documentation tasks**: Use Bash - run linter/markdown checks, validate links

### Pre-Flight Verifications (Wave 0 - MUST PASS)

Wave 2 (premium-time authoring) MUST NOT begin until ALL Wave 0 verifications pass. If any fail, replan before proceeding.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Pre-flight verifications - MUST PASS before Wave 2):
├── Task 1: Verify OPENCODE_CONFIG_DIR precedence over project config [quick]
├── Task 2: Verify Anthropic prompt caching works in opencode [quick - HIGHEST LEVERAGE]
├── Task 3: Verify GLM provider reports cost (requires GLM signup first) [quick]
├── Task 4: Verify Kimi provider reports cost (requires Kimi signup first) [quick]
├── Task 5: Verify Codex MCP server auth persists across restarts [quick]
├── Task 6: Snapshot current premium baseline (git tag or backup) [quick]
└── Task 7: Verify cost-guard plugin reads cheap-provider costs [quick]

Wave 1 (Foundation - PARALLEL after Wave 0):
├── Task 8: Profile directory scaffolding (all 5 profiles) [quick]
├── Task 9: GLM provider config + agent overrides [quick]
├── Task 10: Kimi provider config + agent overrides [quick]
├── Task 11: Codex MCP server config + agent overrides [quick]
├── Task 12: Anthropic-metered config + planner agent overrides [quick]
├── Task 13: Premium baseline profile (copy current state) [quick]
├── Task 14: Shell aliases setup (~/.zshrc) [quick]
├── Task 15: Smoke tests for each profile [quick]
└── Task 16: Benchmark suite design - 5 scenarios with pass criteria [deep - PREMIUM]

Wave 2 (Premium-Time Agent Re-Authoring - SEQUENTIAL):
> Per Metis directive: NO BATCHING. Author one agent, benchmark immediately, iterate or commit, then next.
├── Task 17: Re-author Sisyphus prompt + benchmark [deep - PREMIUM]
├── Task 18: Re-author Prometheus prompt + benchmark [deep - PREMIUM]
├── Task 19: Re-author Metis prompt + benchmark [deep - PREMIUM]
├── Task 20: Re-author Oracle prompt + benchmark [deep - PREMIUM]
└── Task 21: Re-author Momus prompt + benchmark [deep - PREMIUM]

Wave 3 (Cross-Profile Benchmark + Scorecard - PARALLEL):
├── Task 22: Run full benchmark on premium baseline profile [unspecified-high]
├── Task 23: Run full benchmark on GLM profile [unspecified-high]
├── Task 24: Run full benchmark on Kimi profile [unspecified-high]
├── Task 25: Run full benchmark on Codex profile [unspecified-high]
├── Task 26: Run full benchmark on anthropic-metered profile [unspecified-high]
└── Task 27: Compile cross-profile scorecard + identify weakest agents [deep]

Wave 4 (Iteration + GPT-5.4 Routing - depends on Wave 3 scorecard):
├── Task 28: Apply ONE tuning pass to weakest agent in worst profile [deep - PREMIUM if available]
├── Task 29: Apply ONE tuning pass to second-weakest agent [deep - PREMIUM if available]
├── Task 30: Decide GPT-5.4 agent routing per [DECISION NEEDED] [quick]
├── Task 31: Update profile configs to route GPT-5.4 agents [quick]
└── Task 32: Re-benchmark agents affected by Task 28-31 changes [unspecified-high]

Wave 5 (Documentation + Rollback - cheap-tier):
├── Task 33: Document profile precedence chain (corrected) [writing]
├── Task 34: Document per-agent fallback recipe with cost table [writing]
├── Task 35: Document Anthropic-metered budget reality [writing]
├── Task 36: Update cost-aware-delegation.md rule [writing]
└── Task 37: Final premium-baseline snapshot before expiry [quick]

Wave FINAL (Review - 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Config quality review (unspecified-high)
├── Task F3: Real manual QA - end-to-end profile smoke (unspecified-high + playwright N/A here)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: P1-P5 (user) -> 1,2,6 -> 8 -> 16 -> 17 -> 18 -> 19 -> 20 -> 21 -> 22-26 -> 27 -> 28-32 -> 33-36 -> F1-F4 -> user okay -> create final tag -> 37 (verify tag)
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 7 (Wave 0 and Wave 1 each have 7 parallelizable tasks)
```

### Dependency Matrix (Detailed)

- **Prerequisites P1-P5**: USER actions, blocking Wave 0 Tasks 3, 4, 5 respectively. P5 (env verification) blocks all of Tasks 3, 4, 5.
- **Task 1** (precedence test): No deps. Blocks Tasks 14, 22-26 (anything using OPENCODE_CONFIG_DIR).
- **Task 2** (caching test): Blocked by P4 (ANTHROPIC_API_KEY env var) + P5 (env verification). Blocks Task 12 (anthropic-metered config), Task 35 (budget docs).
- **Task 3** (GLM cost): Blocked by P1 (GLM signup + key). Blocks Task 7 (cost-guard verification needs GLM working), Task 9 (GLM profile config).
- **Task 4** (Kimi cost): Blocked by P2. Blocks Task 7, Task 10.
- **Task 5** (Codex auth): Blocked by P3. Blocks Task 11.
- **Task 6** (snapshot): No deps. Blocks Tasks 17-21 (premium authoring needs baseline first).
- **Task 7** (cost-guard verify): Blocked by Tasks 3 + 4 (needs both providers working).
- **Tasks 8-16 (Wave 1)**: Task 8 blocks 9-13. Task 9 blocked by Tasks 3, 7, 8. Task 10 blocked by Tasks 4, 7, 8. Task 11 blocked by Tasks 5, 8. **Task 12 blocked by P4 + P5 + Task 2 (caching) + Task 8** (anthropic-metered profile needs API key, env verified, caching reality known, dirs scaffolded). Task 13 blocked by Tasks 6, 8. Task 14 blocked by 8-13. Task 15 blocked by 14. Task 16 blocked by Tasks 1, 6.
- **Tasks 17-21 (Wave 2)**: STRICTLY SEQUENTIAL. Task 17 blocked by Wave 1 done. Task 18 blocked by 17. Task 19 by 18. Task 20 by 19. Task 21 by 20.
- **Tasks 22-26 (Wave 3)**: Each blocked by Wave 2 (Task 21) done. Each blocked by its respective profile config Task 9-13 + Task 16 (benchmarks). Parallel within wave.
- **Task 27**: Blocked by Tasks 22-26.
- **Tasks 28-29 (Wave 4)**: Blocked by Task 27. Parallel with each other.
- **Task 30**: Blocked by Task 27 (needs scorecard for routing recommendation table).
- **Task 31**: Blocked by Task 30 (applies decisions). Plus blocked by user reviewing the [DECISION NEEDED] table from Task 30.
- **Task 32**: Blocked by Tasks 28, 29, 31.
- **Tasks 33-36 (Wave 5)**: Task 33 blocked by Task 1. Task 34 blocked by Task 27 + Task 32. Task 35 blocked by Tasks 2, 26. Task 36 blocked by Task 27.
- **Task 37**: Blocked by Tasks 33-36 AND F1-F4 approval (this is the POST-REVIEW final tag, distinct from Task 6 PRE-migration tag). See note below.
- **F1-F4 (Wave FINAL)**: Blocked by Tasks 33-36. Parallel within wave.

> **Task 37 Timing Note**: Per the Commit Strategy section, the `premium-baseline-final` tag should be created AFTER F1-F4 approve and user provides explicit "okay". Task 37's QA verifies the tag exists; the tag itself is created at the very end of the workflow as the final artifact.

### Agent Dispatch Summary

- **Wave 0**: 7 tasks - All `quick` (verification scripts, no premium needed)
- **Wave 1**: 9 tasks - 8 `quick` + 1 `deep` (benchmark design needs premium)
- **Wave 2**: 5 tasks - All `deep` (premium-time agent authoring + benchmark)
- **Wave 3**: 6 tasks - 5 `unspecified-high` (benchmark execution) + 1 `deep` (scorecard analysis)
- **Wave 4**: 5 tasks - 2 `deep` (premium tuning) + 2 `quick` (config updates) + 1 `unspecified-high` (re-benchmark)
- **Wave 5**: 5 tasks - All `writing` (cheap-tier docs)
- **Wave FINAL**: 4 reviews - F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

### Wave 0: Pre-Flight Verifications

- [x] 1. Verify `OPENCODE_CONFIG_DIR` precedence over project config

  **What to do**:
  - Create test fixtures: `/tmp/opencode-precedence-test/project/opencode.json` with model A
  - Create `/tmp/opencode-precedence-test/profile/opencode.json` with model B
  - Run opencode from project dir with `OPENCODE_CONFIG_DIR=/tmp/opencode-precedence-test/profile`
  - Verify model B is used (profile wins over project)
  - Save evidence to `.sisyphus/evidence/task-1-precedence.md`

  **Must NOT do**:
  - Test with `OPENCODE_CONFIG=` (already known broken - Metis Finding 1)
  - Modify Joey's actual `~/.config/opencode/` during this test

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-script verification, no complex reasoning needed
  - **Skills**: []
    - No skills needed - pure shell scripting

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with Tasks 2-7)
  - **Blocks**: Tasks 8-16 (Wave 1 needs precedence confirmed)
  - **Blocked By**: None (can start immediately)

  **References**:
  - Metis findings (Finding 1 in plan Context section): documented merge order from binary inspection
  - opencode docs: https://opencode.ai/docs/config (load order documentation)

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: OPENCODE_CONFIG_DIR overrides project opencode.json
    Tool: Bash
    Preconditions: opencode CLI installed, no active opencode session
    Steps:
      1. mkdir -p /tmp/opencode-precedence-test/{project,profile}
      2. Write /tmp/opencode-precedence-test/project/opencode.json: {"model": "anthropic/claude-haiku-4-5"}
      3. Write /tmp/opencode-precedence-test/profile/opencode.json: {"model": "anthropic/claude-sonnet-4-5"}
      4. cd /tmp/opencode-precedence-test/project && OPENCODE_CONFIG_DIR=/tmp/opencode-precedence-test/profile opencode --print-config 2>&1 | tee /tmp/precedence-output.txt
      5. grep -q "claude-sonnet-4-5" /tmp/precedence-output.txt
    Expected Result: grep returns 0 (sonnet model active, profile wins over project)
    Failure Indicators: haiku-4-5 in output (project won), or no model field at all
    Evidence: .sisyphus/evidence/task-1-precedence-pass.txt

  Scenario: OPENCODE_CONFIG (single file) loses to project (regression test)
    Tool: Bash
    Preconditions: same as above
    Steps:
      1. cd /tmp/opencode-precedence-test/project && OPENCODE_CONFIG=/tmp/opencode-precedence-test/profile/opencode.json opencode --print-config 2>&1 | tee /tmp/precedence-broken-output.txt
      2. grep -q "claude-haiku-4-5" /tmp/precedence-broken-output.txt
    Expected Result: grep returns 0 (haiku model active - project STILL wins, confirming OPENCODE_CONFIG is broken for our use case)
    Failure Indicators: sonnet in output (would mean docs and Metis finding are wrong)
    Evidence: .sisyphus/evidence/task-1-precedence-broken-confirmed.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-1-precedence-pass.txt` - confirms OPENCODE_CONFIG_DIR works
  - [ ] `.sisyphus/evidence/task-1-precedence-broken-confirmed.txt` - confirms OPENCODE_CONFIG broken

  **Commit**: YES (groups with Wave 0)
  - Message: `chore(opencode): verify OPENCODE_CONFIG_DIR precedence`
  - Files: `.sisyphus/evidence/task-1-*`
  - Pre-commit: `test -f .sisyphus/evidence/task-1-precedence-pass.txt`

- [x] 2. Verify Anthropic prompt caching works in opencode (HIGHEST LEVERAGE TEST)

  **What to do**:
  - **First**: Discover available Anthropic model IDs in this opencode version: `opencode models list 2>&1 | grep -E '^anthropic/' | tee .sisyphus/evidence/task-2-anthropic-models.txt`
  - Pick the most-recent **non-haiku** Anthropic model from the list (caching benefit is most observable on larger models). Save the chosen ID to `.sisyphus/evidence/task-2-chosen-model.txt`.
  - Run identical large-context query twice using the discovered model ID
  - Inspect response metadata for `cache_read_input_tokens > 0` on second call
  - This determines if $20/mo Anthropic-metered budget is realistic or fantasy

  **Must NOT do**:
  - Hardcode model IDs - opencode's available Anthropic models may have changed (e.g., claude-opus-4-7 vs claude-opus-4-5 vs claude-opus-5)
  - Skip this task - if caching is broken, the entire hybrid plan budget is wrong by 10x
  - Run on cheap models (only Anthropic supports prompt caching API)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Run command, parse JSON, assert
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0
  - **Blocks**: Tasks 12 (anthropic-metered profile config depends on caching reality)
  - **Blocked By**: None

  **References**:
  - Anthropic caching docs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
  - opencode provider system (need to verify if it sets `cache_control` markers)
  - Metis Finding: highest single-test leverage in entire plan

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Discover Anthropic model IDs and select test model
    Tool: Bash
    Preconditions: Active ANTHROPIC_API_KEY env var
    Steps:
      1. opencode models list 2>&1 | grep -E '^anthropic/' > .sisyphus/evidence/task-2-anthropic-models.txt
      2. test -s .sisyphus/evidence/task-2-anthropic-models.txt || (echo "NO-MODELS-FOUND"; exit 1)
      3. # Pick the largest non-haiku model. Prefer opus, then sonnet
      4. MODEL=$(grep -E 'opus|sonnet' .sisyphus/evidence/task-2-anthropic-models.txt | grep -v haiku | head -1 | awk '{print $1}')
      5. test -n "$MODEL" || (echo "NO-SUITABLE-MODEL"; exit 1)
      6. echo "$MODEL" > .sisyphus/evidence/task-2-chosen-model.txt
    Expected Result: A non-haiku Anthropic model ID is recorded
    Evidence: .sisyphus/evidence/task-2-anthropic-models.txt, .sisyphus/evidence/task-2-chosen-model.txt

  Scenario: Second identical request reports cache_read_input_tokens > 0
    Tool: Bash
    Preconditions: Scenario 1 passed (model ID chosen)
    Steps:
      1. MODEL=$(cat .sisyphus/evidence/task-2-chosen-model.txt)
      2. Generate large context fixture: yes "test content line for caching" | head -n 500 > /tmp/cache-test-context.txt
      3. First request: opencode run -m "$MODEL" "$(cat /tmp/cache-test-context.txt)\n\nWhat is the first word?" 2>&1 | tee /tmp/cache-test-1.json
      4. Wait 5 seconds (avoid rate limit)
      5. Second IDENTICAL request: opencode run -m "$MODEL" "$(cat /tmp/cache-test-context.txt)\n\nWhat is the first word?" 2>&1 | tee /tmp/cache-test-2.json
      6. Extract cache metrics: grep -E "cache_read|cache_creation" /tmp/cache-test-2.json > /tmp/cache-test-result.txt
      7. Assert: grep -qE "cache_read.*[1-9][0-9]*" /tmp/cache-test-result.txt
    Expected Result: cache_read_input_tokens > 0 in second request (caching works)
    Failure Indicators: cache_read = 0 or field absent (caching broken in opencode for this model/version)
    Evidence: .sisyphus/evidence/task-2-caching-works.json (or task-2-caching-broken.md if failed)

  Scenario: Document impact if caching broken
    Tool: Bash
    Preconditions: Previous scenario returned cache_read = 0
    Steps:
      1. If previous failed, write impact note to .sisyphus/evidence/task-2-caching-broken.md
      2. Note must include: estimated cost without caching at expected usage volume
      3. Note must include: alternative providers that DO cache (e.g., direct Anthropic SDK without opencode)
      4. STOP further plan execution - this triggers REPLAN per Wave 0 gate
    Expected Result: If broken, plan owner notified before any premium-time spending
    Evidence: .sisyphus/evidence/task-2-caching-broken.md (if applicable)
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-2-caching-works.json` (or `task-2-caching-broken.md` if failed)
  - [ ] Decision recorded: proceed with hybrid plan (caching works) OR replan (caching broken)

  **Commit**: YES (groups with Wave 0)
  - Message: `chore(opencode): verify Anthropic prompt caching`
  - Files: `.sisyphus/evidence/task-2-*`
  - Pre-commit: `test -f .sisyphus/evidence/task-2-*`

- [x] 3. Verify GLM provider reports cost to opencode (after GLM signup)

  **What to do**:
  - PREREQUISITE: User must sign up for GLM Coding Plan and provide API key (manual step before this task runs)
  - Configure minimal opencode profile pointing at GLM
  - Run small query
  - Verify `opencode stats` reports non-zero cost for the GLM model
  - This determines if cost-guard plugin will function on GLM (it fails open silently if cost is $0)

  **Must NOT do**:
  - Run before Joey signs up for GLM (no API key yet)
  - Use Joey's main config - use a tmpfile profile

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification script
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1, 2, 4, 5, 6, 7)
  - **Parallel Group**: Wave 0
  - **Blocks**: Task 9 (GLM profile config)
  - **Blocked By**: User completing GLM signup (external dependency - flag in summary)

  **References**:
  - Z.ai docs: https://docs.z.ai/scenario-example/develop-tools/opencode
  - opencode provider config: https://opencode.ai/docs/providers
  - cost-guard plugin: ~/.config/opencode/plugin/cost-guard.js (reads `msg.cost`, fails open at $0)

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: GLM provider returns non-zero cost
    Tool: Bash
    Preconditions: GLM_API_KEY env var set with valid Z.ai key
    Steps:
      1. Create /tmp/glm-test/opencode.json with provider config (see References for syntax) and apiKey={env:GLM_API_KEY}
      2. OPENCODE_CONFIG_DIR=/tmp/glm-test opencode run -m glm/glm-4.6 "say hello in one word" 2>&1 | tee /tmp/glm-test-1.json
      3. OPENCODE_CONFIG_DIR=/tmp/glm-test opencode stats --session-id=$(jq -r '.session_id' /tmp/glm-test-1.json) 2>&1 | tee /tmp/glm-stats.txt
      4. grep -E 'glm-4\.6.*\$0\.[0-9]+' /tmp/glm-stats.txt
    Expected Result: regex matches a non-zero dollar amount (e.g., "$0.0001")
    Failure Indicators: cost is $0.00 or not reported (cost-guard would fail open)
    Evidence: .sisyphus/evidence/task-3-glm-cost.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-3-glm-cost.txt` showing non-zero cost
  - [ ] If cost is $0: document remediation (likely manual cost-guard configuration update)

  **Commit**: YES
  - Message: `chore(opencode): verify GLM cost reporting`
  - Files: `.sisyphus/evidence/task-3-*`
  - Pre-commit: `test -f .sisyphus/evidence/task-3-glm-cost.txt`

- [x] 4. Verify Kimi provider reports cost to opencode

  **What to do**:
  - PREREQUISITE: User must sign up for Kimi (per P2). User chose ONE of:
    - **Kimi Code subscription** ($19/mo, endpoint `https://api.kimi.com/coding/v1`, model `kimi-for-coding`)
    - **Kimi K2 API** (pay-per-token at `https://api.moonshot.ai/v1`, models `kimi-k2-0905-preview` etc)
  - Read user's choice from P2 evidence (Prerequisites section); test ONLY that endpoint
  - If user signed up for BOTH (rare), test both
  - Use OpenAI-compatible endpoint variants

  **Must NOT do**:
  - Test the endpoint user did NOT sign up for - will fail with auth error and waste time
  - Use Anthropic-compatible endpoint (`https://api.kimi.com/coding/`) - go OpenAI-compatible (`/coding/v1`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0
  - **Blocks**: Task 10 (Kimi profile config)
  - **Blocked By**: User completing Kimi signup

  **References**:
  - Moonshot docs: https://platform.kimi.ai/docs/guide/kimi-k2-quickstart.md
  - Kimi Code docs: https://www.kimi.com/code/docs/en/third-party-tools/other-coding-agents.html

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Selected Kimi product reports non-zero cost (single-endpoint, choice-driven)
    Tool: Bash
    Preconditions: P2 signup complete; KIMI_API_KEY env var set; .sisyphus/evidence/p2-kimi-choice.txt contains 'kimi-code' or 'kimi-k2'
    Steps:
      1. CHOICE=$(cat .sisyphus/evidence/p2-kimi-choice.txt) && echo "Testing: $CHOICE"
      2. case "$CHOICE" in
           kimi-code)
             ENDPOINT="https://api.kimi.com/coding/v1"; MODEL="kimi/kimi-for-coding";;
           kimi-k2)
             ENDPOINT="https://api.moonshot.ai/v1"; MODEL="kimi/kimi-k2-0905-preview";;
           *) echo "INVALID-CHOICE: $CHOICE"; exit 1;;
         esac
      3. mkdir -p /tmp/kimi-test && cat > /tmp/kimi-test/opencode.json <<EOF
         {"\$schema":"https://opencode.ai/config.json","provider":{"kimi":{"npm":"@ai-sdk/openai-compatible","options":{"baseURL":"$ENDPOINT","apiKey":"{env:KIMI_API_KEY}"},"models":{"$(echo $MODEL | cut -d/ -f2)":{"name":"Kimi"}}}}}
         EOF
      4. OPENCODE_CONFIG_DIR=/tmp/kimi-test opencode run -m "$MODEL" "say hello" 2>&1 | tee /tmp/kimi-run.log
      5. SESSION_ID=$(grep -oE 'ses_[a-zA-Z0-9]+' /tmp/kimi-run.log | head -1)
      6. opencode stats --session-id="$SESSION_ID" 2>&1 | grep -E 'kimi.*\$0?\.[0-9]+' | tee .sisyphus/evidence/task-4-kimi-cost.txt
      7. test -s .sisyphus/evidence/task-4-kimi-cost.txt
    Expected Result: cost line found in stats output for the chosen Kimi product (single endpoint tested)
    Evidence: .sisyphus/evidence/task-4-kimi-cost.txt (whichever product was chosen)
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-4-kimi-cost.txt` (one file, for whichever product was tested)
  - [ ] `.sisyphus/evidence/p2-kimi-choice.txt` (created in P2, read by this task)

  **Commit**: YES
  - Message: `chore(opencode): verify Kimi cost reporting (K2 + Code)`

- [x] 5. Verify Codex MCP server auth persists across opencode restarts

  **What to do**:
  - Install Codex CLI globally if not already
  - Configure it as an MCP in a test profile
  - Run opencode, invoke a Codex tool, verify it works
  - Restart opencode, verify Codex still works WITHOUT re-authentication
  - Document if auth needs to be refreshed periodically

  **Must NOT do**:
  - Skip the restart test - the whole point is verifying auth persistence
  - Use API key auth if ChatGPT Plus auth is intended (different cost models)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0
  - **Blocks**: Task 11 (Codex profile config)
  - **Blocked By**: User completing ChatGPT Plus signup + Codex CLI install

  **References**:
  - Codex CLI: https://github.com/openai/codex
  - Codex MCP server interface: https://github.com/openai/codex/blob/main/codex-rs/README.md
  - ChatGPT auth flow: https://developers.openai.com/codex/auth

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Codex MCP works on first opencode launch
    Tool: Bash
    Preconditions: codex CLI installed, signed in via `codex login` with ChatGPT Plus
    Steps:
      1. Create /tmp/codex-test/opencode.json with mcp.codex.command="codex" args=["mcp-server"] type="stdio"
      2. OPENCODE_CONFIG_DIR=/tmp/codex-test opencode run "list available codex tools"
      3. Verify response references codex-provided tool names
    Expected Result: response includes tool names from codex (not error)
    Evidence: .sisyphus/evidence/task-5-codex-first-run.txt

  Scenario: Codex MCP persists across opencode restart
    Tool: Bash
    Preconditions: Scenario 1 passed
    Steps:
      1. Wait 10 seconds (let session close cleanly)
      2. OPENCODE_CONFIG_DIR=/tmp/codex-test opencode run "use a codex tool to write hello to /tmp/codex-restart-test.txt"
      3. cat /tmp/codex-restart-test.txt | grep -q "hello"
    Expected Result: grep returns 0, no auth prompt encountered
    Failure Indicators: opencode prompts for re-auth, codex returns auth error
    Evidence: .sisyphus/evidence/task-5-codex-persistence.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-5-codex-first-run.txt`
  - [ ] `.sisyphus/evidence/task-5-codex-persistence.txt`
  - [ ] If auth doesn't persist: document refresh interval

  **Commit**: YES
  - Message: `chore(opencode): verify Codex MCP auth persistence`

- [x] 6. Snapshot current premium baseline (BEFORE any edits)

  **What to do**:
  - Verify `~/.config/opencode/` is git-tracked. If not, initialize a backup repo or `cp -r` to a timestamped backup
  - Create git tag `premium-baseline-pre-migration-{YYYYMMDD}` capturing the current state
  - Document tag location and rollback procedure
  - This is the LIFELINE - if anything goes wrong, this is the recovery point

  **Must NOT do**:
  - Edit any agent prompts before this snapshot exists
  - Skip this task - if Wave 2 produces broken prompts and premium expires, no rollback is possible

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single git/cp operation
  - **Skills**: [`git-master`]
    - Why needed: Tag creation with proper message conventions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (but logically must complete before Wave 2 starts)
  - **Blocks**: Tasks 17-21 (premium-time agent authoring needs baseline first)
  - **Blocked By**: None

  **References**:
  - `~/.config/opencode/oh-my-openagent.json` - current agent routing
  - `~/.config/opencode/opencode.json` - current main config
  - Custom plugins: plugin/, plugins/, local-plugins/

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Snapshot tag exists and captures all critical files
    Tool: Bash
    Preconditions: opencode CLI not running (clean state)
    Steps:
      1. cd ~/.config/opencode
      2. If not git: git init && git add -A && git commit -m "chore: pre-migration baseline"
      3. git tag -a "premium-baseline-pre-migration-$(date +%Y%m%d)" -m "Premium baseline before multi-profile migration"
      4. git tag | grep -q "premium-baseline-pre-migration-"
      5. git ls-tree -r premium-baseline-pre-migration-$(date +%Y%m%d) | grep -E "(opencode\.json|oh-my-openagent\.json|skills/.*SKILL\.md)" | wc -l
    Expected Result: tag exists AND captured file count > 50 (53 skills + 2 main configs + plugins)
    Evidence: .sisyphus/evidence/task-6-snapshot-tag.txt with `git log -1 premium-baseline-pre-migration-{date}`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-6-snapshot-tag.txt` showing tag commit hash and file count

  **Commit**: NO (the snapshot itself IS a commit, no separate commit needed)

- [x] 7. Verify cost-guard plugin reads cost data from cheap providers

  **What to do**:
  - cost-guard.js reads `msg.cost` from opencode events. If GLM/Kimi don't populate this field, cost-guard fails open silently
  - This is a follow-up to Tasks 3 + 4: now confirm the OPENCODE EVENT system, not just `opencode stats`, surfaces the cost
  - Hook into cost-guard with a debug flag (or read its source) to confirm it sees > $0 events from GLM/Kimi

  **Must NOT do**:
  - Trust `opencode stats` alone - that's a CLI command, not the event stream cost-guard listens to
  - Modify cost-guard.js without understanding original behavior (out of scope)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (must complete after Tasks 3 + 4)
  - **Blocks**: Wave 4 GPT-5.4 routing decisions (need cost guardrails functional)
  - **Blocked By**: Tasks 3 + 4 (need GLM and Kimi providers configured)

  **References**:
  - `~/.config/opencode/plugin/cost-guard.js` - reads `msg.cost`, fails open at $0
  - opencode event/hook docs: https://opencode.ai/docs/plugins

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: cost-guard receives cost events from GLM (with safe rollback)
    Tool: Bash
    Preconditions: GLM profile from Task 3, cost-guard plugin enabled, ~/.config/opencode/ on a clean working tree
    Steps:
      1. cd ~/.config/opencode && git status --porcelain plugin/cost-guard.js | grep -q "^." && (echo "DIRTY: cost-guard.js has uncommitted changes - aborting"; exit 1) || true
      2. Read cost-guard.js to identify the event handler that receives the cost-bearing message object
      3. cp plugin/cost-guard.js plugin/cost-guard.js.bak  # backup BEFORE any edit
      4. Insert temporary debug log: `console.log("[cost-guard-debug]", JSON.stringify({cost: msg.cost, model: msg.model}))` at the event handler entry
      5. OPENCODE_CONFIG_DIR=/tmp/glm-test opencode run -m glm/glm-4.6 "say hi" 2>&1 | tee /tmp/cost-guard-glm.log
      6. grep -E '\[cost-guard-debug\].*"cost":[0-9]+\.[0-9]+' /tmp/cost-guard-glm.log > .sisyphus/evidence/task-7-cost-guard-glm.log
      7. test -s .sisyphus/evidence/task-7-cost-guard-glm.log
      8. mv plugin/cost-guard.js.bak plugin/cost-guard.js  # MANDATORY restore (atomic)
      9. cd ~/.config/opencode && git diff --exit-code plugin/cost-guard.js && echo "RESTORED-CLEAN" > .sisyphus/evidence/task-7-restore-clean.txt || (echo "RESTORE-FAILED"; exit 1)
    Expected Result: cost line captured AND restoration leaves file byte-identical to original
    Failure Indicators: empty grep output (cost field absent or zero); residual git diff after restore
    Evidence: .sisyphus/evidence/task-7-cost-guard-glm.log, .sisyphus/evidence/task-7-restore-clean.txt

  Scenario: cost-guard receives cost events from Kimi (with safe rollback)
    Tool: Bash
    Preconditions: Kimi profile from Task 4, cost-guard.js on clean working tree (post Scenario 1 restoration)
    Steps:
      1. Same git status precheck as Scenario 1
      2. cp plugin/cost-guard.js plugin/cost-guard.js.bak
      3. Insert same debug log
      4. OPENCODE_CONFIG_DIR=/tmp/kimi-test opencode run -m kimi/kimi-for-coding "say hi" 2>&1 | tee /tmp/cost-guard-kimi.log
      5. grep -E '\[cost-guard-debug\].*"cost":[0-9]+\.[0-9]+' /tmp/cost-guard-kimi.log > .sisyphus/evidence/task-7-cost-guard-kimi.log
      6. test -s .sisyphus/evidence/task-7-cost-guard-kimi.log
      7. mv plugin/cost-guard.js.bak plugin/cost-guard.js
      8. git diff --exit-code plugin/cost-guard.js && echo "RESTORED-CLEAN" > .sisyphus/evidence/task-7-restore-clean-kimi.txt
    Expected Result: cost line captured AND restoration clean
    Evidence: .sisyphus/evidence/task-7-cost-guard-kimi.log, .sisyphus/evidence/task-7-restore-clean-kimi.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-7-cost-guard-glm.log` (non-empty cost line)
  - [ ] `.sisyphus/evidence/task-7-cost-guard-kimi.log` (non-empty cost line)
  - [ ] `.sisyphus/evidence/task-7-restore-clean.txt` (RESTORED-CLEAN marker)
  - [ ] `.sisyphus/evidence/task-7-restore-clean-kimi.txt` (RESTORED-CLEAN marker)

  **Commit**: YES
  - Message: `chore(opencode): verify cost-guard receives events from cheap providers`
  - Pre-commit: `cd ~/.config/opencode && git diff --exit-code plugin/cost-guard.js`  # ensure no residual debug log

---

### Wave 1: Foundation (Profile Scaffolding + Benchmark Design)

- [x] 8. Profile directory scaffolding (all 5 profiles)

  **What to do**:
  - Create `~/.config/opencode/profiles/{premium,glm,kimi,codex,anthropic-metered}/`
  - Each dir gets empty `opencode.json` (`{"$schema": "https://opencode.ai/config.json"}`) and `oh-my-openagent.json` placeholder
  - Verify the empty profiles load without errors via `OPENCODE_CONFIG_DIR=...`

  **Must NOT do**:
  - Symlink node_modules between profiles (each profile is independent)
  - Add provider configs yet (Tasks 9-12 do that)

  **Recommended Agent Profile**:
  - **Category**: `quick` - Filesystem scaffolding
  - **Skills**: []

  **Parallelization**: YES, Wave 1. Blocks Tasks 9-13 (profile configs need dirs to exist). Blocked By: Wave 0.

  **References**:
  - opencode docs: https://opencode.ai/docs/config (load order)
  - Current `~/.config/opencode/opencode.json` schema reference

  **QA Scenarios**:
  ```
  Scenario: All 5 profile dirs exist and load
    Tool: Bash
    Steps:
      1. for p in premium glm kimi codex anthropic-metered; do test -d ~/.config/opencode/profiles/$p && test -f ~/.config/opencode/profiles/$p/opencode.json && test -f ~/.config/opencode/profiles/$p/oh-my-openagent.json || echo "FAIL: $p"; done | tee /tmp/wave1-task8.txt
      2. ! grep -q "FAIL" /tmp/wave1-task8.txt
      3. for p in premium glm kimi codex anthropic-metered; do OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/$p timeout 10 opencode --print-config > /dev/null 2>&1 && echo "$p OK" || echo "$p FAIL"; done | tee -a /tmp/wave1-task8.txt
      4. ! grep -q "FAIL" /tmp/wave1-task8.txt
    Expected Result: All 5 profiles exist with both required files, all load without error
    Evidence: .sisyphus/evidence/task-8-profile-dirs.txt
  ```

  **Commit**: YES - `feat(opencode): scaffold 5 profile directories`

- [x] 9. GLM provider config + agent overrides

  **What to do**:
  - Populate `~/.config/opencode/profiles/glm/opencode.json` with provider block per research findings
  - Populate `oh-my-openagent.json` with all 14 agents bound to `glm/glm-4.6`
  - Use `{env:GLM_API_KEY}` for auth (NEVER hardcode)
  - Add to a `.env.example` file showing required env var

  **Must NOT do**:
  - Hardcode API key in config
  - Use Anthropic-compatible endpoint without verifying it works (use OpenAI-compatible `/api/coding/paas/v4` first)
  - Override built-in plugin agent set - just rebind models

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**: YES, Wave 1. Blocks Task 23 (benchmark on GLM). Blocked By: Tasks 3, 7, 8.

  **References**:
  - Z.ai docs: https://docs.z.ai/scenario-example/develop-tools/opencode (provider config example)
  - Provider syntax (research): `{"provider": {"glm": {"npm": "@ai-sdk/openai-compatible", "options": {"baseURL": "https://api.z.ai/api/coding/paas/v4", "apiKey": "{env:GLM_API_KEY}"}, "models": {"glm-4.6": {"name": "GLM 4.6"}}}}}`
  - Current `~/.config/opencode/oh-my-openagent.json` - copy structure, swap models

  **QA Scenarios**:
  ```
  Scenario: GLM profile parses and runs a query
    Tool: Bash
    Preconditions: GLM_API_KEY env var set
    Steps:
      1. jq . ~/.config/opencode/profiles/glm/opencode.json > /dev/null
      2. jq . ~/.config/opencode/profiles/glm/oh-my-openagent.json > /dev/null
      3. ! grep -E "sk-|gsk_|api_key.*[a-zA-Z0-9]{16,}" ~/.config/opencode/profiles/glm/*.json
      4. OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/glm timeout 30 opencode run "respond with the word READY"
      5. grep -q "READY" output
    Expected Result: All JSON valid, no hardcoded secrets, query returns READY
    Evidence: .sisyphus/evidence/task-9-glm-profile.txt
  ```

  **Commit**: YES - `feat(opencode): add GLM 4.6 profile config`

- [x] 10. Kimi provider config + agent overrides

  **What to do**:
  - Same pattern as Task 9 but for Kimi
  - Use `kimi-for-coding` model on `https://api.kimi.com/coding/v1` (Kimi Code subscription endpoint)
  - All 14 agents bound to `kimi/kimi-for-coding`
  - Use `{env:KIMI_API_KEY}` exclusively (single env var per P2 standardization, regardless of product choice)

  **Must NOT do**:
  - Mix Kimi K2 (api.moonshot.ai) and Kimi Code (api.kimi.com) endpoints in same profile - pick one
  - Skip BOTH endpoints in benchmark - if Kimi Code is the cheaper/better option, use it

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**: YES, Wave 1. Blocks Task 24. Blocked By: Tasks 4, 7, 8.

  **References**:
  - Kimi Code docs: https://www.kimi.com/code/docs/en/third-party-tools/other-coding-agents.html
  - Provider syntax: same as GLM but baseURL is Kimi-specific

  **QA Scenarios**:
  ```
  Scenario: Kimi profile parses and runs a query
    Tool: Bash
    Preconditions: KIMI_API_KEY env var set
    Steps:
      1. jq . ~/.config/opencode/profiles/kimi/opencode.json > /dev/null
      2. ! grep -E "sk-|api_key.*[a-zA-Z0-9]{16,}" ~/.config/opencode/profiles/kimi/*.json
      3. OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/kimi timeout 30 opencode run "respond with the word READY"
      4. grep -q "READY" output
    Expected Result: All JSON valid, query returns READY
    Evidence: .sisyphus/evidence/task-10-kimi-profile.txt
  ```

  **Commit**: YES - `feat(opencode): add Kimi profile config`

- [x] 11. Codex MCP server config + agent overrides

  **What to do**:
  - Configure Codex as MCP server in `~/.config/opencode/profiles/codex/opencode.json`
  - MCP block: `{"mcp": {"codex": {"type": "stdio", "command": "codex", "args": ["mcp-server"]}}}`
  - **CRITICAL**: opencode requires a model binding for each agent. Codex is an MCP, not a model. The Codex profile must:
    - Bind agents to a SHIM model (recommend the cheapest configured cheap model, e.g., `glm/glm-4.6` or `kimi/kimi-for-coding`) so opencode boots
    - Configure agent prompts to PREFER Codex MCP tools (`codex/*`) for actual work via tool selection guidance
    - The shim model handles tool orchestration; Codex MCP does the heavy lifting
  - Document this paradigm in `~/.config/opencode/profiles/codex/README.md`

  **Must NOT do**:
  - Try to bind agents directly to a "codex" model - it's not a model, it's an MCP server
  - Use API key auth if Joey wants ChatGPT Plus pricing (different auth flow)
  - Skip the shim model - opencode will fail to load profile without one

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**: YES, Wave 1. Blocks Task 25. Blocked By: Tasks 5, 8.

  **References**:
  - Codex MCP docs: https://github.com/openai/codex/blob/main/codex-rs/README.md
  - opencode MCP config: https://opencode.ai/docs/mcp-servers

  **QA Scenarios**:
  ```
  Scenario: Codex MCP available in codex profile
    Tool: Bash
    Preconditions: codex CLI installed and authed
    Steps:
      1. jq . ~/.config/opencode/profiles/codex/opencode.json > /dev/null
      2. OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/codex opencode run "list available codex MCP tools" 2>&1 | tee /tmp/codex-mcp-tools.txt
      3. grep -i "codex" /tmp/codex-mcp-tools.txt
    Expected Result: codex tool names appear in response
    Evidence: .sisyphus/evidence/task-11-codex-mcp.txt
  ```

  **Commit**: YES - `feat(opencode): add Codex MCP profile config`

- [x] 12. Anthropic-metered config + planner agent overrides

  **What to do**:
  - Configure pay-as-you-go Anthropic API in `~/.config/opencode/profiles/anthropic-metered/`
  - **Model ID resolution**: Verify available Anthropic model IDs FIRST by running `opencode models list 2>&1 | grep anthropic` (or equivalent). The plan references `anthropic/claude-opus-4-7`, `anthropic/claude-opus-4-5`, `anthropic/claude-sonnet-4-5`, `anthropic/claude-haiku-4-5` as candidates - use whichever the opencode version actually supports. If model name has changed, document the actual ID used.
  - Bind ONLY planner agents (prometheus, metis, momus, oracle) to the chosen Anthropic model (sonnet for cost efficiency if caching works; opus only if caching test result justifies)
  - Other agents fall back to a configured cheap model (probably GLM)
  - Add cost-guard rules to stay under $20/mo target

  **Must NOT do**:
  - Use unverified model IDs - if `claude-opus-4-7` isn't valid in opencode, the profile will fail
  - Bind ALL agents to Anthropic - that defeats the budget purpose
  - Skip caching configuration - this is the budget linchpin (Task 2 result determines viability)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**: YES, Wave 1. Blocks Task 26. Blocked By: Tasks 2 (caching test), 8.

  **References**:
  - Anthropic API docs: https://docs.anthropic.com/en/api
  - cost-guard.js for budget rule patterns
  - Task 2 result determines whether to use claude-opus-4-5 (cached) or claude-sonnet-4-5 (cheaper)

  **QA Scenarios**:
  ```
  Scenario: Anthropic-metered profile routes only planners to Anthropic
    Tool: Bash
    Preconditions: ANTHROPIC_API_KEY env var set
    Steps:
      1. jq '.agents' ~/.config/opencode/profiles/anthropic-metered/oh-my-openagent.json | jq -r 'to_entries[] | "\(.key): \(.value.model)"' > /tmp/anthropic-routing.txt
      2. grep -E "(prometheus|metis|momus|oracle).*anthropic/" /tmp/anthropic-routing.txt | wc -l
      3. Result must be 4 (all 4 planners on Anthropic)
      4. grep -E "(sisyphus|build|plan).*anthropic/" /tmp/anthropic-routing.txt | wc -l
      5. Result must be 0 (executors NOT on Anthropic)
    Expected Result: Only planners routed to Anthropic, executors elsewhere
    Evidence: .sisyphus/evidence/task-12-anthropic-routing.txt
  ```

  **Commit**: YES - `feat(opencode): add anthropic-metered planner profile`

- [x] 13. Premium baseline profile (snapshot of current state)

  **What to do**:
  - Copy current `~/.config/opencode/{opencode.json,oh-my-openagent.json}` into `~/.config/opencode/profiles/premium/`
  - This becomes the "as-is reference" profile - lets Joey toggle back to premium during the few remaining days

  **Must NOT do**:
  - Modify the copied files - they're the reference
  - Use this profile post-expiry (it'll fail when premium models error out)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**: YES, Wave 1. Blocks Task 22. Blocked By: Tasks 6 (snapshot tag), 8.

  **References**:
  - `~/.config/opencode/opencode.json` (current)
  - `~/.config/opencode/oh-my-openagent.json` (current)

  **QA Scenarios**:
  ```
  Scenario: Premium profile is byte-identical copy of current state at snapshot time
    Tool: Bash
    Steps:
      1. cd ~/.config/opencode && diff opencode.json profiles/premium/opencode.json
      2. diff oh-my-openagent.json profiles/premium/oh-my-openagent.json
    Expected Result: No diff output (files identical)
    Evidence: .sisyphus/evidence/task-13-premium-baseline.txt
  ```

  **Commit**: YES - `feat(opencode): add premium baseline profile`

- [x] 14. Shell aliases setup

  **What to do**:
  - Add aliases to `~/.zshrc` (Joey is on zsh per env):
    ```
    alias oc-premium='OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/premium opencode'
    alias oc-glm='OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/glm opencode'
    alias oc-kimi='OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/kimi opencode'
    alias oc-codex='OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/codex opencode'
    alias oc-anthropic-metered='OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/anthropic-metered opencode'
    ```
  - NEVER use `OPENCODE_CONFIG=` (it loses to project files - confirmed Wave 0 Task 1)

  **Must NOT do**:
  - Use `OPENCODE_CONFIG=` (broken)
  - Add aliases without testing them
  - Modify .zprofile/.bashrc/etc unnecessarily - aliases go in .zshrc only

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**: YES, Wave 1. Blocks Task 15 (smoke tests use aliases). Blocked By: Tasks 8-13.

  **References**:
  - Wave 0 Task 1 evidence (precedence confirmation)
  - `~/.zshrc` (existing shell config)

  **QA Scenarios**:
  ```
  Scenario: All 5 aliases exist and use OPENCODE_CONFIG_DIR
    Tool: Bash
    Steps:
      1. for a in oc-premium oc-glm oc-kimi oc-codex oc-anthropic-metered; do grep -q "alias $a=" ~/.zshrc || echo "MISSING: $a"; done
      2. ! grep "OPENCODE_CONFIG=" ~/.zshrc | grep -v OPENCODE_CONFIG_DIR
      3. zsh -i -c 'alias' | grep -E "^oc-(premium|glm|kimi|codex|anthropic-metered)=" | wc -l
      4. Result must be 5
    Expected Result: 5 aliases defined, no OPENCODE_CONFIG (single-file) usage
    Evidence: .sisyphus/evidence/task-14-aliases.txt
  ```

  **Commit**: YES - `chore(shell): add opencode profile aliases`

- [x] 15. Smoke tests for each profile

  **What to do**:
  - Run a 1-line query through each alias, verify response within 30s
  - This validates the entire chain: alias -> OPENCODE_CONFIG_DIR -> profile dir -> opencode -> provider -> response

  **Must NOT do**:
  - Skip premium profile (it should still work during remaining days)
  - Run with high token usage - keep prompts to "echo READY" type

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**: YES, Wave 1. Blocks: Wave 2. Blocked By: Tasks 9-14.

  **References**: Tasks 9-14 (each profile must already exist)

  **QA Scenarios**:
  ```
  Scenario: All 5 aliases respond within 30 seconds AND use the configured model
    Tool: Bash (interactive zsh for alias resolution)
    Steps:
      1. for alias in oc-premium oc-glm oc-kimi oc-codex oc-anthropic-metered; do
           out=$(zsh -i -c "$alias run --json 'respond READY'" 2>&1)
           echo "$out" > /tmp/smoke-$alias.json
           echo "$out" | grep -q "READY" || echo "RESPONSE-FAIL: $alias"
           # Verify the model used matches the profile's intended model (parse from --json output or follow-up stats call)
           model_used=$(echo "$out" | jq -r '.model // .session.model // empty' 2>/dev/null)
           echo "$alias used model: $model_used" >> /tmp/smoke-models.txt
         done | tee /tmp/smoke-tests.txt
      2. test ! -s /tmp/smoke-tests.txt  # no FAIL lines
      3. # Verify profile-model mapping: oc-glm should show glm/, oc-kimi should show kimi/, oc-anthropic-metered should show anthropic/
      4. grep "oc-glm used model: glm/" /tmp/smoke-models.txt
      5. grep "oc-kimi used model: kimi" /tmp/smoke-models.txt  # kimi/ or kimi-code/ depending on Task 10 choice
      6. grep "oc-anthropic-metered used model: anthropic/" /tmp/smoke-models.txt
    Expected Result: All 5 aliases respond AND verified to use their profile's configured provider
    Note: If --json flag isn't supported by your opencode version, replace with: alias run "respond READY" then opencode stats --session=$LATEST | grep model
    Evidence: .sisyphus/evidence/task-15-smoke-tests.txt, .sisyphus/evidence/task-15-smoke-models.txt
  ```

  **Commit**: YES - `test(opencode): smoke-test all 5 profiles`

- [x] 16. Benchmark suite design (5 scenarios with concrete pass criteria)

  **What to do**:
  - Design exactly 5 benchmark scenarios per Metis directive (no more, no less)
  - Each scenario must be a REAL workflow Joey actually does (not synthetic)
  - Required scenario types: (1) single-file refactor, (2) multi-step plan generation, (3) tool orchestration, (4) long-context retrieval, (5) bug debug from stack trace
  - Each scenario gets: exact command, concrete pass criteria (regex/diff), cost ceiling, wall-clock ceiling, evidence path
  - Save scenarios to `~/.config/opencode/benchmark-runs/scenarios/{1-5}.md`

  **Must NOT do**:
  - Add a 6th scenario ("while I'm here")
  - Use vague pass criteria like "good code quality"
  - Skip cost/time ceilings - they're the abort triggers

  **Recommended Agent Profile**:
  - **Category**: `deep` - PREMIUM TIME (uses Opus to design good benchmarks)
    - Reason: Benchmark design quality directly affects all downstream measurement; Opus best at this
  - **Skills**: []

  **Parallelization**: YES, Wave 1. Blocks: Wave 2 (each agent author cycle uses one or more scenarios). Blocked By: Tasks 1, 6.

  **References**:
  - Metis directives: 5 scenario types specified
  - Joey's actual workflow patterns - infer from `~/.config/opencode/skills/` (e.g., the work he does most)

  **Required Scenario File Format** (designed for cross-profile reuse):
  ```
  # Scenario {N}: {Name}

  ## Exact Command
  \`\`\`bash
  # Uses $MODEL and $OUTPUT_PATH from caller. NEVER hardcode model.
  # $MODEL example: glm/glm-4.6, kimi/kimi-for-coding, anthropic/claude-sonnet-4-5
  opencode run -m "$MODEL" "..." > "$OUTPUT_PATH" 2>&1
  \`\`\`

  ## Pass Criteria
  \`\`\`bash
  # Reads $OUTPUT_PATH set by caller
  grep -q "expected output" "$OUTPUT_PATH"
  \`\`\`

  ## Cost Ceiling
  $0.50

  ## Time Ceiling
  300s
  ```

  > Use H2 headings exactly as shown so awk extraction is deterministic.
  > **CRITICAL**: Commands MUST use `$MODEL` and `$OUTPUT_PATH` env-var placeholders, never hardcoded model strings or output paths. The cross-profile benchmark runners (Tasks 22-26) export these variables before invoking the scenario command.

  **QA Scenarios**:
  ```
  Scenario: 5 benchmark scenario files exist with required fields
    Tool: Bash
    Steps:
      1. shopt -s nullglob; files=(~/.config/opencode/benchmark-runs/scenarios/*.md); echo ${#files[@]}
      2. Result must be 5
      3. for f in ~/.config/opencode/benchmark-runs/scenarios/*.md; do
           grep -qE "^## Exact Command" "$f" && grep -qE "^## Pass Criteria" "$f" && grep -qE "^## Cost Ceiling" "$f" && grep -qE "^## Time Ceiling" "$f" || echo "INCOMPLETE: $f"
         done > /tmp/scenario-validation.txt
      4. test ! -s /tmp/scenario-validation.txt
    Expected Result: Exactly 5 scenario files, all with required sections (empty validation file)
    Evidence: .sisyphus/evidence/task-16-benchmark-suite.txt

  Scenario: Each scenario's exact command extractable AND runs on premium baseline
    Tool: Bash
    Preconditions: Premium profile working (Task 15); scenarios use $MODEL/$OUTPUT_PATH placeholders per format spec
    Steps:
      1. # Read premium's default model for the validation run
         PREMIUM_MODEL=$(jq -r '.categories.default.model // .agents.build.model // empty' ~/.config/opencode/profiles/premium/oh-my-openagent.json)
         test -n "$PREMIUM_MODEL" || (echo "MODEL-NOT-FOUND in premium profile"; exit 1)
      2. for f in ~/.config/opencode/benchmark-runs/scenarios/*.md; do
           cmd=$(awk '/^## Exact Command/{flag=1; next} flag && /^```/{count++; if(count>=2){exit}; next} flag && count==1 {print}' "$f")
           if [ -z "$cmd" ]; then echo "EXTRACT-FAIL: $f"; continue; fi
           # Export required env vars BEFORE running the extracted command (placeholders are expanded by bash -c)
           export MODEL="$PREMIUM_MODEL"
           export OUTPUT_PATH="/tmp/scenario-test-$(basename "$f").out"
           echo "[$f] CMD: $cmd | MODEL=$MODEL"
           OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/premium timeout 300 bash -c "$cmd" && echo "PASS: $f" || echo "FAIL: $f"
         done | tee /tmp/benchmark-design-validation.txt
      3. ! grep -qE "(FAIL|EXTRACT-FAIL|MODEL-NOT-FOUND):" /tmp/benchmark-design-validation.txt
    Expected Result: All 5 commands extracted AND runnable on premium baseline (with $MODEL/$OUTPUT_PATH exported)
    Evidence: .sisyphus/evidence/task-16-scenarios-runnable.txt
  ```

  **Commit**: YES - `test(opencode): design 5-scenario cross-profile benchmark suite`

---

### Wave 2: Premium-Time Agent Re-Authoring (SEQUENTIAL - NO BATCHING)

> Per Metis directive: For each agent, snapshot -> identify weakness -> tune ONE pattern -> benchmark on target cheap model -> iterate or commit. NEVER batch authoring across agents.
> Each task uses category=`deep` (PREMIUM) for authoring. The QA benchmark within each task may use cheap-tier models.

- [x] 17. Re-author Sisyphus prompt for cheap models + benchmark

  **What to do**:
  - Read current Sisyphus prompt from `~/.config/opencode/node_modules/oh-my-opencode/dist/agents/sisyphus/`
  - Identify likely cheap-model weakness based on prompt structure (likely: long context recall, attention drift)
  - Apply ONE primary compensation pattern (recommend: `decomposition` + `output-template` for executor agent)
  - Save tuned prompt to `~/.config/opencode/profiles/glm/agents/sisyphus.md` (and kimi/, codex/ if cheap-model-tuned variants differ)
  - Run benchmark Scenario 1 (single-file refactor) on tuned Sisyphus via GLM profile
  - If benchmark fails: ONE iteration adding `verification-loops` pattern. Then commit either way.

  **Must NOT do**:
  - Tune more than 2 iterations (hard cap)
  - Batch this with other agent authoring
  - Apply ALL 7 compensation patterns - pick the highest-value one based on observed weakness
  - Skip the immediate benchmark (Metis directive: "no batching")

  **Recommended Agent Profile**:
  - **Category**: `deep` - PREMIUM, requires Opus to author quality prompts
    - Reason: Heavy tuning requires deep understanding of model weaknesses
  - **Skills**: []

  **Parallelization**: NO - sequential within Wave 2. Blocks Task 18. Blocked By: Wave 0 + Wave 1 complete.

  **References**:
  - Built-in Sisyphus: `~/.config/opencode/node_modules/oh-my-opencode/dist/agents/sisyphus/`
  - Benchmark Scenario 1: `~/.config/opencode/benchmark-runs/scenarios/1.md`
  - Metis compensation patterns (in plan Context section): decomposition, verification-loops, output-template, tool-scaffolding, anti-bias, smaller-turn-scopes, constraint-repetition

  **QA Scenarios**:
  ```
  Scenario: Tuned Sisyphus passes Benchmark Scenario 1 on GLM profile
    Tool: Bash
    Preconditions: GLM profile working, benchmark scenarios designed (Task 16); scenarios use $MODEL/$OUTPUT_PATH placeholders
    Steps:
      1. cd ~/.config/opencode && git tag pre-sisyphus-tune-$(date +%Y%m%d%H%M)
      2. Author tuned prompt to ~/.config/opencode/profiles/glm/agents/sisyphus.md
      3. # Resolve target model for GLM profile
         export MODEL=$(jq -r '.categories.default.model // .agents.sisyphus.model // empty' ~/.config/opencode/profiles/glm/oh-my-openagent.json)
         test -n "$MODEL" || (echo "MODEL-NOT-FOUND in glm profile"; exit 1)
      4. export OUTPUT_PATH=/tmp/sisyphus-glm-bench.txt
      5. cmd=$(awk '/^## Exact Command/{flag=1; next} flag && /^```/{count++; if(count>=2){exit}; next} flag && count==1 {print}' ~/.config/opencode/benchmark-runs/scenarios/1.md)
      6. test -n "$cmd" || (echo "EXTRACT-FAIL: scenario 1"; exit 1)
      7. OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/glm timeout 300 bash -c "$cmd"
      8. pass_check=$(awk '/^## Pass Criteria/{flag=1; next} flag && /^```/{count++; if(count>=2){exit}; next} flag && count==1 {print}' ~/.config/opencode/benchmark-runs/scenarios/1.md)
      9. bash -c "$pass_check" && echo "ITERATION-1: PASS" || echo "ITERATION-1: FAIL"
      10. If FAIL: apply ONE more iteration (verification-loops pattern), re-run with OUTPUT_PATH=/tmp/sisyphus-glm-bench-iter2.txt, log "ITERATION-2: PASS|FAIL"
      11. Commit final state regardless of outcome
    Expected Result: Either iteration passes pass_criteria, OR best-effort tuned prompt committed with documented FAIL
    Evidence: .sisyphus/evidence/task-17-sisyphus-original.md, task-17-sisyphus-tuned.md, task-17-sisyphus-glm-bench.txt, task-17-sisyphus-glm-bench-iter2.txt (if applicable)

  Scenario: Iteration cap respected (max 2 commits touching sisyphus prompt)
    Tool: Bash
    Steps:
      1. cd ~/.config/opencode && git log --oneline --since="$(git log -1 --format=%cI pre-sisyphus-tune-* | head -1)" -- profiles/glm/agents/sisyphus.md profiles/kimi/agents/sisyphus.md profiles/codex/agents/sisyphus.md 2>/dev/null | wc -l
      2. Count must be <= 2
      3. echo "Iteration count: $(cat above)" > .sisyphus/evidence/task-17-iteration-count.txt
    Expected Result: No more than 2 commits touching sisyphus prompts since the pre-tune tag
    Evidence: .sisyphus/evidence/task-17-iteration-count.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `refactor(agent/sisyphus): tune prompt for cheap models with {pattern-name}`
  - Files: `~/.config/opencode/profiles/glm/agents/sisyphus.md` (and kimi/, codex/ variants if applicable)
  - Pre-commit: benchmark must run (PASS or FAIL recorded)

- [x] 18. Re-author Prometheus prompt for cheap models + benchmark

  **What to do**:
  - Same pattern as Task 17 but for Prometheus
  - Likely weakness: structured plan output drift on cheap models -> use `output-template` pattern
  - Run benchmark Scenario 2 (multi-step plan generation) on tuned Prometheus via target profile (GLM or anthropic-metered)
  - Iterate ONCE if needed, commit either way

  **Must NOT do**:
  - Touch other agents
  - Skip immediate benchmark
  - Iterate more than 2 passes

  **Recommended Agent Profile**:
  - **Category**: `deep` - PREMIUM
  - **Skills**: []

  **Parallelization**: NO. Blocks Task 19. Blocked By: Task 17.

  **References**:
  - Built-in Prometheus: `~/.config/opencode/node_modules/oh-my-opencode/dist/agents/prometheus/`
  - Built-in hook: `dist/hooks/prometheus-md-only/` - prompt restrictions
  - Benchmark Scenario 2

  **QA Scenarios**:
  ```
  Scenario: Tuned Prometheus passes Scenario 2 on target profile
    Tool: Bash
    Preconditions: Task 17 complete; scenarios use $MODEL/$OUTPUT_PATH placeholders
    Steps:
      1. Follow CANONICAL TEMPLATE from Task 17's QA Scenario, substituting:
         - AGENT=prometheus
         - SCENARIO_NUM=2
         - TARGET=glm or anthropic-metered (per Wave 0 caching result)
         - OUTPUT_PATH=/tmp/prometheus-bench-iter1.txt
         - PATTERN=output-template (iteration 1) -> constraint-repetition (iteration 2 if needed)
      2. Each iteration:
         - export MODEL=$(jq -r '.categories.default.model // .agents.prometheus.model // empty' ~/.config/opencode/profiles/$TARGET/oh-my-openagent.json)
         - export OUTPUT_PATH=/tmp/prometheus-bench-iter{N}.txt
         - Extract cmd + pass_check via canonical awk pattern
         - OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/$TARGET timeout 600 bash -c "$cmd"
         - bash -c "$pass_check" && log "ITERATION-{N}: PASS" or "ITERATION-{N}: FAIL"
      3. Iteration cap: <= 2 commits touching profiles/*/agents/prometheus.md since pre-prometheus-tune tag
    Evidence: .sisyphus/evidence/task-18-prometheus-{original,tuned,bench}.{md,txt}, task-18-prometheus-iter-count.txt
  ```

  **Commit**: YES - `refactor(agent/prometheus): tune prompt for cheap models with output-template`

- [x] 19. Re-author Metis prompt for cheap models + benchmark

  **What to do**:
  - Same sequential pattern. Metis = gap analyzer.
  - Likely weakness: deep reasoning required but cheap models surface-skim
  - Recommended pattern: `verification-loops` + `anti-bias` (force "did I check X? did I verify Y?")
  - Benchmark via Scenario 4 (long-context retrieval - tests deep reasoning over input)

  **Recommended Agent Profile**:
  - **Category**: `deep` - PREMIUM
  - **Skills**: []

  **Parallelization**: NO. Blocks Task 20. Blocked By: Task 18.

  **References**:
  - Built-in: `~/.config/opencode/node_modules/oh-my-opencode/dist/agents/metis.d.ts`
  - Benchmark Scenario 4

  **QA Scenarios**:
  ```
  Scenario: Tuned Metis passes Benchmark Scenario 4 (long-context retrieval) on target profile
    Tool: Bash
    Preconditions: Sisyphus + Prometheus tasks complete (17, 18); GLM or anthropic-metered profile working; scenarios use $MODEL/$OUTPUT_PATH placeholders
    Steps:
      1. cd ~/.config/opencode && git tag pre-metis-tune-$(date +%Y%m%d%H%M)
      2. TARGET=glm  # or anthropic-metered, depending on Wave 0 caching test result
      3. Snapshot original Metis prompt to .sisyphus/evidence/task-19-metis-original.md
      4. Author tuned prompt with verification-loops + anti-bias patterns to ~/.config/opencode/profiles/$TARGET/agents/metis.md
      5. # Resolve target model
         export MODEL=$(jq -r '.categories.default.model // .agents.metis.model // empty' ~/.config/opencode/profiles/$TARGET/oh-my-openagent.json)
         test -n "$MODEL" || (echo "MODEL-NOT-FOUND in $TARGET profile"; exit 1)
      6. export OUTPUT_PATH=/tmp/metis-bench-iter1.txt
      7. cmd=$(awk '/^## Exact Command/{flag=1; next} flag && /^```/{count++; if(count>=2){exit}; next} flag && count==1 {print}' ~/.config/opencode/benchmark-runs/scenarios/4.md)
      8. test -n "$cmd" || (echo "EXTRACT-FAIL: scenario 4"; exit 1)
      9. OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/$TARGET timeout 600 bash -c "$cmd"
      10. pass_check=$(awk '/^## Pass Criteria/{flag=1; next} flag && /^```/{count++; if(count>=2){exit}; next} flag && count==1 {print}' ~/.config/opencode/benchmark-runs/scenarios/4.md)
      11. bash -c "$pass_check" && echo "ITERATION-1: PASS" >> .sisyphus/evidence/task-19-metis-bench.txt || echo "ITERATION-1: FAIL" >> .sisyphus/evidence/task-19-metis-bench.txt
      12. If FAIL: apply ONE more iteration (different pattern), re-run with OUTPUT_PATH=/tmp/metis-bench-iter2.txt, log "ITERATION-2: PASS|FAIL"
      13. Commit final state regardless of outcome
    Expected Result: Either iteration passes, OR best-effort tuned prompt committed with documented FAIL
    Evidence: .sisyphus/evidence/task-19-metis-original.md, task-19-metis-tuned.md, task-19-metis-bench.txt

  Scenario: Iteration cap respected (max 2 commits touching metis prompt)
    Tool: Bash
    Steps:
      1. cd ~/.config/opencode && git log --oneline --since="$(git log -1 --format=%cI pre-metis-tune-* | head -1)" -- 'profiles/*/agents/metis.md' 2>/dev/null | wc -l
      2. Count must be <= 2
      3. echo "Iteration count: $(cat above)" > .sisyphus/evidence/task-19-metis-iter-count.txt
    Expected Result: <= 2 commits since pre-tune tag
    Evidence: .sisyphus/evidence/task-19-metis-iter-count.txt
  ```

  **Commit**: YES - `refactor(agent/metis): tune prompt for cheap models with verification-loops`

- [x] 20. Re-author Oracle prompt for cheap models + benchmark

  **What to do**:
  - Oracle = high-IQ consultant. Weakness: cheap models lack reasoning depth Oracle assumes
  - Recommended pattern: `decomposition` + `tool-scaffolding` (force step-by-step approach + explicit tool use)
  - Benchmark via Scenario 5 (bug debug from stack trace - requires reasoning chain)

  **Recommended Agent Profile**:
  - **Category**: `deep` - PREMIUM
  - **Skills**: []

  **Parallelization**: NO. Blocks Task 21. Blocked By: Task 19.

  **References**:
  - Built-in: oracle agent in `dist/agents/`
  - Benchmark Scenario 5

  **QA Scenarios**:
  ```
  Scenario: Tuned Oracle passes Scenario 5 on target profile
    Tool: Bash
    Preconditions: Task 19 complete; scenarios use $MODEL/$OUTPUT_PATH placeholders
    Steps:
      1. Follow CANONICAL TEMPLATE from Task 17's QA Scenario, substituting:
         - AGENT=oracle, SCENARIO_NUM=5
         - PATTERN=decomposition (iter 1) -> tool-scaffolding (iter 2 if needed)
         - export MODEL=$(jq -r '.categories.default.model // .agents.oracle.model // empty' ~/.config/opencode/profiles/$TARGET/oh-my-openagent.json)
         - export OUTPUT_PATH=/tmp/oracle-bench-iter${N}.txt
      2. Iteration cap: <= 2 commits touching profiles/*/agents/oracle.md
    Evidence: .sisyphus/evidence/task-20-oracle-{original,tuned,bench}.{md,txt}, task-20-oracle-iter-count.txt
  ```

  **Commit**: YES - `refactor(agent/oracle): tune prompt for cheap models with decomposition`

- [x] 21. Re-author Momus prompt for cheap models + benchmark

  **What to do**:
  - Momus = critical reviewer. Weakness: nuance detection
  - Recommended pattern: `constraint-repetition` (mention "look for X" 2-3 times) + `output-template` (forced verdict format)
  - Benchmark via Scenario 2 (multi-step plan generation - run Momus AGAINST a Prometheus-generated plan, check verdict quality)

  **Recommended Agent Profile**:
  - **Category**: `deep` - PREMIUM
  - **Skills**: []

  **Parallelization**: NO (last in Wave 2). Blocks Wave 3. Blocked By: Task 20.

  **References**:
  - Built-in: `dist/agents/momus.d.ts`
  - Use Scenario 2 output from Task 18 as Momus input

  **QA Scenarios**:
  ```
  Scenario: Tuned Momus produces structured verdict on Prometheus output (target profile)
    Tool: Bash
    Preconditions: Task 18 complete and Task 18's Scenario 2 output exists; scenarios use $MODEL/$OUTPUT_PATH placeholders
    Steps:
      1. Follow CANONICAL TEMPLATE from Task 17's QA Scenario, with these adaptations:
         - AGENT=momus, INPUT=Task 18's Scenario 2 output (Prometheus-generated plan)
         - export MODEL=$(jq -r '.categories.default.model // .agents.momus.model // empty' ~/.config/opencode/profiles/$TARGET/oh-my-openagent.json)
         - export OUTPUT_PATH=/tmp/momus-bench-iter{N}.txt
         - PATTERN=constraint-repetition (iter 1) -> output-template (iter 2 if needed)
      2. Run Momus via target profile pointing at Task 18's output as input
      3. Verdict assertion: grep -qE "VERDICT: (APPROVE|REJECT|REVISE)" "$OUTPUT_PATH"
      4. Iteration cap: <= 2 commits touching profiles/*/agents/momus.md
    Evidence: .sisyphus/evidence/task-21-momus-{original,tuned,bench}.{md,txt}, task-21-momus-iter-count.txt
  ```

  **Commit**: YES - `refactor(agent/momus): tune prompt for cheap models with constraint-repetition`

---

### Wave 3: Cross-Profile Benchmark Execution + Scorecard

- [x] 22. Run full benchmark on premium baseline profile

  **What to do**: Execute all 5 benchmark scenarios via `oc-premium`, save outputs and metrics (cost, time, pass/fail) to `~/.config/opencode/benchmark-runs/premium-{date}/`

  **Recommended Agent Profile**: `unspecified-high` (orchestration, not deep reasoning). **Skills**: []

  **Parallelization**: YES, Wave 3. Blocks Task 27. Blocked By: Wave 2 done.

  **References**: Benchmark scenarios from Task 16, Premium profile from Task 13

  **QA Scenarios**:
  ```
  Scenario: All 5 benchmark scenarios complete on premium profile with metrics captured
    Tool: Bash
    Preconditions: Premium profile working, benchmark scenarios use $MODEL and $OUTPUT_PATH placeholders
    Steps:
      1. RUN_DIR=~/.config/opencode/benchmark-runs/premium-$(date +%Y%m%d-%H%M); mkdir -p "$RUN_DIR"
      2. # Read premium's default model from its config (e.g., from oh-my-openagent.json categories.default.model)
      3. PREMIUM_MODEL=$(jq -r '.categories.default.model // .agents.build.model // empty' ~/.config/opencode/profiles/premium/oh-my-openagent.json)
      4. test -n "$PREMIUM_MODEL" || (echo "MODEL-NOT-FOUND"; exit 1)
      5. for i in 1 2 3 4 5; do
           SCEN=~/.config/opencode/benchmark-runs/scenarios/$i.md
           cmd=$(awk '/^## Exact Command/{flag=1; next} flag && /^```/{count++; if(count>=2){exit}; next} flag && count==1 {print}' "$SCEN")
           pass_check=$(awk '/^## Pass Criteria/{flag=1; next} flag && /^```/{count++; if(count>=2){exit}; next} flag && count==1 {print}' "$SCEN")
           export MODEL="$PREMIUM_MODEL"
           export OUTPUT_PATH="$RUN_DIR/scenario-$i.out"
           start=$(date +%s)
           OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/premium timeout 600 bash -c "$cmd"
           end=$(date +%s)
           bash -c "$pass_check" > /dev/null && status=PASS || status=FAIL
           echo "scenario-$i,$status,$((end-start))s" >> "$RUN_DIR/results.csv"
         done
      6. test $(wc -l < "$RUN_DIR/results.csv") -eq 5
      7. for i in 1 2 3 4 5; do test -s "$RUN_DIR/scenario-$i.out" || echo "EMPTY: $i"; done | tee /tmp/premium-bench-emptiness.txt
      8. test ! -s /tmp/premium-bench-emptiness.txt
      9. cp "$RUN_DIR/results.csv" .sisyphus/evidence/task-22-premium-results.csv
    Expected Result: All 5 scenarios produce non-empty output, results.csv has 5 rows
    Evidence: .sisyphus/evidence/task-22-premium-results.csv, $RUN_DIR/scenario-{1-5}.out
  ```

  **Commit**: YES - `test(opencode): record premium baseline benchmark results`

- [x] 23. Run full benchmark on GLM profile

  **What to do**: Same pattern as Task 22 but for GLM profile. Save to `benchmark-runs/glm-{date}/`.

  **Recommended Agent Profile**: `unspecified-high`. **Skills**: []

  **Parallelization**: YES, Wave 3. Blocks Task 27. Blocked By: Wave 2 done.

  **References**: Same as Task 22, GLM profile from Task 9

  **QA Scenarios**:
  ```
  Scenario: All 5 benchmark scenarios complete on GLM profile with metrics captured
    Tool: Bash
    Steps: Identical to Task 22 QA Scenario but with OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/glm and RUN_DIR=glm-{date}
    Evidence: .sisyphus/evidence/task-23-glm-results.csv, $RUN_DIR/scenario-{1-5}.out
  ```

  **Commit**: YES - `test(opencode): record GLM benchmark results`

- [x] 24. Run full benchmark on Kimi profile

  **What to do**: Same pattern, Kimi profile

  **Recommended Agent Profile**: `unspecified-high`. **Skills**: []

  **Parallelization**: YES, Wave 3. Blocked By: Wave 2 done.

  **QA Scenarios**:
  ```
  Scenario: All 5 benchmark scenarios complete on Kimi profile with metrics captured
    Tool: Bash
    Steps: Identical to Task 22 QA Scenario but with OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/kimi and RUN_DIR=kimi-{date}
    Evidence: .sisyphus/evidence/task-24-kimi-results.csv, $RUN_DIR/scenario-{1-5}.out
  ```

  **Commit**: YES - `test(opencode): record Kimi benchmark results`

- [x] 25. Run full benchmark on Codex profile

  **What to do**: Same pattern, Codex profile. NOTE: Codex profile uses MCP delegation rather than native model binding (see Task 11). Sisyphus may invoke a default cheap model that delegates to Codex tools.

  **Must NOT do**:
  - Treat ChatGPT Plus rate limit as a blocking failure - log and continue (Codex profile is best-effort)

  **Recommended Agent Profile**: `unspecified-high`. **Skills**: []

  **Parallelization**: YES, Wave 3. Blocked By: Wave 2 done.

  **QA Scenarios**:
  ```
  Scenario: All 5 benchmark scenarios attempt run on Codex profile (rate limit tolerated)
    Tool: Bash
    Steps: Same as Task 22 but: when scenario fails AND output contains "rate.limit" or "429", record as RATE_LIMIT not FAIL in results.csv. Profile considered PASS if at least 3/5 scenarios complete (rate limits don't count against pass rate).
    Evidence: .sisyphus/evidence/task-25-codex-results.csv (with RATE_LIMIT rows distinguishable)
  ```

  **Commit**: YES - `test(opencode): record Codex benchmark results`

- [x] 26. Run full benchmark on anthropic-metered profile

  **What to do**: Same pattern. ALSO log cost-per-scenario to verify $20/mo budget realism with actual benchmark traffic.

  **Recommended Agent Profile**: `unspecified-high`. **Skills**: []

  **Parallelization**: YES, Wave 3. Blocked By: Wave 2 done.

  **QA Scenarios**: Same template + cost extraction step:
  ```
  Scenario: Anthropic-metered cost stays reasonable
    Tool: Bash
    Steps:
      1. Run all 5 scenarios via anthropic-metered profile
      2. opencode stats --since=today | grep -E '\$[0-9]+\.[0-9]+' | awk '{sum+=$NF} END {print sum}'
      3. Result should be under $1 (5 scenarios * ~$0.20 max each)
    Evidence: .sisyphus/evidence/task-26-anthropic-bench-cost.txt
  ```

  **Commit**: YES - `test(opencode): record anthropic-metered benchmark + cost`

- [x] 27. Compile cross-profile scorecard + identify weakest agents

  **What to do**:
  - Aggregate all 25 benchmark results (5 scenarios x 5 profiles) into `~/.config/opencode/benchmark-runs/scorecard.md`
  - Score each: pass/fail, cost, time, qualitative notes
  - Identify: (a) the 1-2 weakest agent/profile combos, (b) which GPT-5.4-routed agents are now in scope for Wave 4 routing decisions
  - Output a recommendation table for [DECISION NEEDED: GPT-5.4 agent routing]

  **Must NOT do**: Tune anything yet (Wave 4 does that). This is analysis only.

  **Recommended Agent Profile**:
  - **Category**: `deep` - synthesis requires depth (use premium if available, else anthropic-metered)
  - **Skills**: []

  **Parallelization**: NO. Blocks Wave 4. Blocked By: Tasks 22-26.

  **References**: All benchmark output files from Tasks 22-26

  **QA Scenarios**:
  ```
  Scenario: Scorecard exists and contains all 25 cells
    Tool: Bash
    Steps:
      1. test -f ~/.config/opencode/benchmark-runs/scorecard.md
      2. grep -cE "^(\\| (premium|glm|kimi|codex|anthropic-metered) \\|)" ~/.config/opencode/benchmark-runs/scorecard.md
      3. Result must be 5 (one row per profile in scorecard table)
      4. Scorecard must contain "Weakest Agent" section with at least 1 entry
      5. Scorecard must contain "GPT-5.4 Routing Recommendations" section
    Evidence: .sisyphus/evidence/task-27-scorecard.md
  ```

  **Commit**: YES - `test(opencode): compile cross-profile benchmark scorecard`

---

### Wave 4: Iteration + GPT-5.4 Routing

- [ ] 28. Apply ONE tuning pass to weakest agent in worst profile

  **What to do**:
  - Per Task 27 scorecard, identify worst-performing agent/profile combo
  - Apply ONE additional compensation pattern (different from the one used in Wave 2)
  - Re-benchmark just that agent/scenario
  - Commit improvement OR documented regression

  **Must NOT do**: More than ONE pass per agent (already used 2 caps in Wave 2 = total of 3 max)

  **Recommended Agent Profile**:
  - **Category**: `deep` - PREMIUM if remaining, else anthropic-metered
  - **Skills**: []

  **Parallelization**: YES, Wave 4. Blocked By: Task 27.

  **References**: Task 27 scorecard, original Wave 2 commit for that agent

  **QA Scenarios**:
  ```
  Scenario: Iteration produces measurable change vs Wave 2 result
    Tool: Bash
    Steps:
      1. Run scorecard scenario for chosen agent/profile combo with new prompt
      2. Compare cost/time/pass against Task 27 baseline
      3. Save delta to .sisyphus/evidence/task-28-iteration-{agent}.md
    Expected Result: Either pass rate improves OR cost decreases OR both, OR documented regression
    Evidence: .sisyphus/evidence/task-28-{agent}-iteration.md
  ```

  **Commit**: YES - `refactor(agent/{name}): tuning iteration 2 with {pattern}`

- [ ] 29. Apply ONE tuning pass to second-weakest agent

  **What to do**: Same as Task 28 but for second-weakest combo from scorecard

  **Recommended Agent Profile**: `deep` - PREMIUM if remaining. **Skills**: []

  **Parallelization**: YES (parallel with Task 28). Blocked By: Task 27.

  **References**: Task 27 scorecard

  **QA Scenarios**: Same pattern as Task 28
  Evidence: `.sisyphus/evidence/task-29-{agent}-iteration.md`

  **Commit**: YES - `refactor(agent/{name}): tuning iteration 2 with {pattern}`

- [ ] 30. Decide GPT-5.4 agent routing (Sisyphus produces recommendation table; user makes final call)

  **What to do**:
  - 7 agents currently on `openai/gpt-5.4` need post-expiry routing decisions: build, plan, hephaestus, oracle, multimodal-looker, momus, church
  - Sisyphus produces a recommendation table at `.sisyphus/evidence/task-30-routing-recommendations.md` with this format:
    ```
    | Agent | Wave 3 Best Profile | Cost/Invoke | Recommended Provider | Rationale |
    |-------|--------------------|-----------:|--------------------|-----------|
    | build | glm | $0.003 | glm/glm-4.6 | Strong in single-file refactor (S1 PASS) |
    | oracle | anthropic-metered | $0.04 | anthropic-metered | Heavy reasoning required, cheap models failed S5 |
    ...
    ```
  - Sisyphus then PAUSES and prompts user to confirm/override each row (using OpenCode's question UI or written prompt)
  - User's confirmed routing is saved to `.sisyphus/evidence/task-30-routing-confirmed.md`
  - Task 31 reads the confirmed file and applies the changes

  **Must NOT do**:
  - Make routing decisions without scorecard data (Task 27 must complete first)
  - Apply changes without user confirmation (Task 31 does that)
  - Skip the recommendation table - user needs the data to make informed call

  **Recommended Agent Profile**: `quick` - data presentation, not decision-making. **Skills**: []

  **Parallelization**: NO. Blocks Task 31. Blocked By: Task 27.

  **References**: Task 27 scorecard at `~/.config/opencode/benchmark-runs/scorecard.md`

  **QA Scenarios**:
  ```
  Scenario: Recommendation table exists with all 7 agents
    Tool: Bash
    Steps:
      1. test -f .sisyphus/evidence/task-30-routing-recommendations.md
      2. for a in build plan hephaestus oracle multimodal-looker momus church; do
           grep -qE "^\| $a " .sisyphus/evidence/task-30-routing-recommendations.md || echo "MISSING: $a"
         done > /tmp/routing-table-check.txt
      3. test ! -s /tmp/routing-table-check.txt
    Expected Result: Recommendation table exists with all 7 agents covered
    Evidence: .sisyphus/evidence/task-30-routing-recommendations.md

  Scenario: User confirmation captured
    Tool: Bash
    Steps:
      1. test -f .sisyphus/evidence/task-30-routing-confirmed.md
      2. # Confirmed file must contain decision per agent
      3. for a in build plan hephaestus oracle multimodal-looker momus church; do
           grep -qE "^\| $a " .sisyphus/evidence/task-30-routing-confirmed.md || echo "MISSING: $a"
         done > /tmp/routing-confirm-check.txt
      4. test ! -s /tmp/routing-confirm-check.txt
    Expected Result: All 7 agents have user-confirmed routing decisions
    Evidence: .sisyphus/evidence/task-30-routing-confirmed.md
  ```

  **Commit**: YES - `docs(opencode): record GPT-5.4 agent routing decisions`

- [ ] 31. Update profile configs to apply GPT-5.4 routing decisions

  **What to do**: Apply Task 30 decisions across all relevant profile configs. This is the actual file edits.

  **Must NOT do**: Touch agents not in the 7-agent GPT-5.4 list

  **Recommended Agent Profile**: `quick`. **Skills**: []

  **Parallelization**: NO. Blocks Task 32. Blocked By: Task 30.

  **References**: Task 30 decision document

  **QA Scenarios**:
  ```
  Scenario: All profile configs parse after edits
    Tool: Bash
    Steps:
      1. shopt -s nullglob; configs=(~/.config/opencode/profiles/*/opencode.json ~/.config/opencode/profiles/*/oh-my-openagent.json)
      2. test ${#configs[@]} -ge 10  # 5 profiles x 2 files = 10 minimum
      3. for f in "${configs[@]}"; do jq . "$f" > /dev/null 2>&1 || echo "FAIL: $f"; done > /tmp/config-validity.txt
      4. test ! -s /tmp/config-validity.txt
      5. cp /tmp/config-validity.txt .sisyphus/evidence/task-31-config-validity.txt
    Expected Result: All 10+ config files parse, no FAIL lines
    Evidence: .sisyphus/evidence/task-31-config-validity.txt (empty = pass)
  ```

  **Commit**: YES - `feat(opencode): apply GPT-5.4 routing to all cheap profiles`

- [ ] 32. Re-benchmark agents affected by Tasks 28-31

  **What to do**: Run subset of benchmarks affected by tuning (Tasks 28-29) and routing (Tasks 30-31). Update scorecard.

  **Recommended Agent Profile**: `unspecified-high`. **Skills**: []

  **Parallelization**: NO (final task in Wave 4). Blocks Wave 5. Blocked By: Tasks 28-31.

  **References**: Task 27 scorecard format

  **QA Scenarios**:
  ```
  Scenario: Updated scorecard reflects iteration changes
    Tool: Bash
    Steps:
      1. Compare scorecard.md before/after task 32
      2. Tasks 28-29 agents must show changed metrics
      3. Tasks 30-31 GPT-5.4 agents now have measured baselines (no longer "untested")
    Evidence: .sisyphus/evidence/task-32-rebench.md
  ```

  **Commit**: YES - `test(opencode): re-benchmark after iteration + GPT-5.4 routing`

---

### Wave 5: Documentation + Rollback

- [ ] 33. Document profile precedence chain (CORRECTED per Metis findings)

  **What to do**:
  - Write `~/.config/opencode/profiles/PRECEDENCE.md` documenting the actual load order: remote -> global -> OPENCODE_CONFIG (loses to project) -> project -> .opencode/ + OPENCODE_CONFIG_DIR -> OPENCODE_CONFIG_CONTENT
  - Explain why aliases use OPENCODE_CONFIG_DIR not OPENCODE_CONFIG
  - Reference Wave 0 Task 1 evidence

  **Recommended Agent Profile**: `writing`. **Skills**: []

  **Parallelization**: YES, Wave 5. Blocked By: Wave 4 done.

  **References**: Metis Findings 1 + 2, Wave 0 Task 1 evidence, opencode docs config page

  **QA Scenarios**:
  ```
  Scenario: PRECEDENCE.md exists and accurate
    Tool: Bash
    Steps:
      1. test -f ~/.config/opencode/profiles/PRECEDENCE.md
      2. grep -q "OPENCODE_CONFIG_DIR" ~/.config/opencode/profiles/PRECEDENCE.md
      3. grep -q "OPENCODE_CONFIG.*loses to project" ~/.config/opencode/profiles/PRECEDENCE.md
      4. ! grep -q "alias.*OPENCODE_CONFIG=" ~/.config/opencode/profiles/PRECEDENCE.md
    Evidence: .sisyphus/evidence/task-33-precedence-docs.txt
  ```

  **Commit**: YES - `docs(opencode): document corrected profile precedence chain`

- [ ] 34. Document per-agent fallback recipe with cost table

  **What to do**: Write `~/.config/opencode/profiles/FALLBACKS.md`:
  - Per-agent table: which providers/profiles each agent can fall back to if primary fails
  - Cost-per-invocation estimates from Wave 3 scorecard
  - "If sisyphus on GLM fails -> route to anthropic-metered for that session"
  - "If anthropic-metered budget hits cap -> Codex MCP fallback"

  **Recommended Agent Profile**: `writing`. **Skills**: []

  **Parallelization**: YES, Wave 5. Blocked By: Task 27 (scorecard).

  **References**: Task 27 scorecard, Task 32 updated scorecard

  **QA Scenarios**:
  ```
  Scenario: FALLBACKS.md covers all 14 agents with cost data
    Tool: Bash
    Steps:
      1. for a in build plan sisyphus hephaestus oracle explore multimodal-looker prometheus metis momus general librarian atlas church; do
           grep -q "^| $a " ~/.config/opencode/profiles/FALLBACKS.md || echo "MISSING: $a"
         done
      2. ! grep -q "MISSING"
      3. grep -cE "\\$0\\.[0-9]+|\\$[0-9]+\\.[0-9]+" ~/.config/opencode/profiles/FALLBACKS.md
      4. Result >= 14 (one cost figure per agent minimum)
    Evidence: .sisyphus/evidence/task-34-fallback-docs.txt
  ```

  **Commit**: YES - `docs(opencode): document per-agent fallback recipe`

- [ ] 35. Document Anthropic-metered budget reality (post-caching-verification)

  **What to do**: Write `~/.config/opencode/profiles/anthropic-metered/BUDGET.md`:
  - Reference Wave 0 Task 2 result (caching works or doesn't)
  - If caching works: budget realistic at $20/mo for planner-only routing
  - If caching broken: revised cost estimate, alternatives (direct Anthropic SDK use, switch to Codex MCP for planners)
  - Daily/weekly burn rate calculation based on Joey's typical usage

  **Recommended Agent Profile**: `writing`. **Skills**: []

  **Parallelization**: YES, Wave 5. Blocked By: Task 26 (anthropic-metered benchmark cost data), Task 2 (caching result).

  **References**: Task 2 evidence, Task 26 cost data

  **QA Scenarios**:
  ```
  Scenario: BUDGET.md addresses caching-broken vs working scenarios
    Tool: Bash
    Steps:
      1. test -f ~/.config/opencode/profiles/anthropic-metered/BUDGET.md
      2. grep -qiE "(caching works|caching broken|cache_read)" ~/.config/opencode/profiles/anthropic-metered/BUDGET.md
      3. grep -qE "\\$[0-9]+/mo" ~/.config/opencode/profiles/anthropic-metered/BUDGET.md
    Evidence: .sisyphus/evidence/task-35-budget-docs.txt
  ```

  **Commit**: YES - `docs(opencode): document anthropic-metered budget reality`

- [ ] 36. Update cost-aware-delegation.md rule with cheap-model data

  **What to do**:
  - Update `~/.config/opencode/rules/cost-aware-delegation.md` with:
    - GLM/Kimi/Codex cost data from Task 27 scorecard
    - Recommended model selection per task complexity
    - When to use each profile
  - Reference the multi-profile architecture

  **Recommended Agent Profile**: `writing`. **Skills**: []

  **Parallelization**: YES, Wave 5. Blocked By: Task 27.

  **References**: existing `~/.config/opencode/rules/cost-aware-delegation.md`, Task 27 scorecard

  **QA Scenarios**:
  ```
  Scenario: Cost-aware-delegation rule updated with cheap-model data
    Tool: Bash
    Steps:
      1. grep -qiE "(GLM|Kimi|Codex)" ~/.config/opencode/rules/cost-aware-delegation.md
      2. grep -qiE "OPENCODE_CONFIG_DIR" ~/.config/opencode/rules/cost-aware-delegation.md
      3. cd ~/.config/opencode && git log --oneline rules/cost-aware-delegation.md | head -1 | grep -q "$(date +%Y-%m)"
    Evidence: .sisyphus/evidence/task-36-rule-updated.txt
  ```

  **Commit**: YES - `docs(rules): add cheap-model cost data to delegation rule`

- [ ] 37. Final premium-baseline snapshot verification (after F1-F4 approval)

  **What to do**:
  - This task VERIFIES the `premium-baseline-final-{YYYYMMDD}` tag exists in `~/.config/opencode/`
  - The tag itself is created at workflow end (after F1-F4 approve and user gives "okay") - see Commit Strategy section
  - This task's role is the verification gate that the tag was actually created

  **Must NOT do**: Skip this verification - the final tag is the rollback anchor

  **Recommended Agent Profile**: `quick`. **Skills**: [`git-master`]

  **Parallelization**: NO (very last task in the workflow, after F1-F4 user-okay)

  **Blocked By**: F1-F4 user-approval gate, all Wave 5 commits.

  **References**: Task 6 (pre-migration tag), Commit Strategy section (final tag is created post-F1-F4-okay)

  **QA Scenarios**:
  ```
  Scenario: Final tag exists and captures post-migration state
    Tool: Bash
    Preconditions: F1-F4 reviews approved, user gave explicit "okay"
    Steps:
      1. cd ~/.config/opencode && git tag --list "premium-baseline-final-*" | tail -1 > /tmp/final-tag-name.txt
      2. test -s /tmp/final-tag-name.txt
      3. FINAL_TAG=$(cat /tmp/final-tag-name.txt)
      4. PRE_TAG=$(git tag --list "premium-baseline-pre-migration-*" | tail -1)
      5. git diff "$PRE_TAG" "$FINAL_TAG" --stat | tee /tmp/migration-diff.txt
      6. grep -cE "(profiles/|rules/cost-aware-delegation\.md|opencode\\.json)" /tmp/migration-diff.txt
      7. Result must be >= 5 (multiple migration files changed since pre-migration)
    Expected Result: Final tag exists, diff vs pre-migration shows >=5 migration-related files changed
    Evidence: .sisyphus/evidence/task-37-final-tag.txt (with both tag names + diff stat)
  ```

  **Commit**: NO (the tag IS the artifact, created by the workflow's final step)

---

## Final Verification Wave (MANDATORY - after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [ ] F1. **Plan Compliance Audit** - `oracle`
  Read the plan end-to-end. For each "Must Have": verify the artifact exists and works (run smoke test, read config file, check git tag). For each "Must NOT Have": search for forbidden patterns - reject with file:line if found. Specifically check: `OPENCODE_CONFIG=` should NOT appear in any alias file (only `OPENCODE_CONFIG_DIR=`). Check evidence files exist in .sisyphus/evidence/. Verify all 5 profile dirs exist and contain both opencode.json + oh-my-openagent.json.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Config Quality Review** - `unspecified-high`
  Validate each profile JSON parses correctly: `for f in ~/.config/opencode/profiles/*/opencode.json; do jq . $f >/dev/null || echo FAIL: $f; done`. Same for oh-my-openagent.json files. Run shell alias precedence test (Wave 0 Task 1's script). Verify cost-guard plugin loads in each profile. Check for: hardcoded API keys (must be `{env:...}`), `OPENCODE_CONFIG=` usage, missing required fields, broken merge precedence.
  Output: `JSON Valid [N/N] | Aliases Work [N/N] | No Secrets Leaked [PASS/FAIL] | VERDICT`

- [ ] F3. **Real End-to-End QA** - `unspecified-high`
  Start from clean state (fresh terminal). Execute EVERY profile smoke test: `oc-premium`, `oc-glm`, `oc-kimi`, `oc-codex`, `oc-anthropic-metered`. Each must respond within 30s. Run the cross-profile precedence test from Task 1. Run benchmark Scenario 1 (single-file refactor) on each profile and verify all complete (regardless of quality - quality is in scorecard). Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Smoke Tests [N/N] | Precedence [PASS/FAIL] | Benchmark Run [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** - `deep`
  For each task: read "What to do", read actual diff (git log/diff in ~/.config/opencode/). Verify 1:1 - everything in spec was built (no missing), nothing beyond spec was built (no creep). Specifically check: only the 5 critical agents had prompts re-authored (sisyphus, prometheus, metis, oracle, momus) - if build/plan/etc were also touched, REJECT for scope creep. Check Wave 0 verifications were actually run (evidence files exist). Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Scope Discipline [CLEAN/N issues] | Wave 0 Evidence [PRESENT/MISSING] | VERDICT`

---

## Commit Strategy

Configuration changes follow per-wave commit strategy:

- **Wave 0**: Single commit per verification (`chore(opencode): verify {check name}`)
- **Wave 1**: One commit per profile (`feat(opencode): add {profile} profile`) + alias commit (`chore(shell): add opencode profile aliases`) + benchmark commit (`test(opencode): add cross-profile benchmark suite`)
- **Wave 2**: One commit per agent (`refactor(agent/{name}): tune prompt for cheap models with {pattern}`)
- **Wave 3**: Single commit (`test(opencode): record cross-profile benchmark scorecard`)
- **Wave 4**: One commit per tuning pass + one for GPT-5.4 routing
- **Wave 5**: Single commit per doc file
- **Workflow End** (after F1-F4 approve AND user gives explicit "okay"):
  1. Tag: `git -C ~/.config/opencode tag -a "premium-baseline-final-$(date +%Y%m%d)" -m "Multi-profile migration complete; pre-expiry final state"`
  2. Task 37 then verifies the tag exists

Files: `~/.config/opencode/` is git-tracked (verified during planning - has `.git` directory).

Pre-commit checks: `shopt -s nullglob; jq . ~/.config/opencode/*.json ~/.config/opencode/profiles/*/*.json` to validate all configs parse.

---

## Success Criteria

### Verification Commands

```bash
# 1. All profile JSONs parse (with nullglob safety)
shopt -s nullglob
for f in ~/.config/opencode/profiles/*/opencode.json; do jq . "$f" > /dev/null || echo "FAIL: $f"; done
for f in ~/.config/opencode/profiles/*/oh-my-openagent.json; do jq . "$f" > /dev/null || echo "FAIL: $f"; done
# Expected: no FAIL output

# 2. All aliases use OPENCODE_CONFIG_DIR (not OPENCODE_CONFIG)
grep -r "OPENCODE_CONFIG=" ~/.zshrc ~/.config/opencode/ 2>/dev/null
# Expected: no matches (only OPENCODE_CONFIG_DIR= should appear)

# 3. Each profile passes smoke test
for p in premium glm kimi codex anthropic-metered; do
  echo "Testing $p..."
  OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/$p timeout 30 opencode run "echo ready" | grep -q "ready" && echo "PASS" || echo "FAIL"
done
# Expected: 5x PASS

# 4. Benchmark scorecard exists
test -f ~/.config/opencode/benchmark-runs/scorecard.md && echo "EXISTS" || echo "MISSING"

# 5. Pre-migration baseline tag exists
cd ~/.config/opencode && git tag | grep -q premium-baseline-pre-migration && echo "EXISTS" || echo "MISSING"

# 6. Final baseline tag exists
cd ~/.config/opencode && git tag | grep -q premium-baseline-final && echo "EXISTS" || echo "MISSING"
```

### Final Checklist

- [ ] All "Must Have" present (verified by F1)
- [ ] All "Must NOT Have" absent (verified by F1)
- [ ] All Wave 0 verifications passed and evidence captured
- [ ] All 5 profile directories exist and pass smoke test
- [ ] All 5 critical agents have re-authored prompts
- [ ] Benchmark suite runs on all 5 profiles, scorecard generated
- [ ] All shell aliases work
- [ ] Documentation committed
- [ ] Two snapshots tagged (pre-migration, final)
- [ ] User explicitly approves Wave FINAL results
