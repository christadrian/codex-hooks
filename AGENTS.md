# Codex JavaScript Mastery Hooks

## Stack

- **Language / Runtime**: JavaScript ES modules, Node.js 20+
- **Framework**: None
- **Key dependencies**: Node built ins only, Codex lifecycle hook contract
- **Package manager**: npm

## Build approach

<TBD, set by /scope>

## Commands

```bash
# Install
npm install

# Tests
npm test

# Workflow evaluation
npm run eval

# Full check
npm run check
```

There is no separate development server or build step. Runtime files run directly under Node.

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title.md`.

## Rules

- Use ESM and Node built ins. Keep runtime dependencies at zero unless a dependency solves a real need.
- Keep hook output machine parseable. Emit valid JSON on stdout and keep diagnostics out of the hook response.
- Keep lifecycle behavior deterministic. Route only high precision prompts and mark edits conservatively.
- Preserve unrelated Codex configuration and trust state in the installer. Use atomic config writes.
- Redact sensitive debug payload fields and keep debug logs private.
- Keep runtime utilities in `src/`, CLI entry points in `bin/`, the user installer in `scripts/`, and lifecycle configuration in `hooks/`.
- Use the built in `node:test` suite for deterministic behavior checks. Run `npm run eval` when workflow routing changes.
- Do not add UI chrome tests or ordinary non LLM evals as process ceremony.
- Keep plugin runtime paths relative to `${PLUGIN_ROOT}`. The user installer remains a separate legacy install path.

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
