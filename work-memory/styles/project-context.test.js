import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { loadBetween } from './between-data.js';
globalThis.location = { search: '' };
globalThis.fetch = async (url) => ({ json: async () => JSON.parse(await readFile(url, 'utf8')) });
for (const scenario of ['architect']) {
  const d = await loadBetween(scenario);
  for (const day of [1, 35, 60, d.days]) for (const person of d.P) {
    const projects = d.sharedProjects(person.id, day);
    for (const pid of projects) {
      const rs = d.sharedRecords(person.id, day, pid);
      assert(rs.length && rs.every((r) => r.first_seen_at <= d.W.snapshots[day - 1].as_of));
      assert.equal(d.defaultProject(person.id, pid, day), pid);
      assert.doesNotThrow(() => d.card(person.id, pid, day));
    }
    assert(projects.includes(d.defaultProject(person.id, 'nonexistent', day)) || !projects.length);
  }
  if (scenario === 'architect') {
    assert.deepEqual(d.sharedProjects('robert'), ['lakeside']);
    assert.deepEqual(d.sharedProjects('mark'), ['lakeside']);
    assert.equal(d.defaultProject('robert', 'riverside'), 'lakeside');
    const school = d.card('dian', 'lakeside');
    assert(school.includes('Fire stair 2'));
    assert(!school.includes('jury-response') && !school.includes('north retail frontage'));
    assert(!d.card('mark', 'lakeside', 30).includes('Hall exit door'));
    assert(d.card('mark', 'lakeside').includes('Hall exit door'));
    assert(!d.sharedProjects('dian', 1).includes('riverside'));
  }
}
// Standalone styles contain inline modules outside the bundled app entry point.
for (const page of ['timeline', 'universe2-project-space']) {
  const html = await readFile(new URL(`./${page}.html`, import.meta.url), 'utf8');
  for (const [, script] of html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) {
    const check = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: script, encoding: 'utf8' });
    assert.equal(check.status, 0, `${page}: ${check.stderr}`);
  }
}
console.log('PASS: alternate-style shared project evidence, scoped cards, historical visibility and inline module syntax.');
