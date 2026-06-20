# Codex JavaScript-Mastery-Pro Hooks

Codex lifecycle hooks for the installed `JavaScript-Mastery-Pro/skills` workflow:

- `/architect` before meaningful build work
- `/review` before shipping
- `/recover` when a session or fix loop goes wrong
- `/imprint` after UI component edits
- `/remember` for session restore/save hygiene

The hooks do not replace skills. They add deterministic reminders and gates so agents use the right workflow at the right time.

## What It Does

| Codex event | Behavior |
| --- | --- |
| `SessionStart` | Adds context about installed workflow skills and `memory.md` restore/save usage. |
| `UserPromptSubmit` | Routes prompts to likely JavaScript-Mastery-Pro skills. |
| `PostToolUse` | Detects UI file edits and asks for `/imprint`; warns after failed tool runs. |
| `Stop` | Blocks final responses that omit `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT` **only when the turn edited files** (`apply_patch`/`Edit`/`Write`). Advisory / read-only turns are not forced to emit a status. |

## User-Level Install

Install into `~/.codex/config.toml` after cloning this repo:

```bash
npm run install:user
```

The installer writes a managed hook block into `config.toml`. This package uses user-level hooks only so a project checkout does not run the same hook twice. If an older install put these same hooks in `~/.codex/hooks.json`, the installer migrates only this package's hooks out of that legacy file and preserves unrelated hooks.

## Test And Eval

```bash
npm run check
```

`npm test` is the deterministic gate suite. `npm run eval` scores workflow behavior against representative hook inputs.

## GitHub Publish

After adding a remote:

```bash
git remote add origin git@github.com:<owner>/<repo>.git
git push -u origin main
```

## Hook Input Contract

The CLI reads Codex hook JSON from stdin and writes JSON to stdout. Example:

```bash
printf '{"hook_event_name":"UserPromptSubmit","prompt":"Create a dashboard card component"}' | node bin/codex-jmp-hook.mjs
```
