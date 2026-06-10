# Memory - Codex Hooks Workflow Fix

Last updated: 2026-06-11 01:14:04 EAT

## What was built

- Updated `scripts/install-user-hook.mjs` so user-level installs write a managed JavaScript-Mastery-Pro hook block to `~/.codex/config.toml` instead of creating `~/.codex/hooks.json`.
- Added TOML install helpers and legacy JSON migration helpers in `src/hook-utils.mjs`.
- Added installer integration coverage in `test/install-user-hook.test.mjs` using temp HOME directories.
- Added regression coverage in `test/hook-utils.test.mjs` for empty `Stop` hook payloads.
- Updated `evals/workflow-eval.mjs` so evals cover empty `Stop` payload approval.
- Updated `README.md` to document `~/.codex/config.toml` as the user-level install target.
- Committed and pushed two fixes to `main`:
  - `3a5a326 Migrate user hooks install to config toml`
  - `1ce5d35 Avoid false Stop hook blocks`

## Decisions made

- `~/.codex/config.toml` is the single user-level representation for these hooks. `~/.codex/hooks.json` is treated as legacy and migrated away.
- The installer owns a clearly delimited managed TOML block between `# BEGIN codex-javascript-mastery-hooks` and `# END codex-javascript-mastery-hooks`, making repeated installs idempotent.
- Legacy JSON migration removes only this package's command entries and preserves unrelated user hooks.
- `Stop` hook should block only when Codex provides final text and that text lacks `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`. If Codex provides no `final_response` and no assistant `transcript`, the hook approves to avoid false blocks.

## Problems solved

- Codex app reported: `loading hooks from both /home/christadrian/.codex/hooks.json and /home/christadrian/.codex/config.toml; prefer a single representation for this layer`. Root cause was the old installer writing `~/.codex/hooks.json` while Codex also had hooks in `config.toml`.
- After the first fix, stale/current hook runs still showed `Missing completion status` from `Stop` hooks. Root cause was the hook treating absent final text as an empty final response and blocking. The hook now approves absent-text `Stop` payloads.
- Live workflow was tested after Christadrian installed and restarted Codex: `UserPromptSubmit`, `PostToolUse`, and `Stop` CLI payloads returned expected JSON responses.

## Current state

- Git worktree was clean before saving this memory.
- `~/.codex/hooks.json` is absent.
- `/home/christadrian/.codex/config.toml` contains one managed JavaScript-Mastery-Pro hook block pointing at `/home/christadrian/Projects/codex-hooks/bin/codex-jmp-hook.mjs` for `SessionStart`, `UserPromptSubmit`, `PostToolUse`, and `Stop`.
- `npm run check` passed with 19 tests and eval score `1`.
- Live CLI checks passed:
  - `UserPromptSubmit` routes UI build prompt to `architect` and `imprint`.
  - `PostToolUse` on UI patch returns `/imprint` reminder.
  - Empty `Stop` payload returns `{"decision":"approve"}`.
  - Status-bearing `Stop` payload returns `{"decision":"approve"}`.

## Next session starts with

- Run `/remember restore` first.
- If continuing this project, verify Codex no longer shows hook-source warnings in the UI after restart and confirm no stale `hook_run_id` paths from `~/.codex/hooks.json` appear in new conversations.
- If hook warnings still appear, inspect Codex app hook state entries in `~/.codex/config.toml` and app logs, but do not recreate `~/.codex/hooks.json`.

## Open questions

- Whether Codex desktop fully clears trusted hook source state after restart, or whether stale `hooks.state` entries for deleted hook files should also be pruned by the installer.
