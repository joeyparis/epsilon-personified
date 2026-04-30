# Learnings - multi-profile-opencode-migration

## 2026-04-30 Task 1: OPENCODE_CONFIG_DIR Precedence

- `opencode debug config` is the correct tool for config inspection (NOT `opencode run` which requires a server)
- `OPENCODE_CONFIG_DIR` WINS over project files - confirmed via `opencode debug config` showing profile model overrides project model
- `OPENCODE_CONFIG` (single file) LOSES to project files - confirmed broken for our use case
- Evidence: .sisyphus/evidence/task-1-precedence-pass.txt

## 2026-04-30 Task 6: Baseline Snapshot

- ~/.config/opencode/ IS git-tracked
- Tag created: premium-baseline-pre-migration-20260430 (commit 87ba164)
- Used `git add -u` (NOT `git add -A`) to stage only tracked changes, not untracked files
- 29 files in snapshot

## 2026-04-30 Provider Discovery

- ALL providers already configured in ~/.local/share/opencode/auth.json
- GLM: Z.AI Coding Plan active - models: opencode/glm-5, opencode/glm-5.1
- Kimi: Kimi For Coding active - models: kimi-for-coding/k2p5, kimi-for-coding/k2p6, kimi-for-coding/kimi-k2-thinking
- Anthropic: active - anthropic/claude-opus-4-7, anthropic/claude-sonnet-4-6, etc.
- OpenAI: active - openai/gpt-5.4, openai/gpt-5.1-codex, openai/gpt-5.1-codex-max, etc.
- NO custom provider blocks needed in profile configs - use native model IDs directly

## 2026-04-30 opencode run Architecture

- `opencode run` is CLIENT-SERVER - requires `opencode serve` running first
- For config inspection: use `opencode debug config`
- For cost/model verification: need active opencode server OR use `opencode stats` after a session
- Profile smoke tests (Task 15) need to be done interactively or with server running

## 2026-04-30 Model ID Corrections (plan had wrong IDs)

- GLM: use `opencode/glm-5.1` (NOT `glm/glm-4.6`)
- Kimi: use `kimi-for-coding/k2p6` (NOT `kimi/kimi-for-coding`)
- Codex: use `openai/gpt-5.1-codex-max` (NOT Codex CLI MCP - not needed)
- Anthropic: `anthropic/claude-opus-4-7` ✓ correct

## 2026-04-30 Profile Config Architecture (simplified)

- Profile opencode.json: minimal - just schema + any MCP overrides needed
- Profile oh-my-openagent.json: agent model bindings using native model IDs
- NO custom provider blocks with API keys needed (providers in auth.json)
- Aliases use: OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/{name} opencode

## 2026-04-30 Task 16: Benchmark scenario suite

- Benchmark scenarios live in `~/.config/opencode/benchmark-runs/scenarios/1.md` through `5.md`
- Keep every scenario output-verifiable with shell checks against `$OUTPUT_PATH`; no human judgment in pass criteria
- Reused real repo anchors for fidelity: `monitor-avatar/src/main.ts`, `monitor-avatar/src/animation-sampler.ts`, and `.sisyphus/plans/multi-profile-opencode-migration.md`
- Long-context retrieval scenario works best when the expected answer is a single exact line spanning facts from different plan sections
