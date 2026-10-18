// Verify a deployed or local service without any Google credentials.
import assert from 'node:assert/strict';
const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base)) throw Error('Usage: node deploy/smoke.mjs URL [EXPECTED_COMMIT]');
const get = (route, options={}) => fetch(new URL(route, base), {signal:AbortSignal.timeout(60000), ...options});
const root = await get('/', {redirect:'manual'});
assert.equal(root.status,200);
assert.match(await root.text(),/<title>Between/);
// Cloud Run reserves some paths ending in "z", including /healthz.
// Check the public version asset and actual app routes instead.
const release = await get('/version.json');
assert.equal(release.status,200);
const version = await release.json();
assert.equal(version.product,'Between');
assert.equal(version.dataMode,'synthetic-snapshot');
if (process.argv[3]) assert.equal(version.commit,process.argv[3]);
for (const route of ['/between.html','/universe2.css','/universe2.bundle.js',
  '/i18n.js','/universe2-attention.js?v=20261017-en2',
  '/styles/timeline.html','/styles/timeline.js','/styles/universe2-project-space.html',
  '/styles/universe2-project-space.js','/vendor/three.module.js','/reports/architect.html',
  '/data/scenarios/architect/worklife.json','/data/scenarios/architect/scenario.json']) {
  const res = await get(route);
  assert.equal(res.status,200,route);
  assert.ok((await res.arrayBuffer()).byteLength > 0,route);
}
for (const route of ['/.env','/.git/config','/package.json','/scripts/monthly-contributions/extract.mjs',
  '/daily-memory/runs/monthly-contributions/report.html','/space-links.json','/styles/','/missing.html']) {
  assert.equal((await get(route)).status,404,route);
}
assert.equal((await get('/between.html',{method:'POST'})).status,405);
for (const persona of ['student', 'ai_engineer', 'iris']) {
  for (const file of ['worklife.json', 'scenario.json', 'work-stories.json']) {
    for (const suffix of ['', '.gz']) {
      const route = `/data/scenarios/${persona}/${file}${suffix}`;
      assert.equal((await get(route)).status,404,route);
    }
  }
}
console.log(`PASS: public entry, embedded views, report, architect data, excluded personas and private paths; commit ${version.commit}`);

const manifest = await (await get('/archive-manifest.json')).json();
const packaged = await get('/' + manifest.file);
const cloud = await get('/api/archive/' + manifest.version);
assert.equal(cloud.status, 200, 'Firestore archive available');
assert.equal(cloud.headers.get('x-between-data-source'), 'firestore');
assert.equal(await cloud.text(), await packaged.text(), 'Firestore equals packaged archive byte for byte');
console.log('PASS: Firestore read-back equals packaged data, version ' + manifest.version);
