# Memory — Codex Hook Output Contract Fix

Last updated: 2026-06-11 02:11:22 EAT

## What was built

- Updated `src/hook-utils.mjs` so context-producing hooks emit Codex's current `hookSpecificOutput` shape with `hookEventName` and `additionalContext`.
- Updated `bin/codex-jmp-hook.mjs` so no-op hook responses emit no stdout instead of `{}`.
- Changed malformed stdin handling to return valid Stop-compatible JSON with `decision: "approve"` and `systemMessage`.
- Removed `.codex/hooks.json` from the repo so this package runs through one user-level hook source instead of both project and user hooks.
- Updated `README.md`, `package.json`, `test/cli.test.mjs`, `test/hook-utils.test.mjs`, `test/install-user-hook.test.mjs`, and `evals/workflow-eval.mjs` for the new hook contract and package contents.

## Decisions made

- User-level install in `~/.codex/config.toml` is the only supported install layer. Project-level `.codex/hooks.json` caused duplicate User/Project hook rows in Codex Desktop.
- Codex hook context must use `hookSpecificOutput`, matching local Codex Rust tests in `/home/christadrian/.cache/codex-desktop-linux/fuzzy-codex-cli/codex/codex-rs/core/tests/suite/hooks.rs`.
- Hooks with no action should stay silent. This avoids Codex Desktop rejecting empty JSON objects as invalid event output.
- Stop-hook malformed-input fallback should avoid `additionalContext`, which is not accepted by the Stop output schema.

## Problems solved

- Codex Desktop showed red `hook returned invalid session start JSON output`, `invalid user prompt submit JSON output`, and `invalid stop hook JSON output` rows because the hook emitted SDK-style top-level `additionalContext` instead of Codex's event-specific wrapper.
- Duplicate `User` and `Project` hook rows came from both `/home/christadrian/.codex/config.toml` and `/home/christadrian/Projects/codex-hooks/.codex/hooks.json` registering the same command.
- No-op `UserPromptSubmit` returned `{}` and could still appear as invalid output.

## Current state

- Verification before commit passed:
  - `npm run check`: 29 tests passed, eval 7/7, score `1`.
  - `npm pack --dry-run`: 5 runtime files only: `README.md`, `bin/codex-jmp-hook.mjs`, `package.json`, `scripts/install-user-hook.mjs`, `src/hook-utils.mjs`.
- Direct CLI checks passed:
  - `SessionStart` emits `hookSpecificOutput.hookEventName = "SessionStart"`.
  - No-op `UserPromptSubmit` emits no stdout.
  - Routed `UserPromptSubmit` emits `hookSpecificOutput.hookEventName = "UserPromptSubmit"`.
  - Valid `Stop` emits `{"decision":"approve"}`.
- Repo still needs commit and push after this memory update.

## Next session starts with

- Run `/remember restore`.
- Restart Codex Desktop after pulling this commit so hook config and removed project hook are reloaded.
- In a fresh thread, open the hooks popover and confirm red invalid JSON rows are gone and only user-level rows remain.

## Open questions

- Whether stale `[hooks.state]` entries in `/home/christadrian/.codex/config.toml` for deleted `/home/christadrian/.codex/hooks.json` and project `.codex/hooks.json` should be pruned by a future installer cleanup pass.
