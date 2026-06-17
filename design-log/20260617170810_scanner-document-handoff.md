# Design Log #20260617170810

## Background
MOI scanner intake currently polls Gmail for RICOH-like scanner messages and hands safe metadata to local OpenCode. That was intentionally conservative: it avoided downloading attachment bodies and told OpenCode that raw document text was unavailable. Joey now wants scanned documents to be downloaded immediately and handed to OpenCode with Church context so the document can be analyzed, organized, and turned into action items or questions.

Related design logs: scanner intake rollout work was previously tracked outside this branch in Design Log #20260617000000.

## Problem
The existing metadata-only prompt is too locked down for real scanner intake. It can detect that a PDF/image exists, but it cannot let OpenCode inspect the document or make useful Church organization decisions. At the same time, the scanner still must avoid Gmail mutations, avoid logging raw document bytes, and avoid passing large binary payloads through command-line prompts or delegation job snapshots.

## Questions and Answers
- Q: Should Gmail attachments be downloaded?
  - A: Yes, for matched scanner messages. The scanner may use Gmail readonly attachment GET endpoints but still must not send, delete, archive, mark read, or mutate labels.
- Q: Should document bytes be embedded in the OpenCode prompt?
  - A: No. The bytes are decoded into private local files under the scanner app-support directory. The prompt includes local file paths and metadata only.
- Q: Should the OpenCode prompt be the old bounded voice wrapper?
  - A: No. Scanner jobs use a narrow direct prompt mode so the prompt can start with `/church` and avoid the voice delegation safety text that says “no writes.”
- Q: Which model should scanner Church jobs use on MOI?
  - A: `opencode/gpt-5.5`, now that MOI OpenCode has OpenAI OAuth available.

## Design
- Extend `GmailScannerAttachmentRecord` and `EpsilonTriggerAttachment` with optional `localPath` and content hash support for downloaded files.
- Add `attachmentDownloadDir` to `createGmailRestScannerMessageSource()` and `ScannerIntakeServiceConfig`.
- For each external Gmail attachment part with `body.attachmentId`, call Gmail readonly `users.messages.attachments.get`, decode Gmail base64url bytes, hash them, and write them to `~/Library/Application Support/Epsilon/scanner-intake/attachments` with sanitized filenames and private file permissions.
- Preserve inline `body.data` as ignored unless future policy explicitly supports inline MIME bodies.
- Add `DelegationPromptMode = 'bounded' | 'direct'`. Existing delegation jobs remain `bounded`; scanner handoffs set `promptMode: 'direct'`.
- Change scanner handoff prompt to start with `/church Analyze and organize the scanned document(s) for Joey.` and include document local paths, safe Gmail refs, sender, subject, filename, MIME type, size, hash, classification, confidence, and scanner questions.

## Implementation Plan
- Update Gmail REST source to download attachments to local files when `attachmentDownloadDir` is configured.
- Update scanner intake attachment metadata and content hashing to prefer downloaded content hashes.
- Update scanner service defaults and LaunchAgent template to use the download directory and `opencode/gpt-5.5`.
- Update delegation gateway/types to support direct prompts without changing default bounded behavior.
- Update tests for download calls, direct Church prompt behavior, service defaults, and launchd model.

## Examples
A RICOH email with `scan.pdf` and Gmail attachment id `attach-1` becomes a local file such as:

```text
~/Library/Application Support/Epsilon/scanner-intake/attachments/gmail-1-attach-1-scan.pdf
```

The OpenCode prompt starts with:

```text
/church Analyze and organize the scanned document(s) for Joey.
Open the local document file path(s) listed below.
Document local path: .../gmail-1-attach-1-scan.pdf
```

## Trade-offs
- Downloading files makes the scanner more useful, but it stores scanned documents on disk. The files are placed in the private scanner app-support directory and are referenced by path rather than embedded into logs or job snapshots.
- Direct prompt mode weakens the previous generic voice delegation wrapper for scanner jobs only. This is intentional because the scanner job needs to invoke Church behavior and may propose Church organization/write actions through normal safeguards.
- The scanner still does not mutate Gmail, so scanned messages remain in Gmail until a separate retention/label policy is added.
