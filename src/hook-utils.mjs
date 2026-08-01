import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const COMPLETION_STATUSES = ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT'];
const COMPLETION_STATUS_RE = /(^|\n)(DONE|DONE_WITH_CONCERNS|BLOCKED|NEEDS_CONTEXT)(?::[^\n]*)?\s*$/;

// Direct file-edit tools always count. Shell tools count only when the command
// looks like a real filesystem mutation.
const FILE_EDIT_TOOLS = new Set(['apply_patch', 'edit', 'write']);
const SHELL_TOOLS = new Set(['bash', 'exec_command', 'shell', 'run_terminal_cmd']);

// Shell mutation signals. Keep this conservative: package installs and plain
// builds should not force a completion status.
const SHELL_MUTATION_RE = new RegExp(
  [
    // common mutating commands
    String.raw`(?:^|[\s;|&\`(])(?:sudo\s+)?(?:sed\s+-[^\s]*i|perl\s+-i|ruby\s+-i|\btee\b|\binstall\b|\bmv\b|\bcp\b|\brm\b|\bmkdir\b|\btouch\b|\bchmod\b|\bchown\b|\bln\b|\btruncate\b|\bdd\b|git\s+(?:add|commit|mv|rm|checkout|restore|reset|stash|rebase|merge|cherry-pick|am|apply|revert)\b)`,
    // shell redirects
    String.raw`(?:^|[\s;|&])(?:cat|printf|echo|tee)\b[\s\S]{0,200}?(?:>|>>)`,
    // package publish/version bumps
    String.raw`(?:^|[\s;|&])(?:npm|pnpm|yarn|bun)\b[^\n]*\b(?:version|publish)\b`,
  ].join('|'),
  'i',
);

const UI_FILE_PATTERN =
  /(?:^|[\s"'`:/\\])(?:app|pages|components|src\/components|src\/app|ui)\/[^\s"'`]+\.(?:tsx|jsx|css|scss|vue|svelte)|\b[A-Z][A-Za-z0-9_-]*\.(?:tsx|jsx)\b/;

// High-precision skill routing only. Broad words like add/create/button/fix
// alone must not fire workflows.
const SKILL_RULES = [
  {
    skill: 'recover',
    pattern:
      /(?:(?:^|[\s`])\/recover\b|\bkeeps?\s+failing\b|\bfailing\s+after\b|\bstill\s+(?:broken|failing)\b|\bregression\b|\btroubleshoot(?:ing)?\b|\broot\s+cause\b|\bdebug(?:ging)?\s+this\s+(?:failing|broken|error|issue|bug)\b)/i,
  },
  {
    skill: 'remember',
    pattern: /(?:(?:^|[\s`])\/remember\b|\bmemory\.md\b|\bsession\s+handoff\b|\bhandoff\b)/i,
  },
  {
    skill: 'review',
    pattern:
      /(?:(?:^|[\s`])\/review\b|\bcode\s+review\b|\bready\s+to\s+ship\b|\bproduction\s+ready\b|\bpre-?(?:ship|release)\b|\bship\s+check\b)/i,
  },
  {
    skill: 'architect',
    pattern:
      /(?:(?:^|[\s`])\/architect\b|\bgreenfield\b|\bsystem\s+design\b|\barchitecture\b|\bscaffold(?:ing)?\s+(?:a|the|new)\b|\bnew\s+(?:service|app|project|platform)\b)/i,
  },
  {
    skill: 'imprint',
    pattern:
      /(?:(?:^|[\s`])\/imprint\b|\bdesign\s+system\b|\bvisual\s+polish\b|\bui\s+polish\b|\bcomponent\s+library\b|\bmatch\s+(?:the\s+)?(?:design|figma)\b)/i,
  },
];

const STOP_BLOCK_REASON = [
  'Missing completion status on an edited turn.',
  'Final non-empty line must start with DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT.',
  'Preferred shape: Evidence / Verification / Restart / Next, then the status line.',
  'Advisory read-only turns do not need a status. Do not add UI chrome tests to satisfy gates.',
].join(' ');

function editsDir() {
  return path.join(os.tmpdir(), 'codex-jmp-hook-edits');
}

function flagPath(turnId) {
  return path.join(editsDir(), `${turnId}.edit`);
}

export function isFileEditTool(name = '') {
  return FILE_EDIT_TOOLS.has(String(name).toLowerCase());
}

export function isShellTool(name = '') {
  return SHELL_TOOLS.has(String(name).toLowerCase());
}

export function extractShellCommand(payload = {}) {
  const input = payload.tool_input ?? payload.input ?? payload;
  if (typeof input === 'string') return input;

  const candidates = [input?.command, input?.cmd, input?.script, payload?.command, payload?.cmd];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value;
  }

  return '';
}

export function shellLooksLikeMutation(command = '') {
  const text = String(command || '');
  if (!text.trim()) return false;
  return SHELL_MUTATION_RE.test(text);
}

export function shouldMarkTurnEdited(payload = {}) {
  const toolName = payload.tool_name ?? payload.toolName ?? '';
  if (isFileEditTool(toolName)) return true;
  if (isShellTool(toolName) && shellLooksLikeMutation(extractShellCommand(payload))) return true;
  return false;
}

export function markTurnEdited(turnId) {
  if (!turnId) return;
  fs.mkdirSync(editsDir(), { recursive: true });
  fs.writeFileSync(flagPath(turnId), '');
}

// Returns true/false when turnId is present; null when unknown (no turnId) so callers can fall back.
export function turnEdited(turnId) {
  if (!turnId) return null;
  return fs.existsSync(flagPath(turnId));
}

export function clearTurnEdited(turnId) {
  if (!turnId) return;
  try {
    fs.unlinkSync(flagPath(turnId));
  } catch {
    /* already gone */
  }
}

export function detectLikelySkills(prompt = '') {
  const matches = [];

  for (const rule of SKILL_RULES) {
    if (rule.pattern.test(prompt) && !matches.includes(rule.skill)) {
      matches.push(rule.skill);
    }
  }

  // Recover dominates when the user is in a failure loop.
  if (matches.includes('recover')) {
    return ['recover'];
  }

  const ordered = ['architect', 'imprint', 'review', 'remember'];
  return ordered.filter((skill) => matches.includes(skill));
}

export function detectUiTouched(payload = {}) {
  const toolName = String(payload.tool_name ?? '');
  const raw = JSON.stringify(payload.tool_input ?? payload);
  const looksLikeEdit = /apply_patch|Edit|Write/i.test(toolName) || /apply_patch|Edit|Write/i.test(raw);
  return looksLikeEdit && UI_FILE_PATTERN.test(raw);
}

export function detectVisualContractWork(payload = {}) {
  const prompt = String(payload.prompt ?? payload.user_prompt ?? '');
  if (/\b(?:\/imprint\b|design\s+system\b|visual\s+polish\b|ui\s+polish\b|match\s+(?:the\s+)?(?:design|figma)\b|component\s+library\b)\b/i.test(prompt)) {
    return true;
  }

  // Only nudge imprint for substantial UI surface creation, not tiny prop/class tweaks.
  const raw = JSON.stringify(payload.tool_input ?? payload);
  if (!UI_FILE_PATTERN.test(raw)) return false;
  if (/\b(?:Add File|new file|create component|export function|export default function)\b/i.test(raw)) return true;
  return false;
}

export function hasCompletionStatus(text = '') {
  return COMPLETION_STATUS_RE.test(text);
}

export function mentionsUiChromeTests(text = '') {
  return /\b(?:test|spec|eval)s?\b[\s\S]{0,80}\b(?:button|icon|spacing|css|label|chrome|pixel|visual)\b|\b(?:button|icon|spacing|css|label|chrome|pixel|visual)\b[\s\S]{0,80}\b(?:test|spec|eval)s?\b/i.test(
    String(text || ''),
  );
}

function stopText(payload = {}) {
  if (Object.hasOwn(payload, 'final_response')) {
    return String(payload.final_response ?? '');
  }

  if (Object.hasOwn(payload, 'last_assistant_message')) {
    return String(payload.last_assistant_message ?? '');
  }

  return null;
}

function skillContext(skills) {
  if (skills.length === 0) return '';

  const lines = skills.map((skill) => `Use \`${skill}\` only if it still fits after reading the request boundary.`);
  return [
    'High-precision skill routing (optional, not mandatory process):',
    ...lines,
    'Do not expand scope or add UI chrome tests because a skill was mentioned.',
  ].join('\n');
}

function additionalContextOutput(hookEventName, additionalContext) {
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext,
    },
  };
}

function sessionStartContext(cwd = process.cwd()) {
  const memoryPath = path.join(cwd, 'memory.md');
  const memoryLine = fs.existsSync(memoryPath)
    ? 'Project has `memory.md`. Run `/remember restore` only when you explicitly need the previous session handoff.'
    : 'No project `memory.md` found. At session end, run `/remember save` when useful.';

  return [
    'Operating split:',
    '- Policy: AGENTS.md',
    '- Shape: Ponytail (smallest design that still satisfies gates)',
    '- Gates: completion status on edited turns only',
    '- Skills: high-precision matches only; never required for ordinary fixes',
    memoryLine,
    'Available playbooks when precisely matched: `/architect`, `/review`, `/recover`, `/imprint`, `/remember`.',
    'Edited-turn final line must be one of: DONE, DONE_WITH_CONCERNS, BLOCKED, NEEDS_CONTEXT.',
    'Do not add button/UI chrome tests or non-LLM evals to satisfy process.',
  ].join('\n');
}

export function buildHookResponse(payload = {}) {
  const eventName = payload.hook_event_name ?? payload.event ?? '';

  if (eventName === 'SessionStart') {
    return additionalContextOutput('SessionStart', sessionStartContext(payload.cwd));
  }

  if (eventName === 'UserPromptSubmit') {
    const context = skillContext(detectLikelySkills(payload.prompt ?? ''));
    return context ? additionalContextOutput('UserPromptSubmit', context) : null;
  }

  if (eventName === 'PostToolUse') {
    if (shouldMarkTurnEdited(payload)) {
      markTurnEdited(payload.turn_id);
    }

    if (detectUiTouched(payload) && detectVisualContractWork(payload)) {
      return additionalContextOutput(
        'PostToolUse',
        'Visual/UI contract surface changed. Use `/imprint` only if design-system consistency matters for this change. Do not add button/chrome tests.',
      );
    }

    const exitCode = Number(payload.tool_response?.exit_code ?? payload.tool_response?.exitCode ?? 0);

    if (Number.isFinite(exitCode) && exitCode !== 0) {
      return additionalContextOutput(
        'PostToolUse',
        'Tool failed. If this is a repeated or unclear failure loop, use `/recover` before more patches. Ordinary first failures: fix the root cause directly.',
      );
    }

    return null;
  }

  if (eventName === 'Stop') {
    const finalText = stopText(payload);
    if (finalText === null) {
      return null;
    }

    const turnId = payload.turn_id;
    const edited = turnEdited(turnId);

    if (hasCompletionStatus(finalText)) {
      clearTurnEdited(turnId);

      // Soft guidance only: never block for over-testing, just remind on edited turns.
      if (edited === true && mentionsUiChromeTests(finalText)) {
        return additionalContextOutput(
          'Stop',
          'Note: UI chrome tests/evals are discouraged by AGENTS.md. Prefer behavior/invariant checks only.',
        );
      }

      return null;
    }

    // Advisory turn (read-only / Q&A, no file edits recorded): do not force a status.
    if (edited === false) {
      return null;
    }

    // Real task (file edits this turn) or unknown (no turnId): enforce status.
    return {
      decision: 'block',
      reason: STOP_BLOCK_REASON,
    };
  }

  return null;
}

export function createUserHookToml(repoPath) {
  const command = `node ${JSON.stringify(path.join(repoPath, 'bin/codex-jmp-hook.mjs'))}`;

  return [
    '[[hooks.SessionStart]]',
    '[[hooks.SessionStart.hooks]]',
    'type = "command"',
    `command = ${JSON.stringify(command)}`,
    '',
    '[[hooks.UserPromptSubmit]]',
    '[[hooks.UserPromptSubmit.hooks]]',
    'type = "command"',
    `command = ${JSON.stringify(command)}`,
    '',
    '[[hooks.PostToolUse]]',
    'matcher = "apply_patch|Edit|Write|Bash|exec_command|Shell"',
    '[[hooks.PostToolUse.hooks]]',
    'type = "command"',
    `command = ${JSON.stringify(command)}`,
    '',
    '[[hooks.Stop]]',
    '[[hooks.Stop.hooks]]',
    'type = "command"',
    `command = ${JSON.stringify(command)}`,
    '',
  ].join('\n');
}

const MANAGED_TOML_START = '# BEGIN codex-javascript-mastery-hooks';
const MANAGED_TOML_END = '# END codex-javascript-mastery-hooks';
const MANAGED_TOML_PATTERN = new RegExp(
  `\\n?${MANAGED_TOML_START}\\n[\\s\\S]*?\\n${MANAGED_TOML_END}\\n?`,
  'g',
);

// Legacy unscoped install: remove only this package's command entries so we can
// re-wrap them with managed markers without touching wakatime/reaper hooks.
const LEGACY_HOOK_COMMAND_RE = /codex-jmp-hook\.mjs/;

export function stripLegacyJmpHooks(existingToml = '') {
  const lines = String(existingToml || '').split(/\r?\n/);
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Top-level event tables look like [[hooks.Stop]] (one dotted name).
    // Nested tables look like [[hooks.Stop.hooks]] and belong to the parent event.
    if (/^\[\[hooks\.[A-Za-z0-9_]+\]\]\s*$/.test(line)) {
      let j = i + 1;
      const block = [line];
      while (j < lines.length) {
        const next = lines[j];
        if (/^\[\[hooks\.[A-Za-z0-9_]+\]\]\s*$/.test(next) || /^\[[^\[]/.test(next)) {
          break;
        }
        block.push(next);
        j += 1;
      }

      const blockText = block.join('\n');
      if (LEGACY_HOOK_COMMAND_RE.test(blockText)) {
        i = j;
        continue;
      }

      out.push(...block);
      i = j;
      continue;
    }

    out.push(line);
    i += 1;
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

export function mergeHooksToml(existingToml = '', repoPath) {
  const managedBlock = [MANAGED_TOML_START, createUserHookToml(repoPath).trimEnd(), MANAGED_TOML_END].join('\n');
  const withoutManagedBlock = existingToml.replace(MANAGED_TOML_PATTERN, '\n');
  const withoutLegacy = stripLegacyJmpHooks(withoutManagedBlock).trimEnd();

  return `${withoutLegacy}${withoutLegacy ? '\n\n' : ''}${managedBlock}\n`;
}

export function writeFileAtomic(filePath, contents) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(dir, `.${base}.${process.pid}.${randomUUID()}.tmp`);

  try {
    fs.writeFileSync(tmpPath, contents);
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // Best-effort cleanup after failed config writes.
    }

    throw error;
  }
}

export function removeCommandFromHooksConfig(existing = {}, command) {
  const next = { ...existing, hooks: {} };

  for (const [eventName, entries] of Object.entries(existing.hooks ?? {})) {
    const keptEntries = entries
      .map((entry) => {
        const hadCommand = (entry.hooks ?? []).some((hook) => hook.command === command);

        return {
          entry: {
            ...entry,
            hooks: (entry.hooks ?? []).filter((hook) => hook.command !== command),
          },
          hadCommand,
        };
      })
      .filter(({ entry, hadCommand }) => entry.hooks.length > 0 || !hadCommand)
      .map(({ entry }) => entry);

    if (keptEntries.length > 0) {
      next.hooks[eventName] = keptEntries;
    }
  }

  for (const [key, value] of Object.entries(existing)) {
    if (key !== 'hooks') next[key] = value;
  }

  return next;
}

export function hasAnyHooks(config = {}) {
  return Object.values(config.hooks ?? {}).some((entries) => entries.length > 0);
}

export function createUserHookCommand(repoPath) {
  return `node ${JSON.stringify(path.join(repoPath, 'bin/codex-jmp-hook.mjs'))}`;
}

export { COMPLETION_STATUSES, STOP_BLOCK_REASON };
