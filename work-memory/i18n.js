// English display helpers for the competition release.
export const LANG = 'en';
export const EN = true;
export const t = (_unused, english) => english;

// ---- dates (ISO strings, read as calendar dates, never shifted by the viewer's time zone) ----
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ymd = iso => [+iso.slice(0, 4), +iso.slice(5, 7), +iso.slice(8, 10)];
const weekdayOf = iso => new Date(iso.slice(0, 10) + 'T00:00:00Z').getUTCDay();
/** "30 Sep" */
export const dayMonth = iso => { const [, m, d] = ymd(iso); return `${d} ${MONTHS[m - 1]}`; };
/** "Wed 30 Sep" */
export const weekdayDate = iso => `${WEEKDAYS[weekdayOf(iso)]} ${dayMonth(iso)}`;
/** "30 Sep 2026" */
export const fullDate = iso => `${dayMonth(iso)} ${iso.slice(0, 4)}`;
/** "Sep 2026" */
export const monthYear = iso => `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
export const weekdayName = iso => WEEKDAYS[weekdayOf(iso)];
/** "1 item" / "3 items" */
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// Normalize legacy display-field aliases. All retained values are English.
const KIND_EN = {email: 'Email', chat: 'Chat', meeting: 'Meeting', document: 'File', task_update: 'Task', journal: 'Work note', weekly_report: 'Weekly report', calendar: 'Calendar', note: 'Assistant note'};
const RELATIONSHIP_EN = {self: 'Me', manager: 'Line manager', skip_manager: 'Manager’s manager', assistant: 'AI assistant', junior: 'Assistant', peer: 'Peer', colleague: 'Colleague', client: 'Client', client_pm: 'Client contact', contractor: 'Builder', authority: 'Permit officer', consultant: 'Consultant', engineer: 'Engineer'};
const periodEn = label => String(label || '').replace(/(\d{4})\/(\d{1,2})/g, (_, y, m) => `${MONTHS[+m - 1]} ${y}`);
const done = new WeakSet();

export function localizeScenario(scenario) {
  if (!EN || !scenario || done.has(scenario)) return scenario;
  done.add(scenario);
  const {config: C = {}, data: W = {}, stories} = scenario;
  const zhStages = C.stages || [];
  // config
  if (C.title_en) C.title = C.title_en;
  if (C.persona_role_label_en) C.persona_role_label = C.persona_role_label_en;
  C.period_label = C.period_label_en || periodEn(C.period_label);
  C.kind_labels = {...KIND_EN, ...(C.kind_labels_en || {})};
  if (C.status_labels_en) C.status_labels = {...C.status_labels, ...C.status_labels_en};
  if (C.stages_en) C.stages = C.stages_en;
  for (const p of Object.values(C.projects || {})) { if (p.short_en) p.short = p.short_en; if (p.goal_en) p.goal = p.goal_en; }
  for (const [type, l] of Object.entries(C.relationship_labels || {})) l.zh = l.en || RELATIONSHIP_EN[type] || l.zh;
  for (const d of C.special_days || []) if (d.label_en) d.label = d.label_en;
  for (const m of C.month_markers || []) m.label = m.label_en || monthYear(m.date);
  if (C.about_en) C.about = C.about_en;
  for (const o of C.offices || []) { if (o.label_en) o.label = o.label_en; if (o.city_en) o.city = o.city_en; }
  // data
  const relEn = r => r && (r.label_en || C.relationship_labels?.[r.type]?.en || RELATIONSHIP_EN[r.type] || r.label_zh);
  const person = p => {
    if (!p) return;
    if ('name_zh' in p) p.name_zh = p.name;
    if ('role_zh' in p) p.role_zh = p.role || p.role_zh;
    if (p.relationship) p.relationship.label_zh = relEn(p.relationship);
  };
  person(W.manifest?.persona);
  (W.people || []).forEach(person);
  for (const p of W.projects || []) {
    if ('name_zh' in p) p.name_zh = p.name;
    if (p.plain_en) p.plain_zh = p.plain_en;
    for (const ph of p.phases || []) { if (ph.label_en) ph.label_zh = ph.label_en; if (ph.plain_en) ph.plain_zh = ph.plain_en; }
  }
  for (const m of W.milestones || []) { if (m.title_en) m.title_zh = m.title_en; if (m.plain_en) m.plain_zh = m.plain_en; }
  for (const s of W.snapshots || []) {
    (s.connections?.nodes || []).forEach(person);
    for (const ps of s.desk?.project_states || []) if ('name_zh' in ps) ps.name_zh = ps.name;
  }
  for (const e of stories || []) {
    if (e.title_en) e.title_zh = e.title_en;
    const i = zhStages.indexOf(e.stage);
    if (i >= 0 && C.stages_en?.[i]) e.stage = C.stages_en[i];
  }
  return scenario;
}
