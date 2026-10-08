import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const serverFile = path.join(root, 'server.js');

function runCli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverFile, ...args], { cwd: root, env: { ...process.env, PUBLIC_DEMO_MODE: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`CLI exited ${code}: ${stderr || stdout}`)));
  });
}

function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverFile], { cwd: root, env: { ...process.env, PUBLIC_DEMO_MODE: '', ...env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false;
    const timer = setTimeout(() => fail(new Error(`Server start timed out. ${stderr || stdout}`)), 10_000);
    const fail = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(error);
    };
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdout.on('data', chunk => {
      stdout += chunk;
      const match = stdout.match(/listening on http:\/\/([^:]+):(\d+)/);
      if (!match || settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ child, host: match[1], port: Number(match[2]), output: stdout, stderr: () => stderr });
    });
    child.on('error', fail);
    child.on('exit', code => fail(new Error(`Server exited before startup (${code}). ${stderr || stdout}`)));
  });
}

function stopServer(server) {
  return new Promise(resolve => {
    if (!server?.child || server.child.exitCode !== null) return resolve();
    server.child.once('exit', resolve);
    server.child.kill();
    setTimeout(resolve, 2_000).unref();
  });
}

function clientFor(port) {
  const base = `http://127.0.0.1:${port}`;
  return async function request(route, { method = 'GET', body, cookie, headers = {} } = {}) {
    const response = await fetch(base + route, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data = text;
    try { data = text ? JSON.parse(text) : null; } catch {}
    return { status: response.status, data, headers: response.headers };
  };
}

async function login(request, username, password, headers) {
  const response = await request('/api/login', { method: 'POST', body: { username, password }, headers });
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  return { ...response, cookie };
}

test('CampusIQ complete regression suite', { timeout: 90_000 }, async t => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'campusiq-test-'));
  const csv = await readFile(path.join(root, 'demo-data.csv'), 'utf8');
  const dataLines = csv.split(/\r?\n/).slice(1).filter(line => line.trim());
  const studentId = dataLines[0].split(',')[0].replaceAll('"', '').trim();
  const secondStudentId = dataLines.find(line => line.split(',')[0].replaceAll('"', '').trim() !== studentId).split(',')[0].replaceAll('"', '').trim();
  const sharedEnv = { CAMPUSIQ_DATA_DIR: dataDir, PUBLIC_DEMO_MODE: '' };
  let server, request, admin, faculty, facultyTwo, student, studentTwo;
  let courseId, assignmentId, submissionId, facultyId;

  t.after(async () => {
    await stopServer(server);
    await rm(dataDir, { recursive: true, force: true });
  });

  await t.test('server startup creates the initial administrator once without logging credentials', async () => {
    const env = {
      ...sharedEnv,
      CAMPUSIQ_ADMIN_USERNAME: 'test-admin',
      CAMPUSIQ_ADMIN_DISPLAY_NAME: 'Test Administrator',
      CAMPUSIQ_ADMIN_PASSWORD: 'Admin-Test-Password-123!',
    };
    server = await startServer(env);
    let bootstrapRequest = clientFor(server.port);
    let signedIn = await login(bootstrapRequest, 'test-admin', 'Admin-Test-Password-123!');
    assert.equal(signedIn.status, 200);
    assert.match(server.output, /Initial administrator account created from environment configuration/);
    assert.doesNotMatch(server.output + server.stderr(), /Admin-Test-Password-123!|test-admin/);
    await stopServer(server);
    server = await startServer({ ...env, CAMPUSIQ_ADMIN_PASSWORD: 'Different-Password-456!' });
    bootstrapRequest = clientFor(server.port);
    signedIn = await login(bootstrapRequest, 'test-admin', 'Admin-Test-Password-123!');
    assert.equal(signedIn.status, 200);
    const overwritten = await login(bootstrapRequest, 'test-admin', 'Different-Password-456!');
    assert.equal(overwritten.status, 401);
    await stopServer(server);
    const repeated = await runCli(['init-admin'], sharedEnv);
    assert.match(repeated.stdout, /already exists; no changes made/);
  });

  await t.test('unsafe production and Railway configuration fails clearly', async () => {
    const emptyDataDir = await mkdtemp(path.join(tmpdir(), 'campusiq-empty-'));
    try {
      await assert.rejects(
        runCli([], { NODE_ENV: 'production', CAMPUSIQ_DATA_DIR: emptyDataDir }),
        /CAMPUSIQ_ADMIN_USERNAME/
      );
      await assert.rejects(
        runCli([], {
          NODE_ENV: 'production', PORT: '4173', CAMPUSIQ_DATA_DIR: dataDir, CAMPUSIQ_TRUST_PROXY: 'railway',
          RAILWAY_ENVIRONMENT_ID: 'test-environment', RAILWAY_SERVICE_ID: 'test-service',
        }),
        /Attach a Railway volume and mount it at \/data/
      );
    } finally {
      await rm(emptyDataDir, { recursive: true, force: true });
    }
  });

  await t.test('Railway production startup bootstraps an empty mounted volume exactly once', async () => {
    const railwayDataDir = await mkdtemp(path.join(tmpdir(), 'campusiq-railway-'));
    const railwayEnv = {
      NODE_ENV: 'production',
      CAMPUSIQ_DATA_DIR: railwayDataDir,
      CAMPUSIQ_TRUST_PROXY: 'railway',
      RAILWAY_ENVIRONMENT_ID: 'test-environment',
      RAILWAY_SERVICE_ID: 'test-service',
      RAILWAY_VOLUME_MOUNT_PATH: railwayDataDir,
    };
    let railwayServer;
    try {
      railwayServer = await startServer({
        ...railwayEnv,
        CAMPUSIQ_ADMIN_USERNAME: 'railway-admin',
        CAMPUSIQ_ADMIN_DISPLAY_NAME: 'Railway Administrator',
        CAMPUSIQ_ADMIN_PASSWORD: 'Railway-Admin-Password-123!',
      });
      let railwayRequest = clientFor(railwayServer.port);
      let signedIn = await login(railwayRequest, 'railway-admin', 'Railway-Admin-Password-123!');
      assert.equal(signedIn.status, 200);
      assert.match(signedIn.headers.get('set-cookie'), /; Secure/i);
      assert.doesNotMatch(railwayServer.output + railwayServer.stderr(), /Railway-Admin-Password-123!|railway-admin/);
      await stopServer(railwayServer);
      railwayServer = await startServer(railwayEnv);
      railwayRequest = clientFor(railwayServer.port);
      signedIn = await login(railwayRequest, 'railway-admin', 'Railway-Admin-Password-123!');
      assert.equal(signedIn.status, 200);
    } finally {
      await stopServer(railwayServer);
      await rm(railwayDataDir, { recursive: true, force: true });
    }
  });

  await t.test('backend starts without errors on Node.js 24+', async () => {
    assert.ok(Number(process.versions.node.split('.')[0]) >= 24, `Expected Node.js 24+, received ${process.version}`);
    server = await startServer({ ...sharedEnv, NODE_ENV: 'development', CAMPUSIQ_TRUST_PROXY: '203.0.113.10' });
    request = clientFor(server.port);
    assert.equal(server.host, '127.0.0.1');
    assert.equal(server.child.exitCode, null);
    assert.equal(server.stderr(), '');
  });

  await t.test('frontend HTML and JavaScript load from the local server', async () => {
    let response = await request('/');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    assert.match(response.data, /id="studentPortal"/);
    assert.match(response.data, /id="overviewChart"/);
    response = await request('/prototype.js');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/javascript/);
    assert.match(response.data, /function renderStudentPortal/);
    assert.match(response.data, /function renderCharts/);
    response = await request('/campusiq-config.js');
    assert.equal(response.status, 200);
    assert.match(response.data, /publicDemoMode:\s*false/);
  });

  await t.test('database initializes every table and seeds the demo CSV', async () => {
    const directDb = new DatabaseSync(path.join(dataDir, 'campusiq.sqlite'), { readOnly: true });
    const tables = new Set(directDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    const expected = ['students','users','assignments','student_accounts','cases','courses','course_enrollments','class_sessions','attendance_records','course_assignments','submissions','audit'];
    for (const table of expected) assert.equal(tables.has(table), true, `Missing table ${table}`);
    const seeded = directDb.prepare('SELECT COUNT(*) AS n FROM students').get().n;
    assert.ok(seeded > 100, `Expected demo seed, found ${seeded} rows`);
    assert.ok(directDb.prepare('SELECT 1 FROM students WHERE student_id=?').get(studentId));
    assert.ok(directDb.prepare('SELECT 1 FROM students WHERE student_id=?').get(secondStudentId));
    directDb.close();
  });

  await t.test('/health responds successfully when SQLite is ready', async () => {
    const response = await request('/health');
    assert.equal(response.status, 200);
    assert.deepEqual({ status: response.data.status, database: response.data.database }, { status: 'ok', database: 'ready' });
  });

  await t.test('administrator can create faculty and student accounts', async () => {
    admin = await login(request, 'test-admin', 'Admin-Test-Password-123!');
    assert.equal(admin.status, 200);
    const accounts = [
      { username: 'faculty-one', display_name: 'Faculty One', role: 'faculty', password: 'Faculty-One-Password!' },
      { username: 'faculty-two', display_name: 'Faculty Two', role: 'faculty', password: 'Faculty-Two-Password!' },
      { username: 'student-one', display_name: 'Student One', role: 'student', student_id: studentId, password: 'Student-One-Password!' },
      { username: 'student-two', display_name: 'Student Two', role: 'student', student_id: secondStudentId, password: 'Student-Two-Password!' },
    ];
    for (const account of accounts) {
      const response = await request('/api/users', { method: 'POST', cookie: admin.cookie, body: account });
      assert.equal(response.status, 201, `Failed to create ${account.username}: ${JSON.stringify(response.data)}`);
    }
    const response = await request('/api/users', { cookie: admin.cookie });
    assert.equal(response.status, 200);
    assert.deepEqual(new Set(accounts.map(x => x.username)), new Set(response.data.users.filter(x => x.username !== 'test-admin').map(x => x.username)));
    facultyId = response.data.users.find(user => user.username === 'faculty-one').id;
  });

  await t.test('admin, faculty, and student can login and logout', async () => {
    const credentials = [
      ['test-admin', 'Admin-Test-Password-123!', 'admin'],
      ['faculty-one', 'Faculty-One-Password!', 'faculty'],
      ['faculty-two', 'Faculty-Two-Password!', 'faculty'],
      ['student-one', 'Student-One-Password!', 'student'],
      ['student-two', 'Student-Two-Password!', 'student'],
    ];
    for (const [username, password, role] of credentials) {
      const signedIn = await login(request, username, password);
      assert.equal(signedIn.status, 200);
      assert.equal(signedIn.data.user.role, role);
      const signedOut = await request('/api/logout', { method: 'POST', cookie: signedIn.cookie, body: {} });
      assert.equal(signedOut.status, 200);
      assert.match(signedOut.headers.get('set-cookie'), /Max-Age=0/);
      const expired = await request('/api/session', { cookie: signedIn.cookie });
      assert.equal(expired.status, 401);
    }
    admin = await login(request, 'test-admin', 'Admin-Test-Password-123!');
    faculty = await login(request, 'faculty-one', 'Faculty-One-Password!');
    facultyTwo = await login(request, 'faculty-two', 'Faculty-Two-Password!');
    student = await login(request, 'student-one', 'Student-One-Password!');
    studentTwo = await login(request, 'student-two', 'Student-Two-Password!');
  });

  await t.test('untrusted forwarded HTTPS headers cannot force cookie security state', async () => {
    const spoofed = await login(request, 'test-admin', 'Admin-Test-Password-123!', { 'x-forwarded-proto': 'https' });
    assert.equal(spoofed.status, 200);
    assert.doesNotMatch(spoofed.headers.get('set-cookie'), /; Secure/i);
    assert.match(spoofed.headers.get('set-cookie'), /HttpOnly/);
    assert.match(spoofed.headers.get('set-cookie'), /SameSite=Strict/);
  });

  await t.test('students cannot access another student records', async () => {
    let response = await request('/api/students', { cookie: student.cookie });
    assert.equal(response.status, 200);
    assert.deepEqual(new Set(response.data.students.map(row => row.student_id)), new Set([studentId]));
    response = await request('/api/students', { cookie: studentTwo.cookie });
    assert.equal(response.status, 200);
    assert.deepEqual(new Set(response.data.students.map(row => row.student_id)), new Set([secondStudentId]));
  });

  await t.test('students and faculty cannot use administrator-only routes', async () => {
    for (const actor of [student, faculty]) {
      let response = await request('/api/users', { cookie: actor.cookie });
      assert.equal(response.status, 403);
      response = await request('/api/audit', { cookie: actor.cookie });
      assert.equal(response.status, 403);
      response = await request('/api/import', { method: 'POST', body: { csv: 'student_id,name,term,cgpa' }, cookie: actor.cookie });
      assert.equal(response.status, 403);
      response = await request('/api/enroll', { method: 'POST', body: { course_id: 1, student_ids: [] }, cookie: actor.cookie });
      assert.equal(response.status, 403);
      response = await request('/api/assign', { method: 'POST', body: { username: 'faculty-one', student_id: studentId }, cookie: actor.cookie });
      assert.equal(response.status, 403);
    }
  });

  await t.test('administrator can create a course and enroll a student', async () => {
    let response = await request('/api/courses', {
      method: 'POST', cookie: admin.cookie,
      body: { code: 'TEST101', title: 'Synthetic Test Course', weekday: 2, start_time: '09:00', end_time: '10:00', room: 'TEST', faculty_username: 'faculty-one', student_ids: [] },
    });
    assert.equal(response.status, 201);
    response = await request('/api/campus', { cookie: faculty.cookie });
    assert.equal(response.status, 200);
    courseId = response.data.courses.find(course => course.code === 'TEST101').id;
    response = await request('/api/enroll', { method: 'POST', cookie: admin.cookie, body: { course_id: courseId, student_ids: [studentId], replace: true } });
    assert.equal(response.status, 200);
    response = await request('/api/campus', { cookie: faculty.cookie });
    assert.equal(response.data.enrollments.some(row => row.student_id === studentId), true);
    response = await request('/api/campus', { cookie: student.cookie });
    assert.equal(response.data.courses.some(course => course.id === courseId), true);
    response = await request('/api/campus', { cookie: studentTwo.cookie });
    assert.equal(response.data.courses.some(course => course.id === courseId), false);
  });

  await t.test('faculty cannot access unauthorized students or courses', async () => {
    let response = await request('/api/students', { cookie: faculty.cookie });
    assert.equal(response.status, 200);
    assert.deepEqual(new Set(response.data.students.map(row => row.student_id)), new Set([studentId]));
    response = await request('/api/students', { cookie: facultyTwo.cookie });
    assert.equal(response.status, 200);
    assert.equal(response.data.students.length, 0);
    response = await request('/api/attendance', { method: 'POST', cookie: facultyTwo.cookie, body: { course_id: courseId, class_date: '2026-10-08', attendance: { [studentId]: 'Present' } } });
    assert.equal(response.status, 404);
  });

  await t.test('faculty can enter attendance for an authorized course', async () => {
    let response = await request('/api/attendance', { method: 'POST', cookie: faculty.cookie, body: { course_id: courseId, class_date: '2026-10-08', attendance: { [studentId]: 'Present' } } });
    assert.equal(response.status, 200);
    response = await request('/api/campus', { cookie: student.cookie });
    const mark = response.data.attendance.find(row => row.course_id === courseId && row.class_date === '2026-10-08');
    assert.equal(mark.status, 'Present');
    assert.equal(mark.student_id, studentId);
  });

  await t.test('assignment publication, student submission, and faculty grading work', async () => {
    let response = await request('/api/assignments', {
      method: 'POST', cookie: faculty.cookie,
      body: { course_id: courseId, title: 'Synthetic coursework', instructions: 'Submit a synthetic answer.', due_at: '2099-12-31T12:00:00.000Z', max_points: 20 },
    });
    assert.equal(response.status, 201);
    response = await request('/api/assignments', {
      method: 'POST', cookie: facultyTwo.cookie,
      body: { course_id: courseId, title: 'Unauthorized', instructions: 'Must fail.', due_at: '2099-12-31T12:00:00.000Z', max_points: 20 },
    });
    assert.equal(response.status, 404);

    response = await request('/api/campus', { cookie: student.cookie });
    assignmentId = response.data.assignments.find(item => item.title === 'Synthetic coursework').id;
    assert.deepEqual(new Set(response.data.courses.map(course => course.id)), new Set([courseId]));
    assert.equal(response.data.attendance.every(row => row.student_id === studentId), true);

    response = await request('/api/submissions', { method: 'POST', cookie: faculty.cookie, body: { assignment_id: assignmentId, answer_text: 'Must fail.' } });
    assert.equal(response.status, 403);
    response = await request('/api/submissions', { method: 'POST', cookie: student.cookie, body: { assignment_id: assignmentId, answer_text: 'Synthetic student submission.' } });
    assert.equal(response.status, 200);

    response = await request('/api/campus', { cookie: faculty.cookie });
    submissionId = response.data.submissions.find(item => item.assignment_id === assignmentId).id;
    response = await request(`/api/submissions/${submissionId}`, { method: 'PATCH', cookie: facultyTwo.cookie, body: { score: 18, feedback: 'Must fail.' } });
    assert.equal(response.status, 403);
    response = await request(`/api/submissions/${submissionId}`, { method: 'PATCH', cookie: faculty.cookie, body: { score: 18, feedback: 'Synthetic feedback.' } });
    assert.equal(response.status, 200);

    response = await request('/api/campus', { cookie: student.cookie });
    assert.equal(response.data.submissions.find(item => item.id === submissionId).score, 18);
  });

  await t.test('disabled accounts immediately lose new and previously issued access', async () => {
    let response = await request(`/api/users/${facultyId}`, { method: 'PATCH', cookie: admin.cookie, body: { enabled: false } });
    assert.equal(response.status, 200);
    response = await request('/api/campus', { cookie: faculty.cookie });
    assert.equal(response.status, 401);
    response = await login(request, 'faculty-one', 'Faculty-One-Password!');
    assert.equal(response.status, 401);
    response = await request(`/api/users/${facultyId}`, { method: 'PATCH', cookie: admin.cookie, body: { enabled: true } });
    assert.equal(response.status, 200);
    response = await request('/api/campus', { cookie: faculty.cookie });
    assert.equal(response.status, 401);
    response = await login(request, 'faculty-one', 'Faculty-One-Password!');
    assert.equal(response.status, 200);
    const refreshedCookie = response.cookie;
    const directDb = new DatabaseSync(path.join(dataDir, 'campusiq.sqlite'));
    directDb.prepare('UPDATE users SET enabled=0 WHERE id=?').run(facultyId);
    directDb.close();
    response = await request('/api/campus', { cookie: refreshedCookie });
    assert.equal(response.status, 401);
    response = await request(`/api/users/${facultyId}`, { method: 'PATCH', cookie: admin.cookie, body: { enabled: true } });
    assert.equal(response.status, 200);
  });

  await t.test('CSV import accepts valid rows, reports malformed rows, and preserves exportable records', async () => {
    const importedCsv = [
      'student_id,name,term,program,year,cgpa,attendance',
      `${studentId},Synthetic Student One,2026 Test Term,Test Program,1,8.2,91`,
      `${secondStudentId},Synthetic Student Two,2026 Test Term,Test Program,1,7.4,84`,
      'BROKEN-ROW,,2026 Test Term,Test Program,1,,not-a-number',
    ].join('\r\n');
    let response = await request('/api/import', { method: 'POST', cookie: admin.cookie, body: { csv: importedCsv } });
    assert.equal(response.status, 200);
    assert.equal(response.data.accepted, 2);
    assert.equal(response.data.issues.some(issue => issue.includes('Row 4')), true);
    response = await request('/api/students', { cookie: admin.cookie });
    assert.equal(response.status, 200);
    assert.deepEqual(new Set(response.data.students.map(row => row.student_id)), new Set([studentId, secondStudentId]));
    const exported = response.data.students.map(row => [row.student_id, row.name, row.term, row.cgpa].map(value => String(value).includes(',') ? `"${String(value).replaceAll('"','""')}"` : value).join(',')).join('\r\n');
    assert.match(exported, new RegExp(studentId));
    assert.match(exported, new RegExp(secondStudentId));
    const frontendJs = await request('/prototype.js');
    assert.match(frontendJs.data, /function exportCsv\(/);
    assert.match(frontendJs.data, /campusiq-students\.csv/);
  });

  await stopServer(server);
  server = await startServer({ ...sharedEnv, NODE_ENV: 'development' });
  request = clientFor(server.port);
  await t.test('database data persists after restarting the server', async () => {
    admin = await login(request, 'test-admin', 'Admin-Test-Password-123!');
    faculty = await login(request, 'faculty-one', 'Faculty-One-Password!');
    student = await login(request, 'student-one', 'Student-One-Password!');
    assert.equal(admin.status, 200);
    assert.equal(faculty.status, 200);
    assert.equal(student.status, 200);
    let response = await request('/api/campus', { cookie: student.cookie });
    assert.equal(response.data.courses.some(course => course.id === courseId), true);
    assert.equal(response.data.attendance.some(row => row.course_id === courseId && row.status === 'Present'), true);
    assert.equal(response.data.assignments.some(item => item.id === assignmentId), true);
    assert.equal(response.data.submissions.some(item => item.id === submissionId && item.score === 18), true);
    response = await request('/api/students', { cookie: admin.cookie });
    assert.deepEqual(new Set(response.data.students.map(row => row.student_id)), new Set([studentId, secondStudentId]));
  });

  await stopServer(server);
  server = await startServer({
    ...sharedEnv,
    NODE_ENV: 'production',
    CAMPUSIQ_TRUST_PROXY: 'railway',
    RAILWAY_ENVIRONMENT_ID: 'test-environment',
    RAILWAY_SERVICE_ID: 'test-service',
    RAILWAY_VOLUME_MOUNT_PATH: dataDir,
  });
  request = clientFor(server.port);
  await t.test('Railway production binds externally and safely handles HTTPS proxy headers', async () => {
    assert.match(server.output, /http:\/\/0\.0\.0\.0:/);
    const proxiedRequest = clientFor(server.port);
    const headers = { host: '127.0.0.1', 'x-railway-edge': 'iad1', 'x-railway-request-id': 'test-request-id', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'campusiq.example', 'x-real-ip': '203.0.113.20', origin: 'https://campusiq.example' };
    const response = await login(proxiedRequest, 'test-admin', 'Admin-Test-Password-123!', headers);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /; Secure/i);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(response.headers.get('set-cookie'), /SameSite=Strict/i);
    const rejected = await login(proxiedRequest, 'test-admin', 'Admin-Test-Password-123!', { ...headers, origin: 'https://attacker.example' });
    assert.equal(rejected.status, 403);
    const unmarked = await login(proxiedRequest, 'test-admin', 'Admin-Test-Password-123!', { ...headers, 'x-railway-edge': '', origin: 'https://campusiq.example' });
    assert.equal(unmarked.status, 403);
  });
});
