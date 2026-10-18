import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadBetween } from './between-data.js';
import { createProjectTeams, projectTeamLayout, projectTeamMarkup } from './project-team.js';
globalThis.location = { search: '' };
globalThis.fetch = async (url) => ({ json: async () => JSON.parse(await readFile(url, 'utf8')) });
for (const scenario of ['architect']) {
  const d = await loadBetween(scenario, { allProjects: true }),teams = createProjectTeams(d);
  for (const p of Object.values(d.PROJ)) {
    for (const day of [...new Set([1, p.start, Math.min(d.days, p.start + 30), d.days])]) {
      const team = teams.team(p.id, day),layout = projectTeamLayout(team);
      const actual = new Set(d.W.records.filter((r) => r.project_id === p.id && r.first_seen_at <= d.W.snapshots[day - 1].as_of && !['calendar', 'journal', 'weekly_report'].includes(r.kind)).flatMap((r) => r.participant_ids));
      for (const member of team.members) assert(actual.has(member.id), 'No future or unrelated participants');
      const grouped = team.groups.flatMap((g) => g.organisations.flatMap((o) => o.members.map((m) => m.id)));
      assert.deepEqual(new Set(grouped), team.ids);
      assert.equal(grouped.length, team.members.length, 'Each person appears once');
      assert.deepEqual(new Set(Object.keys(layout.positions)), team.ids, 'Every member is in the focus arrangement');
      for (const [x, y, z] of Object.values(layout.positions)) assert(Math.hypot(x, y, z) < layout.radius);
    }
  }
  if (scenario === 'architect') {
    const cafe = teams.team('corner_cafe', d.days);
    assert.equal(cafe.members.length, 7);
    assert(cafe.ids.has('grace'));
    assert.equal(cafe.groups[0].organisations.flatMap((o) => o.members).length, 4);
    assert.equal(cafe.groups[1].organisations.length, 3);
    assert.equal(new Set(cafe.members.map((p) => p.org.color)).size, 4);
    assert.equal(teams.team('corner_cafe', 1).members.length, 0);
    assert.equal(teams.organisation('meridian_hk').internal, true);
    const hk = teams.team('hk_tower', d.days);
    assert(hk.groups[0].organisations.some((o) => o.id === 'meridian_hk' && o.members.length === 3));
    const hospital = teams.team('westpark_hospital', d.days);
    assert.equal(hospital.members.length, 12);
    assert.equal(hospital.members.filter((p) => p.ai).length, 1);
    assert(projectTeamMarkup(hospital).includes('Scribe · AI'));
    assert(!cafe.ids.has('scribe'));
    assert.equal(teams.organisation('meridian').color, cafe.members.find((p) => p.self).org.color);
  }
}
console.log('PASS: dated project rosters include me, separate internal/external organisations (including HK), identify AI and fit every member in the temporary layout.');
