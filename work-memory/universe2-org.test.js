import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { organizationLayout } from './universe2-org.js';
import { projectsAt } from './universe2-project-data.js';
import { historicalPeopleAt } from './universe2-people.js';
const read = (n) => JSON.parse(readFileSync(new URL(`./data/scenarios/architect/${n}.json`, import.meta.url)));
const data = read('worklife'),config = read('scenario');
const people = Object.fromEntries(data.people.map((p) => [p.id, p])),orgs = Object.fromEntries(data.organisations.map((o) => [o.id, o]));
for (const snapshot of data.snapshots) for (const history of [true, false]) for (const projectHistory of [true, false]) {
  const hidden = historicalPeopleAt(data, config, snapshot);
  const ids = snapshot.connections.nodes.map((n) => n.person_id).filter((id) => history || !hidden.has(id));
  const layout = organizationLayout(people, orgs, ids, config.persona_id, config.home_org_id, config.offices, { showHistoricalProjects: projectHistory, projects: projectsAt(data, config, snapshot), records: data.records.filter((r) => r.first_seen_at <= snapshot.as_of) });
  assert.deepEqual(layout.groups.filter((g) => g.projectId).map((g) => g.projectId).sort(), projectsAt(data, config, snapshot).filter((p) => p.active || projectHistory).map((p) => p.id).sort(), 'Project switch alone determines project clusters, even without visible members');
  assert.deepEqual(Object.keys(layout.positions).sort(), [...new Set([config.persona_id, ...ids])].sort());
  for (const [parent, child] of layout.reports) {
    assert.equal(people[child].reports_to, parent, 'Only actual direct reports get a line');
    assert(layout.positions[parent][1] > layout.positions[child][1], 'Managers appear above reports');
  }
  const points = Object.values(layout.positions);
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) assert(Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]) >= 4.4, 'No stacked people');
  for (const group of layout.groups.filter((g) => g.projectId)) for (const id of group.members) {
    assert(data.records.some((r) => r.project_id === group.projectId && r.first_seen_at <= snapshot.as_of && (r.actor_id === id || r.participant_ids?.includes(id))), 'Project placement needs dated participation evidence');
    assert.equal(layout.personColors[id], group.color);
    const position = layout.positions[id];
    assert(Math.hypot(...position.map((v, i) => v - group.sphereCenter[i])) < group.radius, 'Members stay inside their spherical project cluster');
    assert.equal(layout.personProjects[id][0].id, group.projectId);
    if (layout.personProjects[id].some((p) => p.active)) assert(layout.personProjects[id][0].active, 'Prefer current project over archived work');
  }
  assert(!layout.groups.some((g) => g.id === 'meridian_hk'), 'Hong Kong office is internal');
}
const first = organizationLayout(people, orgs, data.snapshots[0].connections.nodes.map((n) => n.person_id), 'grace', 'meridian', config.offices);
assert(!first.positions.robert, 'Future contact never gets a position');
console.log('PASS: org placement across 365 days and all four independent history settings, exact reporting edges, known membership, internal offices, non-overlapping positions.');

const syntheticPeople = { me: { name: 'Me', organisation_id: 'home' }, x: { name: 'X', organisation_id: 'ext' } };
const syntheticProjects = [{ id: 'old', name: 'Old', active: false, color: '#123456' }, { id: 'now', name: 'Now', active: true, color: '#654321' }];
const synthetic = organizationLayout(syntheticPeople, {}, ['x'], 'me', 'home', [], { projects: syntheticProjects, records: [
  { project_id: 'old', participant_ids: ['x'] }, { project_id: 'old', actor_id: 'x' }, { project_id: 'now', actor_id: 'x' }] });
assert.equal(synthetic.personProjects.x[0].id, 'now');
assert.equal(synthetic.personProjects.x.length, 2, 'Cross-project membership retained without duplicating the person');
assert.equal(synthetic.groups.filter((g) => g.cluster).length, 1);

for (const showPeople of [false, true]) for (const showProjects of [false, true]) {
  const layout = organizationLayout(syntheticPeople, {}, showPeople ? ['x'] : [], 'me', 'home', [], {
    projects: [syntheticProjects[0]], records: [{ project_id: 'old', actor_id: 'x' }], showHistoricalProjects: showProjects });
  assert.equal(!!layout.positions.x, showPeople, 'Project switch must not reveal hidden people');
  assert.equal(layout.groups.some((g) => g.projectId === 'old'), showProjects, 'People switch must not reveal hidden projects');
  if (showPeople && !showProjects) assert(layout.groups.find((g) => g.id === 'project:unassigned').members.includes('x'), 'Historical contacts remain accessible without expanding their projects');
}
console.log('PASS: independent history switches, empty historical clusters, and historical contacts with projects hidden.');
