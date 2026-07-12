import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  clearTurnEdited,
  isFileEditTool,
  markTurnEdited,
  turnEdited,
  buildHookResponse,
  createUserHookCommand,
  createUserHookToml,
  detectLikelySkills,
  detectUiTouched,
  hasAnyHooks,
  hasCompletionStatus,
  mergeHooksToml,
  removeCommandFromHooksConfig,
} from '../src/hook-utils.mjs';

describe('detectLikelySkills', () => {
  it('routes build prompts to architect', () => {
    assert.deepEqual(detectLikelySkills('Build a reusable settings panel'), ['architect']);
  });

  it('routes broken prompts to recover', () => {
    assert.deepEqual(detectLikelySkills('This build keeps failing after three fixes'), ['recover']);
  });

  it('routes UI prompts to imprint after architect', () => {
    assert.deepEqual(detectLikelySkills('Create a dashboard card component'), ['architect', 'imprint']);
  });
});

describe('detectUiTouched', () => {
  it('detects UI component files in apply_patch input', () => {
    const payload = {
      tool_name: 'apply_patch',
      tool_input: {
        patch: '*** Add File: components/Card.tsx\n+export function Card() { return <div /> }',
      },
    };

    assert.equal(detectUiTouched(payload), true);
  });

  it('ignores non-UI script edits', () => {
    const payload = {
      tool_name: 'apply_patch',
      tool_input: {
        patch: '*** Add File: scripts/install.mjs\n+console.log("ok")',
      },
    };

    assert.equal(detectUiTouched(payload), false);
  });
});

describe('hasCompletionStatus', () => {
  it('accepts AGENTS completion statuses', () => {
    assert.equal(hasCompletionStatus('Tests: npm test\nDONE'), true);
    assert.equal(hasCompletionStatus('Tests blocked\nDONE_WITH_CONCERNS'), true);
    assert.equal(hasCompletionStatus('Need credentials\nBLOCKED'), true);
    assert.equal(hasCompletionStatus('Need repo\nNEEDS_CONTEXT'), true);
  });

  it('rejects missing completion status', () => {
    assert.equal(hasCompletionStatus('Implemented hook package. Tests pass.'), false);
  });

  it('requires the completion status at the end', () => {
    assert.equal(hasCompletionStatus('DONE\nTests: npm test'), false);
    assert.equal(hasCompletionStatus('Tests: npm test\nDONE'), true);
    assert.equal(hasCompletionStatus('Tests: npm test\nDONE: ready to merge'), true);
  });
});

describe('buildHookResponse', () => {
  it('wraps UserPromptSubmit context in hookSpecificOutput', () => {
    const response = buildHookResponse({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Build a profile card component',
    });

    assert.equal(response.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(response.hookSpecificOutput.additionalContext, /Use `architect`/);
    assert.match(response.hookSpecificOutput.additionalContext, /Use `imprint`/);
  });

  it('wraps SessionStart context in hookSpecificOutput', () => {
    const response = buildHookResponse({ hook_event_name: 'SessionStart', cwd: process.cwd() });

    assert.equal(response.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(response.hookSpecificOutput.additionalContext, /workflow installed/);
  });

  it('returns null for no-op UserPromptSubmit output so CLI can stay silent', () => {
    assert.equal(buildHookResponse({ hook_event_name: 'UserPromptSubmit', prompt: 'hello' }), null);
  });

  it('blocks Stop when Codex last_assistant_message is missing final status', () => {
    const response = buildHookResponse({
      hook_event_name: 'Stop',
      last_assistant_message: 'Tests pass.',
    });

    assert.equal(response.decision, 'block');
    assert.match(response.reason, /completion status/i);
  });

  it('returns null for allowed Stop when Codex does not provide final response text', () => {
    const response = buildHookResponse({ hook_event_name: 'Stop' });

    assert.equal(response, null);
  });

  it('returns null for allowed Stop when Codex last_assistant_message has final status', () => {
    const response = buildHookResponse({
      hook_event_name: 'Stop',
      last_assistant_message: 'Tests: npm test\nDONE',
    });

    assert.equal(response, null);
  });

  it('warns on failed tool responses that use camelCase exitCode', () => {
    const response = buildHookResponse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_response: { exitCode: 1 },
    });

    assert.equal(response.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(response.hookSpecificOutput.additionalContext, /use `\/recover`/i);
  });

  it('does not warn when a tool reports string exit code zero', () => {
    assert.equal(buildHookResponse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_response: { exitCode: '0' },
    }), null);
  });
});

describe('expanded skill routing', () => {
  it('routes troubleshooting prompts to recover', () => {
    assert.deepEqual(detectLikelySkills('Debug this failing checkout flow'), ['recover']);
    assert.deepEqual(detectLikelySkills('Troubleshoot the broken hook'), ['recover']);
  });

  it('routes refactor prompts to architect', () => {
    assert.deepEqual(detectLikelySkills('Refactor the hook installer'), ['architect']);
  });

  it('routes ship and release prompts to review', () => {
    assert.deepEqual(detectLikelySkills('Ship this package'), ['review']);
    assert.deepEqual(detectLikelySkills('Release the hook update'), ['review']);
  });
});

describe('mergeHooksToml', () => {
  it('adds a managed config.toml hook block', () => {
    const next = mergeHooksToml('model = "gpt-5"\n', '/repo');

    assert.match(next, /# BEGIN codex-javascript-mastery-hooks/);
    assert.match(next, /\[\[hooks\.SessionStart\]\]/);
    assert.match(next, /command = "node \\\"\/repo\/bin\/codex-jmp-hook\.mjs\\\""/);
    assert.match(next, /# END codex-javascript-mastery-hooks/);
  });

  it('replaces an existing managed block instead of duplicating hooks', () => {
    const once = mergeHooksToml('', '/old-repo');
    const twice = mergeHooksToml(once, '/new-repo');

    assert.equal((twice.match(/BEGIN codex-javascript-mastery-hooks/g) ?? []).length, 1);
    assert.match(twice, /new-repo/);
    assert.doesNotMatch(twice, /old-repo/);
  });
});

describe('writeFileAtomic', () => {
  it('writes target contents through a same-directory temporary file', async () => {
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { writeFileAtomic } = await import('../src/hook-utils.mjs');

    const dir = mkdtempSync(join(tmpdir(), 'codex-hooks-atomic-'));
    const target = join(dir, 'config.toml');

    try {
      writeFileAtomic(target, 'model = "gpt-5"\n');

      assert.equal(readFileSync(target, 'utf8'), 'model = "gpt-5"\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('createUserHookToml', () => {
  it('renders the four Codex hook events supported by this package', () => {
    const toml = createUserHookToml('/repo');

    assert.match(toml, /\[\[hooks\.SessionStart\]\]/);
    assert.match(toml, /\[\[hooks\.UserPromptSubmit\]\]/);
    assert.match(toml, /\[\[hooks\.PostToolUse\]\]/);
    assert.match(toml, /\[\[hooks\.Stop\]\]/);
  });
});

describe('removeCommandFromHooksConfig', () => {
  it('removes only migrated package hooks from legacy hooks.json', () => {
    const command = createUserHookCommand('/repo');
    const existing = {
      hooks: {
        Stop: [
          { hooks: [{ type: 'command', command }] },
          { hooks: [{ type: 'command', command: 'echo keep' }] },
        ],
        SessionStart: [{ hooks: [{ type: 'command', command }] }],
      },
    };

    const next = removeCommandFromHooksConfig(existing, command);

    assert.deepEqual(next.hooks.Stop, [{ hooks: [{ type: 'command', command: 'echo keep' }] }]);
    assert.equal(next.hooks.SessionStart, undefined);
    assert.equal(hasAnyHooks(next), true);
  });

  it('reports empty when all legacy hooks belonged to this package', () => {
    const command = createUserHookCommand('/repo');
    const next = removeCommandFromHooksConfig({ hooks: { Stop: [{ hooks: [{ command }] }] } }, command);

    assert.equal(hasAnyHooks(next), false);
  });
});

describe('Stop completion-status gating by file edits', () => {
  const tmpTurn = 'test-turn-gating';

  afterEach(() => clearTurnEdited(tmpTurn));

  it('isFileEditTool matches apply_patch/Edit/Write only', () => {
    assert.equal(isFileEditTool('apply_patch'), true);
    assert.equal(isFileEditTool('Edit'), true);
    assert.equal(isFileEditTool('WRITE'), true);
    assert.equal(isFileEditTool('Bash'), false);
    assert.equal(isFileEditTool('exec_command'), false);
  });

  it('markTurnEdited/turnEdited/clearTurnEdited round-trip', () => {
    assert.equal(turnEdited(tmpTurn), false);
    markTurnEdited(tmpTurn);
    assert.equal(turnEdited(tmpTurn), true);
    clearTurnEdited(tmpTurn);
    assert.equal(turnEdited(tmpTurn), false);
  });

  it('turnEdited returns null when turnId is absent', () => {
    assert.equal(turnEdited(undefined), null);
    assert.equal(turnEdited(''), null);
  });

  it('skips block for advisory Stop (turn_id present, no file edits)', () => {
    const response = buildHookResponse({
      hook_event_name: 'Stop',
      turn_id: 'advisory-turn',
      last_assistant_message: 'Run pipx install to fix it.',
    });
    assert.equal(response, null);
  });

  it('blocks Stop after file edits when status is missing', () => {
    const turn = 'task-turn-missing-status';
    markTurnEdited(turn);
    try {
      const response = buildHookResponse({
        hook_event_name: 'Stop',
        turn_id: turn,
        last_assistant_message: 'Fixed the bug in auth.py.',
      });
      assert.equal(response.decision, 'block');
      assert.match(response.reason, /Missing completion status/);
    } finally {
      clearTurnEdited(turn);
    }
  });

  it('allows Stop after file edits when status is present and clears flag', () => {
    const turn = 'task-turn-with-status';
    markTurnEdited(turn);
    try {
      const response = buildHookResponse({
        hook_event_name: 'Stop',
        turn_id: turn,
        last_assistant_message: 'Tests: npm test\nDONE',
      });
      assert.equal(response, null);
      assert.equal(turnEdited(turn), false, 'flag should be cleared after success');
    } finally {
      clearTurnEdited(turn);
    }
  });

  it('keeps flag across a block-retry so enforcement persists', () => {
    const turn = 'task-turn-retry';
    markTurnEdited(turn);
    try {
      const first = buildHookResponse({
        hook_event_name: 'Stop',
        turn_id: turn,
        last_assistant_message: 'Fixed it.',
      });
      assert.equal(first.decision, 'block');
      assert.equal(turnEdited(turn), true, 'flag must persist after a block');
      const second = buildHookResponse({
        hook_event_name: 'Stop',
        turn_id: turn,
        last_assistant_message: 'Tests: npm test\nDONE',
      });
      assert.equal(second, null);
      assert.equal(turnEdited(turn), false);
    } finally {
      clearTurnEdited(turn);
    }
  });

  it('falls back to block when turnId is unknown and status is missing', () => {
    const response = buildHookResponse({
      hook_event_name: 'Stop',
      last_assistant_message: 'Tests pass.',
    });
    assert.equal(response.decision, 'block');
  });
});

describe('PostToolUse records file edits by turn_id', () => {
  const turn = 'ptu-turn';
  afterEach(() => clearTurnEdited(turn));

  it('marks the turn edited for apply_patch', () => {
    assert.equal(turnEdited(turn), false);
    const response = buildHookResponse({
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      turn_id: turn,
      tool_input: { patch: '*** Add File: scripts/run.mjs\n+console.log(1)' },
    });
    assert.equal(turnEdited(turn), true);
    assert.equal(response, null, 'non-UI edit should still return null');
  });

  it('does not mark the turn for Bash/exec_command', () => {
    clearTurnEdited(turn);
    buildHookResponse({ hook_event_name: 'PostToolUse', tool_name: 'Bash', turn_id: turn, tool_response: { exit_code: 0 } });
    assert.equal(turnEdited(turn), false);
  });
});
