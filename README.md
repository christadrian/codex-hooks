# Codex JavaScript-Mastery-Pro Hooks

Codex lifecycle hooks that enforce a few deterministic gates and issue rare high-precision skill nudges.

They do **not** replace `~/.codex/AGENTS.md`.

Split:

- **AGENTS.md** = policy
- **Ponytail** = implementation shape
- **these hooks** = hard gates + quiet nudges
- **skills** = deep playbooks only when precisely matched

## Behavior

| Codex event | Behavior |
| --- | --- |
| `SessionStart` | Injects the operating split, memory hygiene, and completion-status reminder. |
| `UserPromptSubmit` | Routes only high-precision prompts to `/architect`, `/review`, `/recover`, `/imprint`, `/remember`. Ordinary "add/create/fix/button" prompts stay silent. |
| `PostToolUse` | Marks real file mutations (direct edit tools + mutating shell commands). Nudges `/imprint` only for substantial visual/UI contract work. Warns after failed tools. |
| `Stop` | Blocks edited turns unless the final non-empty line starts with `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`. Advisory/read-only turns are not forced to emit a status. |

Hard rules these hooks will **not** impose:

- UI chrome tests
- evals for ordinary non-LLM work
- mandatory `/architect` or `/imprint` on every change

`/remember restore` is never automatic.

## User-level install

```bash
npm run install:user
```

Installs a managed block into `~/.codex/config.toml` between:

```toml
# BEGIN codex-javascript-mastery-hooks
...
# END codex-javascript-mastery-hooks
```

Re-running install replaces that block cleanly. Legacy unscoped `codex-jmp-hook.mjs` entries are stripped first so duplicates are not created. Unrelated hooks such as `codex-wakatime` are preserved.

## Test and eval

```bash
npm run check
```

`npm test` is the deterministic gate suite. `npm run eval` scores workflow behavior against representative hook inputs.

## Hook input contract

```bash
printf '{"hook_event_name":"UserPromptSubmit","prompt":"Greenfield system design for billing"}' | node bin/codex-jmp-hook.mjs
```
