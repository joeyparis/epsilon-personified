# GPT-5.4 Agent Routing Recommendations

Based on benchmark scorecard (Kimi 5/5, Codex 2/5, GLM output-capture issue).

## Recommendation Table

| Agent | Current (GPT-5.4) | Recommended Provider | Rationale |
|-------|-------------------|---------------------|-----------|
| build | openai/gpt-5.4 | kimi-for-coding/k2p6 | Kimi 5/5 pass rate, fast (32s avg), good at code tasks |
| plan | openai/gpt-5.4 | anthropic/claude-sonnet-4-6 | Plan generation needs quality; Kimi passed S2 but premium failed - use Anthropic for reliability |
| hephaestus | openai/gpt-5.4 | kimi-for-coding/k2p6 | Deep agent, Kimi performs well on complex tasks |
| oracle | openai/gpt-5.4 | anthropic/claude-sonnet-4-6 | Consultation needs reasoning depth; Anthropic-metered profile |
| multimodal-looker | openai/gpt-5.4 | kimi-for-coding/k2p6 | Kimi handles multi-step tasks well |
| momus | openai/gpt-5.4 | anthropic/claude-sonnet-4-6 | Critic needs nuance; Anthropic-metered profile |
| church | openai/gpt-5.4 | kimi-for-coding/k2p6 | Personal assistant, Kimi fast and capable |

## Summary
- **Kimi** (kimi-for-coding/k2p6): build, hephaestus, multimodal-looker, church
- **Anthropic-metered** (anthropic/claude-sonnet-4-6): plan, oracle, momus

## Cost Impact
- Kimi agents: ~$0.60/1M input tokens (subscription-based, predictable)
- Anthropic-metered agents: ~$3/1M input tokens (sonnet-4-6), with caching ~$0.30/1M cached
- Estimated monthly: <$20 for typical usage with caching

## AWAITING USER CONFIRMATION
Please review and confirm/override each routing decision.
Save confirmed decisions to: .sisyphus/evidence/task-30-routing-confirmed.md
