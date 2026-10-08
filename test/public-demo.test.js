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
    ['/premium-demo.css', ['premium-demo.css', 'text/css; charset=utf-8']],
    ['/premium-demo.js', ['premium-demo.js', 'text/javascript; charset=utf-8']],
    ['/campusiq-config.js', ['campusiq-config.js', 'text/javascript; charset=utf-8']],
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
    assert.deepEqual((await readdir(output)).sort(), ['campusiq-config.js', 'index.html', 'premium-demo.css', 'premium-demo.js', 'prototype.js']);
    const [html, config, script, premiumCss, premiumScript] = await Promise.all([
      readFile(path.join(output, 'index.html'), 'utf8'),
      readFile(path.join(output, 'campusiq-config.js'), 'utf8'),
      readFile(path.join(output, 'prototype.js'), 'utf8'),
      readFile(path.join(output, 'premium-demo.css'), 'utf8'),
      readFile(path.join(output, 'premium-demo.js'), 'utf8'),
    ]);
    assert.doesNotMatch(html, /id="loginForm"|id="loginUsername"|id="loginPassword"|type="password"/u);
    assert.match(html, /id="demoRoleSelect"/u);
    assert.match(html, /value="administrator">Administrator/u);
    assert.match(html, /value="faculty">Faculty/u);
    assert.match(html, /value="student">Student/u);
    assert.match(html, /id="publicFacultyPortal"/u);
    assert.match(html, /id="publicStudentPortal"/u);
    assert.match(config, /publicDemoMode:\s*true/u);
    assert.match(script, /Private APIs are unavailable in public demo mode/u);
    assert.match(script, /records=seeded\(\)/u);
    assert.match(script, /demoFacultyIds/u);
    assert.match(script, /activateDemoRole/u);
    assert.doesNotMatch(script, /fetch\s*\(|\/api\//u);
    assert.doesNotMatch(script, /PUBLIC_BUILD_STRIP_PRIVATE_/u);
    assert.match(premiumCss, /prefers-reduced-motion/u);
    assert.match(premiumCss, /data-theme="light"/u);
    assert.match(premiumScript, /campusiq-demo-theme/u);
    assert.match(premiumScript, /runGlobalSearch/u);
    assert.equal((await readdir(output)).some(file => /\.sqlite|\.csv$/u.test(file)), false);
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

  await t.test('headless browser renders all role routes, navigation panels, charts, and no JavaScript errors', async t => {
    const browser = browserPath();
    if (!browser) { t.skip('No supported headless browser found'); return; }
    const requests = [];
    const server = await staticServer(output, requests);
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    let browserRun = 0;
    const open = async (query, viewport = [1440, 1000]) => {
      browserRun += 1;
      const result = await run(browser, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        `--window-size=${viewport[0]},${viewport[1]}`,
        `--user-data-dir=${path.join(temporary, `browser-profile-${browserRun}`)}`, '--virtual-time-budget=5000', '--dump-dom',
        `${base}/${query}`,
      ], { timeout: 45_000 });
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /data-demo-ready="true"/u);
      assert.match(result.stdout, /data-demo-errors="0"/u);
      assert.match(result.stdout, /data-premium-ready="true"/u);
      assert.match(result.stdout, /data-demo-horizontal-overflow="false"/u);
      assert.doesNotMatch(result.stdout, /id="loginForm"|id="loginUsername"|id="loginPassword"/u);
      return result.stdout;
    };
    try {
      const administrator = await open('?role=administrator&expand=overviewChart');
      assert.match(administrator, /data-demo-role="administrator"/u);
      assert.match(administrator, /data-demo-interaction="chart-expanded"/u);
      assert.match(administrator, /class="card premium-expanded"/u);
      assert.match(administrator, /data-demo-students="512"/u);
      assert.match(administrator, /id="metricTotal"[^>]*data-counter-animated="true"/u);
      assert.match(administrator, /512 synthetic students/u);
      assert.match(administrator, /id="themeToggle"/u);
      assert.match(administrator, /id="globalDemoSearch"/u);
      assert.match(administrator, /id="premiumHero"/u);
      for (const chartId of ['overviewChart', 'riskDonut', 'cgpaDistribution', 'attendanceScatter', 'placementByProgram', 'studentFlow']) {
        assert.match(administrator, new RegExp(`id="${chartId}"[^>]*>[\\s\\S]*?<svg`, 'u'), `${chartId} did not render an SVG chart`);
      }

      const facultyOverview = await open('?role=administrator&switchRole=faculty', [1024, 900]);
      assert.match(facultyOverview, /data-demo-role="faculty"/u);
      assert.match(facultyOverview, /data-demo-role-switched="true"/u);
      assert.match(facultyOverview, /id="publicFacultyPortal" class="demo-role-portal"/u);
      for (const id of ['STU-0002', 'STU-0006', 'STU-0010', 'STU-0014', 'STU-0018', 'STU-0022', 'STU-0026', 'STU-0030']) assert.match(facultyOverview, new RegExp(id, 'u'));
      assert.match(facultyOverview, /id="facultyScoreChart"><svg/u);
      assert.match(facultyOverview, /data-demo-section="faculty-overview">/u);

      const facultyTeaching = await open('?role=faculty&section=teaching&simulate=grade');
      assert.match(facultyTeaching, /data-demo-section="faculty-teaching">/u);
      assert.match(facultyTeaching, /data-demo-interaction="grade-simulated"/u);
      assert.match(facultyTeaching, /CS-204 · Data Structures/u);
      assert.match(facultyTeaching, /class="select demo-attendance-status"/u);
      assert.match(facultyTeaching, /Demo grade recorded/u);

      const facultySupport = await open('?role=faculty&section=support');
      assert.match(facultySupport, /data-demo-section="faculty-support">/u);
      assert.match(facultySupport, /Suggestion only · faculty review required/u);

      const studentProgress = await open('?role=student&section=progress&theme=dark&toggleTheme=true', [390, 844]);
      assert.match(studentProgress, /data-demo-role="student"/u);
      assert.match(studentProgress, /data-theme="light"/u);
      assert.match(studentProgress, /id="publicStudentPortal" class="demo-role-portal"/u);
      assert.match(studentProgress, /data-demo-section="student-progress">/u);
      assert.match(studentProgress, /id="demoStudentTrajectory"><svg/u);
      assert.match(studentProgress, /STU-0001/u);

      const studentCoursework = await open('?role=student&section=coursework&simulate=submit');
      assert.match(studentCoursework, /data-demo-section="student-coursework">/u);
      assert.match(studentCoursework, /data-demo-interaction="submission-simulated"/u);
      assert.match(studentCoursework, /My assignments, submissions and grades/u);
      assert.match(studentCoursework, /Faculty feedback/u);
      assert.match(studentCoursework, /Submitted in this browser/u);

      const searched = await open('?role=administrator&q=STU-0001&sort=name-asc&profile=STU-0001');
      assert.match(searched, /data-demo-search="STU-0001"/u);
      assert.match(searched, /data-demo-sort="name-asc"/u);
      assert.match(searched, /data-demo-interaction="profile-opened"/u);
      assert.match(searched, /id="triageCount">1 of 512 students</u);
      assert.match(searched, /class="modal-backdrop open" id="profileBackdrop"/u);
      assert.match(searched, /id="modalStudentId"[^>]*>STU-0001/u);

      assert.equal(requests.some(request => request.pathname.startsWith('/api/')), false, 'Browser requested a private API route');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
