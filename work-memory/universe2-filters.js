// Show / hide filters for Universe 2, like the calendar list in macOS Calendar: tick projects and kinds of
// relationship to show them, untick to hide; ⌥-click shows only that one (⌥-click it again to show everything).
// Filters only change what the scene shows and counts — never the data, search or person cards. They are kept per
// viewer and dataset in the browser (and silently skipped when storage is blocked).
export const GROUPS = [
['line', 'My managers', 'var(--uv-line)'],
['team', 'My team', 'var(--uv-team)'],
['dept', 'Other teams', 'var(--uv-dept)'],
['ext', 'Outside organisations', 'var(--uv-ext)'],
['auth', 'Approving bodies', 'var(--uv-auth)'],
['ai', 'AI assistants', 'var(--uv-ai)']];

// Small markers echoing the scene: me = a glowing dot, managers = nested rings, team = a ring, other departments =
// a thin ring, external and authority = solid dots, AI = a diamond.
const MARK = {
  me: () => `<circle cx="7" cy="7" r="6.2" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.2"/><circle cx="7" cy="7" r="3.6" fill="currentColor"/>`,
  line: () => `<circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="7" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  team: () => `<circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="2"/>`,
  dept: () => `<circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1"/>`,
  ext: () => `<circle cx="7" cy="7" r="4.2" fill="currentColor"/>`,
  auth: () => `<circle cx="7" cy="7" r="4.2" fill="currentColor"/>`,
  ai: () => `<rect x="3.6" y="3.6" width="6.8" height="6.8" rx="1" transform="rotate(45 7 7)" fill="currentColor"/>`
};
const mark = (k, c) => `<svg class="uv2-mark" viewBox="0 0 14 14" style="color:${c}" aria-hidden="true">${MARK[k]()}</svg>`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function createFilters(scenario) {
  const key = `between:${scenario}:uv2-filters`;
  let groups = new Set(),projects = new Set(); // hidden ones
  try {const s = JSON.parse(localStorage.getItem(key) || '{}');groups = new Set(s.groups || []);projects = new Set(s.projects || []);} catch {/* defaults */}
  const save = () => {try {localStorage.setItem(key, JSON.stringify({ groups: [...groups], projects: [...projects] }));} catch {/* not kept */}};
  // ⌥-click: show only this one; if it already is the only one shown, show everything again
  const toggle = (set, id, solo, all) => {
    if (!solo) {set.has(id) ? set.delete(id) : set.add(id);return set;}
    const onlyThis = all.every((x) => x === id ? !set.has(x) : set.has(x));
    return onlyThis ? new Set() : new Set(all.filter((x) => x !== id));
  };
  return {
    groupHidden: (g) => groups.has(g),
    projectHidden: (id) => projects.has(id),
    anyProjectHidden: () => projects.size > 0,
    active: () => groups.size + projects.size > 0,
    toggleGroup(g, solo) {groups = toggle(groups, g, solo, GROUPS.map((x) => x[0]));save();},
    toggleProject(id, solo, all) {projects = toggle(projects, id, solo, all);save();},
    clear() {groups.clear();projects.clear();save();}
  };
}

// The relationship legend as a list of tick boxes, with how many people of each kind are known on the date.
export function groupFilterHTML(filters, counts) {
  return `<span class="uv2-filter-row fixed" title="The whole world is centred on you, so this is always shown"><i class="uv2-check on" style="--c:var(--uv-me)" aria-hidden="true"></i>${mark('me', 'var(--uv-me)')}<span>Me, at the centre</span></span>` +
  GROUPS.map(([g, label, color]) => {
    const on = !filters.groupHidden(g);
    return `<button class="uv2-filter-row" role="checkbox" aria-checked="${on}" data-group="${g}" title="Click to show or hide · ⌥-click to show only this kind"><i class="uv2-check${on ? ' on' : ''}" style="--c:${color}" aria-hidden="true"></i>${mark(g, color)}<span>${esc(label)}</span><em>${counts[g] || 0}</em></button>`;
  }).join('');
}
