import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildHookResponse,
  createUserHookConfig,
  detectLikelySkills,
  detectUiTouched,
  hasCompletionStatus,
  mergeHooksConfig,
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
    assert.equal(hasCompletionStatus('DONE\nTests: npm test'), true);
    assert.equal(hasCompletionStatus('DONE_WITH_CONCERNS\nTests blocked'), true);
    assert.equal(hasCompletionStatus('BLOCKED\nNeed credentials'), true);
    assert.equal(hasCompletionStatus('NEEDS_CONTEXT\nNeed repo'), true);
  });

  it('rejects missing completion status', () => {
    assert.equal(hasCompletionStatus('Implemented hook package. Tests pass.'), false);
  });
});

describe('buildHookResponse', () => {
  it('adds skill context on UserPromptSubmit', () => {
    const response = buildHookResponse({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Build a profile card component',
    });

    assert.match(response.additionalContext, /Use `architect`/);
    assert.match(response.additionalContext, /Use `imprint`/);
  });

  it('blocks Stop when final status is missing', () => {
    const response = buildHookResponse({
      hook_event_name: 'Stop',
      transcript: [{ role: 'assistant', content: 'Tests pass.' }],
    });

    assert.equal(response.decision, 'block');
    assert.match(response.reason, /completion status/i);
  });

  it('allows Stop when final status exists', () => {
    const response = buildHookResponse({
      hook_event_name: 'Stop',
      transcript: [{ role: 'assistant', content: 'DONE\nTests: npm test' }],
    });

    assert.equal(response.decision, 'approve');
  });
});

describe('mergeHooksConfig', () => {
  it('merges this package hooks without deleting existing hooks', () => {
    const existing = {
      hooks: {
        Stop: [{ command: 'echo existing' }],
      },
    };

    const next = mergeHooksConfig(existing, createUserHookConfig('/repo'));

    assert.equal(next.hooks.Stop.length, 2);
    assert.equal(next.hooks.SessionStart.length, 1);
    assert.match(next.hooks.Stop[1].hooks[0].command, /codex-jmp-hook/);
  });
});
