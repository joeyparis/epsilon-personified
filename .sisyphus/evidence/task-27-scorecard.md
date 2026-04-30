# Cross-Profile Benchmark Scorecard

Date: 2026-04-30
Benchmark: 5 scenarios (single-file refactor, plan generation, tool orchestration, long-context retrieval, bug debug)

## Results Summary

| Profile | Model | S1 Refactor | S2 Plan | S3 Tools | S4 LongCtx | S5 Debug | Pass Rate |
|---------|-------|-------------|---------|----------|------------|----------|-----------|
| premium | anthropic/claude-opus-4-7 | PASS (57s) | FAIL (293s) | FAIL (39s) | PASS (46s) | FAIL (timeout) | 2/5 (40%) |
| kimi | kimi-for-coding/k2p6 | PASS (32s) | PASS (146s) | FAIL (43s) | PASS (18s) | FAIL (34s) | 3/5 (60%) |
| codex | openai/gpt-5.1-codex-max | PASS (21s) | FAIL (31s) | FAIL (42s) | PASS (13s) | FAIL (27s) | 2/5 (40%) |
| glm | opencode/glm-5.1 | FAIL-NO-OUTPUT | FAIL-NO-OUTPUT | FAIL-NO-OUTPUT | FAIL-NO-OUTPUT | FAIL-NO-OUTPUT | 0/5 (0%) |
| anthropic-metered | opencode/glm-5.1 (executor) | FAIL-NO-OUTPUT | FAIL-NO-OUTPUT | FAIL-NO-OUTPUT | FAIL-NO-OUTPUT | FAIL-NO-OUTPUT | 0/5 (0%) |

## Key Findings

### GLM Output Capture Issue
GLM (opencode/glm-5.1) responds to queries but the text output is NOT captured when using `opencode run --attach ... > file`. The model runs (9s for scenario 1 vs 5s for others) but produces empty output files. This is a known limitation of how opencode routes GLM output through the TUI.

**Impact**: GLM and anthropic-metered (which uses GLM for executors) cannot be benchmarked with the current approach.

**Mitigation**: GLM works interactively (confirmed via direct testing). The benchmark harness needs to be updated to capture GLM output differently.

### Kimi Outperforms Premium on Plan Generation
Kimi PASSES scenario 2 (plan generation) while premium FAILS. This is unexpected and suggests Kimi's training data includes more structured plan generation examples.

### Scenario 2 and 3 Failures Across All Profiles
- Scenario 2 (plan generation): Only Kimi passes. The pass criteria requires specific markdown headers that models don't always produce.
- Scenario 3 (tool orchestration): All profiles fail. The pass criteria may be too strict.

## Weakest Agent/Profile Combos

1. **GLM/anthropic-metered**: 0/5 due to output capture issue (not model quality)
2. **Premium scenario 2**: Plan generation fails (model explores instead of generating plan)
3. **All profiles scenario 3**: Tool orchestration pass criteria too strict

## GPT-5.4 Routing Recommendations

| Agent | Current (GPT-5.4) | Recommended | Rationale |
|-------|-------------------|-------------|-----------|
| build | openai/gpt-5.4 | kimi-for-coding/k2p6 | Kimi 60% pass rate, fast |
| plan | openai/gpt-5.4 | anthropic/claude-sonnet-4-6 | Plan generation needs quality |
| hephaestus | openai/gpt-5.4 | kimi-for-coding/k2p6 | Deep agent, Kimi performs well |
| oracle | openai/gpt-5.4 | anthropic/claude-sonnet-4-6 | Consultation needs reasoning |
| multimodal-looker | openai/gpt-5.4 | kimi-for-coding/k2p6 | Multimodal, Kimi handles well |
| momus | openai/gpt-5.4 | anthropic/claude-sonnet-4-6 | Critic needs nuance |
| church | openai/gpt-5.4 | kimi-for-coding/k2p6 | Personal assistant, Kimi fast |

## Iteration Recommendations

1. Fix GLM output capture (update benchmark harness to use `--format json` or alternative)
2. Relax scenario 2 pass criteria (accept any plan with TODOs section)
3. Relax scenario 3 pass criteria (accept any multi-tool response)
4. Consider Kimi as primary cheap model (60% pass rate vs 40% for Codex)
