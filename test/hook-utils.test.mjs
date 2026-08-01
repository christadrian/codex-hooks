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
  detectVisualContractWork,
  hasAnyHooks,
  hasCompletionStatus,
  mergeHooksToml,
  mentionsUiChromeTests,
  removeCommandFromHooksConfig,
  shellLooksLikeMutation,
  shouldMarkTurnEdited,
  stripLegacyJmpHooks,
} from '../src/hook-utils.mjs';

describe('detectLikelySkills', () => {
  it('routes explicit architecture prompts to architect', () => {
    assert.deepEqual(detectLikelySkills('Need system design for a new billing service'), ['architect']);
    assert.deepEqual(detectLikelySkills('Greenfield architecture for checkout'), ['architect']);
  });

  it('does not route ordinary add/create prompts to architect', () => {
    assert.deepEqual(detectLikelySkills('Add a config flag for retries'), []);
    assert.deepEqual(detectLikelySkills('Create a script to rename files'), []);
    assert.deepEqual(detectLikelySkills('Build a reusable settings panel'), []);
  });

  it('routes repeated-failure prompts to recover', () => {
    assert.deepEqual(detectLikelySkills('This build keeps failing after three fixes'), ['recover']);
    assert.deepEqual(detectLikelySkills('Still broken after the last patch'), ['recover']);
  });

  it('does not route a plain fix prompt to recover', () => {
    assert.deepEqual(detectLikelySkills('Fix the off-by-one in parser.py'), []);
    assert.deepEqual(detectLikelySkills('Debug this later maybe'), []);
  });

  it('routes explicit visual-contract prompts to imprint only', () => {
    assert.deepEqual(detectLikelySkills('Polish the dashboard against the design system'), ['imprint']);
    assert.deepEqual(detectLikelySkills('Match the Figma card spacing'), ['imprint']);
  });

  it('does not route generic button/UI wording to imprint', () => {
    assert.deepEqual(detectLikelySkills('Fix the submit button loading state'), []);
    assert.deepEqual(detectLikelySkills('Create a dashboard card component'), []);
  });

  it('does not route generic context or session wording to remember', () => {
    assert.deepEqual(detectLikelySkills('Continue this session with the available context'), []);
  });

  it('routes explicit memory handoffs to remember', () => {
    assert.deepEqual(detectLikelySkills('Restore memory.md for this handoff'), ['remember']);
    assert.deepEqual(detectLikelySkills('Run /remember restore'), ['remember']);
  });

  it('routes explicit review language only', () => {
    assert.deepEqual(detectLikelySkills('Ready to ship after code review'), ['review']);
    assert.deepEqual(detectLikelySkills('Ship this package'), []);
    assert.deepEqual(detectLikelySkills('Release the hook update'), []);
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

describe('detectVisualContractWork', () => {
  it('requires design-system intent or substantial new UI surface', () => {
    assert.equal(
      detectVisualContractWork({
        tool_name: 'apply_patch',
        tool_input: { patch: '*** Add File: components/Card.tsx\n+export function Card() { return <div /> }' },
      }),
      true,
    );

    assert.equal(
      detectVisualContractWork({
        tool_name: 'apply_patch',
        tool_input: { patch: '*** Update File: components/Card.tsx\n-const x=1\n+const x=2' },
      }),
      false,
    );

    assert.equal(
      detectVisualContractWork({
        prompt: 'Match the Figma spacing on the card',
        tool_name: 'apply_patch',
        tool_input: { patch: '*** Update File: components/Card.tsx\n+gap-2' },
      }),
      true,
    );
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

describe('mentionsUiChromeTests', () => {
  it('detects discouraged UI chrome verification language', () => {
    assert.equal(mentionsUiChromeTests('Added button presence tests'), true);
    assert.equal(mentionsUiChromeTests('Verification: unit tests for parser'), false);
  });
});

describe('shell mutation detection', () => {
  it('marks shell file mutations and ignores plain reads/builds', () => {
    assert.equal(shellLooksLikeMutation('sed -i "s/a/b/" foo.txt'), true);
    assert.equal(shellLooksLikeMutation('cat foo > bar.txt'), true);
    assert.equal(shellLooksLikeMutation('git commit -m "x"'), true);
    assert.equal(shellLooksLikeMutation('npm test'), false);
    assert.equal(shellLooksLikeMutation('rg -n TODO src'), false);
  });

  it('shouldMarkTurnEdited accepts direct edits and mutating shells', () => {
    assert.equal(shouldMarkTurnEdited({ tool_name: 'apply_patch' }), true);
    assert.equal(shouldMarkTurnEdited({ tool_name: 'Bash', tool_input: { command: 'sed -i s/a/b/ file' } }), true);
    assert.equal(shouldMarkTurnEdited({ tool_name: 'Bash', tool_input: { command: 'npm test' } }), false);
    assert.equal(shouldMarkTurnEdited({ tool_name: 'exec_command', tool_input: { cmd: 'printf x > out.txt' } }), true);
  });
});

describe('buildHookResponse', () => {
  it('stays silent for ordinary feature prompts', () => {
    assert.equal(
      buildHookResponse({
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Create a settings card component',
      }),
      null,
    );
  });

  it('wraps high-precision UserPromptSubmit context in hookSpecificOutput', () => {
    const response = buildHookResponse({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Greenfield system design for a billing service',
    });

    assert.equal(response.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(response.hookSpecificOutput.additionalContext, /Use `architect`/);
    assert.doesNotMatch(response.hookSpecificOutput.additionalContext, /Use `imprint`/);
  });

  it('wraps SessionStart context in hookSpecificOutput with operating split', () => {
    const response = buildHookResponse({ hook_event_name: 'SessionStart', cwd: process.cwd() });

    assert.equal(response.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(response.hookSpecificOutput.additionalContext, /Policy: AGENTS\.md/);
    assert.match(response.hookSpecificOutput.additionalContext, /Ponytail/);
    assert.doesNotMatch(response.hookSpecificOutput.additionalContext, /before continuing work/);
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
    assert.match(response.reason, /Evidence/);
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
    assert.equal(
      buildHookResponse({
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_response: { exitCode: '0' },
      }),
      null,
    );
  });

  it('nudge imprint only for substantial UI surface creation', () => {
    const response = buildHookResponse({
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      turn_id: 'ui-create',
      tool_input: {
        patch: '*** Add File: components/SettingsCard.tsx\n+export function SettingsCard() { return null }',
      },
    });

    assert.match(response.hookSpecificOutput.additionalContext, /\/imprint/);
    assert.match(response.hookSpecificOutput.additionalContext, /Do not add button\/chrome tests/);
  });

  it('stays silent for tiny UI prop edits', () => {
    assert.equal(
      buildHookResponse({
        hook_event_name: 'PostToolUse',
        tool_name: 'apply_patch',
        turn_id: 'ui-tiny',
        tool_input: {
          patch: '*** Update File: components/SettingsCard.tsx\n-disabled={false}\n+disabled={pending}',
        },
      }),
      null,
    );
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

  it('strips legacy unscoped jmp hook tables before wrapping managed markers', () => {
    const legacy = [
      'model = "gpt-5"',
      '',
      '[[hooks.SessionStart]]',
      '[[hooks.SessionStart.hooks]]',
      'type = "command"',
      'command = \'node "/old/bin/codex-jmp-hook.mjs"\'',
      '',
      '[[hooks.PostToolUse]]',
      'matcher = "apply_patch"',
      '[[hooks.PostToolUse.hooks]]',
      'type = "command"',
      'command = "codex-wakatime --hook"',
      '',
    ].join('\n');

    const next = mergeHooksToml(legacy, '/repo');
    assert.equal((next.match(/codex-jmp-hook\.mjs/g) ?? []).length, 4);
    assert.match(next, /codex-wakatime --hook/);
    assert.match(next, /# BEGIN codex-javascript-mastery-hooks/);
  });
});

describe('stripLegacyJmpHooks', () => {
  it('keeps unrelated hooks', () => {
    const text = [
      '[[hooks.Stop]]',
      '[[hooks.Stop.hooks]]',
      'command = "codex-wakatime --hook"',
      '',
    ].join('\n');

    assert.match(stripLegacyJmpHooks(text), /codex-wakatime/);
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
    assert.match(toml, /exec_command/);
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

  it('marks the turn for mutating Bash and not for plain Bash reads', () => {
    clearTurnEdited(turn);
    buildHookResponse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      turn_id: turn,
      tool_input: { command: 'sed -i s/a/b/ file.txt' },
      tool_response: { exit_code: 0 },
    });
    assert.equal(turnEdited(turn), true);

    clearTurnEdited(turn);
    buildHookResponse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      turn_id: turn,
      tool_input: { command: 'rg -n TODO src' },
      tool_response: { exit_code: 0 },
    });
    assert.equal(turnEdited(turn), false);
  });
});
