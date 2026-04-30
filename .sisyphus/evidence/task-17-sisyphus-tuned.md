# Sisyphus Tuning Summary

## Patterns Applied
1. Decomposition: Replaced complex intent table with explicit numbered steps
2. Output-template: Added explicit response format templates
3. Constraint-repetition: Key delegation rule repeated 3x in different sections
4. Smaller-turn-scopes: Added "one decision per turn" explicit rule

## Key Changes
- Simplified Step 0-2 reasoning chain into 5 explicit numbered questions
- Added response templates for common scenarios (delegation, investigation, clarification)
- Added self-check section at end of prompt
- Removed complex domain classification table (too much context for cheap models)
- Kept all tool usage patterns (parallel tools, background agents)

## Target Models
- opencode/glm-5.1
- kimi-for-coding/k2p6

## Files Created
- ~/.config/opencode/profiles/glm/agents/sisyphus.md (957 words)
- ~/.config/opencode/profiles/kimi/agents/sisyphus.md (957 words, identical)

## Commit
200fa7b - refactor(agent/sisyphus): tune prompt for cheap models with decomposition+output-template
