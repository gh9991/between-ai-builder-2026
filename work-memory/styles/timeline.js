// Project Timeline: the scenario's projects as swimlanes over the quarter, for reviewing the data at a glance.
// Each lane has three rows — phases (dated bands), milestones (planned vs actual), and daily activity by channel.
// Click a day or a milestone to read exactly who did what that day. Reads the same data as every style.
import { loadBetween } from './between-data.js?v=20261017-en2';
import { mountStyleBar } from './style-bar.js?v=20261017-en3';
import { EN, t as tr, MONTHS, dayMonth, weekdayDate, fullDate, plural } from '../i18n.js';

const EMBED = new URLSearchParams(location.search).has('embed'); // inside the Project Timeline tab of a host page
if (EMBED) document.body.classList.add('embed');else mountStyleBar('timeline', '../');
if (new URLSearchParams(location.search).get('theme') === 'dark') document.body.classList.add('dark'); // inside Universe 2
// English hosts pass ?lang=en: relabel the static page chrome before the data arrives.
if (EN) {
  document.documentElement.lang = 'en';
  document.title = 'Between · Project Timeline';
  document.getElementById('sheetno').textContent = 'SHEET TL-01 · PROJECT TIMELINE';
  document.getElementById('title').textContent = 'Project Timeline';
  const who = document.getElementById('who'),zoomSel = document.getElementById('zoom');
  who.setAttribute('aria-label', 'Show only exchanges with one person');who.options[0].textContent = 'Everyone';
  who.parentElement.firstChild.textContent = 'Exchanges with ';
  zoomSel.setAttribute('aria-label', 'Timeline zoom');zoomSel.parentElement.firstChild.textContent = 'View ';
  zoomSel.options[0].textContent = 'Whole period';zoomSel.options[1].textContent = 'Zoomed in (scroll sideways)';
}
const D = await loadBetween();
const { W, C } = D;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---- time axis ----
const DAY = 864e5,d0 = Date.parse(D.dateOf(1) + 'T00:00:00Z'),lastData = D.days - 1;
const idx = (iso) => Math.round((Date.parse(iso.slice(0, 10) + 'T00:00:00Z') - d0) / DAY);
const isoOf = (i) => new Date(d0 + i * DAY).toISOString().slice(0, 10);
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],wd = (i) => new Date(d0 + i * DAY).getUTCDay();
const md = (iso) => dayMonth(iso);
const snap = W.snapshots.find((s) => s.date === W.manifest?.default_snapshot) || W.snapshots.at(-1);
// Exclude purely social records: drop records whose only content is small talk
const unitKinds = new Map();for (const u of W.work_units || []) (unitKinds.get(u.record_id) || unitKinds.set(u.record_id, []).get(u.record_id)).push(u.type);
const smallOnly = (r) => {const k = unitKinds.get(r.id);return !!k?.length && k.every((t) => t === 'small_talk');};
const records = W.records.filter((r) => r.first_seen_at <= snap.as_of && !smallOnly(r)).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
const persona = C.persona_id;

// ---- projects, phases, milestones (new fields first, graceful fallbacks for older data) ----
const cfg = (id) => C.projects?.[id] || {};
const projects = W.projects.filter((p) => p.id !== C.daily_project_id).map((p) => ({
  id: p.id, name: cfg(p.id).short || p.name_zh || p.name, full: p.name_zh || p.name, plain: p.plain_zh || '',
  status: snap.desk?.project_states?.find((s) => s.id === p.id)?.status === 'closed' || p.status === 'closed' ? 'closed' : p.status || 'active', outcome: p.outcome || null,
  closed: p.closed_at ? idx(p.closed_at) : null, kind: p.kind || '', periods: (p.grace_periods || []).map((g) => ({ s: idx(g.from), e: idx(g.to || isoOf(lastData)) })), color: '#' + (cfg(p.id).color || '888888'), goal: cfg(p.id).goal || p.goal || '',
  phase: snap.desk?.project_states?.find((s) => s.id === p.id)?.phase || p.phase,
  phases: (p.phases || []).filter((ph) => ph.start || ph.start_date).map((ph) => ({ id: ph.id, label: ph.label_zh || ph.label_en || ph.id, en: ph.label_en, plain: ph.plain_zh || '', s: idx(ph.start || ph.start_date), e: idx(ph.end || ph.end_date || ph.start || ph.start_date) }))
}));
// read the year top to bottom: projects in the order Grace started on them
const startOf = (p) => Math.min(p.periods[0]?.s ?? 1e9, p.phases[0]?.s ?? 1e9);
projects.sort((a, b) => startOf(a) - startOf(b));
const OUTCOME = { lost: 'not won', built: 'built', delivered_not_proceeding: 'delivered · client did not go ahead', won: 'won', named_scope_delivered: 'agreed part delivered', study_paused: 'study paused' };

const statusLabel = (p) => p.status === 'closed' ? `${'Finished'} · ${OUTCOME[p.outcome] || 'done'}` : p.status === 'on_hold' ? 'On hold' : p.periods.length && p.periods.at(-1).e < lastData ? 'I left · project continues' : 'In progress';
const statusKey = (p) => p.status === 'closed' ? 'closed' : p.status === 'on_hold' ? 'hold' : p.periods.length && p.periods.at(-1).e < lastData ? 'left' : 'active';
const daily = W.projects.find((p) => p.id === C.daily_project_id);
let milestones = (W.milestones || []).map((m) => ({ ...m, title: m.title_zh || m.title_en || m.title, plain: m.plain_zh || '', date: m.actual_date || m.planned_date }));
if (!milestones.length) // older data: calendar entries stand in for milestones
  milestones = records.filter((r) => r.kind === 'calendar').map((r) => ({ id: r.id, project_id: r.project_id, title: r.title, kind: 'calendar', planned_date: (r.start_at || r.occurred_at).slice(0, 10), actual_date: (r.start_at || r.occurred_at).slice(0, 10), status: 'done', people: r.participant_ids, source_ids: [r.id], date: (r.start_at || r.occurred_at).slice(0, 10) }));
const lastAxis = Math.max(lastData, ...milestones.map((m) => idx(m.planned_date || m.date)), ...projects.flatMap((p) => p.phases.map((ph) => ph.e)));
const N = Math.min(lastAxis, lastData + 45) + 1; // allow a short look ahead for upcoming milestones

// ---- channels ----
const CH = {
  email: { zh: 'Email', c: 'var(--c-email)' }, chat: { zh: 'Teams', c: 'var(--c-chat)' }, meeting: { zh: 'Meeting', c: 'var(--c-meeting)' }, document: { zh: 'File', c: 'var(--c-document)' },
  calendar: { zh: 'Calendar', c: 'var(--c-calendar)' }, ai: { zh: 'AI assistant', c: 'var(--c-ai)' }, task: { zh: 'Task update', c: 'var(--c-task)' }, note: { zh: 'My notes', c: 'var(--c-note)' }
};
const chOf = (r) => r.source_system === 'assistant' ? 'ai' : r.kind === 'task_update' ? 'task' : ['note', 'journal', 'weekly_report'].includes(r.kind) ? 'note' : CH[r.kind] ? r.kind : 'document';
const nameOf = (id) => id === persona ? 'Me' : D.people[id]?.name || id;
const short = (id) => id === persona ? 'me' : (D.people[id]?.name || id).split(' ')[0];
const MSKIND = { submission: 'Submission', meeting: 'Meeting', deadline: 'Deadline', decision: 'Decision', result: 'Result', approval: 'Approval', calendar: 'Calendar' };

const STATUS = { done: 'Done', slipped: 'Slipped', upcoming: 'Coming up', missed: 'Missed' };

// ---- state ----
// Cuts a label at a whole word to fit `px` (approximate width per character); '' when not even one word fits.
function fitWords(text, px, charW) {
  if (text.length * charW <= px) return text;
  const words = text.split(' ');
  let out = '';
  for (const w of words) {const next = out ? out + ' ' + w : w;if ((next.length + 1) * charW > px) break;out = next;}
  if (EN) out = out.replace(/(\s+(the|a|an|to|for|of|and|on|in|with))+$/i, ''); // never end on a small word: 'Finish…', not 'Finish the…'
  return out ? out.replace(/[\s,;:·–-]+$/, '') + '…' : '';
}
let who = '',sel = { type: 'day', day: lastData, project: null },DW = 14,zoom = 'fit',show = 'all';
// filters: projects and channels can be ticked off (⌥-click shows only that one); task updates and my notes start hidden
let hiddenProj = new Set(),hiddenCh = new Set(['task', 'note']);
const LAB = 178,AXIS_H = 46;
let PH_ROW = 26,MS_H = 62,ACT_H = 74;
const counted = (r) => !hiddenCh.has(chOf(r)) && !hiddenProj.has(r.project_id) && (!who || r.actor_id === who || r.participant_ids.includes(who));
const byDay = new Map();for (const r of records) {const k = idx(r.occurred_at);(byDay.get(k) || byDay.set(k, []).get(k)).push(r);}
const recsOn = (day, pid) => (byDay.get(day) || []).filter((r) => (!pid || r.project_id === pid) && counted(r));
const x = (i) => LAB + i * DW;

function phaseRows(p) {// stack overlapping phases (e.g. permit runs alongside tender)
  const rows = [];
  for (const ph of [...p.phases].sort((a, b) => a.s - b.s)) {let r = rows.findIndex((end) => end < ph.s);if (r < 0) {r = rows.length;rows.push(-1);}rows[r] = ph.e;ph.row = r;}
  return Math.max(1, rows.length);
}

function render() {
  const avail = $('chart').clientWidth - LAB - 2;
  DW = zoom === 'zoom' ? 12 : Math.max(1.2, Math.floor((avail - 4) / N * 100) / 100);
  const dense = DW < 6;[PH_ROW, MS_H, ACT_H] = dense ? [22, 56, 50] : [26, 62, 74];
  const width = LAB + N * DW,inner = $('inner');
  inner.style.width = width + 'px';
  const leave = new Set(D.LEAVE);
  const cols = (h, withLabels) => Array.from({ length: N }, (_, i) => {
    const cls = [!dense && (wd(i) === 0 || wd(i) === 6) ? 'we' : '', leave.has(i) ? 'leave' : '', i > lastData ? 'future' : '', sel.type === 'day' && sel.day === i ? 'sel' : ''].filter(Boolean).join(' ');
    return (cls ? `<div class="col ${cls}" style="left:${x(i)}px;width:${DW}px"></div>` : '') + (isoOf(i).endsWith('-01') || !dense && wd(i) === 1 ? `<div class="vline ${isoOf(i).endsWith('-01') ? 'month' : ''}" style="left:${x(i)}px"></div>` : '');
  }).join('') + `<div class="todayline" style="left:${x(lastData) + DW}px"></div>`;

  // axis
  let axis = `<div class="axis" style="height:${AXIS_H}px">${cols()}<div class="lab abs" style="left:0;top:0;width:${LAB}px;height:${AXIS_H}px;padding:8px 14px"><small style="font:500 10px var(--f-mono);letter-spacing:.12em;color:var(--muted)">${'DATE · CLICK A DAY'}</small></div>`;
  for (let i = 0; i < N; i++) {
    const iso = isoOf(i);
    if (i === 0 || iso.endsWith('-01')) axis += `<div class="mlabel" style="left:${x(i) + 4}px">${MONTHS[+iso.slice(5, 7) - 1] + (iso.slice(5, 7) === '01' || i === 0 ? ' ' + iso.slice(0, 4) : '')}</div>`;
    if (!dense && (wd(i) === 1 || DW >= 22)) axis += `<div class="dlabel ${wd(i) === 1 ? 'mon' : ''}" style="left:${x(i)}px;width:${DW}px">${+iso.slice(8, 10)}</div>`;
    axis += `<button class="axisday" data-day="${i}" style="left:${x(i)}px;width:${DW}px" aria-label="${`All exchanges on ${weekdayDate(iso)} ${iso.slice(0, 4)}`}"></button>`;
  }
  const lv = [...leave].sort((a, b) => a - b),runs = [];
  for (const d of lv) {if (runs.length && d - runs.at(-1).e <= 3) runs.at(-1).e = d;else runs.push({ s: d, e: d });}
  for (const r of runs) axis += `<div class="leave-tag" style="left:${x(r.s) + 1}px;top:24px" title="${md(isoOf(r.s))}–${md(isoOf(r.e))}">${'Leave'}</div>`;
  axis += `<div class="leave-tag" style="left:${x(lastData) + DW + 3}px;top:24px;background:var(--sheet);color:var(--today);font-family:var(--f-mono)">${'Now'}</div></div>`;

  // lanes
  let lanes = '';
  const maxDay = Math.max(1, ...projects.flatMap((p) => Array.from({ length: lastData + 1 }, (_, i) => recsOn(i, p.id).length)));
  const cell = Math.max(3, Math.min(9, Math.floor((ACT_H - 18) / Math.min(maxDay, 8)) - 2));
  for (const p of projects.filter((q) => !hiddenProj.has(q.id) && (show === 'all' || statusKey(q) === show))) {
    const prows = phaseRows(p),phH = prows * PH_ROW + 12,H = phH + MS_H + ACT_H,mine = milestones.filter((m) => m.project_id === p.id);
    const curIdx = p.phases.findIndex((ph) => ph.id === p.phase);
    const n = records.filter((r) => r.project_id === p.id).length;
    let h = `<section class="lane" style="height:${H}px" data-lane="${p.id}">${cols()}`;
    h += `<div class="lab abs" style="left:0;top:0;width:${LAB}px;height:${H}px"><b><span class="sw" style="background:${p.color}"></span>${esc(p.name)}</b><small>${esc(p.full)}</small><small>${`${plural(n, 'record')} · ${plural(mine.length, 'milestone')}`}</small><span class="now st-${statusKey(p)}">${statusLabel(p)}</span>${curIdx >= 0 && p.status !== 'closed' ? `<span class="now">${'Now: '}${esc(p.phases[curIdx].label)}</span>` : ''}</div>`;
    // when Grace worked on it (thin bar on top); the rest of the lane is dimmed; a closed project is greyed after it closed
    if (p.periods.length) {
      let prev = 0;
      for (const g of p.periods) {if (g.s > prev) h += `<div class="away" style="left:${x(prev)}px;width:${(g.s - prev) * DW}px"></div>`;h += `<div class="mine" style="left:${x(g.s)}px;width:${Math.max(DW, (g.e - g.s + 1) * DW)}px;background:${p.color}" title="${'My part: '}${md(isoOf(g.s))}–${md(isoOf(g.e))}"></div>`;prev = g.e + 1;}
      if (prev <= lastData) h += `<div class="away" style="left:${x(prev)}px;width:${(N - prev) * DW}px"></div>`;
    }
    if (p.closed != null && p.closed <= lastData) h += `<div class="closed-zone" style="left:${x(p.closed) + DW}px;width:${(N - p.closed - 1) * DW}px"><span>${'Finished'}</span></div>`;
    // phases: a label that does not fit is cut at a word, or left off when not even a word fits (the bar keeps its tooltip)
    p.phases.forEach((ph, k) => {
      const cls = k < curIdx ? 'past' : k === curIdx ? 'cur' : '';
      h += `<button class="phase ${cls}" data-phase="${p.id}:${ph.id}" title="${esc(ph.label)} · ${md(isoOf(ph.s))}–${md(isoOf(ph.e))}${ph.plain ? '\n' + esc(ph.plain) : ''}" style="left:${x(ph.s) + 1}px;width:${Math.max(DW, (ph.e - ph.s + 1) * DW) - 2}px;top:${8 + ph.row * PH_ROW}px;background:${p.color};color:${p.color}"><span style="color:#fff">${esc(fitWords(ph.label, Math.max(DW, (ph.e - ph.s + 1) * DW) - 16, 6))}</span></button>`;
    });
    if (!p.phases.length) h += `<div class="row-tag" style="left:${LAB + 8}px;top:10px">${'No phase dates in this project’s data yet'}</div>`;
    // milestones: diamond at the actual date; a slipped one keeps a ghost at the planned date
    const sorted = [...mine].sort((a, b) => a.date.localeCompare(b.date)),y = phH + 10,lastEnd = [-1e9, -1e9, -1e9];
    for (const m of sorted) {
      const a = idx(m.date),cx = x(a) + DW / 2,st = m.status === 'slipped' ? 'slip' : m.status === 'upcoming' ? 'up' : '';
      if (m.status === 'slipped' && m.planned_date && m.actual_date) {const pl = x(idx(m.planned_date)) + DW / 2;h += `<div class="slipline" style="left:${Math.min(pl, cx)}px;width:${Math.abs(cx - pl)}px;top:${y}px"></div><div class="ms ghost" style="left:${pl}px;top:${y}px" title="${'Planned '}${md(m.planned_date)}"></div>`;}
      h += `<button class="ms ${st} ${sel.type === 'ms' && sel.id === m.id ? 'on' : ''}" data-ms="${m.id}" style="left:${cx}px;top:${y}px" aria-label="${esc(m.title)}"></button>`;
      // up to three label rows; a label that has no room is left off (the diamond keeps its tooltip and stays clickable)
      const wmax = Math.max(120, Math.min(190, DW * 16)),row = lastEnd.findIndex((end) => cx - 6 > end + 4);
      const text = fitWords(m.title, wmax - 46, 5.9);
      if (row >= 0) {lastEnd[row] = cx - 6 + Math.min(wmax, 46 + text.length * 5.9);h += `<button class="mst" data-ms="${m.id}" style="left:${cx}px;top:${y + 11 + row * 14}px;max-width:${wmax}px" title="${esc(m.title)}"><em>${md(m.date)}</em>${esc(text)}</button>`;}
    }
    // daily activity, stacked by channel
    for (let i = 0; i <= lastData; i++) {
      const rs = recsOn(i, p.id);if (!rs.length) continue;
      const shown = rs.slice(0, 8).map((r) => `<i style="width:${Math.max(2, Math.min(DW - 1, DW - 5 > 4 ? DW - 5 : DW - 1))}px;height:${cell}px;background:${CH[chOf(r)].c}"></i>`).join('');
      h += `<button class="dayact" data-day="${i}" data-project="${p.id}" style="left:${x(i)}px;width:${DW}px;height:${ACT_H - 4}px;top:${phH + MS_H}px;justify-content:flex-start" aria-label="${`${fullDate(isoOf(i))} · ${esc(p.name)} · ${plural(rs.length, 'record')}`}">${shown}${rs.length > 8 ? `<b>+${rs.length - 8}</b>` : ''}</button>`;
    }
    h += `<div class="row-tag" style="left:${LAB + 12}px;top:${phH + MS_H - 10}px">${'Daily exchanges'}</div></section>`;
    lanes += h;
  }
  inner.innerHTML = axis + lanes;

  // milestone table
  $('table').innerHTML = projects.filter((q) => !hiddenProj.has(q.id) && (show === 'all' || statusKey(q) === show)).map((p) => `<section><h3><span class="sw" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>${esc(p.name)} · ${'milestones'} <span class="chip st-${statusKey(p)}">${statusLabel(p)}</span></h3><ol>${milestones.filter((m) => m.project_id === p.id).sort((a, b) => a.date.localeCompare(b.date)).map((m) => `<li data-ms="${m.id}"><span class="d">${m.status === 'slipped' && m.planned_date !== m.actual_date ? `<s>${md(m.planned_date)}</s> ${md(m.actual_date)}` : md(m.date)}</span><span>${esc(m.title)}</span><span class="chip ${m.status}">${STATUS[m.status] || m.status}</span></li>`).join('') || `<li><span></span><span class="empty">${'No milestones yet'}</span><span></span></li>`}</ol></section>`).join('');

  bind();
  renderSide();
  pinLabels();
  const focusDay = sel.type === 'day' ? sel.day : sel.type === 'phase' ? projects.find((q) => q.id === sel.project).phases.find((q) => q.id === sel.id).s : idx(milestones.find((m) => m.id === sel.id)?.date || isoOf(lastData)),c = $('chart');
  if (zoom === 'zoom' && x(focusDay) > c.scrollLeft + c.clientWidth - 40 || x(focusDay) < c.scrollLeft + LAB) c.scrollLeft = x(focusDay) - c.clientWidth / 2;
}

// one row per record, drawn like its medium (same colours and icons as the record viewer)
const SVG = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  email: SVG('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'), chat: SVG('<path d="M4 5h16v11H9l-5 4z"/>'),
  meeting: SVG('<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 19c0-3 2.2-5 5-5s5 2 5 5M11 19c.3-2.8 2.4-5 5-5 2.8 0 5 2 5 5"/>'),
  calendar: SVG('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'), document: SVG('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'),
  task: SVG('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 3 3 5-6"/>'), ai: SVG('<path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/>'),
  note: SVG('<path d="M6 3h11a1 1 0 0 1 1 1v17H7a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1z"/><path d="M9 8h6M9 12h6"/>')
};
const initials = (id) => id === persona ? 'Me' : (D.people[id]?.name || id).split(' ').map((w) => w[0]).join('').slice(0, 2);
const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
const TASK_ST = { open: 'To do', in_progress: 'In progress', completed: 'Done', blocked: 'Blocked' };
function recHTML(r, withProject) {
  const k = chOf(r),c = CH[k],to = r.participant_ids.filter((id) => id !== r.actor_id),t = (r.start_at || r.occurred_at).slice(11, 16);
  const proj = projects.find((p) => p.id === r.project_id)?.name || (r.project_id === daily?.id ? cfg(daily.id).short || 'Everyday work' : '');
  const people = `${esc(nameOf(r.actor_id))}${to.length ? ' → ' + to.slice(0, 4).map((id) => esc(short(id))).join(', ') + (to.length > 4 ? ` +${to.length - 4} more` : '') : ''}`;
  let body = '';
  if (k === 'email') {const ls = lines(r.body).filter((l) => !/^(hi|hello|dear)\b/i.test(l) && !/^(thanks|regards|best)/i.test(l));body = `<div class="ev-letter">${esc(ls.slice(0, 2).join(' ')).slice(0, 180)}</div>`;} else
  if (k === 'chat') {const g = r.group_id && (W.groups || []).find((x) => x.id === r.group_id);body = `<div class="ev-chat${r.actor_id === persona ? ' me' : ''}"><i>${esc(initials(r.actor_id))}</i><span>${esc(lines(r.body).join(' ').slice(0, 160))}</span></div>${g ? `<small class="ev-sub">${'Group chat'} · ${esc(g.name)}</small>` : ''}`;} else
  if (k === 'meeting' || k === 'calendar') {body = `<div class="ev-when">${(r.start_at || r.occurred_at).slice(11, 16)}${r.end_at ? '–' + r.end_at.slice(11, 16) : ''}${r.location ? ' · ' + esc(r.location) : ''}</div><div class="ev-faces">${r.participant_ids.slice(0, 7).map((id) => `<i title="${esc(nameOf(id))}">${esc(initials(id))}</i>`).join('')}${r.participant_ids.length > 7 ? `<small>+${r.participant_ids.length - 7}</small>` : ''}</div>${(r.minutes || []).length ? `<ul class="ev-points">${r.minutes.slice(0, 2).map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}`;} else
  if (k === 'document') body = `<div class="ev-file">${ICON.document}<span><b>${esc(r.path || r.title)}</b><small>${[r.revision, r.version ? 'version ' + r.version : '', r.format ? String(r.format).toUpperCase() : ''].filter(Boolean).map(esc).join(' · ')}</small></span></div>`;else
  if (k === 'task') body = `<div class="ev-task"><i class="${r.task_status === 'completed' ? 'done' : ''}"></i><span class="pill${r.task_status === 'completed' ? ' ok' : ''}">${esc(TASK_ST[r.task_status] || r.task_status || '')}</span>${r.due_date ? `<small>${'due'} ${md(r.due_date)}</small>` : ''}</div>`;else
  body = `<div class="ev-note">${esc(lines(r.body).slice(0, 2).join(' ').slice(0, 160))}</div>`;
  return `<div class="ev" style="--c:${c.c}"><div class="ev-ic">${ICON[k] || ICON.note}</div><div class="ev-b">
    <div class="ev-top"><b>${esc(r.title)}</b><time>${t}</time></div>
    <div class="ev-meta"><span class="ev-kind">${c.zh}</span>${people}${withProject && proj ? ` · ${esc(proj)}` : ''}</div>${body}
    ${r.body && k !== 'task' ? `<details><summary>${'Show full text'}</summary><pre>${esc(r.body)}</pre></details>` : ''}</div></div>`;
}
const msCard = (m) => {const p = projects.find((q) => q.id === m.project_id);return `<button class="mcard" data-ms="${m.id}" style="border-left-color:${p?.color || 'var(--ink)'};display:block;width:100%;text-align:left"><b>${esc(m.title)}</b><small>${MSKIND[m.kind] || m.kind || ''} · ${STATUS[m.status] || m.status}${m.status === 'slipped' ? ` · planned ${md(m.planned_date)}, actual ${md(m.actual_date)}` : ''}${p ? ' · ' + esc(p.name) : ''}</small>${m.plain ? `<span class="plain">${esc(m.plain)}</span>` : ''}</button>`;};

function renderSide() {
  const side = $('side');
  if (sel.type === 'phase') {
    const p = projects.find((q) => q.id === sel.project),ph = p.phases.find((q) => q.id === sel.id),ms = milestones.filter((m) => m.project_id === p.id && idx(m.date) >= ph.s && idx(m.date) <= ph.e);
    const n = records.filter((r) => r.project_id === p.id && idx(r.occurred_at) >= ph.s && idx(r.occurred_at) <= ph.e && counted(r)).length;
    side.innerHTML = `<div class="kicker">${'Phase'} · ${esc(p.name)}</div><h2>${esc(ph.label)}</h2><div class="sub">${md(isoOf(ph.s))} – ${md(isoOf(ph.e))} · ${`${plural(ph.e - ph.s + 1, 'day')} · ${plural(n, 'exchange')}`}</div>
      ${ph.plain ? `<div class="explain"><b>${'What this means'}</b>${esc(ph.plain)}</div>` : ''}
      ${p.plain ? `<h4>${'This project'}</h4><div>${esc(p.plain)}</div>` : ''}
      <h4>${'Milestones in this phase'}</h4>${ms.map(msCard).join('') || `<div class="empty">${'No milestones in this phase.'}</div>`}`;
  } else if (sel.type === 'ms') {
    const m = milestones.find((q) => q.id === sel.id),p = projects.find((q) => q.id === m.project_id),src = (m.source_ids || []).map((id) => records.find((r) => r.id === id)).filter(Boolean);
    side.innerHTML = `<div class="kicker">${'Milestone'} · ${esc(p?.name || '')}</div><h2>${esc(m.title)}</h2><div class="sub">${MSKIND[m.kind] || ''} · ${STATUS[m.status] || m.status}</div>${m.plain ? `<div class="explain"><b>${'What this means'}</b>${esc(m.plain)}</div>` : ''}
      <h4>${'Dates'}</h4><div>${m.planned_date ? `${'Planned'} <b>${fullDate(m.planned_date)}</b>` : ''}${m.actual_date ? ` · ${'actual'} <b>${fullDate(m.actual_date)}</b>` : ' · not happened yet'}${m.status === 'slipped' ? ` <span class="chip slipped">${`${plural(idx(m.actual_date) - idx(m.planned_date), 'day')} late`}</span>` : ''}</div>
      <h4>${'People involved'}</h4><div>${(m.people || []).map((id) => esc(nameOf(id))).join(', ') || '—'}</div>
      <h4>${`Sources: ${plural(src.length, 'record')}`}</h4>${src.map((r) => `<div style="font:11px var(--f-mono);color:var(--muted);margin-top:8px">${md(r.occurred_at)}</div>` + recHTML(r, false)).join('') || `<div class="empty">${'No linked records yet.'}</div>`}`;
  } else {
    const day = sel.day,iso = isoOf(day),p = projects.find((q) => q.id === sel.project),rs = recsOn(day, sel.project),ms = milestones.filter((m) => idx(m.date) === day && (!sel.project || m.project_id === sel.project));
    const leave = D.LEAVE.includes(day);
    side.innerHTML = `<div class="kicker">${p ? esc(p.name) : 'All projects'}${who ? ' · with ' + esc(nameOf(who)) : ''}</div><h2>${weekdayDate(iso)}</h2>
      <div class="sub">${day > lastData ? 'This day has not come yet' : plural(rs.length, 'exchange')}${leave ? ' · I was on leave' : ''}${day === lastData ? ' · today' : ''}</div>
      <div class="daynav"><button data-step="-1">${'← Previous'}</button><button data-step="1">${'Next day →'}</button>${p ? `<button data-allday>${'All projects'}</button>` : ''}</div>
      ${p?.plain ? `<div class="explain"><b>${`About ${esc(p.name)}`} · ${statusLabel(p)}</b>${esc(p.plain)}</div>` : ''}
      ${ms.length ? `<h4>${'Milestones that day'}</h4>` + ms.map(msCard).join('') : ''}
      ${rs.length ? `<h4>${'Who did what'}</h4>` + rs.map((r) => recHTML(r, !p)).join('') : `<div class="empty">${day > lastData ? '' : 'No records on this day.'}</div>`}
      ${!p && day <= lastData ? upcomingHTML(day) : ''}`;
  }
  side.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {sel = { ...sel, day: Math.max(0, Math.min(N - 1, sel.day + +b.dataset.step)) };render();});
  side.querySelector('[data-allday]')?.addEventListener('click', () => {sel = { type: 'day', day: sel.day, project: null };render();});
  side.querySelectorAll('[data-ms]').forEach((b) => b.onclick = () => {sel = { type: 'ms', id: b.dataset.ms };render();});
}
function upcomingHTML(day) {
  const next = milestones.filter((m) => idx(m.planned_date || m.date) > day && m.status !== 'done' || idx(m.date) > day).sort((a, b) => (a.planned_date || a.date).localeCompare(b.planned_date || b.date)).slice(0, 4);
  return next.length ? `<h4>${'Coming up'}</h4>` + next.map(msCard).join('') : '';
}

function bind() {
  const tip = $('tip');
  document.querySelectorAll('#inner [data-day]').forEach((b) => {
    b.onclick = () => {sel = { type: 'day', day: +b.dataset.day, project: b.dataset.project || null };render();};
    b.onmouseenter = (e) => {const rs = recsOn(+b.dataset.day, b.dataset.project);tip.innerHTML = `<b>${weekdayDate(isoOf(+b.dataset.day))}</b>${b.dataset.project ? '' : ' · all projects'}<br>${rs.slice(0, 5).map((r) => `${CH[chOf(r)].zh} · ${esc(r.title)}`).join('<br>') || 'No records'}${rs.length > 5 ? `<br>${`… ${rs.length - 5} more`}` : ''}`;tip.hidden = false;move(e);};
    b.onmousemove = move;b.onmouseleave = () => tip.hidden = true;
  });
  document.querySelectorAll('[data-ms]').forEach((b) => b.onclick = () => {sel = { type: 'ms', id: b.dataset.ms };render();});
  document.querySelectorAll('[data-phase]').forEach((b) => b.onclick = () => {const [project, id] = b.dataset.phase.split(':');sel = { type: 'phase', project, id };render();});
  function move(e) {tip.style.left = Math.min(innerWidth - 300, e.clientX + 14) + 'px';tip.style.top = e.clientY + 14 + 'px';}
}

// ---- filters: like the left panel in Universe 2, tick to show, ⌥-click for only that one ----
const solo = (set, id, all) => {const only = all.every((x) => x === id ? !set.has(x) : set.has(x));return only ? new Set() : new Set(all.filter((x) => x !== id));};
function renderFilters() {
  const ST = [['all', 'All'], ['active', 'In progress'], ['left', 'Handed back'], ['hold', 'Paused'], ['closed', 'Finished']].filter(([k]) => k === 'all' || projects.some((p) => statusKey(p) === k));
  const inStatus = projects.filter((p) => show === 'all' || statusKey(p) === show);
  const nCh = (k) => records.filter((r) => chOf(r) === k && !hiddenProj.has(r.project_id)).length;
  const active = hiddenProj.size || show !== 'all' || who || !(hiddenCh.size === 2 && hiddenCh.has('task') && hiddenCh.has('note'));
  $('filters').innerHTML = `<div class="frow"><span class="fl">${'Projects'}</span><span class="seg">${ST.map(([k, t]) => `<button data-status="${k}" aria-pressed="${k === show}">${t}</button>`).join('')}</span>
      ${inStatus.map((p) => `<button class="pill" role="checkbox" aria-checked="${!hiddenProj.has(p.id)}" data-proj="${p.id}" style="--c:${p.color}" title="${'Click to show or hide · ⌥-click to show only this one'}"><i></i>${esc(p.name)}</button>`).join('')}</div>
    <div class="frow"><span class="fl">${'Channels'}</span>${Object.entries(CH).map(([k, v]) => `<button class="pill" role="checkbox" aria-checked="${!hiddenCh.has(k)}" data-ch="${k}" style="--c:${v.c}" title="${'Click to show or hide · ⌥-click to show only this kind'}"><i></i>${v.zh}<small>${nCh(k)}</small></button>`).join('')}
      ${active ? `<button class="fclear" data-clear>${'Reset'}</button>` : ''}</div>`;
  $('filters').querySelectorAll('[data-status]').forEach((b) => b.onclick = () => {show = b.dataset.status;update();});
  $('filters').querySelectorAll('[data-proj]').forEach((b) => b.onclick = (e) => {const id = b.dataset.proj;hiddenProj = e.altKey ? solo(hiddenProj, id, projects.map((p) => p.id)) : hiddenProj.has(id) ? (hiddenProj.delete(id), hiddenProj) : hiddenProj.add(id);update();});
  $('filters').querySelectorAll('[data-ch]').forEach((b) => b.onclick = (e) => {const k = b.dataset.ch;hiddenCh = e.altKey ? solo(hiddenCh, k, Object.keys(CH)) : hiddenCh.has(k) ? (hiddenCh.delete(k), hiddenCh) : hiddenCh.add(k);update();});
  $('filters').querySelector('[data-clear]')?.addEventListener('click', () => {hiddenProj = new Set();hiddenCh = new Set(['task', 'note']);show = 'all';who = '';$('who').value = '';update();});
}
function update() {renderFilters();render();}

// ---- header, legend ----
const total = records.length;
$('title').textContent = `${D.persona.name}’s project timeline`;
$('subtitle').textContent =
`${fullDate(isoOf(0))} – ${fullDate(isoOf(lastData))} · ${plural(projects.length, 'project')} · ${plural(milestones.length, 'milestone')} · ${plural(total, 'record')} (email, Teams, meetings, files, calendar, AI assistants)`;

$('legend').innerHTML = `<span><i class="dia" style="background:var(--ink)"></i>${'Milestone'}</span><span><i class="dia" style="background:var(--slip)"></i>${'Slipped (dashed = original plan)'}</span><span><i class="dia" style="background:var(--sheet);border:1.5px solid var(--up)"></i>${'Coming up'}</span><span><i style="background:repeating-linear-gradient(135deg,var(--leave) 0 3px,transparent 3px 6px);border:1px solid var(--rule)"></i>${'Leave'}</span>`;
const ppl = [...new Set(records.flatMap((r) => [r.actor_id, ...r.participant_ids]))].filter((id) => id !== persona && D.people[id]);
ppl.sort((a, b) => records.filter((r) => r.participant_ids.includes(b)).length - records.filter((r) => r.participant_ids.includes(a)).length);
$('who').innerHTML += ppl.map((id) => `<option value="${id}">${esc(D.people[id].name)} · ${esc(D.people[id].relationship?.label_zh || D.people[id].role || '')}</option>`).join('');
$('who').onchange = (e) => {who = e.target.value;update();};
$('zoom').onchange = (e) => {zoom = e.target.value;render();};
const hashDay = location.hash.match(/^#d(\d{1,3})$/);if (hashDay) sel.day = Math.min(N - 1, +hashDay[1]);
function pinLabels() {const l = $('chart').scrollLeft;document.querySelectorAll('#inner .lab').forEach((el) => el.style.transform = `translateX(${l}px)`);}
$('chart').addEventListener('scroll', pinLabels, { passive: true });
let lastW = 0;new ResizeObserver(() => {const w = $('chart').clientWidth;if (Math.abs(w - lastW) > 4) {lastW = w;render();}}).observe($('chart')); // width only: a height change must not re-render
renderFilters();render();
