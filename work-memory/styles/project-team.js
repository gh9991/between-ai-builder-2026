// Project membership is evidence-based and dated; visual placement never creates membership.
import { EN, t as tr } from '../i18n.js';
export function createProjectTeams(D) {
  const internal = new Set([D.C.home_org_id, ...(D.C.offices || []).map((o) => o.organisation_id)]);
  const orgs = new Map(D.W.organisations.map((o, i) => {
    // A stable categorical palette: the source's earth tones are too similar for team identification.
    // Keyed by the full scenario organisation order, never by the current project or date.
    return [o.id, { ...o, internal: internal.has(o.id), color: `hsl(${Math.round((35 + i * 137.508) % 360)}, 62%, 67%)` }];
  }));
  const cache = new Map();
  function organisation(id) {
    return orgs.get(id) || { id, name: 'Organisation not recorded', color: '#93a0b5', internal: false };
  }
  function team(projectId, day) {
    const key = `${projectId}:${day}`;
    if (cache.has(key)) return cache.get(key);
    const contacts = [{ id: D.persona.id, n: D.persona.name, self: true }, ...D.P];
    const members = contacts.filter((p) => D.sharedRecords(p.id, day, projectId).length).map((p) => {
      const raw = D.people[p.id],org = organisation(raw.organisation_id);
      return { ...p, org, ai: raw.kind === 'agent' };
    });
    const groups = ['internal', 'external'].map((side) => ({
      id: side, title: side === 'internal' ? 'Inside the organisation' : 'Outside the organisation',
      organisations: [...orgs.values()].filter((o) => o.internal === (side === 'internal')).map((org) => ({
        ...org, members: members.filter((p) => p.org.id === org.id)
      })).filter((o) => o.members.length)
    }));
    const result = { members, ids: new Set(members.map((p) => p.id)), groups };
    cache.set(key, result);
    return result;
  }
  return { team, organisation };
}

// Temporary project meeting layout: internal team left, external partners right,
// me at my desk in front of the model. Does not overwrite the overview layout.
export function projectTeamLayout(team) {
  const positions = {};
  for (const group of team.groups) {
    const members = group.organisations.flatMap((o) => o.members).filter((p) => !p.self);
    const rows = Math.ceil(members.length / 2);
    members.forEach((p, i) => {
      positions[p.id] = [(group.id === 'internal' ? -1 : 1) * (3.7 + i % 2 * 2.7), 0, (Math.floor(i / 2) - (rows - 1) / 2) * 3.1];
    });
  }
  const self = team.members.find((p) => p.self);
  if (self) positions[self.id] = [0, 0, 3.4];
  const radius = Math.max(6, ...Object.values(positions).map(([x,, z]) => Math.hypot(x, z) + 1.5));
  return { positions, model: [0, 1.2, -2.4], radius };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function projectTeamMarkup(team) {
  return team.groups.map((g) => {
    const members = g.organisations.flatMap((o) => o.members);
    const people = members.filter((p) => !p.ai).length,agents = members.filter((p) => p.ai).length;
    return `<div class="team-category" data-team-category="${g.id}"><h4>${g.title}<small>${`${people} ${people === 1 ? 'person' : 'people'}`}${agents ? ` · ${agents} AI` : ''}</small></h4>${g.organisations.map((o) => `<div class="team-org" style="--org-color:${o.color}" data-org="${esc(o.id)}"><div class="team-org-name"><i></i>${esc(o.name)}</div><div class="badges">${o.members.map((p) => p.self ? `<span class="badge team-member" data-member="${esc(p.id)}">${esc(p.n)} · ${'me'}</span>` : `<button class="badge team-member" data-member="${esc(p.id)}" data-pick="${esc(p.id)}">${esc(p.n)}${p.ai ? ' · AI' : ''}</button>`).join('')}</div></div>`).join('') || `<div class="meta">${'No known people at this date'}</div>`}</div>`;
  }).join('');
}
