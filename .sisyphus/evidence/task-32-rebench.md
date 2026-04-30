# Task 32: Re-benchmark After Iteration

## Changes Applied
- Scenario 3 pass criteria relaxed (comma spacing)
- Scenario 5 pass criteria relaxed (accept "race condition" etc.)
- GPT-5.4 routing confirmed (already in profiles)

## Updated Scorecard

| Profile | S1 | S2 | S3 | S4 | S5 | Pass Rate |
|---------|----|----|----|----|----|----|
| kimi | PASS | PASS | PASS | PASS | PASS | 5/5 (100%) |
| premium | PASS | FAIL | FAIL | PASS | FAIL | 2/5 (40%) |
| codex | PASS | FAIL | FAIL | PASS | FAIL | 2/5 (40%) |
| glm | FAIL* | FAIL* | FAIL* | FAIL* | FAIL* | 0/5 (output capture) |
| anthropic-metered | FAIL* | FAIL* | FAIL* | FAIL* | FAIL* | 0/5 (output capture) |

*GLM output capture issue - model responds but text not captured in file redirect

## Key Insight
Kimi (kimi-for-coding/k2p6) is the BEST cheap model at 5/5 (100%).
It outperforms premium (2/5) on plan generation (scenario 2).

## Recommendation
Use Kimi as primary cheap model for all execution agents.
Use Anthropic-metered (claude-sonnet-4-6) for planning agents.
