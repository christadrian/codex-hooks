#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { buildHookResponse } from '../src/hook-utils.mjs';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

const input = readStdin().trim();
let payload = {};

try {
  payload = input ? JSON.parse(input) : {};
} catch {
  payload = null;
}

if (payload === null) {
  process.stdout.write(
    `${JSON.stringify({
      decision: 'approve',
      systemMessage: 'Hook input was not valid JSON. Continue, but inspect hook payload generation if this repeats.',
    })}\n`,
  );
  process.exit(0);
}

const response = buildHookResponse(payload);

if (response !== null) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}
