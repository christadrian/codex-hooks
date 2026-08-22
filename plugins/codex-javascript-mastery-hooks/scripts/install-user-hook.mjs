#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createUserHookCommand,
  hasAnyHooks,
  mergeHooksToml,
  removeCommandFromHooksConfig,
  writeFileAtomic,
} from '../src/hook-utils.mjs';

export function resolveRepoPath(moduleUrl = import.meta.url) {
  return path.resolve(fileURLToPath(new URL('..', moduleUrl)));
}

export function installUserHook({ home = os.homedir(), repoPath = resolveRepoPath() } = {}) {
  const codexDir = path.join(home, '.codex');
  const hooksPath = path.join(codexDir, 'hooks.json');
  const configPath = path.join(codexDir, 'config.toml');

  fs.mkdirSync(codexDir, { recursive: true });

  const existingToml = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const command = createUserHookCommand(repoPath);

  // Parse and transform the legacy file before touching config.toml. A bad
  // hooks.json must leave the current installation untouched.
  let migratedHooks = null;
  if (fs.existsSync(hooksPath)) {
    const existingHooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    migratedHooks = removeCommandFromHooksConfig(existingHooks, command);
  }

  const nextToml = mergeHooksToml(existingToml, repoPath);
  writeFileAtomic(configPath, nextToml);

  let legacyMessage = 'No legacy ~/.codex/hooks.json migration needed';

  if (migratedHooks) {
    if (hasAnyHooks(migratedHooks)) {
      writeFileAtomic(hooksPath, `${JSON.stringify(migratedHooks, null, 2)}\n`);
      legacyMessage = 'Removed migrated JavaScript-Mastery-Pro hooks from legacy ~/.codex/hooks.json';
    } else {
      fs.unlinkSync(hooksPath);
      legacyMessage = 'Removed legacy ~/.codex/hooks.json after migrating JavaScript-Mastery-Pro hooks';
    }
  }

  console.log(`Installed JavaScript-Mastery-Pro Codex hooks to ${configPath}`);
  console.log(legacyMessage);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  installUserHook();
}
