import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const buildFile = path.join(root, 'scripts', 'build-public-demo.js');
const serverFile = path.join(root, 'server.js');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Process timed out: ${command} ${args.join(' ')}`));
    }, options.timeout || 30_000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

function browserPath() {
  const candidates = [
    process.env.CHROME_BIN,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find(existsSync);
}

async function staticServer(directory, requests) {
  const allowed = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/prototype.js', ['prototype.js', 'text/javascript; charset=utf-8']],
    ['/campusiq-config.js', ['campusiq-config.js', 'text/javascript; charset=utf-8']],
    ['/demo-data.csv', ['demo-data.csv', 'text/csv; charset=utf-8']],
  ]);
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    requests.push({ method: req.method, pathname });
    const entry = allowed.get(pathname);
    if (!entry) { res.writeHead(404).end('Not found'); return; }
    const [file, type] = entry;
    const body = await readFile(path.join(directory, file));
    res.writeHead(200, { 'content-type': type, 'x-content-type-options': 'nosniff' });
    res.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

test('isolated public demo build', { timeout: 90_000 }, async t => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'campusiq-public-demo-'));
  const output = path.join(temporary, 'site');
  t.after(async () => rm(temporary, { recursive: true, force: true }));

  await t.test('production static build needs no administrator secret and contains only public assets', async () => {
    const result = await run(process.execPath, [buildFile], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PUBLIC_DEMO_MODE: 'true',
        CAMPUSIQ_PUBLIC_DEMO_OUT_DIR: output,
        CAMPUSIQ_ADMIN_USERNAME: '',
        CAMPUSIQ_ADMIN_PASSWORD: '',
      },
    });
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.deepEqual((await readdir(output)).sort(), ['campusiq-config.js', 'demo-data.csv', 'index.html', 'prototype.js']);
    const [html, config, script, csv] = await Promise.all([
      readFile(path.join(output, 'index.html'), 'utf8'),
      readFile(path.join(output, 'campusiq-config.js'), 'utf8'),
      readFile(path.join(output, 'prototype.js'), 'utf8'),
      readFile(path.join(output, 'demo-data.csv'), 'utf8'),
    ]);
    assert.doesNotMatch(html, /id="loginForm"|id="loginUsername"|id="loginPassword"|type="password"/u);
    assert.match(config, /publicDemoMode:\s*true/u);
    assert.match(script, /Private APIs are unavailable in public demo mode/u);
    assert.match(script, /records=seeded\(\)/u);
    assert.match(csv, /^student_id,name,term,program,/u);
    const studentRows = csv.trim().split(/\r?\n/u).slice(1);
    assert.ok(studentRows.length > 100, 'Expected a substantial synthetic demo dataset');
    assert.equal(studentRows.every(row => /^STU-\d{4},/u.test(row)), true);
    assert.equal((await readdir(output)).some(file => /\.sqlite/u.test(file)), false);
  });

  await t.test('server.js refuses public demo mode before creating a database', async () => {
    const dataDir = path.join(temporary, 'must-not-be-created');
    const result = await run(process.execPath, [serverFile], {
      env: { ...process.env, PUBLIC_DEMO_MODE: 'true', CAMPUSIQ_DATA_DIR: dataDir, NODE_ENV: 'production' },
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /isolated static build/u);
    assert.equal(existsSync(dataDir), false);
  });

  await t.test('public static routes cannot expose private API data or accept writes', async () => {
    const requests = [];
    const server = await staticServer(output, requests);
    t.after(() => new Promise(resolve => server.close(resolve)));
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const readAttempt = await fetch(`${base}/api/students`);
    const writeAttempt = await fetch(`${base}/api/cases`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"cases":{}}' });
    assert.equal(readAttempt.status, 404);
    assert.equal(writeAttempt.status, 404);
  });

  await t.test('headless browser opens without authentication and renders the synthetic dashboard', async t => {
    const browser = browserPath();
    if (!browser) { t.skip('No supported headless browser found'); return; }
    const requests = [];
    const server = await staticServer(output, requests);
    const address = server.address();
    const profile = path.join(temporary, 'browser-profile');
    try {
      const result = await run(browser, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        `--user-data-dir=${profile}`, '--virtual-time-budget=5000', '--dump-dom',
        `http://127.0.0.1:${address.port}/`,
      ], { timeout: 45_000 });
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /data-demo-ready="true"/u);
      assert.match(result.stdout, /data-demo-students="512"/u);
      assert.match(result.stdout, /id="metricTotal">512</u);
      assert.match(result.stdout, /512 synthetic students/u);
      for (const chartId of ['overviewChart', 'riskDonut', 'cgpaDistribution', 'attendanceScatter', 'placementByProgram', 'studentFlow']) {
        assert.match(result.stdout, new RegExp(`id="${chartId}"[^>]*>[\\s\\S]*?<svg`, 'u'), `${chartId} did not render an SVG chart`);
      }
      assert.doesNotMatch(result.stdout, /id="loginForm"|id="loginUsername"|id="loginPassword"/u);
      assert.equal(requests.some(request => request.pathname.startsWith('/api/')), false, 'Browser requested a private API route');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
