# Memory - Hook duplicate cleanup + Stop status explanation

Last updated: 2026-06-20 19:30:00 EAT

## What was built

- Removed the duplicate `codex-javascript-mastery-hooks` block from `/home/christadrian/.codex/config.toml`.
- Removed the stale `[hooks.state]` entries that belonged to the duplicate block.
- Left a backup at `/home/christadrian/.codex/config.toml.bak`.

## Decisions made

- The Stop hook enforces that the assistant's final message contains one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT` at the start of a line. If it does not, the hook returns `decision:block` with the "Missing completion status" reason.
- Duplicate `codex-hooks` entries were indeed installed twice, causing every event to run multiple times and multiple Stop rows in the UI.

## Problems solved

- The red "Missing completion status" rows in Codex Desktop are the hook working as designed: earlier assistant replies ended without a status line, so the Stop hook blocked.
- The duplicate hook installs are gone, so Codex should only run one `codex-hooks` hook per event.

## Current state

- `/home/christadrian/.codex/config.toml` now has one `codex-hooks` block per event plus the existing `codex-wakatime` hooks.
- A backup of the pre-dedup config exists at `/home/christadrian/.codex/config.toml.bak`.

## Next session starts with

- Restart Codex Desktop or start a fresh thread so the updated config is reloaded.
- Approve the remaining hooks if Codex prompts for trust again.
- Continue whatever task is next; remember to end every task response with a line starting with `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`.

## Open questions

- None.

## 2026-06-20 — Stop hook gated on file edits (advisory turns no longer blocked)

### Problem
Stop hook hard-blocked every final response lacking a completion status, including advisory /
read-only Q&A turns (e.g. "how do I fix pip: command not found"). The assistant was forced to
append `DONE` to a conversational answer, which Christadrian found wrong.

### Root cause
`buildHookResponse` Stop branch returned `decision:block` whenever `hasCompletionStatus(text)`
was false, with no notion of whether the turn actually did shippable work.

### Fix (deterministic)
Gated the block on per-turn file-edit tracking:
- `PostToolUse` records `apply_patch`/`Edit`/`Write` calls to `/tmp/codex-jmp-hook-edits/<turn_id>.edit`.
- `Stop` checks the flag via `turnEdited(turn_id)`:
  - `false` (turn_id present, no file edits) -> advisory -> no block.
  - `true` -> real task -> enforce status.
  - `null` (no turn_id, Codex anomaly) -> fall back to old block behavior.
- Flag cleared on successful Stop (status present); persists across a block-retry.

### Ceiling (ponytail)
Edits made via shell tools (`sed -i`, redirects through `Bash`) bypass the gate because the hook
keys off file-edit tool names, not shell side effects. Upgrade path: parse `transcript_path`
rollout JSONL for any mutating tool call. Accepted: rare, and AGENTS.md still nudges status.

### Evidence
- `npm run check`: 33 gate tests pass, 10/10 eval cases pass.
- E2E: advisory Stop with `turn_id` and no edits -> no block; `apply_patch` then Stop w/o status -> block.
- Codex core Stop payload fields (from binary strings): `session_id`, `transcript_path`, `cwd`,
  `hook_event_name`, `model`, `permission_mode`, `turn_id`, `agent_transcript_path`, `agent_type`,
  `last_assistant_message`. No `transcript` array is sent; `stopText`'s `transcript` branch is dead
  for real Codex (kept as a defensive fallback).
