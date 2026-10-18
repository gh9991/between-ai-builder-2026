// Symbolic home-office membership. Never infer a location from project participation.
export function officeFor(person, offices = []) {
  if (person.kind === 'agent') return null;
  return offices.find((o) => person.organisation_id === o.organisation_id && (
  !o.office || person.office === o.office)) || null;
}

export function officeLayout(people, personaId, offices) {
  const positions = {},membership = {};
  for (const office of offices) {
    const members = people.filter((p) => p.id !== personaId && officeFor(p, offices)?.id === office.id);
    members.forEach((p, i) => {
      const col = i % office.columns,row = Math.floor(i / office.columns);
      positions[p.id] = [office.center[0] + (col - (office.columns - 1) / 2) * 2.8,
      .1, office.center[1] - office.size[1] / 2 + 2.6 + row * 3.1];
      membership[p.id] = office.id;
    });
  }
  let agent = 0;
  for (const p of people) {
    if (p.id === personaId || positions[p.id]) continue;
    if (p.kind === 'agent') positions[p.id] = [-4.5 + agent++ * 4.5, .15, 3.4];else
    positions[p.id] = [0, .15, 7]; // Positioned from known project evidence on each refresh.
  }
  return { positions, membership };
}

// `records` must contain only sources known at the viewed date. A shared consultant is
// drawn once: under their most represented known project, or the selected project.
export function externalProjectLayout(people, records, offices, personaId, dailyProject, selectedProject = null) {
  const external = people.filter((p) => p.id !== personaId && p.kind !== 'agent' && !officeFor(p, offices));
  const counts = new Map(external.map((p) => [p.id, new Map()]));
  for (const r of records) {
    if (['calendar', 'journal', 'weekly_report'].includes(r.kind) || !r.project_id) continue;
    for (const id of new Set(r.participant_ids)) {
      const projects = counts.get(id);
      if (projects) projects.set(r.project_id, (projects.get(r.project_id) || 0) + 1);
    }
  }
  const groups = new Map(),positions = {},membership = {};
  for (const p of external) {
    const known = [...counts.get(p.id)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const project = selectedProject ?
    counts.get(p.id).has(selectedProject) ? selectedProject : null :
    (known.find(([id]) => id !== dailyProject) || known[0])?.[0];
    if (!project) continue;
    if (!groups.has(project)) groups.set(project, { id: project, people: [] });
    groups.get(project).people.push(p.id);
    membership[p.id] = project;
  }
  const ordered = [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
  const columns = Math.min(4, ordered.length);
  ordered.forEach((group, i) => {
    group.center = [(i % columns - (columns - 1) / 2) * 12, 10 + Math.floor(i / columns) * 9];
    const rows = Math.ceil(group.people.length / 3);
    group.depth = Math.max(5, rows * 2.6 + 2);
    group.people.forEach((id, j) => {
      const rowCount = Math.min(3, group.people.length - Math.floor(j / 3) * 3);
      positions[id] = [group.center[0] + (j % 3 - (rowCount - 1) / 2) * 3.2,
      .15, group.center[1] + Math.floor(j / 3) * 2.6];
    });
  });
  return { groups: ordered, positions, membership };
}
