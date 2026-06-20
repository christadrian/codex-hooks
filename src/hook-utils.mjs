import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const COMPLETION_STATUSES = ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT'];

// ponytail: per-turn file-edit flag in /tmp. Gates the Stop completion-status block so advisory
// (read-only / Q&A) turns are not forced to emit a status. Ceiling: edits made via shell tools
// (sed -i, redirects) bypass this gate; upgrade by inspecting transcript_path rollout JSONL.
const FILE_EDIT_TOOLS = new Set(['apply_patch', 'edit', 'write']);

function editsDir() {
  return path.join(os.tmpdir(), 'codex-jmp-hook-edits');
}

function flagPath(turnId) {
  return path.join(editsDir(), `${turnId}.edit`);
}

export function isFileEditTool(name = '') {
  return FILE_EDIT_TOOLS.has(String(name).toLowerCase());
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
  try { fs.unlinkSync(flagPath(turnId)); } catch { /* already gone */ }
}

const SKILL_RULES = [
  {
    skill: 'recover',
    pattern: /\b(broken|bug|crash|debug|error|failing|failed|failure|fix|keeps failing|regression|troubleshoot)\b/i,
  },
  {
    skill: 'remember',
    pattern: /\b(remember|restore|resume|handoff|session|context)\b/i,
  },
  {
    skill: 'review',
    pattern: /\b(review|audit|ready to ship|done|verify|production ready|ship|release)\b/i,
  },
  {
    skill: 'architect',
    pattern: /\b(build|create|implement|add|design|scaffold|feature|project|refactor)\b/i,
  },
  {
    skill: 'imprint',
    pattern: /\b(ui|component|card|button|modal|dialog|form|dashboard|page|layout|screen|frontend|visual)\b/i,
  },
];

const UI_FILE_PATTERN = /(?:^|[\s"'`:/])(?:app|pages|components|src\/components|src\/app|ui)\/[^\s"'`]+\.(?:tsx|jsx|css|scss|vue|svelte)|\b[A-Z][A-Za-z0-9_-]*\.(?:tsx|jsx)\b/;

export function detectLikelySkills(prompt = '') {
  const matches = [];

  for (const rule of SKILL_RULES) {
    if (rule.pattern.test(prompt) && !matches.includes(rule.skill)) {
      matches.push(rule.skill);
    }
  }

  if (matches.includes('recover')) {
    return ['recover'];
  }

  const ordered = ['architect', 'imprint', 'review', 'remember'];
  return ordered.filter((skill) => matches.includes(skill));
}

export function detectUiTouched(payload = {}) {
  const raw = JSON.stringify(payload.tool_input ?? payload, null, 2);
  return /apply_patch|Edit|Write/i.test(payload.tool_name ?? raw) && UI_FILE_PATTERN.test(raw);
}

export function hasCompletionStatus(text = '') {
  return COMPLETION_STATUSES.some((status) => new RegExp(`(^|\\n)${status}(\\b|:)`).test(text));
}

function lastAssistantText(transcript = []) {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const entry = transcript[index];
    if (entry?.role === 'assistant') {
      return Array.isArray(entry.content)
        ? entry.content.map((part) => part.text ?? '').join('\n')
        : String(entry.content ?? '');
    }
  }

  return '';
}

function stopText(payload = {}) {
  if (Object.hasOwn(payload, 'final_response')) {
    return String(payload.final_response ?? '');
  }

  if (Object.hasOwn(payload, 'last_assistant_message')) {
    return String(payload.last_assistant_message ?? '');
  }

  if (Array.isArray(payload.transcript)) {
    return lastAssistantText(payload.transcript);
  }

  return null;
}

function skillContext(skills) {
  if (skills.length === 0) return '';

  const lines = skills.map((skill) => `Use \`${skill}\` if it applies before acting.`);
  return ['JavaScript-Mastery-Pro skill routing:', ...lines].join('\n');
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
    ? 'Project has `memory.md`. Run `/remember restore` before continuing work.'
    : 'No project `memory.md` found. At session end, run `/remember save` when useful.';

  return [
    'JavaScript-Mastery-Pro workflow installed: `/architect`, `/review`, `/recover`, `/imprint`, `/remember`.',
    memoryLine,
    'End task responses with one status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT.',
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
    if (isFileEditTool(payload.tool_name)) {
      markTurnEdited(payload.turn_id);
    }
    if (detectUiTouched(payload)) {
      return additionalContextOutput('PostToolUse', 'UI files changed. Run `/imprint` before marking work complete.');
    }

    const exitCode = payload.tool_response?.exit_code ?? payload.tool_response?.exitCode;

    if (exitCode && exitCode !== 0) {
      return additionalContextOutput(
        'PostToolUse',
        'Tool failed. If this is repeated or unclear, use `/recover` before patching further.',
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
      return null;
    }

    // Advisory turn (read-only / Q&A, no file edits recorded): do not force a status.
    if (edited === false) {
      return null;
    }

    // Real task (file edits this turn) or unknown (no turnId): enforce status.
    return {
      decision: 'block',
      reason: 'Missing completion status. End with DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT plus evidence.',
    };
  }

  return null;
}

export function createUserHookConfig(repoPath) {
  const command = `node ${JSON.stringify(path.join(repoPath, 'bin/codex-jmp-hook.mjs'))}`;

  return {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command }] }],
      UserPromptSubmit: [{ hooks: [{ type: 'command', command }] }],
      PostToolUse: [{ matcher: 'apply_patch|Edit|Write|Bash', hooks: [{ type: 'command', command }] }],
      Stop: [{ hooks: [{ type: 'command', command }] }],
    },
  };
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
    'matcher = "apply_patch|Edit|Write|Bash"',
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

export function mergeHooksToml(existingToml = '', repoPath) {
  const managedBlock = [MANAGED_TOML_START, createUserHookToml(repoPath).trimEnd(), MANAGED_TOML_END].join('\n');
  const withoutManagedBlock = existingToml.replace(MANAGED_TOML_PATTERN, '\n').trimEnd();

  return `${withoutManagedBlock}${withoutManagedBlock ? '\n\n' : ''}${managedBlock}\n`;
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

export function mergeHooksConfig(existing = {}, addition = {}) {
  const next = { ...existing, hooks: { ...(existing.hooks ?? {}) } };

  for (const [eventName, entries] of Object.entries(addition.hooks ?? {})) {
    next.hooks[eventName] = [...(next.hooks[eventName] ?? []), ...entries];
  }

  return next;
}

function hookEntryContainsCommand(entry = {}, command) {
  return (entry.hooks ?? []).some((hook) => hook.command === command);
}

export function removeCommandFromHooksConfig(existing = {}, command) {
  const next = { ...existing, hooks: {} };

  for (const [eventName, entries] of Object.entries(existing.hooks ?? {})) {
    const keptEntries = entries
      .map((entry) => {
        const hadCommand = hookEntryContainsCommand(entry, command);

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
