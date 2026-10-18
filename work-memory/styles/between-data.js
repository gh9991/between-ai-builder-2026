// Shared data adapter for the design-style pages in work-memory/styles/.
// Every style page keeps its own look; this module turns the one scenario dataset (architect by default) into the
// shapes those pages were designed around: people with orbit/sector hints, three project "slots", person cards,
// drafts, orbiting work units, today's desk, notes and project states. Change the data → every style follows.
import { EN, t as tr, dayMonth, fullDate, MONTHS_LONG, localizeScenario } from '../i18n.js';
import { loadReleaseArchive } from '../archive-loader.js';
const SLOTS = ['mall', 'tower', 'school'];
const SLOT_COLORS = { mall: 0xF2A65A, tower: 0x6EA8FF, school: 0x5ED3A0 };

export async function loadBetween(scenario = new URLSearchParams(location.search).get('scenario') || 'architect', { allProjects = false } = {}) {
  const base = new URL(`../data/scenarios/${scenario}/`, import.meta.url);
  const archive = scenario === 'architect' ? await loadReleaseArchive() : null;
  const [W, C] = archive ? [structuredClone(archive.data), structuredClone(archive.config)] : await Promise.all([fetch(new URL('worklife.json', base)).then((r) => r.json()), fetch(new URL('scenario.json', base)).then((r) => r.json())]);
  // English pages (?lang=en) read the dataset's English fields; the scenario's stories are not loaded here.
  localizeScenario({ config: C, data: W });
  const PERSONA_ID = C.persona_id,HOME = C.home_org_id,DAILY = C.daily_project_id;
  const snap = W.snapshots.find((s) => s.date === W.manifest?.default_snapshot) || W.snapshots.at(-1);
  const asOf = snap.as_of,day0 = new Date(W.snapshots[0].date + 'T00:00:00Z');
  const dayIndex = (iso) => Math.floor((new Date(iso.slice(0, 10) + 'T00:00:00Z') - day0) / 864e5) + 1;
  const people = Object.fromEntries(W.people.map((p) => [p.id, p])),records = Object.fromEntries(W.records.map((r) => [r.id, r]));
  const visible = W.records.filter((r) => r.first_seen_at <= asOf),visibleIds = new Set(visible.map((r) => r.id));
  const units = (W.work_units || []).filter((u) => visibleIds.has(u.record_id));
  const statusAt = (u) => (u.status_history || []).filter((h) => h.at <= asOf).at(-1)?.status || null;
  const persona = people[PERSONA_ID],manager = persona?.reports_to,skip = manager && people[manager]?.reports_to;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const dd = (iso) => iso ? dayMonth(iso) : '';
  const status = (k) => C.status_labels?.[k] || k;
  const channel = (r) => r.kind === 'email' ? 'Email' : r.kind === 'meeting' ? 'Meeting' : r.kind === 'document' ? 'File' : r.kind === 'task_update' ? 'Task' : r.source_system === 'assistant' ? 'AI assistant' : r.kind === 'chat' ? 'Teams' : r.kind;
  const smallOnly = (() => {const m = new Map();for (const u of W.work_units || []) (m.get(u.record_id) || m.set(u.record_id, []).get(u.record_id)).push(u);return (r) => {const us = m.get(r.id);return !!us?.length && us.every((u) => u.type === 'small_talk');};})();

  // One evidence boundary for all alternate styles. day is one-based, as in their timelines.
  function context(projectId = null, day = W.snapshots.length) {
    const snap = W.snapshots[Math.max(0, Math.min(W.snapshots.length - 1, day - 1))];
    const known = new Set(W.records.filter((r) => r.first_seen_at <= snap.as_of).map((r) => r.id));
    const visible = W.records.filter((r) => known.has(r.id) && (!projectId || r.project_id === projectId) && !smallOnly(r));
    const units = (W.work_units || []).filter((u) => known.has(u.record_id) && u.type !== 'small_talk' && (!projectId || u.project_id === projectId));
    const statusAt = (u) => (u.status_history || []).filter((h) => h.at <= snap.as_of && (h.evidence_ids || []).every((id) => known.has(id))).at(-1)?.status || null;
    const tasks = snap.task_states.filter((t) => (!projectId || t.project_id === projectId) && t.source_ids?.some((id) => known.has(id)));
    return { snap: { ...snap, task_states: tasks }, visible, units, statusAt };
  }
  function sharedRecords(id, day = W.snapshots.length, projectId = null) {
    return context(projectId, day).visible.filter((r) => r.participant_ids.includes(id) && !['calendar', 'journal', 'weekly_report'].includes(r.kind));
  }
  function sharedProjects(id, day = W.snapshots.length) {
    const counts = {};
    for (const r of sharedRecords(id, day)) if (r.project_id) counts[r.project_id] = (counts[r.project_id] || 0) + 1;
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  }
  function defaultProject(id, preferred = null, day = W.snapshots.length) {
    const projects = sharedProjects(id, day),focus = context(null, day).snap.desk.focus_project_id;
    return [preferred, focus, ...projects].find((pid) => projects.includes(pid)) || null;
  }

  // ---- projects → slots ----
  // The three project slots the 3D styles draw: projects not closed on the default day, most recent shared activity first
  // Legacy pages retain their three slots. Worlds opts into allProjects so replay includes retired work.
  const openNow = new Set((snap.desk.project_states || []).filter((s) => s.status !== 'closed').map((s) => s.id));
  const projRecent = Object.fromEntries(W.projects.map((p) => [p.id, W.records.filter((r) => r.project_id === p.id && r.first_seen_at <= asOf && (new Date(asOf) - new Date(r.first_seen_at)) / 864e5 < 60).length]));
  const recentProjects = W.projects.filter((p) => p.id !== DAILY && p.status !== 'closed' && (!snap.desk.project_states?.length || openNow.has(p.id))).
  sort((a, b) => projRecent[b.id] - projRecent[a.id] || W.projects.indexOf(a) - W.projects.indexOf(b)).slice(0, 3);
  const projList = allProjects ? [...recentProjects, ...W.projects.filter((p) => p.id !== DAILY && !recentProjects.includes(p))] : recentProjects;
  const slotFor = (i) => SLOTS[i] || `project_${i}`;
  const slotOf = Object.fromEntries(projList.map((p, i) => [p.id, slotFor(i)]));
  const angles = [Math.PI, Math.PI * 1.5, 0];
  for (let i = 1; angles.length < projList.length; i++) {
    const a = i * Math.PI * 2 / Math.max(4, projList.length);
    if (!angles.some((v) => Math.abs(v - a) < .001)) angles.push(a);
  }
  const PROJ = {};
  const previewModels = new URLSearchParams(location.search).get('models')?.split(','); // e.g. ?models=chat,document,chip to preview models
  projList.forEach((p, i) => {
    const slot = slotFor(i),cfg = C.projects?.[p.id] || {},st = snap.desk.project_states.find((s) => s.id === p.id);
    const phases = p.phases || [],curPhase = st?.phase || p.phase,now = Math.max(0, phases.findIndex((ph) => ph.id === curPhase));
    const firstRec = W.records.filter((r) => r.project_id === p.id).sort((a, b) => a.first_seen_at.localeCompare(b.first_seen_at))[0];
    const hex = cfg.color ? parseInt(cfg.color, 16) : SLOT_COLORS[slot] || 0x829b83;
    const orbit = { r: [8.2, 11.2, 14][i] ?? 8.2 + i * 2.9, a0: [2.5, 4.5, .6][i] ?? angles[i], speed: [.010, .007, .005][i] ?? .01 / (1 + i * .4) };
    PROJ[slot] = { id: p.id, slot, name: cfg.short ? `${cfg.short}` : p.name_zh || p.name, short: cfg.short || p.name_zh || p.name, color: hex, hex, day: hex, css: '#' + hex.toString(16).padStart(6, '0'),
      start: firstRec ? dayIndex(firstRec.first_seen_at) : 1, progress: phases.length ? (now + 1) / phases.length : .5, status: status(st?.status || p.status),
      steps: phases.map((ph) => ph.label_zh || ph.label_en || ph.id), now, massing: previewModels?.[i] || cfg.model || slot, angle: angles[i],
      ...orbit, solar: orbit };
  });

  // A project's shape is stable, but visibility, phase and status belong to the viewed day.
  // Use snapshot knowledge, never the project's final status or promised completion date.
  function projectAt(slot, day = W.snapshots.length) {
    const p = PROJ[slot];
    if (!p) return null;
    const at = W.snapshots[Math.max(0, Math.min(W.snapshots.length - 1, day - 1))];
    const state = at.desk.project_states.find((s) => s.id === p.id);
    if (!state || day < p.start) return null;
    const raw = W.projects.find((x) => x.id === p.id);
    const now = Math.max(0, (raw.phases || []).findIndex((ph) => ph.id === state.phase));
    return { ...p, status: status(state.status), state: state.status, now,
      progress: p.steps.length ? (now + 1) / p.steps.length : .5,
      active: !['closed', 'completed', 'handed_back', 'on_hold'].includes(state.status) };
  }

  // Full history changes display eligibility, never the dated lifecycle state.
  function projectVisible(slot, day = W.snapshots.length, fullHistory = false) {
    const project = projectAt(slot, day);
    return !!project && (fullHistory || project.active);
  }

  // ---- people ----
  const nodes = snap.connections.nodes.filter((n) => people[n.person_id] && n.person_id !== PERSONA_ID);
  const countOf = (n) => n.signals?.by_channel ? Object.values(n.signals.by_channel).reduce((a, b) => a + b, 0) : visible.filter((r) => r.participant_ids.includes(n.person_id)).length;
  const byProject = (id) => {const c = {};for (const r of visible) if (r.participant_ids.includes(id) || r.actor_id === id) c[r.project_id] = (c[r.project_id] || 0) + 1;return Object.entries(c).filter(([pid]) => slotOf[pid]).sort((a, b) => b[1] - a[1]);};
  const humans = nodes.filter((n) => people[n.person_id].kind !== 'agent').map((n) => ({ id: n.person_id, c: countOf(n) })).sort((a, b) => b.c - a.c);
  const tierOf = (id) => {const i = humans.findIndex((h) => h.id === id);return i < 2 ? 0 : i < 5 ? 1 : i < 11 ? 2 : 3;};
  const insight = (id) => insightFor(id);
  const scores = Object.fromEntries(nodes.map((n) => [n.person_id, insight(n.person_id).score]));
  const topAlert = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0];
  const recentCount = (id) => visible.filter((r) => r.participant_ids.includes(id) && (new Date(asOf) - new Date(r.first_seen_at)) / 864e5 < 2 && !smallOnly(r)).length;
  const P = [];
  const sunIdx = {},moonIdx = {};
  for (const n of nodes) {
    const p = people[n.person_id],type = p.kind === 'agent' ? 'agent' : p.relationship?.type || 'colleague';
    const cat = p.kind === 'agent' ? 'ai' : type === 'authority' ? 'authority' : p.organisation_id === HOME ? 'studio' : 'external';
    const bp = byProject(p.id),primary = bp[0]?.[0],second = bp[1];
    const tier = p.kind === 'agent' ? -1 : type === 'authority' ? 3 : tierOf(p.id);
    const bridge = !allProjects && cat === 'external' && second && second[1] >= .35 * bp[0][1];
    const home = cat === 'ai' ? 'studio' : cat === 'studio' && (tier <= 1 || !primary) ? 'studio' : bridge ? 'bridge' : slotOf[primary] || 'studio';
    let solar;
    if (cat === 'ai') {const k = (sunIdx.ai = (sunIdx.ai || 0) + 1) - 1;solar = { orbit: 'ai', a0: k * 2.1 };} else
    if (home === 'studio') {const k = (sunIdx.s = (sunIdx.s || 0) + 1) - 1;solar = { orbit: 'sun', r: 3.1 + k * .55 + (tier > 1 ? 1.2 : 0), a0: .5 + k * 1.6 };} else
    if (home === 'bridge') solar = { orbit: 'comet' };else
    {const k = (moonIdx[home] = (moonIdx[home] || 0) + 1) - 1;solar = { orbit: home, r: 1.6 + k * .45, a0: k * 2.1 };}
    const sc = scores[p.id],nc = recentCount(p.id);
    P.push({ id: p.id, n: p.name, role: p.role_zh || p.role, rel: p.relationship?.label_zh || (cat === 'studio' ? 'Colleague' : ''), type, tier, cat, home, lens: slotOf[primary] || 'mall',
      first: Math.max(1, dayIndex(n.first_observed_at)), attn: p.id === topAlert && sc > 0 ? 'flare' : sc >= 2 ? 'warn' : nc ? 'new' : undefined, newc: nc || undefined,
      count: countOf(n), solar, orbit: solar.orbit, r: solar.r, a0: solar.a0, org: p.organisation_id });
  }

  // ---- the person card , in the class names the style pages share ----
  function insightFor(id, projectId = null, day = W.snapshots.length) {
    const { snap, visible, units, statusAt } = context(projectId, day);
    const name = people[id].name.split(' ')[0];
    const mine = snap.task_states.filter((t) => t.owner_id === PERSONA_ID && t.counterparty_id === id && t.status !== 'completed');
    const theirs = snap.task_states.filter((t) => t.owner_id === id && t.counterparty_id === PERSONA_ID && t.status !== 'completed');
    const groups = {};for (const u of units) if (u.type === 'feedback' && u.from_id === id) (groups[u.group_id || u.id] ||= []).push(u);
    const fb = Object.values(groups).sort((a, b) => records[b[0].record_id].occurred_at.localeCompare(records[a[0].record_id].occurred_at))[0];
    const question = units.filter((u) => u.type === 'question' && u.from_id === id && statusAt(u) === 'open').at(-1);
    const late = units.filter((u) => u.type === 'promise' && u.from_id === id && statusAt(u) === 'late').at(-1);
    const found = units.filter((u) => u.type === 'update' && u.from_id === id && ['open', 'likely_addressed'].includes(statusAt(u))).slice(-2);
    const updates = units.filter((u) => (u.type === 'update' || u.type === 'file_pointer') && u.from_id === id).slice(-2);
    const openFb = fb ? fb.filter((u) => statusAt(u) === 'open').length : 0;
    return { name, mine, theirs, fb, question, late, found, updates, openFb, score: (question ? 3 : 0) + openFb + (mine.some((t) => t.overdue) ? 2 : mine.length ? 1 : 0) + (late ? 1 : 0) };
  }
  const blk = (title, n, inner) => `<section class="blk"><h3>${title}${n ? `<span class="n">${n}</span>` : ''}</h3>${inner}</section>`;
  function card(id, projectId = null, day = W.snapshots.length, { compactLedger = false } = {}) {
    const { snap, visible, statusAt } = context(projectId, day);
    const I = insightFor(id, projectId, day),out = [];
    if (I.fb) {const r = records[I.fb[0].record_id],st = I.fb.map(statusAt),ai = st.filter((s) => s === 'likely_addressed').length,done = st.filter((s) => s === 'addressed').length,open = st.filter((s) => s === 'open').length,n = I.fb.length;
      out.push(blk(`① ${dd(r.occurred_at)} · ${channel(r)} · ${esc(r.title)}`, `${n} ${n === 1 ? 'point' : 'points'}`, `<div class="bar"><i style="width:${(ai + done) / n * 100}%;background:var(--ok)"></i><i style="width:${open / n * 100}%;background:var(--warn)"></i></div><div class="meta">${'AI thinks done'} ${ai} · ${'open'} ${open}${done ? ` · ${'confirmed'} ${done}` : ''}</div><div class="items">${I.fb.map((u) => {const s = statusAt(u);return `<div class="it ${s === 'likely_addressed' ? 'ai' : s === 'addressed' ? 'done' : ''}"><i class="st"></i><span>${esc(u.text)}</span><small>${s === 'likely_addressed' ? 'AI thinks done' : s === 'addressed' ? 'Done' : 'Open'}</small></div>`;}).join('')}</div>`));}
    const subs = (t) => snap.task_states.filter((x) => x.parent_task_id === t.id);
    if (I.mine.length) out.push(blk(`${out.length ? '②' : '①'} ${`My action items for ${esc(I.name)}`}`, I.mine[0].due_date ? `due ${dd(I.mine[0].due_date)}` : '', I.mine.slice(0, 2).map((t) => `<div class="task"><div class="main"><b>${esc(t.title)}</b><span class="due">${dd(t.due_date)}</span></div>${subs(t).map((s) => `<div class="sub">${esc(s.title)} → ${esc(people[s.owner_id]?.name?.split(' ')[0] || '')}<span class="pill ${s.status === 'completed' ? 'ok' : 'go'}">${s.status === 'completed' ? 'Done' : 'In progress'}</span></div>`).join('')}</div>`).join('') + (I.mine.some((t) => subs(t).length) || I.fb ? `<button class="pass" id="passBtn">${'Pass on… draft a message'}</button><div id="draft"></div>` : '')));
    if (I.question) out.push(blk('Waiting for your answer', '', `<div class="line">${esc(I.question.text)}<em>${dd(records[I.question.record_id].occurred_at)} · ${channel(records[I.question.record_id])}</em></div>`));
    if (I.late) out.push(blk(`${esc(I.name)}’s promise`, 'late', `<div class="line">${esc(I.late.text)}<em>${esc(I.late.due_date ? 'due ' + dd(I.late.due_date) : '')}</em></div>`));
    if (I.found.length && people[id].kind === 'agent') out.push(blk('What it found lately', '', I.found.map((u) => `<div class="line">${esc(u.text)}<em>${dd(records[u.record_id].occurred_at)}</em></div>`).join('')));
    if (out.length < 2 && I.updates.length) out.push(blk('Latest updates', '', I.updates.map((u) => `<div class="line">${esc(u.text)}${u.path ? `<em>${'File'} · ${esc(u.path)}${u.revision ? ' · ' + esc(u.revision) : ''}</em>` : `<em>${dd(records[u.record_id].occurred_at)}</em>`}</div>`).join('')));
    if (out.length < 2) {const recent = visible.filter((r) => r.participant_ids.includes(id) && !smallOnly(r) && ['email', 'chat', 'meeting', 'document'].includes(r.kind)).slice(-2).reverse();out.push(blk('Latest exchanges', '', recent.map((r) => `<div class="line">${esc(r.title)}<em>${dd(r.occurred_at)} · ${channel(r)}</em></div>`).join('') || `<div class="line">${'No exchanges yet.'}</div>`));}
    if (compactLedger) {
      // Keep both labels visible; only positive counts need a number in the project summary.
      const status = (label, count) => `<div><small>${label}</small>${count ? `<b>(${count})</b>` : ''}</div>`;
      out.push(`<section class="blk between-us-compact"><h3>${'Between us'}</h3><div class="ledger">${status('To do', I.mine.length)}${status('Awaiting them', I.theirs.length)}</div></section>`);
    } else {
      out.push(blk('Between us', '', `<div class="ledger"><div><small>${'My action items'}</small><b>${I.mine.length}</b><span>${esc(I.mine[0]?.title || '—')}</span></div><div><small>${'Awaiting them'}</small><b>${I.theirs.length}</b><span>${esc(I.theirs[0]?.title || '—')}</span></div></div>`));
    }
    return out.slice(0, 3).join('');
  }
  function draft(id, projectId = null, day = W.snapshots.length) {
    const { statusAt } = context(projectId, day);
    const I = insightFor(id, projectId, day),open = (I.fb || []).filter((u) => statusAt(u) === 'open'),junior = W.people.find((p) => p.relationship?.type === 'junior');
    if (open.length && junior) return { to: junior.name, channel: 'Teams', text:
      `Hi ${junior.name.split(' ')[0]}, ${I.name}’s feedback still has ${open.length} ${open.length === 1 ? 'point' : 'points'} to address:\n${open.slice(0, 3).map((u, i) => `${i + 1}. ${u.text}`).join('\n')}\nCould you look at the first one for me? Thanks!`
    };
    if (I.mine[0]) return { to: people[id].name, channel: 'Email', text: `Hi ${I.name}, about “${I.mine[0].title}”: I will send it to you by ${dd(I.mine[0].due_date) || 'the end of this week'}.` };
    return { to: people[id].name, channel: 'Teams', text: `Hi ${I.name}, could we check in on the latest progress?` };
  }
  const UCODE = { feedback: 'fb', task: 'task', promise: 'promise', decision: 'dec', file_pointer: 'file', question: 'q', update: 'upd' };
  const workUnits = (id) => units.filter((u) => u.type !== 'small_talk' && (u.from_id === id || (u.to_ids || []).includes(id))).slice(-9).map((u) => [UCODE[u.type] || 'upd', ['addressed', 'kept', 'answered', 'likely_addressed'].includes(statusAt(u)) ? 1 : 0]);

  // ---- my desk: today, notes, projects ----
  const nameOf = (id) => people[id]?.name || id;
  const today = { date: snap.date, focus: snap.desk.focus_project_id ? C.projects?.[snap.desk.focus_project_id]?.short || snap.desk.focus_project_id : null,
    mine: snap.desk.my_open_tasks.map((t) => ({ title: t.title, who: nameOf(t.counterparty_id), due: dd(t.due_date), overdue: t.overdue })),
    waiting: snap.desk.waiting_on_others.map((t) => ({ title: t.title, who: nameOf(t.owner_id), due: dd(t.due_date), overdue: t.overdue })),
    reminders: Object.entries(scores).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => {const I = insightFor(id);return { id, name: nameOf(id), title:
        I.question ? `${I.name} is waiting for your answer to a question` : I.openFb ? `${I.openFb} feedback ${I.openFb === 1 ? 'point is' : 'points are'} still open` : I.mine.length ? `You have something to deliver to ${I.name}` : I.late ? `${I.name}’s promise is late` : 'Something new came in'
      };}),
    recent: visible.filter((r) => ['email', 'meeting', 'chat'].includes(r.kind) && !smallOnly(r)).slice(-5).reverse().map((r) => ({ id: r.id, title: r.title, meta: `${dd(r.occurred_at)} · ${channel(r)}` })) };
  const notes = visible.filter((r) => ['journal', 'weekly_report', 'note'].includes(r.kind) && r.actor_id === PERSONA_ID).slice(-12).reverse().map((r) => ({ id: r.id, title: r.title, meta: `${dd(r.occurred_at)} · ${r.kind === 'weekly_report' ? 'Weekly review' : 'Work note'}` }));
  const projects = Object.values(PROJ).map((p) => ({ ...p, team: new Set(visible.filter((r) => r.project_id === p.id).flatMap((r) => r.participant_ids)).size - 1 }));

  // Short labels under a page's time strip: month starts, special days (leave, breaks), and the last day.
  function timelineMarkers() {
    const md = (iso) => dayMonth(iso),out = [];
    W.snapshots.forEach((s) => {if (s.date.endsWith('-01')) out.push({ date: s.date, text: MONTHS_LONG[+s.date.slice(5, 7) - 1], month: true });});
    for (const d of (C.special_days || []).slice(0, 3)) out.push({ date: d.from, text: `${md(d.from)}${d.to && d.to !== d.from ? '–' + (d.to.slice(5, 7) === d.from.slice(5, 7) && !EN ? +d.to.slice(8, 10) : md(d.to)) : ''} ${d.label.split(' · ')[0]}` });
    out.push({ date: W.snapshots.at(-1).date, text: dayMonth(W.snapshots.at(-1).date) });
    return out.sort((a, b) => a.date.localeCompare(b.date)).filter((m, i, a) => !(m.month && a[i + 1]?.date === m.date));
  }
  const LEAVE = (C.special_days || []).filter((d) => /leave|away|holiday|day off/i.test(d.label)).flatMap((d) => {const out = [];for (let i = dayIndex(d.from); i <= dayIndex(d.to); i++) out.push(i - 1);return out;});
  const top = today.reminders[0];
  return {
    W, C, people, records, persona: { id: PERSONA_ID, name: persona?.name, role: C.persona_role_label || persona?.role, org: W.organisations.find((o) => o.id === HOME)?.name, title: C.title || '' },
    markers: timelineMarkers(),
    activity: (() => {const a = new Array(W.snapshots.length).fill(0);for (const r of visible) {const i = dayIndex(r.occurred_at) - 1;if (i >= 0 && i < a.length) a[i]++;}return a;})(), // records per day, for the time strips
    sharedRecords, sharedProjects, defaultProject, projectAt, projectVisible,
    P, PROJ, card, draft, units: workUnits, today, notes, projects, LEAVE, days: W.snapshots.length,
    dateOf: (d) => W.snapshots[Math.max(0, Math.min(W.snapshots.length - 1, d - 1))].date,
    focusPerson: top?.id || P[0]?.id, cometId: P.find((p) => p.orbit === 'comet')?.id || null,
    toast: top ? `<b>AI</b> ${esc(top.name)}${': '}${esc(top.title)}` : '',
    focusText: today.focus ? { name: today.focus, line: today.mine[0] ? `${today.mine[0].title}${today.mine[0].due ? ' · due ' + today.mine[0].due : ''}` : '' } : null,
    recordText: (id) => {const r = records[id];return r ? { title: r.title, body: r.body, meta: `${fullDate(r.occurred_at) + ' ' + r.occurred_at.slice(11, 16)} · ${channel(r)} · ${nameOf(r.actor_id)}` } : null;}
  };
}
