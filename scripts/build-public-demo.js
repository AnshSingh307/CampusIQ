#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const enabled = String(process.env.PUBLIC_DEMO_MODE || '').trim().toLowerCase() === 'true';
if (!enabled) {
  throw new Error('Refusing to build: set PUBLIC_DEMO_MODE=true for the isolated static demo build.');
}

const configuredOutput = process.env.CAMPUSIQ_PUBLIC_DEMO_OUT_DIR?.trim();
const output = configuredOutput ? path.resolve(configuredOutput) : path.join(root, 'dist', 'public-demo');
const sourceIndex = await readFile(path.join(root, 'index.html'), 'utf8');
const publicIndex = sourceIndex
  .replace(/<!-- PRIVATE_AUTH_START -->[\s\S]*?<!-- PRIVATE_AUTH_END -->\s*/u, '')
  .replace(/<!-- PRIVATE_FEATURES_START -->[\s\S]*?<!-- PRIVATE_FEATURES_END -->\s*/u, '');
if (publicIndex === sourceIndex || /id="loginForm"|id="loginUsername"|id="loginPassword"|id="view-access"|id="studentPortal"/u.test(publicIndex)) {
  throw new Error('Public demo build could not remove the private login and feature sections safely.');
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all([
  writeFile(path.join(output, 'index.html'), publicIndex, 'utf8'),
  cp(path.join(root, 'prototype.js'), path.join(output, 'prototype.js')),
  cp(path.join(root, 'demo-data.csv'), path.join(output, 'demo-data.csv')),
  writeFile(
    path.join(output, 'campusiq-config.js'),
    '// Generated public-demo configuration. Contains no secrets.\nwindow.CAMPUSIQ_CONFIG = Object.freeze({ publicDemoMode: true });\n',
    'utf8',
  ),
]);

console.log(`CampusIQ public demo built at ${output}`);
