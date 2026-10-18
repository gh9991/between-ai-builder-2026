import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { officeFor, officeLayout, externalProjectLayout } from './office-layout.js';

const data = JSON.parse(readFileSync(new URL('./data/scenarios/architect/worklife.json', import.meta.url)));
const config = JSON.parse(readFileSync(new URL('./data/scenarios/architect/scenario.json', import.meta.url)));
const plan = officeLayout(data.people, config.persona_id, config.offices);
const ids = (office) => data.people.filter((p) => officeFor(p, config.offices)?.id === office).map((p) => p.id);
assert.equal(ids('south').length, 16); // Grace and 15 contacts
assert.deepEqual(ids('north'), ['ava']);
assert.equal(ids('hong_kong').length, 3);
assert.equal(Object.keys(plan.positions).length, 50);
const external = externalProjectLayout(data.people, data.records, config.offices, config.persona_id, config.daily_project_id);
const combined = { ...plan.positions, ...external.positions };
assert.equal(new Set(Object.values(combined).map((p) => p.join(','))).size, 50);
assert.ok(external.groups.length > 3);
for (const [id, pid] of Object.entries(external.membership)) {
  assert.ok(data.records.some((r) => r.project_id === pid && r.participant_ids.includes(id) && !['calendar', 'journal', 'weekly_report'].includes(r.kind)));
  assert.equal(plan.membership[id], undefined);
}
const school = externalProjectLayout(data.people, data.records, config.offices, config.persona_id, config.daily_project_id, 'lakeside');
assert.deepEqual(school.groups.map((g) => g.id), ['lakeside']);
assert.ok(school.groups[0].people.includes('daniel_o'));
assert.ok(!school.groups[0].people.includes('claire'));
const start = externalProjectLayout(data.people, data.records.filter((r) => r.first_seen_at <= '2025-10-01T23:59:59+08:00'), config.offices, config.persona_id, config.daily_project_id);
assert.equal(start.groups.length, 0);
const northgate = externalProjectLayout(data.people, data.records, config.offices, config.persona_id, config.daily_project_id, 'northgate');
assert.equal(northgate.membership.daniel_o, 'northgate');
assert.equal(school.membership.daniel_o, 'lakeside');
for (const person of data.people) {
  if (person.kind === 'agent') assert.equal(officeFor(person, config.offices), null);
  const office = officeFor(person, config.offices);
  if (!office || person.id === config.persona_id) continue;
  const [x,, z] = plan.positions[person.id];
  assert.ok(Math.abs(x - office.center[0]) < office.size[0] / 2);
  assert.ok(Math.abs(z - office.center[1]) < office.size[1] / 2);
}
assert.equal(officeFor({ organisation_id: 'axis', office: 'south' }, config.offices), null);
assert.equal(officeFor({ organisation_id: 'meridian', office: 'unknown' }, config.offices), null);
assert.equal(officeFor({ organisation_id: 'meridian' }), null);
console.log('Office membership, separate seats, room bounds and external/agent exclusions passed.');
