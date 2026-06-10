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
const payload = input ? JSON.parse(input) : {};
const response = buildHookResponse(payload);

process.stdout.write(`${JSON.stringify(response)}\n`);
