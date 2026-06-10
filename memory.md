# Memory - Stop Hook Output Contract Fix

Last updated: 2026-06-11 02:34:00 EAT

## What was built

- Updated `src/hook-utils.mjs` so allowed `Stop` responses return `null`, making the CLI emit no stdout instead of invalid `{"decision":"approve"}`.
- Updated `src/hook-utils.mjs` so `Stop` reads Codex's real `last_assistant_message` field before falling back to transcript-based compatibility input.
- Updated `bin/codex-jmp-hook.mjs` so malformed stdin exits cleanly with no stdout. This avoids emitting invalid Stop JSON when the event cannot be identified.
- Added regression coverage in `test/cli.test.mjs`, `test/hook-utils.test.mjs`, and `evals/workflow-eval.mjs` for silent allowed Stop output, malformed stdin silence, and valid `decision:block` output from `last_assistant_message`.

## Decisions made

- Stop hook allow/no-op path must be silent. Codex's Stop output schema accepts `decision:"block"`, `continue:false`, and universal fields like `systemMessage`; it does not accept `decision:"approve"`.
- Malformed input should fail open silently because the hook cannot know which event schema applies.
- Completion-status enforcement remains on Stop, but now uses `last_assistant_message`, matching Codex Rust hook input schema.

## Problems solved

- Codex Desktop showed `hook returned invalid stop hook JSON output` because the hook emitted `{"decision":"approve"}` for allowed Stop runs.
- The Stop completion-status gate could miss real Codex Desktop Stop payloads because the code did not read `last_assistant_message`.

## Current state

- Verification passed:
  - `npm run check`: 33 tests passed, eval 8/8, score `1`.
  - `npm pack --dry-run`: 5 runtime files only: `README.md`, `bin/codex-jmp-hook.mjs`, `package.json`, `scripts/install-user-hook.mjs`, `src/hook-utils.mjs`.
- Direct CLI checks passed:
  - Allowed Stop with `last_assistant_message: "DONE\nTests: npm test"` emits 0 bytes.
  - Missing-status Stop with `last_assistant_message: "Tests pass."` emits valid `{"decision":"block","reason":"Missing completion status..."}`.
  - Malformed stdin emits 0 bytes.

## Next session starts with

- Run `/remember restore`.
- Restart Codex Desktop or start a fresh thread so hook rows are re-read, then confirm the Stop row no longer shows `hook returned invalid stop hook JSON output`.

## Open questions

- Whether stale `[hooks.state]` entries in `/home/christadrian/.codex/config.toml` for deleted hook files should be pruned by a future installer cleanup pass.
