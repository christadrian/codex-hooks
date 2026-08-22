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
| `UserPromptSubmit` | Routes high-precision prompts to the matching JS Mastery Pro phase: `/scope`, `/audit`, `/architect`, `/develop`, `/check verify`, `/test`, `/check review`, `/document`, `/sync`, or `/debug`. Legacy `/imprint` and `/remember` remain available. |
| `PostToolUse` | Marks real file mutations (direct edit tools + mutating shell commands). Nudges `/imprint` only for substantial visual/UI contract work. Warns after failed tools. |
| `Stop` | Blocks edited turns unless the final non-empty line starts with `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`. Advisory/read-only turns are not forced to emit a status. |
| `SessionEnd` | Removes temporary edit/retry state for the session. |

Stop state follows `transcript_path` across continuation turn IDs, with `turn_id` and `session_id` fallbacks. After three blocked retries, the hook allows Stop with a warning to prevent an infinite continuation loop.

Set `CODEX_HOOKS_DEBUG=1` to append redacted payloads to `${PLUGIN_DATA}/hooks-debug.jsonl` (or the system temp directory for legacy installs). The log is mode `0600` and rotates at 1 MiB.

Hard rules these hooks will **not** impose:

- UI chrome tests
- evals for ordinary non-LLM work
- the full workflow on every change
- a fixed verification tail that ignores the project's Prototype/Alpha/Beta/GA depth

`/remember restore` is never automatic.

The hooks follow the upstream workflow without owning its state or sequencing. `/scope` records the project's workflow depth, and that depth determines which stages follow `/develop`. The hooks only suggest a precisely matched entry point; they do not advance scope, specs, or statuses themselves.

## Plugin install

The repository is a Codex marketplace. The `codex-javascript-mastery-hooks` plugin lives in `plugins/codex-javascript-mastery-hooks/`; its lifecycle hooks live in `hooks/hooks.json` and resolve the runtime through `${PLUGIN_ROOT}`, so plugin installs do not modify `~/.codex/config.toml` or depend on the repository's absolute path.

```bash
codex plugin marketplace add christadrian/codex-hooks --ref main
codex plugin add codex-javascript-mastery-hooks@codex-hooks
```

Plugin hooks still require review through `/hooks` before Codex runs them.

## Legacy user-level install

```bash
npm run install:user
```

Installs a managed block into `~/.codex/config.toml` between:

```toml
# BEGIN codex-javascript-mastery-hooks
...
# END codex-javascript-mastery-hooks
```

Re-running install replaces that block cleanly. Codex-generated `[hooks.state]` trust entries are moved outside the managed markers and preserved. Legacy unscoped `codex-jmp-hook.mjs` entries are stripped first so duplicates are not created. Unrelated hooks such as `codex-wakatime` are preserved.

## Test and eval

```bash
npm run check
```

`npm test` is the deterministic gate suite. `npm run eval` scores workflow behavior against representative hook inputs.

## Hook input contract

```bash
printf '{"hook_event_name":"UserPromptSubmit","prompt":"Greenfield system design for billing"}' | node plugins/codex-javascript-mastery-hooks/bin/codex-jmp-hook.mjs
```
