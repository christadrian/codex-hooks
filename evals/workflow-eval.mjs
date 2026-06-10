#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildHookResponse } from '../src/hook-utils.mjs';

const cases = [
  {
    name: 'routes new UI work to architect and imprint',
    input: { hook_event_name: 'UserPromptSubmit', prompt: 'Create a settings card component' },
    expect: /Use `architect`[\s\S]*Use `imprint`/,
  },
  {
    name: 'warns after UI patch',
    input: {
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: { patch: '*** Add File: components/SettingsCard.tsx' },
    },
    expect: /Run `\/imprint`/,
  },
  {
    name: 'blocks missing completion status',
    input: { hook_event_name: 'Stop', final_response: 'Tests pass.' },
    expect: /Missing completion status/,
  },
  {
    name: 'does not block missing Stop text payload',
    input: { hook_event_name: 'Stop' },
    expect: /"decision":"approve"/,
  },
  {
    name: 'warns on failed camelCase tool response',
    input: { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { exitCode: 1 } },
    expect: /recover/,
  },
  {
    name: 'routes debug prompt to recover',
    input: { hook_event_name: 'UserPromptSubmit', prompt: 'Debug this failing hook' },
    expect: /Use `recover`/,
  },
  {
    name: 'routes release prompt to review',
    input: { hook_event_name: 'UserPromptSubmit', prompt: 'Release the hook package' },
    expect: /Use `review`/,
  },
];

let passed = 0;

for (const testCase of cases) {
  const output = JSON.stringify(buildHookResponse(testCase.input));
  assert.match(output, testCase.expect, testCase.name);
  passed += 1;
}

const score = passed / cases.length;
console.log(JSON.stringify({ passed, total: cases.length, score }, null, 2));

if (score < 1) {
  process.exitCode = 1;
}
