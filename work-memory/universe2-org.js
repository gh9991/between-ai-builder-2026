// Organization layout uses only visible contacts and explicit reports_to links.
export function organizationLayout(people, organisations, ids, viewerId, homeOrg, offices = [], projectContext = {}) {
  const known = new Set([viewerId, ...ids]),positions = {},groups = [],reports = [];
  const humans = [...known].filter((id) => people[id] && people[id].kind !== 'agent');
  const internalOrgs = new Set([homeOrg, ...offices.map((o) => o.organisation_id)]);
  const internal = humans.filter((id) => internalOrgs.has(people[id].organisation_id) || people[id].relationship?.type === 'partner_office');
  const internalSet = new Set(internal);
  const depth = (id, seen = new Set()) => {
    const parent = people[id]?.reports_to;
    if (!internalSet.has(parent) || seen.has(parent)) return 0;
    return 1 + depth(parent, new Set([...seen, id]));
  };
  const hierarchy = internal.filter((id) => internalSet.has(people[id].reports_to) || internal.some((other) => people[other].reports_to === id));
  const unplaced = internal.filter((id) => !hierarchy.includes(id));
  let y = 15;
  const levels = [...new Set(hierarchy.map((id) => depth(id)))].sort((a, b) => a - b);
  for (const level of levels) {
    const members = hierarchy.filter((id) => depth(id) === level).sort((a, b) =>
    (people[a].reports_to || '').localeCompare(people[b].reports_to || '') || people[a].name.localeCompare(people[b].name));
    const columns = Math.min(4, members.length);
    members.forEach((id, i) => {positions[id] = [-32 + (i % 4 - (columns - 1) / 2) * 12, y - Math.floor(i / 4) * 6, 0];});
    y -= Math.ceil(members.length / 4) * 6 + 1;
  }
  groups.push({ id: 'internal', name: 'Inside the organisation · reporting lines', subtitle: 'Only known direct reporting lines are drawn', x: -32, y: 22, width: 50, bottom: y + 2, color: '#f4c982' });
  if (unplaced.length) {
    groups.push({ id: 'unplaced', name: 'Other colleagues', subtitle: 'Reporting line not recorded · includes other offices', x: -32, y: y + 1, width: 50, bottom: y - 9, color: '#b49cff' });
    unplaced.forEach((id, i) => {positions[id] = [-32 + (i % 4 - (Math.min(4, unplaced.length) - 1) / 2) * 12, y - 5 - Math.floor(i / 4) * 6, 0];});
    y -= Math.ceil(unplaced.length / 4) * 6 + 6;
  }
  const agents = ids.filter((id) => people[id]?.kind === 'agent');
  if (agents.length) {
    groups.push({ id: 'agents', name: 'AI assistants', subtitle: 'Working alongside the team', x: -32, y: y + 1, width: 50, bottom: y - 7, color: '#4fe3cf' });
    agents.forEach((id, i) => {positions[id] = [-32 + (i - (agents.length - 1) / 2) * 12, y - 4, 0];});
  }
  for (const id of internal) if (internalSet.has(people[id].reports_to)) reports.push([people[id].reports_to, id]);
  const external = humans.filter((id) => !internalSet.has(id));
  const projects = projectContext.projects || [],records = projectContext.records || [];
  const displayedProjects = projects.filter((p) => p.active || projectContext.showHistoricalProjects);
  const displayedIds = new Set(displayedProjects.map((p) => p.id));
  const membership = {},personProjects = {},personColors = {};
  // One position per person. Prefer current work, then the largest known shared record count.
  // This is a placement rule, never a claim that someone belongs to only one project.
  for (const id of external) {
    const counts = new Map();
    for (const r of records) if (r.actor_id === id || (r.participant_ids || []).includes(id))
    counts.set(r.project_id, (counts.get(r.project_id) || 0) + 1);
    const shared = projects.filter((p) => counts.has(p.id)).sort((a, b) =>
    Number(b.active) - Number(a.active) || counts.get(b.id) - counts.get(a.id) || a.id.localeCompare(b.id));
    personProjects[id] = shared;
    const placement = shared.find((p) => displayedIds.has(p.id));
    const key = placement?.id || 'unassigned';
    (membership[key] ||= []).push(id);
    personColors[id] = placement?.color || '#86b6ff';
  }
  // Project visibility is independent of whether any of its people are currently shown.
  const clusters = displayedProjects.slice().sort((a, b) => Number(b.active) - Number(a.active));
  if (membership.unassigned) clusters.push({ id: 'unassigned', name: 'Other outside contacts', status: 'Their project is not shown, or there are no project records yet', color: '#86b6ff' });
  const columns = clusters.length > 6 ? 4 : Math.min(2, clusters.length);
  let top = 22;
  for (let start = 0; start < clusters.length; start += columns) {
    const row = clusters.slice(start, start + columns);
    const radius = Math.max(16, 6 + Math.ceil(Math.max(...row.map((p) => (membership[p.id] || []).length)) / 2) * 3);
    const height = radius * 2 + 6;
    row.forEach((project, col) => {
      const members = (membership[project.id] || []).sort((a, b) => people[a].name.localeCompare(people[b].name));
      const x = 14 + col * 40,bottom = top - height,sphereCenter = [x, top - radius - 5, 0];
      groups.push({ id: 'project:' + project.id, projectId: project.id === 'unassigned' ? null : project.id,
        name: project.name, subtitle: `${project.summary || project.status} · ${members.length} outside ${members.length === 1 ? 'person' : 'people'} shown`,
        x, y: top, width: radius * 2, bottom, color: project.color, cluster: true, members, radius, sphereCenter });
      members.forEach((id, i) => {
        const rowCount = Math.min(2, members.length - Math.floor(i / 2) * 2);
        const rows = Math.ceil(members.length / 2);
        positions[id] = [x + (i % 2 - (rowCount - 1) / 2) * 17, sphereCenter[1] + (rows - 1) * 4 - Math.floor(i / 2) * 8 - 1,
        members.length === 1 ? 2 : [-3, 4, -1, 3, -4, 2][i % 6]];
      });
    });
    top -= height + 5;
  }
  const right = columns ? 14 + (columns - 1) * 40 + 18 : -5,bottom = Math.min(y - 7, top);
  return { positions, groups, reports, personProjects, personColors,
    center: [(-57 + right) / 2, (22 + bottom) / 2 + 4, 0], width: right + 61, height: 22 - bottom + 4 };
}
