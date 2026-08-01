# Memory - AGENTS + hooks system alignment

Last updated: 2026-08-01 EAT

## What was built

- Tightened skill routing to high-precision matches only.
- Stop status gate remains for edited turns; advisory turns stay free.
- Shell mutation detection marks sed/redirect/git-write turns as edited.
- UI imprint nudge only for substantial visual/UI contract work.
- Installer strips legacy unscoped jmp hooks and wraps managed BEGIN/END markers.
- Aligned with new `~/.codex/AGENTS.md` hooks contract and risk-based verification.

## Decisions made

- Hooks enforce ceremony gates, not test volume.
- Broad words like add/create/fix/button no longer auto-route skills.
- Ponytail remains shape; AGENTS remains policy; hooks remain gates.

## Current state

- Source of truth: `/home/christarian/Projects/codex-hooks`
- User install target: `~/.codex/config.toml` managed block

## Next session starts with

- Restart Codex Desktop / fresh thread so SessionStart text reloads.
- Approve hooks if trust hashes change.
