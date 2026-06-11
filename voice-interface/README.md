# Epsilon Voice Interface

Epsilon Voice Interface is a macOS menubar push-to-talk shell for Epsilon. V1 keeps the fast voice loop local to this app, uses mocked flows for smoke evidence, and only allows two write-like outcomes after confirmation: Church capture and local draft artifacts.

## Setup

1. Install dependencies from this directory with `npm install`.
2. Build the Electron, preload, smoke, and renderer bundles with `npm run build`.
3. Run the unit and integration tests with `npm test`.
4. Run the full deterministic smoke with `npm run smoke -- --mock-all --evidence-dir /Users/joey/Church/.omo/evidence` after a successful build.

The app is developed inside the Epsilon worktree, under `voice-interface/`. Do not run it from the default Epsilon checkout while task work is in progress.

## Permissions

V1 is push-to-talk only. It supports press-and-hold and toggle-to-talk modes through the menubar shell and global hotkey. macOS microphone permission is required for real capture. If microphone permission is missing or revoked, the app enters a degraded state and does not retain audio.

There is no wake word and no continuous listening in V1.

## Infisical And Environment Requirements

The main process mints OpenAI Realtime ephemeral session material from `OPENAI_API_KEY` when the app is launched with that environment available. The renderer never receives the raw `OPENAI_API_KEY`; it receives only the typed session result from preload or a mock session in browser preview.

Recommended secret flow:

```sh
infisical run -- npm run dev
```

For local mock-only development and smoke tests, no Infisical secret is required. Mock smoke paths must not call OpenAI, OpenCode, OpenViking, email, Slack, calendar, or other live services.

## Development Launch

Use these commands from `voice-interface/`:

```sh
npm run dev
npm run build
npm test
npm run smoke -- --mock-all --evidence-dir /Users/joey/Church/.omo/evidence
npm test -- docs-scope
```

`npm run dev` starts the Vite renderer preview. In browser preview, the renderer uses an in-memory `EpsilonVoiceApi` fallback when Electron preload is absent. Electron packaging and final launch automation are outside Task 9 and remain part of the final verification wave.

## Hotkeys

The menubar app registers a global voice hotkey through Electron `globalShortcut`. A registration failure moves the app into `degraded` with an actionable shortcut-conflict message instead of crashing. The shell states are `idle`, `listening`, `thinking`, `speaking`, `confirming`, `delegated`, `degraded`, and `error`.

## Confirmation Behavior

All V1 writes go through `prepare -> confirm -> execute`:

1. `prepare` creates an immutable manifest with target path, payload, confirmation phrase, expiration, and hash.
2. `confirm` accepts a click approval or exact voice confirmation phrase.
3. `execute` writes only when the manifest is still valid, unchanged, and approved.

Rejected, edited, ambiguous, expired, or hash-mismatched confirmations create no Church write.

## Supported V1 Actions

Supported V1 actions are deliberately narrow:

- Read compact Church context for local query answers.
- Use OpenViking only as a compact fallback source when available.
- Use explicit read-only service summaries without raw service response dumps.
- Capture a Church inbox item after confirmation.
- Add today/upcoming Church task items through the same manifest pattern.
- Update local voice project notes through allowlisted Church paths.
- Create or update a local draft artifact after confirmation.
- Delegate slow work to local OpenCode only through compact prompt summaries, bounded concurrency, timeout cancellation, and cost caps.

## Unsupported External Writes

External sends are unsupported in V1. Email sends, Slack sends, calendar creates, ticket creates, device actions, cloud writes, shell execution, MCP mutations, arbitrary OpenCode sessions, and direct raw voice tool execution are not supported V1 behavior.

If the user asks for an external send, V1 creates a local draft only after confirmation. The draft must clearly say `Status: NOT SENT - local draft only.` No email, Slack message, calendar event, ticket, device command, cloud mutation, shell command, or MCP write is executed.

## Degraded Modes

The app keeps short, visible degraded states:

- Realtime unavailable: local text/read-only mode remains available and no provider call is made from mocked smoke.
- Realtime cost cap reached: premium realtime is blocked before provider calls.
- OpenViking unavailable: compact Church context remains available.
- OpenCode unavailable: delegation is disabled and no worker process is spawned.
- Microphone permission denied: capture is paused until permission returns.
- Face bridge unavailable: menubar state remains available.
- Read-only service failure: the app continues without raw service responses.

## Secret And Raw-Audio Boundaries

Do not store secrets, raw audio, full transcripts, raw service responses, or provider payloads in repo files, logs, manifests, screenshots, or evidence. Raw audio retention is disabled by default. Logs redact API keys, bearer-like tokens, email/message bodies, manifest payload fields, transcript-like fields, audio-like fields, and raw service response fields.

Smoke evidence is deterministic and mock-only. The Task 9 smoke evidence is `/Users/joey/Church/.omo/evidence/task-9-full-smoke.json`; the docs-scope guard writes `/Users/joey/Church/.omo/evidence/task-9-docs-scope.txt`.
