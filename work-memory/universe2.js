// Independent editable copy of universe.js. Shared data and common controls remain unchanged.
// Universe engine: immersive 3D styles over the same scenario data as the classic style.
// Shared by every style: the derived model (contacts, closeness, links between people), physics (drag, manual placement, automatic layout),
// hover/click, a fixed list of concrete work items, the rule-based "what matters now" summary, reminders and the
// timeline. A style only decides where people stand, how links are drawn and what scenery surrounds them.
// The Universe 2 style has three layouts (Closeness / Org chart / Projects) and the same two views as the classic style (My Desk / Connections).
// Styles: built in below (STYLES) plus any in styles-codex.js — see that file for the contract.
import * as THREE from './vendor/three.module.js';
import { draggedPitch, orbitFrame, draggedPan, positionOrbitCamera } from './universe2-orbit.js';
import { samplePeopleTransition, PEOPLE_TRANSITION_SECONDS, scenarioEntryMotion, SCENARIO_ENTRY_SECONDS } from './universe2-transition.js';
import { createCharacter } from './characters.js';
import { openRecord } from './records.js';
import CODEX_STYLES from './styles-codex.js';
import { createUniverse2Projects } from './universe2-projects.js';
import { protectUniverseLabels } from './universe2-labels.js';
import { projectsAt, sameWords } from './universe2-project-data.js';
import { organizationLayout } from './universe2-org.js';
import { historicalPeopleAt } from './universe2-people.js';
import { attentionAt } from './universe2-attention.js';
import { deskPeopleAt } from './universe2-desk-people.js';
import { createContributionGalaxy } from './universe2-contribution-scene.js';
import { contributionVisible, openContributions } from './universe2-contributions.js';
import { createDeskCompanions } from './universe2-desk-scene.js';
import { personWorkItems } from './universe2-work-list.js';
import { projectSpaceOpen } from './universe2-project-space.js';
import { icon } from './universe2-icons.js';
import { createFilters, groupFilterHTML } from './universe2-filters.js';
import { MONTHS_LONG, WEEKDAYS, dayMonth, fullDate, plural } from './i18n.js';
import { state, actions, DATA, CONFIG, PERSONA_ID, HOME_ORG, DAILY_PROJECT, STATUS, people, orgs, records, short, projectColor } from './state.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const el = (tag, cls, html) => {const x = document.createElement(tag);if (cls) x.className = cls;if (html !== undefined) x.innerHTML = html;return x;};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------------- derived model ----------------
const GROUP_COL = { line: 0xF29A4A, team: 0xE9D3AA, dept: 0xB49CFF, ext: 0x86B6FF, auth: 0xFF8FA3, ai: 0x4FE3CF };
const GROUP_CSS = { line: 'var(--uv-line)', team: 'var(--uv-team)', dept: 'var(--uv-dept)', ext: 'var(--uv-ext)', auth: 'var(--uv-auth)', ai: 'var(--uv-ai)' };
const persona = people[PERSONA_ID];
const manager = persona?.reports_to,skip = manager && people[manager]?.reports_to;
function groupOf(p) {
  if (p.kind === 'agent') return 'ai';
  if (p.id === manager || p.id === skip) return 'line';
  const t = p.relationship?.type;
  if (t === 'authority') return 'auth';
  if (t === 'partner_office' || p.organisation_id === HOME_ORG && p.office && persona?.office && p.office !== persona.office) return 'dept';
  if (p.organisation_id === HOME_ORG) return 'team';
  return 'ext';
}
const relLabel = (p) => p.relationship?.label_zh || (p.organisation_id === HOME_ORG ? 'Colleague' : orgs[p.organisation_id]?.name || '');
const TEXT_KINDS = new Set(['chat', 'email', 'meeting', 'document', 'task_update', 'note']);
const unitsByRecord = new Map();
for (const u of DATA.work_units || []) (unitsByRecord.get(u.record_id) || unitsByRecord.set(u.record_id, []).get(u.record_id)).push(u);
const isSmallTalkOnly = (r) => {const us = unitsByRecord.get(r.id);return !!us?.length && us.every((u) => u.type === 'small_talk');};
const statusAt = (u) => (u.status_history || []).filter((h) => h.at <= state.snapshot.as_of).at(-1)?.status || null;
const dayText = (iso) => dayMonth(iso);
const daysAgo = (iso) => Math.round((new Date(state.snapshot.as_of) - new Date(iso)) / 864e5);

// Each person's main project (most records over the quarter) decides their direction around me: a stable layout.
const PROJECT_IDS = DATA.projects.map((p) => p.id).filter((id) => id !== DAILY_PROJECT);
const PRIMARY = {};
{const c = {};for (const r of DATA.records) for (const id of new Set([r.actor_id, ...r.participant_ids])) {(c[id] ||= {})[r.project_id] = (c[id][r.project_id] || 0) + 1;}
  for (const p of DATA.people) {const list = Object.entries(c[p.id] || {}).sort((a, b) => b[1] - a[1]);PRIMARY[p.id] = (list.find(([pid]) => pid !== DAILY_PROJECT && list[0][1] < 2 * (c[p.id][pid] || 0)) || list[0] || [DAILY_PROJECT])[0];}}
const SECTOR = { [DAILY_PROJECT]: Math.PI / 2 };
PROJECT_IDS.forEach((id, i) => {SECTOR[id] = Math.PI / 2 + (i + 1) * Math.PI * 2 / (PROJECT_IDS.length + 1);});
const ANGLE = {};
{const by = {};for (const p of DATA.people) if (p.id !== PERSONA_ID) (by[PRIMARY[p.id]] ||= []).push(p.id);
  for (const [pid, ids] of Object.entries(by)) ids.forEach((id, i) => {ANGLE[id] = (SECTOR[pid] ?? 0) + (i - (ids.length - 1) / 2) * .38;});}

let showHistoricalPeople = false,historicalPeople = new Set();
// Show / hide filters (left panel, like macOS Calendar's list): kinds of relationship and projects.
const filters = createFilters(CONFIG.id);
let groupCounts = {},filteredOut = 0;
function model() {
  historicalPeople = historicalPeopleAt(DATA, CONFIG, state.snapshot);
  const known = state.snapshot.connections.nodes.filter((n) => people[n.person_id] && n.person_id !== PERSONA_ID && (showHistoricalPeople || !historicalPeople.has(n.person_id)));
  // a person stays when their kind is ticked and at least one project they share with me is ticked (studio-only people stay)
  const projectsOf = new Map();
  for (const r of state.visible) if (r.project_id && r.project_id !== DAILY_PROJECT) for (const id of [r.actor_id, ...r.participant_ids]) (projectsOf.get(id) || projectsOf.set(id, new Set()).get(id)).add(r.project_id);
  groupCounts = {};for (const n of known) {const g = groupOf(people[n.person_id]);groupCounts[g] = (groupCounts[g] || 0) + 1;}
  const shown = (n) => {if (filters.groupHidden(groupOf(people[n.person_id]))) return false;if (!filters.anyProjectHidden()) return true;const ps = projectsOf.get(n.person_id);return !ps?.size || [...ps].some((pid) => !filters.projectHidden(pid));};
  const nodes = known.filter(shown);filteredOut = known.length - nodes.length;
  const count = (id) => {const n = nodes.find((x) => x.person_id === id);const s = n?.signals?.by_channel;return s ? Object.values(s).reduce((a, b) => a + b, 0) : state.visible.filter((r) => r.participant_ids.includes(id)).length;};
  const counts = Object.fromEntries(nodes.map((n) => [n.person_id, count(n.person_id)]));
  const max = Math.max(1, ...Object.values(counts));
  const pair = new Map();
  for (const r of state.visible) {
    if (!TEXT_KINDS.has(r.kind) || isSmallTalkOnly(r)) continue;
    const ids = [...new Set([r.actor_id, ...r.participant_ids])].filter((id) => id !== PERSONA_ID && counts[id] !== undefined);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {const k = [ids[i], ids[j]].sort().join('|');pair.set(k, (pair.get(k) || 0) + 1);}
  }
  const per = {},links = [];
  for (const [k, c] of [...pair.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1])) {const [a, b] = k.split('|');if ((per[a] || 0) >= 3 && (per[b] || 0) >= 3) continue;per[a] = (per[a] || 0) + 1;per[b] = (per[b] || 0) + 1;links.push([a, b, c]);}
  const maxPair = Math.max(1, ...links.map((l) => l[2]));
  return { ids: nodes.map((n) => n.person_id), counts, max, signals: Object.fromEntries(nodes.map((n) => [n.person_id, n.signals])),
    edges: [...nodes.map((n) => ['me', n.person_id, 1 + 4 * Math.sqrt(counts[n.person_id] / max)]), ...links.map(([a, b, c]) => [a, b, 1 + 4 * (c / maxPair)])] };
}

const ITEM_OF_KIND = { chat: 'teams', email: 'mail', meeting: 'cal', calendar: 'cal', document: 'file', task_update: 'task', note: 'ai' };
function channel(r) {return r.kind === 'email' ? 'Email' : r.kind === 'meeting' ? 'Meeting' : r.kind === 'document' ? 'File' : r.kind === 'task_update' ? 'Task' : r.source_system === 'assistant' ? 'AI assistant' : r.kind === 'chat' ? 'Teams' : r.kind;}
function itemsFor(id, projectId = null) {
  const out = personWorkItems(DATA, state.snapshot, id, projectId).map(({ unit: u, record: r, bucket, label, feedback }) => ({
    type: u.type === 'task' || u.type === 'promise' ? 'task' : u.type === 'file_pointer' ? 'file' : u.type === 'decision' ? 'cal' : ITEM_OF_KIND[r.kind] || 'teams',
    title: feedback ? `${plural(feedback.length, 'feedback point')} · ${esc(r.title)}` : esc(u.text) + (u.revision ? ` · ${esc(u.revision)}` : ''),
    meta: `${fullDate(r.occurred_at)} · ${esc(short[r.project_id] || '')} · ${u.path ? esc(u.path) : channel(r)}`,
    status: label, bucket, rid: r.id
  }));
  if (out.length < 6) for (const r of state.visible.slice().reverse()) {
    if (out.length >= 7) break;
    if (projectId && r.project_id !== projectId || !TEXT_KINDS.has(r.kind) || isSmallTalkOnly(r) || !r.participant_ids.includes(id) || out.some((o) => o.rid === r.id)) continue;
    out.push({ type: ITEM_OF_KIND[r.kind] || 'teams', title: esc(r.title), meta: `${fullDate(r.occurred_at)} · ${esc(short[r.project_id] || '')} · ${channel(r)}`, status: 'Record / reference', bucket: 'history', rid: r.id });
  }
  return out;
}
function workListHTML(items, compact = false) {
  const cards = (rows) => rows.map((it) => `<button class="uv2-work-item" data-rid="${esc(it.rid)}" title="Click to see the original record">${cardHTML(it)}</button>`).join('');
  const pending = items.filter((it) => it.bucket === 'pending'),review = items.filter((it) => it.bucket === 'review'),history = items.filter((it) => it.bucket === 'history');
  return `${compact && !pending.length ? '' : `<section class="uv2-work-section" aria-label="Open and awaiting reply"><h5>Open / awaiting reply <span>${pending.length}</span></h5>${cards(pending) || '<p class="uv2-work-empty">Nothing clearly open under this project lens.</p>'}</section>`}
    ${review.length ? `<section class="uv2-work-section" aria-label="To check"><h5>To check <span>${review.length}</span></h5>${cards(review)}</section>` : ''}
    <details class="uv2-work-section uv2-work-history" ${pending.length || review.length ? '' : 'open'}><summary>Past records and references <span>${history.length}</span></summary>${cards(history) || '<p class="uv2-work-empty">No known records yet.</p>'}</details>`;
}
// what matters with this person now (rule-based summary until the Gemini extractor lands)
function insightFor(id, m, projectId = null) {
  const p = people[id],name = p.name.split(' ')[0];
  const units = (DATA.work_units || []).filter((u) => u.type !== 'small_talk' && (!projectId || u.project_id === projectId) && state.visibleIds.has(u.record_id));
  const pts = [],acts = [];let title = null,sug = null;
  const groups = {};for (const u of units) if (u.type === 'feedback' && u.from_id === id) (groups[u.group_id || u.id] ||= []).push(u);
  const lastGroup = Object.values(groups).sort((a, b) => records[b[0].record_id].occurred_at.localeCompare(records[a[0].record_id].occurred_at))[0];
  const question = units.filter((u) => u.type === 'question' && u.from_id === id && statusAt(u) === 'open').at(-1);
  if (question) {title = `${name} is waiting for your answer to a question`;pts.push(['teams', `${dayText(records[question.record_id].occurred_at)}, asked you: ${esc(question.text)}`]);sug = `Answer ${name}’s question`;acts.push(['Reply to ' + name, question.record_id]);}
  let openFb = 0;
  if (lastGroup) {const st = lastGroup.map(statusAt);openFb = st.filter((s) => s === 'open').length;const likely = st.filter((s) => s === 'likely_addressed').length;
    if (openFb || likely) {title ||= `You may want to reply to ${name}’s feedback`;const r = records[lastGroup[0].record_id];
      pts.push(['teams', `${dayText(r.occurred_at)}, sent ${plural(lastGroup.length, 'feedback point')}: AI thinks ${likely} ${likely === 1 ? 'is' : 'are'} done, ${openFb} still open.`]);
      const first = lastGroup.find((u) => statusAt(u) === 'open');if (first) sug ||= `Start with: ${esc(first.text)}`;acts.push(['See this feedback', r.id]);}}
  const mine = state.snapshot.task_states.filter((t) => (!projectId || t.project_id === projectId) && t.owner_id === PERSONA_ID && t.counterparty_id === id && t.status !== 'completed');
  const theirs = state.snapshot.task_states.filter((t) => (!projectId || t.project_id === projectId) && t.owner_id === id && t.counterparty_id === PERSONA_ID && t.status !== 'completed');
  for (const t of mine.slice(0, 2)) pts.push(['task', `My action item for ${name}: ${esc(t.title)}${t.due_date ? ` (due ${dayText(t.due_date)}${t.overdue ? ', overdue' : ''})` : ''}`]);
  for (const t of theirs.slice(0, 1)) pts.push(['task', `Awaiting ${name}: ${esc(t.title)}${t.due_date ? ` (due ${dayText(t.due_date)})` : ''}`]);
  if (!title && mine.length) title = `You have something to deliver to ${name}`;
  if (!title && theirs.length) title = `You are waiting on ${name}`;
  const late = units.filter((u) => u.type === 'promise' && u.from_id === id && statusAt(u) === 'late').at(-1);
  if (late) {pts.push(['mail', `${name}’s promise is late: ${esc(late.text)}`]);title ||= `${name}’s promise is late`;sug ||= 'Send a polite reminder';}
  const found = units.filter((u) => u.type === 'update' && u.from_id === id && ['open', 'likely_addressed'].includes(statusAt(u))).at(-1);
  if (found) {pts.push(['ai', esc(found.text)]);title ||= 'A finding nobody has acted on yet';}
  const last = projectId ? state.visible.filter((r) => r.project_id === projectId && r.participant_ids.includes(id)).at(-1)?.first_seen_at : m.signals[id]?.last_contact_at;
  const sig = { last_contact_at: last };
  if (sig?.last_contact_at) pts.push(['cal', `Last contact: ${daysAgo(sig.last_contact_at) <= 0 ? 'today' : plural(daysAgo(sig.last_contact_at), 'day') + ' ago'}`]);
  return { title: title || 'Your latest exchanges', pts: pts.slice(0, 4), sug, acts: acts.slice(0, 2), score: (question ? 3 : 0) + openFb + (mine.some((t) => t.overdue) ? 2 : mine.length ? 1 : 0) + (late ? 1 : 0) };
}

const ICON = {
  teams: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  mail: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  file: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
  task: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 3 3 5-6"/></svg>',
  cal: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  ai: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/></svg>'
};
const ICOL = { teams: 'var(--uv-teams)', mail: 'var(--uv-mail)', file: 'var(--uv-file)', task: 'var(--uv-task)', cal: 'var(--uv-cal)', ai: 'var(--uv-ai)' };
function cardHTML(it) {
  const st = it.status ? `<span class="uv-st ${it.bucket === 'pending' ? 'open' : it.bucket === 'review' ? 'ai' : it.status === 'Done' ? 'ok' : 'reference'}">${it.status}</span>` : '';
  // calendar items use the same small icon square as Teams, mail and files (the date is already in the meta line)
  const kind = it.type === 'cal' ? 'calendar' : it.type;
  return `<div class="uv-card ${kind}"><div class="ic">${ICON[it.type]}</div><div><b>${it.title}</b><small>${it.meta}</small>${st}</div></div>`;
}

// ---------------- scene helpers available to styles ----------------
function tex(draw, s = 128) {const c = document.createElement('canvas');c.width = c.height = s;draw(c.getContext('2d'), s);return new THREE.CanvasTexture(c);}
const GLOW = tex((x, s) => {const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);g.addColorStop(0, 'rgba(255,255,255,1)');g.addColorStop(.2, 'rgba(255,255,255,.7)');g.addColorStop(.5, 'rgba(255,255,255,.15)');g.addColorStop(1, 'rgba(255,255,255,0)');x.fillStyle = g;x.fillRect(0, 0, s, s);});
const FLARE = tex((x, s) => {x.translate(s / 2, s / 2);for (const r of [0, Math.PI / 2]) {x.save();x.rotate(r);const g = x.createLinearGradient(-s / 2, 0, s / 2, 0);g.addColorStop(0, 'rgba(255,255,255,0)');g.addColorStop(.5, 'rgba(255,255,255,1)');g.addColorStop(1, 'rgba(255,255,255,0)');x.fillStyle = g;x.fillRect(-s / 2, -1.4, s, 2.8);x.restore();}}, 256);
function sprite(t, color, size, op = 1, normal = false) {const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color, transparent: true, opacity: op, blending: normal ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false }));s.scale.set(size, size, 1);return s;}
const mat = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .85 }, o));
function add(parent, geo, material, x = 0, y = 0, z = 0) {const m = new THREE.Mesh(geo, material);m.position.set(x, y, z);parent.add(m);return m;}
function ring(scene, r, color, op, y = 0) {const pts = [];for (let i = 0; i <= 160; i++) {const a = i / 160 * Math.PI * 2;pts.push(V(Math.cos(a) * r, y, Math.sin(a) * r));}const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: op }));scene.add(l);return l;}
function massing(parent, kind, material) {const m = new THREE.Group();parent.add(m);const b = (w, h, d, x, z) => {const x1 = add(m, new THREE.BoxGeometry(w, h, d), material, x, h / 2, z);return x1;};
  if (kind === 0) {b(1.8, .36, 1.2, 0, 0);b(1.2, .32, .84, -.15, 0);b(.56, .28, .56, .4, .1);} else if (kind === 1) {b(1.2, .24, 1, 0, 0);b(.64, 2.2, .64, 0, 0);} else {b(1.4, .28, .4, 0, -.36);b(.4, .28, 1, -.5, .1);}return m;}
const PROJECTS = PROJECT_IDS.map((id, i) => ({ id, i, angle: SECTOR[id], color: parseInt(projectColor(id).slice(1), 16), label: short[id] }));
const straight = (a, b, t, out) => out.lerpVectors(a, b, t);

// ---------------- built-in styles ----------------
export const STYLES = [
{ id: 'universe', label: 'Universe 2', meta: 'A 3D map of people you can drag: the closer someone is to me, the more we work together; lines show work two people share.', theme: 'dark', layout: null,
  legend: `<h4>Legend</h4><span><i style="background:var(--uv-me)"></i>Me, at the centre</span><span><i style="background:var(--uv-line)"></i>My managers</span><span><i style="background:var(--uv-team)"></i>My team</span><span><i class="ring" style="color:var(--uv-dept)"></i>Other teams</span><span><i style="background:var(--uv-ext)"></i>Outside organisations</span><span><i style="background:var(--uv-auth)"></i>Approving bodies</span><span><i style="background:var(--uv-ai)"></i>AI assistants</span><p>People stay where you drag them. In the automatic layout, the closer someone is to me, the more we work together. The brighter a line, the more those two people work together.</p>` },
{ id: 'org', label: 'Org chart', meta: 'Inside the organisation, people follow the reporting lines; outside people gather by project. Click a project to open its space, or a person to see shared work.', theme: 'dark',
  layout: (id) => V(...(orgLayout.positions[id] || [0, 0, 0])),
  legend: `<h4>Org chart</h4><span><i style="background:var(--uv-line)"></i>Gold lines: known direct reporting lines</span><span><i style="background:var(--uv-ext)"></i>Coloured clusters: outside people on a project</span><p>Inside the organisation, people follow the reporting lines. Someone on several projects sits beside the one we work on most now; +N beside a name means N more projects. Show past people to bring in contacts from past projects.</p>` },
...CODEX_STYLES];

export const findStyle = (id) => STYLES.find((s) => s.id === id);

// ---------------- engine state ----------------
let R,scene,cam,S,ORG,mounted = false,selected = null,hover = null,T = 0,M = null,view = 'network',mode = 'graph',deskEntry = 'today';
// Match the close relationship view previously reached at the wheel's near limit.
const GRAPH_DEFAULT_ZOOM = .45;
const defaultZoom = (currentView, currentMode) => currentView === 'network' && currentMode === 'graph' ? GRAPH_DEFAULT_ZOOM : 1;
let theta = .6,phi = .95,dist = 22,zoom = GRAPH_DEFAULT_ZOOM;
const look = V(0, 0, 0),lookGoal = V(0, 0, 0),panOffset = V();
const N = {},hits = [],sparks = [],extraLabels = [];
let edges = [],eGeo,ePos,eCol,ecoG,meCore,meRing,meGlow,dust;
const dom = {};
let detailsOpen = false;
let automaticPositions = null,layoutDate = null,peopleTransition = null;
let floatingItems = [],floatingPage = 0,floatingPageSize = 4;
let projectLayer, orgLayout, orgLines, orgFrames, orgClouds, deskCompanions, contributionGalaxy;
let deskPerson = null,deskPeople = [],deskPanelOpen = false;
function openDeskPerson(id) {deskPerson = id;deskEntry = 'person';deskPanelOpen = true;renderDesk();}
const orgHeadings = new Map();
let attention = {};
const attentionLegend = '<span class="uv2-attention-key"><i>!</i>Someone is waiting on me</span>';
const SEG = 12,light = () => S.theme === 'light';
// Small lights travel along each link, more of them on links with more shared work (none with reduced motion;
// ?links=plain turns them off).
const FLOW = new URLSearchParams(location.search).get('links') !== 'plain',FLOW_MAX = 4;
let fGeo, fPos, fCol;
const targetR = (id) => people[id].kind === 'agent' ? 2.3 : 2.4 + (1 - Math.sqrt((M.counts[id] || 0) / M.max)) * 7.2;
const layoutStyle = () => mode === 'org' && ORG ? ORG : S;
const ctxFor = (id) => ({ T, r: targetR(id), angle: ANGLE[id] ?? 0, group: groupOf(people[id]), primary: PRIMARY[id], ids: M.ids, V, THREE });

function stars(n, rMin, rMax, size, op) {
  const pos = new Float32Array(n * 3),col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {const r = rMin + Math.random() * (rMax - rMin),t = Math.random() * Math.PI * 2,u = Math.acos(2 * Math.random() - 1);pos.set([r * Math.sin(u) * Math.cos(t), r * Math.cos(u), r * Math.sin(u) * Math.sin(t)], i * 3);const w = Math.random();col.set(w > .88 ? [1, .84, .62] : w > .72 ? [.72, .82, 1] : [.9, .92, .98], i * 3);}
  const g = new THREE.BufferGeometry();g.setAttribute('position', new THREE.BufferAttribute(pos, 3));g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: op, depthWrite: false }));scene.add(p);return p;
}
function buildNode(id) {
  const p = people[id],g = new THREE.Group();scene.add(g);
  const grp = groupOf(p),c = GROUP_COL[grp];
  const glow = sprite(GLOW, c, 1.9, light() ? .12 : .32, light());glow.position.y = .1;g.add(glow);
  const ringM = add(g, new THREE.TorusGeometry(.44, grp === 'dept' ? .012 : .026, 8, 64), new THREE.MeshBasicMaterial({ color: c, transparent: true }));ringM.rotation.x = Math.PI / 2;
  if (grp === 'line') {const r2 = add(g, new THREE.TorusGeometry(.56, .012, 6, 64), new THREE.MeshBasicMaterial({ color: 0xFFE0A6, transparent: true, opacity: .7 }));r2.rotation.x = Math.PI / 2;}
  if (grp === 'dept') {const r2 = add(g, new THREE.TorusGeometry(.52, .008, 6, 64), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .6 }));r2.rotation.x = Math.PI / 2;}
  const ch = createCharacter(g, p, c);ch.group.scale.setScalar(.82);if (ch.ring) ch.ring.visible = false;
  const halo = sprite(GLOW, c, .42, .9, light());halo.position.y = 1.15;g.add(halo);
  const flare = sprite(FLARE, light() ? 0xD13B3B : 0xffffff, 1.7, .85, light());flare.position.y = 1.15;flare.visible = false;g.add(flare);
  const hit = add(g, new THREE.SphereGeometry(.62, 10, 8), new THREE.MeshBasicMaterial({ visible: false }), 0, .6, 0);hit.userData.id = id;hits.push(hit);
  const a = Math.random() * Math.PI * 2;
  N[id] = { id, p: V(Math.cos(a) * .8, Math.random() * .3, Math.sin(a) * .8), v: V(), g, ring: ringM, glow, halo, flare, body: ch.group, orb: ch.orb ? ch : null, visible: false, phase: Math.random() * 6, yT: (id.charCodeAt(0) * 37 + id.length * 11) % 300 / 100 - 1.5 };
}
let dressingOrg = false;
function label(text, pos, cls, show, getPos) {const d = el('div', 'uv-nm ' + (cls || ''), esc(text));dom.names.append(d);extraLabels.push({ d, pos, show: show || (() => true), getPos, org: dressingOrg });return d;}

function refreshOrgLayout() {
  orgLayout = organizationLayout(people, orgs, M.ids, PERSONA_ID, HOME_ORG, CONFIG.offices, { projects: projectsAt(DATA, CONFIG, state.snapshot), records: state.visible, showHistoricalProjects: projectLayer?.showHistoricalProjects() || false });
  dom.names.classList.toggle('uv2-many-clusters', orgLayout.groups.filter((g) => g.cluster).length > 6);
  if (!orgLines) {
    orgLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf4c982, transparent: true, opacity: .4, depthWrite: false }));
    orgFrames = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7693b5, transparent: true, opacity: .25, depthWrite: false }));
    orgClouds = new THREE.Group();
    scene.add(orgLines, orgFrames, orgClouds);
  }
  for (const child of [...orgClouds.children]) {
    child.geometry?.dispose();child.material?.dispose();orgClouds.remove(child);
  }
  const points = [];
  for (const group of orgLayout.groups) {
    const x = group.x,top = group.y + 1,bottom = group.bottom;
    const left = x - group.width / 2,right = x + group.width / 2;
    if (group.cluster) {
      // Same volumetric shell language as the original relationship universe.
      // The sphere is a project container; people keep dated project membership.
      const center = V(...group.sphereCenter),radius = group.radius;
      const shell = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), new THREE.MeshBasicMaterial({ color: group.color, transparent: true, opacity: .055, depthWrite: false }));
      shell.position.copy(center);orgClouds.add(shell);
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(radius * 1.01, 2)), new THREE.LineBasicMaterial({ color: group.color, transparent: true, opacity: .22, depthWrite: false }));
      wire.position.copy(center);wire.rotation.set(.2, .35, .12);orgClouds.add(wire);
      const cloud = sprite(GLOW, group.color, radius * 2.2, .1);cloud.position.copy(center);orgClouds.add(cloud);
      const specks = [];
      for (let i = 0; i < 90; i++) {
        const a = i * 2.39996,z = 1 - 2 * (i + .5) / 90,planar = Math.sqrt(1 - z * z),r = radius * (.3 + .65 * (i * 37 % 89 / 89));
        specks.push(center.x + Math.cos(a) * planar * r, center.y + Math.sin(a) * planar * r, center.z + z * r);
      }
      const geometry = new THREE.BufferGeometry();geometry.setAttribute('position', new THREE.Float32BufferAttribute(specks, 3));
      orgClouds.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: group.color, size: .12, transparent: true, opacity: .42, depthWrite: false })));
    } else points.push(V(left, top, -.6), V(right, top, -.6), V(right, top, -.6), V(right, bottom, -.6), V(right, bottom, -.6), V(left, bottom, -.6), V(left, bottom, -.6), V(left, top, -.6));
    if (!orgHeadings.has(group.id)) {
      const d = label('', V(), 'uv2-org-heading', () => orgLayout.groups.some((g) => g.id === group.id), () => {const g = orgLayout.groups.find((g) => g.id === group.id);return V(g.x, g.y, 0);});
      extraLabels.at(-1).org = true;orgHeadings.set(group.id, d);
    }
    const d = orgHeadings.get(group.id);d.innerHTML = `<b>${esc(group.name)}</b><small>${esc(group.subtitle)}</small>`;d.style.setProperty('--org-color', group.color);
    d.classList.toggle('uv2-project-cluster', !!group.projectId);
    if (group.projectId) {d.setAttribute('role', 'button');d.tabIndex = 0;d.onclick = () => projectLayer.show(group.projectId);d.onkeydown = (e) => {if (e.key === 'Enter' || e.key === ' ') {e.preventDefault();projectLayer.show(group.projectId);}};}
  }
  for (const [id, d] of Object.entries(dom.labels)) {
    if (id === 'me') continue;
    const shared = orgLayout.personProjects[id] || [];
    const extra = shared.length > 1 ? ` <small>+${shared.length - 1}</small>` : '';
    d.innerHTML = esc(people[id].name) + `<span class="uv2-other-projects">${extra}</span>`;
    d.title = [orgs[people[id].organisation_id]?.name, ...shared.map((p) => p.name)].filter(Boolean).join(' · ');
    d.style.setProperty('--cluster-color', orgLayout.personColors[id] || '');
  }
  orgFrames.geometry.dispose();orgFrames.geometry = new THREE.BufferGeometry().setFromPoints(points);
}
function updateOrgLines() {
  if (!orgLines) return;
  orgLines.visible = orgFrames.visible = orgClouds.visible = mode === 'org' && view === 'network';
  if (!orgLines.visible) return;
  const points = [],node = (id) => N[id === PERSONA_ID ? 'me' : id];
  for (const [parent, child] of orgLayout.reports) {
    const a = node(parent)?.p,b = node(child)?.p;if (!a || !b) continue;
    const mid = (a.y + b.y) / 2;
    points.push(V(a.x, a.y - .3, -.3), V(a.x, mid, -.3), V(a.x, mid, -.3), V(b.x, mid, -.3), V(b.x, mid, -.3), V(b.x, b.y + 1, -.3));
  }
  if (orgLines.geometry.getAttribute('position')?.count !== points.length) {
    orgLines.geometry.dispose();orgLines.geometry = new THREE.BufferGeometry().setFromPoints(points);
  } else orgLines.geometry.setFromPoints(points);
}
function buildScene() {
  scene = new THREE.Scene();
  const bg = light() ? 0xE9E4D8 : 0x04060D;scene.background = new THREE.Color(bg);scene.fog = new THREE.FogExp2(bg, light() ? .01 : .016);
  cam = new THREE.PerspectiveCamera(48, 1, .1, 600);
  scene.add(new THREE.HemisphereLight(light() ? 0xFFFFFF : 0xC8D8FF, light() ? 0xB9A98A : 0x141a2a, light() ? 1.1 : .9));
  const key = new THREE.DirectionalLight(0xFFF1DC, .9);key.position.set(-6, 10, 8);scene.add(key);
  if (!light()) {dust = stars(3200, 80, 220, .7, .75);stars(500, 25, 60, .22, .9);[[0x3a4f9a, -40, 10, -70, 60], [0x6a3f7a, 50, -14, -60, 50], [0x1f5a6a, 10, 24, -90, 70]].forEach(([c, x, y, z, s]) => {const n = sprite(GLOW, c, s, .18);n.position.set(x, y, z);scene.add(n);});}
  const meG = new THREE.Group();scene.add(meG);
  meGlow = sprite(GLOW, 0xFFC977, 6.5, light() ? .25 : .55, light());meG.add(meGlow);meCore = sprite(GLOW, 0xFFE7BF, 2.6, .9, light());meCore.position.y = .6;meG.add(meCore);
  meRing = add(meG, new THREE.TorusGeometry(1.05, .03, 8, 96), new THREE.MeshBasicMaterial({ color: light() ? 0xC9822E : 0xFFD08A }));meRing.rotation.x = Math.PI / 2;
  {const d = new THREE.Group();meG.add(d);d.position.set(0, 0, -.5);d.scale.setScalar(.75);add(d, new THREE.BoxGeometry(1.6, .07, .8), mat(0xC4A77E), 0, .74, 0);for (const x of [-.72, .72]) for (const z of [-.32, .32]) add(d, new THREE.BoxGeometry(.05, .74, .05), mat(0x8c947c), x, .37, z);add(d, new THREE.BoxGeometry(.7, .45, .04), mat(0x2B3440), 0, 1.05, -.28);add(d, new THREE.BoxGeometry(.64, .39, .01), mat(0xCFE3F5, { emissive: 0x9CC3E0, emissiveIntensity: .7 }), 0, 1.05, -.255);add(d, new THREE.BoxGeometry(.34, .03, .44), mat(0x81957a), -.52, .79, .08);add(d, new THREE.BoxGeometry(.3, .012, .4), mat(0xf4eedc), -.51, .81, .08);add(d, new THREE.BoxGeometry(.38, .07, .44), mat(0xbe936b), .52, .81, .06);}
  const me = createCharacter(meG, persona || { id: PERSONA_ID, kind: 'human' }, 0x1e2430);me.group.rotation.y = Math.PI;if (me.ring) me.ring.visible = false;
  N.me = { id: 'me', p: V(), v: V(), fixed: true, g: meG, visible: true };
  for (const p of DATA.people) if (p.id !== PERSONA_ID) buildNode(p.id);
  const cap = 400;eGeo = new THREE.BufferGeometry();ePos = new Float32Array(cap * SEG * 6);eCol = new Float32Array(cap * SEG * 6);
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));eGeo.setAttribute('color', new THREE.BufferAttribute(eCol, 3));
  scene.add(new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: light() ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false })));
  if (FLOW) {fGeo = new THREE.BufferGeometry();fPos = new Float32Array(cap * FLOW_MAX * 3);fCol = new Float32Array(cap * FLOW_MAX * 3);
    fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3));
    scene.add(new THREE.Points(fGeo, new THREE.PointsMaterial({ map: GLOW, size: .42, vertexColors: true, transparent: true, depthWrite: false, blending: light() ? THREE.NormalBlending : THREE.AdditiveBlending })));}
  ecoG = new THREE.Group();scene.add(ecoG);
  projectLayer = createUniverse2Projects({ scene, root: dom.canvas.parentElement, labels: dom.names, onPerson: select, onFocus: () => select(null),
    peopleDisplay: () => ({ ids: M.ids, historyCount: historicalPeople.size, showHistory: showHistoricalPeople }),
    onProjectHistory: () => refreshUniverse({ animatePeople: true }),
    onPeopleHistory: (checked) => {showHistoricalPeople = checked;hover = null;refreshUniverse({ animatePeople: true });},
    projectHidden: (id) => filters.projectHidden(id),
    onProjectFilter: (id, solo, all) => {filters.toggleProject(id, solo, all);afterFilter();} });
  if (CONFIG.contribution_report) contributionGalaxy = createContributionGalaxy({ scene, labels: dom.names, onOpen: openContributions, anisotropy: R.capabilities.getMaxAnisotropy(), projects: PROJECTS.map((p) => ({ color: p.color })) });
  deskCompanions = createDeskCompanions({ scene, labels: dom.names, people, onSelect: openDeskPerson });
  S.ctx = { scene, THREE, V, sprite, GLOW, add, mat, ring, massing, projects: PROJECTS, label, N, ids: () => M?.ids || [], get T() {return T;} };
  S.dress?.(S.ctx);
  if (ORG && ORG !== S) {dressingOrg = true;ORG.dress?.(S.ctx);dressingOrg = false;}
}

function buildDom(root) {
  root.innerHTML = `<canvas class="uv-sky" tabindex="0" aria-label="3D map of people: drag people around, click someone to see everything between you"></canvas>
  <div class="uv-overlay"><div class="uv-names"></div><div class="uv-objs"></div></div>
  <button class="uv2-details-toggle uv-glass" aria-expanded="false" aria-controls="uv2ProjectSidebar uv2Legend">☰ Projects &amp; legend</button>
  <button class="uv2-filter-chip uv-glass" hidden title="A filter is on; click to show everything"></button>
  <nav class="uv-modes uv-glass" aria-label="Layout"><button data-m="graph" class="on">Universe</button><button data-m="org">Org chart</button><button data-m="projects">Projects</button></nav>
  <section class="uv-desk uv-glass" hidden></section>
  <button class="uv-rem-btn uv-glass" aria-expanded="false"><span class="n">0</span>AI reminders</button>
  <div class="uv-rem uv-glass" hidden></div>
  <div id="uv2Legend" class="uv-legend uv-glass">${S.legend || ''}${attentionLegend}</div>
  <div class="uv-hint">Drag people to pin them · drag to rotate · Shift-drag to pan · scroll to zoom · click someone to see your work together</div>
  <div class="uv-insight" hidden></div>
  <section class="uv2-floating-work" aria-label="Work cards beside the selected person" hidden></section>`;
  dom.canvas = root.querySelector('.uv-sky');dom.names = root.querySelector('.uv-names');dom.objs = root.querySelector('.uv-objs');
  dom.floatingWork = root.querySelector('.uv2-floating-work');
  dom.insight = root.querySelector('.uv-insight');dom.rem = root.querySelector('.uv-rem');dom.remBtn = root.querySelector('.uv-rem-btn');
  if (document.body.classList.contains('uv2-standalone')) {
    const controls = el('div', 'uv2-scene-actions');
    dom.remBtn.before(controls);
    const reset = document.getElementById('uv2ResetView');
    reset.classList.add('uv-glass');
    controls.append(reset, dom.remBtn);
  }
  dom.deskBtns = [['today', 'Today’s work', V(0, 1.45, -.75)], ['notebook', 'Work notes', V(-.45, .85, -.4)], ['projects', 'Shared projects', V(.45, .85, -.4)], ['network', 'Open my connections', V(0, .05, 1.25)]].map(([entry, text, pos]) => {
    const b = el('button', 'uv-deskbtn', text);
    if (entry === 'network') b.innerHTML = icon('network') + `<span>${text}</span>`;
    b.onclick = () => {
      if (entry === 'network') {
        actions.setView?.('network');
        // This desk shortcut always opens Universe, regardless of the last Connections layout.
        setLayoutMode('graph');
      } else {deskEntry = entry;deskPanelOpen = true;renderDesk();}
    };
    dom.names.append(b);return { b, entry, pos };
  });
  dom.desk = root.querySelector('.uv-desk');dom.modes = root.querySelector('.uv-modes');dom.legend = root.querySelector('.uv-legend');dom.manualNotice = root.querySelector('.uv2-manual-layout');dom.detailsToggle = root.querySelector('.uv2-details-toggle');
  // The project list ends just above the legend, whatever the legend's height, so the two boxes read as one column.
  const fitRail = () => {const list = root.querySelector('.uv2-projects');if (!list) return;const r = dom.legend.getBoundingClientRect();
    list.style.bottom = r.height ? list.offsetParent.getBoundingClientRect().bottom - r.top + 10 + 'px' : '';};
  new ResizeObserver(fitRail).observe(dom.legend);addEventListener('resize', fitRail);
  // Share the top navigation row without putting controls behind the header.
  document.querySelector('body > header').append(dom.modes);
  dom.detailsToggle.onclick = () => {detailsOpen = !detailsOpen;updateDetailsVisibility();};
  dom.filterChip = root.querySelector('.uv2-filter-chip');dom.filterChip.onclick = () => {filters.clear();afterFilter();};
  updateDetailsVisibility();
  dom.modes.querySelectorAll('button').forEach((b) => b.onclick = () => setLayoutMode(b.dataset.m));
  dom.remBtn.onclick = () => {dom.rem.hidden = !dom.rem.hidden;dom.remBtn.setAttribute('aria-expanded', String(!dom.rem.hidden));};
  dom.labels = {};dom.attention = {};
  const meL = el('div', 'uv-nm me', `${esc(persona?.name || 'Me')} · me`);dom.names.append(meL);dom.labels.me = meL;
  for (const p of DATA.people) if (p.id !== PERSONA_ID) {const d = el('div', 'uv-nm', esc(p.name));dom.names.append(d);dom.labels[p.id] = d;d.setAttribute('role', 'button');d.tabIndex = 0;d.onclick = () => select(p.id);d.onkeydown = (e) => {if (e.key === 'Enter' || e.key === ' ') {e.preventDefault();select(p.id);}};}
  for (const p of DATA.people) if (p.id !== PERSONA_ID) {
    const b = el('button', 'uv2-attention-badge', '!');b.hidden = true;b.dataset.person = p.id;
    b.onclick = () => {state.selectedProject = attention[p.id]?.[0]?.projectId || null;select(p.id, false);};
    b.onpointerenter = () => {hover = p.id;};b.onpointerleave = () => {hover = null;};
    dom.names.append(b);dom.attention[p.id] = b;
  }
}
function updateDetailsVisibility() {
  const shown = detailsOpen && view === 'network';
  document.body.classList.toggle('uv2-details-open', shown);
  dom.detailsToggle.hidden = view !== 'network';
  dom.detailsToggle.setAttribute('aria-expanded', String(shown));
  dom.detailsToggle.textContent = shown ? '‹ Hide projects & legend' : '☰ Projects & legend';
  updateFilterChip();
}
// Layout changes are local to Universe 2; archive knowledge remains date-driven.
function setLayoutMode(next) {
  const changed = mode !== next;
  mode = next;
  document.body.classList.toggle('uv2-org-mode', mode === 'org');
  if (N.me && (changed || !N.me.manual)) N.me.p.set(...(mode === 'org' ? orgLayout.positions[PERSONA_ID] : [0, 0, 0]));
  projectLayer?.setOrgMode(mode === 'org');
  if (changed) {
    resetOverview();
    projectLayer?.setProjectMode(mode === 'projects');
  }
  dom.modes.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', b.dataset.m === mode);
    b.setAttribute('aria-pressed', String(b.dataset.m === mode));
  });
  const projects = mode === 'projects';
  dom.legend.innerHTML = projects ? '<h4>Project sky</h4><span><i style="background:#ffd08a"></i>Me, at the centre · my projects around me</span><p>Current projects are shown by default. Tick “Show past projects” to see every project up to the selected date; their status changes over time.</p>' : ((mode === 'org' && ORG ? ORG : S).legend || '') + attentionLegend;
  if (!projects) renderLegend();
  dom.rem.hidden = true;dom.remBtn.setAttribute('aria-expanded', 'false');
  dom.remBtn.hidden = projects;
  dom.canvas.setAttribute('aria-label', projects ? '3D project sky: my projects around me; click a project for details' : '3D map of people: drag people around, click someone to see everything between you');
  dom.canvas.parentElement.querySelector('.uv-hint').textContent = projects ? 'Drag to rotate · Shift-drag to pan · scroll to zoom · click a project for details' : 'Drag people to pin them · drag to rotate · Shift-drag to pan · scroll to zoom · click someone to see your work together';
  document.getElementById('uv2HistoryLabel').textContent = 'Show past projects';
}
function renderLegend() {
  if (!dom.legend || mode === 'projects') return;
  const base = (mode === 'org' && ORG ? ORG : S).legend || '',note = (base.match(/<p>[\s\S]*<\/p>/) || [''])[0];
  const head = mode === 'org' && ORG ? base.replace(note, '') : '<h4>Legend</h4>';
  // no explanatory sentence: the tick list has to fit the legend box without scrolling
  dom.legend.innerHTML = head + (filters.active() ? '<button class="uv2-filter-clear">Filtered · show all</button>' : '') + groupFilterHTML(filters, groupCounts) + attentionLegend;
  dom.legend.scrollTop = 0;
  dom.legend.querySelectorAll('[data-group]').forEach((b) => b.onclick = (e) => {filters.toggleGroup(b.dataset.group, e.altKey);afterFilter();});
  dom.legend.querySelector('.uv2-filter-clear')?.addEventListener('click', () => {filters.clear();afterFilter();});
}
function updateFilterChip() {// visible even when the left panel is folded away
  const chip = dom.filterChip;if (!chip) return;
  chip.hidden = !filters.active() || view !== 'network';
  if (chip.hidden) return;
  chip.innerHTML = `Filtered${filteredOut ? ` · ${filteredOut} hidden` : ''}<b aria-hidden="true">×</b>`;
  const t = dom.detailsToggle;chip.style.top = t.offsetTop + 'px';chip.style.left = t.offsetLeft + t.offsetWidth + 8 + 'px';
}
function afterFilter() {hover = null;refreshUniverse({ animatePeople: true });}
// Manual placement is a view preference, never a relationship/data edit.
function clearManualLayout() {
  finishPeopleTransition();
  for (const n of Object.values(N)) {
    if (automaticPositions?.[n.id]) n.p.copy(automaticPositions[n.id]);
    n.manual = false;n.fixed = n.id === 'me';n.v.set(0, 0, 0);
  }
  if (N.me) N.me.p.set(...(mode === 'org' && view === 'network' ? orgLayout.positions[PERSONA_ID] : [0, 0, 0]));
  automaticPositions = null;
  drag = null;
  if (dom.canvas) dom.canvas.style.cursor = 'grab';
  dom.manualNotice?.setAttribute('hidden', '');
}
function resetOverview() {
  clearManualLayout();
  panOffset.set(0, 0, 0);
  drag = null;hover = null;
  select(null);
  projectLayer?.close();projectLayer?.refresh();
  personLens = null;lensContext = '';
  theta = view === 'desk' ? -.75 : mode === 'org' ? 0 : .6;phi = view === 'desk' ? 1.12 : mode === 'org' ? 1.32 : S.camera?.phi || .95;zoom = defaultZoom(view, mode);
}
const initials = (n) => n.split(' ').map((s) => s[0]).join('').slice(0, 2);

function renderReminders() {
  attention = attentionAt(DATA, state.snapshot, PERSONA_ID);
  const ranked = M.ids.map((id) => ({ id, ins: insightFor(id, M) })).filter((x) => x.ins.score > 0).sort((a, b) => b.ins.score - a.ins.score).slice(0, 4);
  dom.remBtn.querySelector('.n').textContent = ranked.length;
  dom.rem.innerHTML = `<h4>${ICON.ai}AI reminders for today</h4>` + (ranked.length ? ranked.map(({ id, ins }) => `<button class="uv-rem-item" data-id="${id}"><span class="av" style="background:${GROUP_CSS[groupOf(people[id])]}">${initials(people[id].name)}</span><span><b>${esc(people[id].name)}</b><span>${esc(ins.title)}</span></span></button>`).join('') : '<p>Nothing needs a reminder right now.</p>');
  dom.rem.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => select(b.dataset.id));
  for (const id of Object.keys(N)) {
    if (id === 'me') continue;
    const needs = attention[id] || [],flag = needs.length > 0;
    N[id].flare.visible = flag;N[id].alert = flag;
    const badge = dom.attention[id];
    badge.hidden = !flag || view !== 'network';
    badge.title = `${people[id].name} · ${plural(needs.length, 'item')} waiting on me\n` + needs.map((n) => `${n.label}: ${n.text}`).join('\n');
    badge.setAttribute('aria-label', `${people[id].name}: ${plural(needs.length, 'item')} waiting on me; see what they are`);
  }
}
let personLens = null,lensContext = '';
function sharedProjects(id) {
  const counts = {};
  for (const r of state.visible) if (TEXT_KINDS.has(r.kind) && !isSmallTalkOnly(r) && r.participant_ids.includes(id) && r.project_id) counts[r.project_id] = (counts[r.project_id] || 0) + 1;
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
}
function chooseProject(pid) {
  state.selectedProject = pid;
  projectLayer?.show(pid);
}
function select(id, useCluster = true) {
  if (useCluster && id && mode === 'org' && orgLayout.personProjects[id]?.length) state.selectedProject = orgLayout.personProjects[id][0].id;
  if (id && mode === 'projects') {
    const project = state.selectedProject;
    setLayoutMode('graph');
    state.selectedProject = project;
  }
  projectLayer?.selectPerson();
  selected = id;dom.objs.innerHTML = '';
  if (!id) {dom.insight.hidden = true;dom.floatingWork.hidden = true;return;}
  const projectIds = sharedProjects(id),key = [id, state.snapshot.date, state.selectedProject].join(':');
  if (key !== lensContext) {personLens = [state.selectedProject, state.snapshot.desk.focus_project_id, ...projectIds].find((pid) => projectIds.includes(pid)) || null;lensContext = key;}
  const p = people[id],grp = groupOf(p),ins = insightFor(id, M, personLens),items = itemsFor(id, personLens);
  const projects = new Set(projectIds.filter((pid) => pid !== DAILY_PROJECT));
  const priority = { pending: 0, review: 1, history: 2 };
  floatingItems = items.slice().sort((a, b) => priority[a.bucket] - priority[b.bucket]);
  floatingPage = 0;
  renderFloatingWork();
  dom.floatingWork.hidden = false;
  dom.insight.innerHTML = `<div class="who"><div class="av" style="background:${GROUP_CSS[grp]}">${initials(p.name)}</div><div class="who-copy"><b>${esc(p.name)}</b><span>${esc(p.role || '')}</span></div><button class="x" aria-label="Close">×</button></div>
    <div class="uv2-work-scroll" tabindex="0" role="region" aria-label="Work with this person">
      <div class="facts"><span class="rel" style="background:${GROUP_CSS[grp]}">${esc(relLabel(p))}</span><span>${plural(M.counts[id] || 0, 'exchange')} so far</span><span>${plural(projects.size, 'shared project')}</span></div>
      <nav class="acts" aria-label="Project lens for this person">${[...projectIds, null].map((pid) => `<button data-lens="${pid || ''}" aria-pressed="${pid === personLens}" class="${pid === personLens ? 'primary' : ''}">${pid ? esc(short[pid]) : 'All'}</button>`).join('')}</nav>
      <p class="uv2-work-scope">As of ${esc(fullDate(state.snapshot.date))} · ${personLens ? esc(short[personLens]) : 'All shared projects'}<br>Open items include work waiting on either side; click any card to see its source.</p>
      <div class="uv2-narrow-work-list">${workListHTML(items)}</div>
      ${(attention[id] || []).length ? `<details class="uv2-attention-detail uv2-work-section"><summary>Waiting on me across all projects · ${attention[id].length}</summary>${attention[id].map((n) => `<button data-rid="${esc(n.recordId)}"><b>${esc(n.label)} · ${esc(short[n.projectId] || '')}</b><span>${esc(n.text)}</span></button>`).join('')}</details>` : ''}
      <details class="uv2-work-section uv2-work-summary" open><summary>Summary and suggestion</summary>
        <h5>${ICON.ai}<span>${esc(ins.title)}</span></h5>
        <ul>${ins.pts.map(([t, txt]) => `<li><i style="color:${ICOL[t]}">${ICON[t]}</i><span>${txt}</span></li>`).join('') || '<li><i></i><span>No summary yet.</span></li>'}</ul>
        ${ins.sug ? `<div class="sug"><b>Suggestion · </b>${ins.sug}</div>` : ''}
        <div class="acts">${ins.acts.map(([t, rid], i) => `<button class="${i ? '' : 'primary'}" data-rid="${rid}">${esc(t)}</button>`).join('')}</div>
        <small class="note">Put together by simple rules from the fictional archive.</small>
      </details>
    </div>`;
  dom.insight.hidden = false;dom.rem.hidden = true;
  dom.insight.querySelectorAll('[data-lens]').forEach((b) => b.onclick = () => {personLens = b.dataset.lens || null;select(id);});
  dom.insight.querySelector('.x').onclick = () => select(null);
  dom.insight.querySelectorAll('[data-rid]').forEach((b) => b.onclick = () => {if (b.dataset.rid) openRecord(b.dataset.rid);});
}

// ---------------- physics ----------------
const tmp = V();
function step(motionScale = 1) {
  if (mode === 'org' && view === 'network') {
    for (const n of Object.values(N)) if (n.visible && !n.manual && drag?.id !== n.id) {
      const p = orgLayout.positions[n.id === 'me' ? PERSONA_ID : n.id];if (p) {n.p.lerp(V(...p), .18);n.v.set(0, 0, 0);}
    }
    return;
  }
  const vis = Object.values(N).filter((n) => n.visible),L = layoutStyle(),free = !L.layout;
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {const a = vis[i],b = vis[j];tmp.subVectors(a.p, b.p);const d2 = Math.max(.25, tmp.lengthSq());tmp.normalize().multiplyScalar((free ? 3.4 : .9) / d2);if (!a.fixed) a.v.add(tmp);if (!b.fixed) b.v.sub(tmp);}
  if (free) for (const [ai, bi, w] of edges) {const a = N[ai],b = N[bi];if (!a?.visible || !b?.visible) continue;tmp.subVectors(b.p, a.p);const d = tmp.length() || .001;const f = .012 * w * (d - (2 + (5 - w) * .55));tmp.multiplyScalar(f / d);if (!a.fixed) a.v.add(tmp);if (!b.fixed) b.v.sub(tmp);}
  for (const n of vis) {if (n.fixed) continue;
    if (free) {const r = n.p.length() || .001;n.v.addScaledVector(n.p, -.05 * (r - targetR(n.id)) / r);n.v.y += -.02 * (n.p.y - n.yT);} else
    {tmp.subVectors(L.layout(n.id, ctxFor(n.id)), n.p);n.v.addScaledVector(tmp, .09);}
    n.v.multiplyScalar(.84);n.p.addScaledVector(n.v, .6 * motionScale);}
}

// ---------------- interaction ----------------
const ray = new THREE.Raycaster(),ptr = new THREE.Vector2(),plane = new THREE.Plane(),hitPt = V();
let drag = null;
function pick(e) {const r = dom.canvas.getBoundingClientRect();ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);ray.setFromCamera(ptr, cam);if (view === 'desk') return null;const hit = ray.intersectObjects(hits.filter((h) => mode !== 'projects' && N[h.userData.id].visible && (N[h.userData.id].presence ?? 1) > .5), false)[0];return hit ? hit.object.userData.id : null;}
function bindPointer() {
  const c = dom.canvas;
  c.title = 'Drag to rotate · Shift-drag to pan · scroll to zoom';
  c.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const pan = e.shiftKey,id = pan ? null : pick(e);
    if (id && peopleTransition) finishPeopleTransition(false);
    const contribution = !pan && !id && view === 'desk' && contributionVisible() && contributionGalaxy?.hit(ray);
    const project = pan || id || view === 'desk' ? null : projectLayer?.hit(ray)?.object.userData.project;
    c.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, id, project, contribution, pan, moved: false, th: theta, ph: phi,
      start: id ? N[id].p.clone() : null,
      panStart: panOffset.toArray(), right: V(1, 0, 0).applyQuaternion(cam.quaternion).toArray(),
      up: V(0, 1, 0).applyQuaternion(cam.quaternion).toArray(),
      panScale: 2 * dist * Math.tan(cam.fov * Math.PI / 360) / Math.max(1, c.clientHeight) };
    if (pan) {e.preventDefault();c.style.cursor = 'move';}
    if (id) plane.setFromNormalAndCoplanarPoint(cam.getWorldDirection(V()).negate(), N[id].p);
  });
  c.addEventListener('pointermove', (e) => {
    if (drag) {if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
      if (drag.pan && drag.moved) {
        const next = V(...draggedPan(drag.panStart, e.clientX - drag.x, e.clientY - drag.y, drag.right, drag.up, drag.panScale));
        look.add(next.clone().sub(panOffset));panOffset.copy(next);c.style.cursor = 'move';
      } else if (drag.id && drag.moved) {const n = N[drag.id];
        if (!automaticPositions) automaticPositions = Object.fromEntries(Object.values(N).map((node) => [node.id, node.p.clone()]));
        n.fixed = true;const r = c.getBoundingClientRect();ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);ray.setFromCamera(ptr, cam);if (ray.ray.intersectPlane(plane, hitPt)) {n.p.copy(hitPt);n.v.set(0, 0, 0);}c.style.cursor = 'grabbing';} else
      if (!drag.id && drag.moved) {theta = drag.th - (e.clientX - drag.x) * .005;phi = draggedPitch(drag.ph, e.clientY - drag.y, mode === 'org' && view === 'network');}} else
    {hover = e.shiftKey ? null : pick(e);c.style.cursor = e.shiftKey ? 'move' : hover || view === 'desk' && contributionVisible() && contributionGalaxy?.hit(ray) || view !== 'desk' && projectLayer?.hit(ray) ? 'pointer' : 'grab';}});
  c.addEventListener('pointerup', () => {if (drag) {if (drag.id) {const n = N[drag.id];
        if (drag.moved) {n.manual = true;n.fixed = true;n.v.set(0, 0, 0);} else
        select(drag.id);} else if (!drag.moved && !drag.pan) {if (drag.contribution) openContributions();else if (drag.project) projectLayer.show(drag.project);else {select(null);projectLayer?.close();projectLayer?.refresh();}}}drag = null;c.style.cursor = 'grab';});
  c.addEventListener('pointercancel', () => {
    if (drag?.pan) {const start = V(...drag.panStart);look.add(start.clone().sub(panOffset));panOffset.copy(start);}
    if (drag?.id) {const n = N[drag.id];n.p.copy(drag.start);n.fixed = n.id === 'me' || !!n.manual;n.v.set(0, 0, 0);}
    drag = null;c.style.cursor = 'grab';
  });
  c.addEventListener('wheel', (e) => {e.preventDefault();zoom = Math.max(.45, Math.min(1.9, zoom + e.deltaY * .0012));}, { passive: false });
  c.addEventListener('keydown', (e) => {if (e.key === 'Escape') {select(null);projectLayer?.close();projectLayer?.refresh();}});
}

// ---------------- frame ----------------
const pv = V(),cv = V(),pa = V(),pb = V(),q0 = V(),q1 = V(),colTmp = new THREE.Color(),up = V(0, 1, 0);
let last = performance.now();
let scenarioEntryPending = false,scenarioEntryElapsed = SCENARIO_ENTRY_SECONDS;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000);last = now;if (!reduced) T += dt;
  if (document.hidden || projectSpaceOpen() || !M) return;
  const entering = scenarioEntryPending;
  if (entering) {
    // Skip only the initial high-energy expansion, retaining velocities and the
    // normal force simulation, character sway and effects after arrival.
    for (let i = 0; i < 120; i++) step();
    scenarioEntryPending = false;scenarioEntryElapsed = 0;
    dom.canvas.parentElement.classList.add('uv2-scenario-enter');
  }
  const arrivalScale = reduced ? 1 : scenarioEntryMotion(scenarioEntryElapsed);
  if (peopleTransition) advancePeopleTransition(dt);else {step(arrivalScale);step(arrivalScale);}
  scenarioEntryElapsed = Math.min(SCENARIO_ENTRY_SECONDS, scenarioEntryElapsed + dt);
  S.update?.(dt, S.ctx);
  if (ORG && ORG !== S) {if (mode === 'org') ORG.update?.(dt, S.ctx);else {for (const [s1, w1] of Object.values(S.ctx.shells || {})) s1.visible = w1.visible = false;if (S.ctx.report) S.ctx.report.visible = false;}}
  if (dust) dust.material.opacity = mode === 'org' ? .15 : .75;
  scene.fog.density = mode === 'org' ? .002 : light() ? .01 : .016;
  updateOrgLines();
  const focus = view === 'network' && mode !== 'projects' ? mode === 'org' ? selected : selected || hover : null;const lit = new Set();
  const still = !focus && !drag; // nothing selected: the world holds still
  if (focus) {lit.add(focus);lit.add('me');for (const [a, b] of edges) {if (a === focus) lit.add(b);if (b === focus) lit.add(a);}}
  for (const n of Object.values(N)) {n.g.position.copy(n.p);n.g.scale.setScalar(mode === 'org' && view === 'network' ? 2.8 : 1);if (n.id === 'me') continue;n.g.visible = (n.visible || (n.presence || 0) > 0) && view === 'network' && mode !== 'projects';if (!n.g.visible) continue;
    if (S.normal) n.g.quaternion.setFromUnitVectors(up, S.normal(n.p));else if (!still && !n.manual) n.g.position.y += Math.sin(T * 1.2 + n.phase) * .05;
    const color = mode === 'org' ? orgLayout.personColors[n.id] : null;
    for (const material of [n.ring.material, n.glow.material, n.halo.material]) material.color.set(color || GROUP_COL[groupOf(people[n.id])]);
    const on = !focus || lit.has(n.id),presence = n.presence ?? 1;
    n.glow.material.opacity = (on ? light() ? .12 : .32 : .05) * (selected === n.id ? 1.8 : 1) * presence;n.ring.material.opacity = (on ? .95 : .18) * presence;
    n.halo.scale.setScalar(.42 * (n.alert ? 1.6 : .8) * (still ? 1 : 1 + Math.sin(T * 3 + n.phase) * .12));n.halo.material.opacity = (on ? .9 : .15) * presence;
    if (n.flare.visible) {n.flare.material.opacity = (on ? .85 : .1) * presence;n.flare.scale.setScalar(1.7 * (still ? 1 : 1 + Math.sin(T * 3) * .1));}
    if (n.orb) {if (!still) {n.orb.halo.rotation.z = T;n.orb.float.position.y = .9 + Math.sin(T * 1.8 + n.phase) * .08;}} else if (!S.normal) n.body.rotation.y = Math.atan2(-n.p.x, -n.p.z) + Math.PI;
    n.body.traverse((m) => {if (m.material && !m.material.isMeshStandardMaterial) {m.material.userData.basePresenceOpacity ??= m.material.opacity;m.material.transparent = true;m.material.opacity = m.material.userData.basePresenceOpacity * presence;}if (m.material?.isMeshStandardMaterial) {m.material.transparent = true;m.material.opacity = (on ? 1 : .22) * presence;}});}
  if (!still) {meCore.material.opacity = .8 + Math.sin(T * 1.5) * .1;meRing.rotation.z = T * .2;}
  // links, drawn as SEG small segments so styles can curve them
  const lift = S.linkHeight ?? .55,edgePoint = S.edgePoint || straight;let i = 0,f = 0;
  for (const [a, b, w] of edges) {const A = N[a],B = N[b];if (!A || !B) continue;const presence = Math.min(A.presence ?? 1, B.presence ?? 1),vis = presence > 0;
    if (mode === 'org' && (!selected || a !== selected && b !== selected)) continue;
    pa.copy(A.p);pb.copy(B.p);if (S.normal) {pa.addScaledVector(S.normal(A.p), lift);pb.addScaledVector(S.normal(B.p), lift);} else {pa.y += lift;pb.y += lift;}
    let k = vis ? .1 + w * .06 : 0,c = light() ? 0x5A6B8C : 0xBFD0FF;
    if (focus) {const touch = a === focus || b === focus;k = vis ? touch ? .9 : .035 : 0;if (touch) c = a === 'me' || b === 'me' ? light() ? 0xC2702A : 0xFFD08A : light() ? 0x3E6FC4 : 0x9EC2FF;}
    k *= presence;
    if (light()) k = Math.min(1, k * 1.4);
    colTmp.setHex(c);if (!light()) colTmp.multiplyScalar(k);else colTmp.lerp(new THREE.Color(0xE9E4D8), 1 - k);
    for (let s = 0; s < SEG; s++) {edgePoint(pa, pb, s / SEG, q0, S.ctx);edgePoint(pa, pb, (s + 1) / SEG, q1, S.ctx);const o = (i * SEG + s) * 6;ePos.set([q0.x, q0.y, q0.z, q1.x, q1.y, q1.z], o);eCol.set([colTmp.r, colTmp.g, colTmp.b, colTmp.r, colTmp.g, colTmp.b], o);}
    i++;
    // flow: 0-3 lights by weight, travelling from the busier end
    if (FLOW && k > .05 && !reduced) {const lights = Math.min(FLOW_MAX, Math.round((w - 1) * .75)); // about a quarter fewer than one per weight step
      for (let n = 0; n < lights; n++) {edgePoint(pa, pb, (T * .12 + n / lights + (a.length + b.length) * .07) % 1, q0, S.ctx);fPos.set([q0.x, q0.y, q0.z], f * 3);
        const glow = Math.min(1, k * 2.2);fCol.set([colTmp.r / Math.max(k, .01) * glow, colTmp.g / Math.max(k, .01) * glow, colTmp.b / Math.max(k, .01) * glow], f * 3);f++;}}}
  eGeo.setDrawRange(0, view === 'desk' || mode === 'projects' ? 0 : i * SEG * 2);eGeo.attributes.position.needsUpdate = true;eGeo.attributes.color.needsUpdate = true;
  if (fGeo) {fGeo.setDrawRange(0, view === 'desk' || mode === 'projects' ? 0 : f);fGeo.attributes.position.needsUpdate = true;fGeo.attributes.color.needsUpdate = true;}
  if (!reduced && focus && Math.random() < dt * 3) {const pool = edges.filter(([a, b]) => N[a]?.visible && N[b]?.visible && (!focus || a === focus || b === focus));if (pool.length) {const e = pool[Math.floor(Math.random() * pool.length)];const s = sprite(GLOW, focus ? 0xFFE0A6 : 0xCFE0FF, .32, 1, light());if (light()) s.material.color.setHex(0xC2702A);scene.add(s);sparks.push({ s, a: e[0], b: e[1], t: 0, dir: Math.random() < .5 });}}
  for (let j = sparks.length - 1; j >= 0; j--) {const sp = sparks[j];sp.t += dt * .55;if (mode === 'projects' || sp.t >= 1 || !N[sp.a].visible || !N[sp.b].visible) {scene.remove(sp.s);sp.s.material.dispose();sparks.splice(j, 1);continue;}
    pa.copy(N[sp.a].p);pb.copy(N[sp.b].p);if (S.normal) {pa.addScaledVector(S.normal(N[sp.a].p), lift);pb.addScaledVector(S.normal(N[sp.b].p), lift);} else {pa.y += lift;pb.y += lift;}
    edgePoint(pa, pb, sp.dir ? sp.t : 1 - sp.t, sp.s.position, S.ctx);sp.s.material.opacity = Math.sin(sp.t * Math.PI);}
  // ecosystem
  const sel = selected && N[selected],showEco = mode !== 'projects' && sel && sel.visible;
  if (showEco) {cv.copy(sel.p);if (S.normal) cv.addScaledVector(S.normal(sel.p), .7);else cv.y += .7;ecoG.position.lerp(cv, .2);}
  // camera
  let ext = 3;for (const n of Object.values(N)) if (n.visible && mode !== 'projects') ext = Math.max(ext, Math.hypot(n.p.x, n.p.z));
  if (S.ctx.planets || S.id === 'studio' || S.id === 'table' || S.id === 'moon') ext = Math.max(ext, 11);
  ext = Math.max(ext, projectLayer?.radius() || 0);
  const projectFocus = projectLayer?.focus();
  const w = dom.canvas.clientWidth,h = dom.canvas.clientHeight,aspect = w / Math.max(1, h);
  if (view === 'desk') lookGoal.set(...(deskPeople.length ? [.5, .7, -1.4] : [0, .9, 0]));else if (mode === 'org') lookGoal.set(...orgLayout.center);else if (showEco) lookGoal.copy(ecoG.position);else if (projectFocus) lookGoal.copy(projectFocus);else lookGoal.set(0, .4, 0);
  let deskDistance = deskPeople.length ? 11.6 : 6.2;
  if (view === 'desk' && contributionVisible() && contributionGalaxy) {
    const canvasTop = dom.canvas.getBoundingClientRect().top;
    const headerBottom = document.querySelector('body > header')?.getBoundingClientRect().bottom || 0;
    // Fit the default pose, then apply the user's zoom/pan normally. Manual rotation must not pump the camera distance.
    deskDistance = Math.max(deskDistance, contributionGalaxy.framingDistance(lookGoal,
    orbitFrame(-.75, 1.12), cam.fov, w, h, Math.max(0, headerBottom - canvasTop) + 14));
  }
  lookGoal.add(panOffset);
  const orgDistance = orgLayout ? Math.max(orgLayout.height / .63, orgLayout.width / (aspect * .88)) / (2 * Math.tan(24 * Math.PI / 180)) : 50;
  const d = (view === 'desk' ? deskDistance : mode === 'org' ? orgDistance : showEco || projectFocus ? 15.5 : S.camera?.dist ? S.camera.dist(ext) : Math.max(9, ext * 2.1 + 4)) * zoom * (mode === 'projects' && view === 'network' && !projectFocus ? 1.18 : 1) * (aspect < 1 ? 1.4 : 1);
  // Keep the user-selected pitch after dragging; desk defaults apply only on entry or Reset view.
  const k = reduced || entering ? 1 : 1 - Math.exp(-dt * 2.2);dist += (d - dist) * k;look.lerp(lookGoal, k);
  const orbit = orbitFrame(theta, phi);
  positionOrbitCamera(cam, orbit, dist, look);
  deskCompanions?.frame(cam, w, h, view === 'desk');
  {const sky = view === 'desk' && !light(); // on the desk, Grace sits in the contribution nebula's violet light
    meGlow.material.color.set(sky ? 0xA996FF : 0xFFC977);meCore.material.color.set(sky ? 0xE8E2FF : 0xFFE7BF);}
  contributionGalaxy?.frame(cam, w, h, view === 'desk' && contributionVisible());
  R.render(scene, cam);
  projectLayer?.frame(cam, w, h);
  // Scene labels; work cards stay in the fixed DOM panel.
  for (const [id, lab] of Object.entries(dom.labels)) {const n = N[id];if (!n || (n.presence ?? (n.visible ? 1 : 0)) <= .01) {lab.style.display = 'none';continue;}
    pv.copy(n.p);
    // The remembered Connections layout must not move the desk's name below the person.
    if (S.normal && id !== 'me') pv.addScaledVector(S.normal(n.p), 1.5);else
    pv.y += view === 'network' && mode === 'org' ? -1 : id === 'me' ? 2.1 : 1.5;
    pv.project(cam);if (pv.z > 1) {lab.style.display = 'none';continue;}
    if ((view === 'desk' || mode === 'projects') && id !== 'me') {lab.style.display = 'none';continue;}
    const on = !focus || lit.has(id);lab.style.display = '';lab.style.left = (pv.x * .5 + .5) * w + 'px';lab.style.top = (-pv.y * .5 + .5) * h + 'px';lab.classList.toggle('dim', !!focus && !on);lab.style.opacity = (n.presence ?? 1) * (focus && !on ? .18 : 1);lab.style.pointerEvents = n.visible && (n.presence ?? 1) > .5 ? '' : 'none';}
  for (const [id, badge] of Object.entries(dom.attention)) {
    const n = N[id];badge.hidden = mode === 'projects' || view !== 'network' || !n?.visible || !attention[id]?.length;
    if (badge.hidden) continue;
    pv.copy(n.p);if (mode === 'org') {pv.x += 2.5;pv.y += 1.6;} else pv.y += 2.5;pv.project(cam);
    badge.hidden = pv.z > 1 || pv.z < -1;
    badge.style.opacity = n.presence ?? 1;
    badge.style.left = (pv.x * .5 + .5) * w + 'px';
    badge.style.top = (-pv.y * .5 + .5) * h + 'px';
  }
  for (const B of dom.deskBtns) {
    if (view !== 'desk') {B.b.style.display = 'none';continue;}
    pv.copy(deskPeople.length ? N.me.p : B.pos).project(cam);
    const offset = deskPeople.length ? { today: [120, -120], notebook: [120, -76], projects: [120, -32], network: [10, 55] }[B.entry] : [0, 0];
    B.b.style.display = pv.z > 1 ? 'none' : '';
    B.b.style.left = (pv.x * .5 + .5) * w + offset[0] + 'px';
    B.b.style.top = (-pv.y * .5 + .5) * h + offset[1] + 'px';
    B.b.classList.toggle('on', deskPanelOpen && B.entry === deskEntry);
  }
  for (const L of extraLabels) {if (mode === 'projects' || !L.show() || L.org && (mode !== 'org' || view !== 'network')) {L.d.style.display = 'none';continue;}pv.copy(L.getPos ? L.getPos() : L.pos).project(cam);if (pv.z > 1) {L.d.style.display = 'none';continue;}L.d.style.display = '';L.d.style.left = (pv.x * .5 + .5) * w + 'px';L.d.style.top = (-pv.y * .5 + .5) * h + 'px';}
  positionFloatingWork(showEco, w, h);
  protectUniverseLabels(dom.canvas.parentElement, dom.canvas);
}

// Individual screen-facing windows, with stable reading order and no depth fading.
function renderFloatingWork() {
  const pages = Math.max(1, Math.ceil(floatingItems.length / floatingPageSize));
  floatingPage = Math.max(0, Math.min(pages - 1, floatingPage));
  const start = floatingPage * floatingPageSize;
  const visible = floatingItems.slice(start, start + floatingPageSize);
  dom.floatingWork.classList.toggle('uv2-compact-windows', floatingPageSize === 2);
  dom.floatingWork.innerHTML = visible.map((it, i) => `<button class="uv2-work-window uv2-window-${i}" data-rid="${esc(it.rid)}" title="Click to see the original record">${cardHTML(it)}</button>`).join('') +
  `<nav class="uv2-window-pager" aria-label="Page through the work cards"><button data-page="-1" aria-label="Previous work cards" ${floatingPage === 0 ? 'disabled' : ''}>‹</button><span>${esc(short[personLens] || 'All projects')} · ${floatingItems.length ? `${start + 1}–${start + visible.length} / ${floatingItems.length}` : 'No known records yet'}</span><button data-page="1" aria-label="Next work cards" ${floatingPage === pages - 1 ? 'disabled' : ''}>›</button></nav>`;
  dom.floatingWork.querySelectorAll('[data-rid]').forEach((b) => b.onclick = () => openRecord(b.dataset.rid));
  dom.floatingWork.querySelectorAll('[data-page]').forEach((b) => b.onclick = () => {
    const direction = +b.dataset.page;
    floatingPage += direction;
    renderFloatingWork();
    const next = dom.floatingWork.querySelector(`[data-page="${direction}"]`);
    (next.disabled ? dom.floatingWork.querySelector(`[data-page="${-direction}"]`) : next).focus({ preventScroll: true });
  });
}
function positionFloatingWork(show, w, h) {
  const windows = dom.floatingWork;
  if (!show || dom.insight.hidden) {windows.hidden = true;return;}
  windows.hidden = false;
  if (!windows.offsetWidth) return;
  const canvas = dom.canvas.getBoundingClientRect(),panel = dom.insight.getBoundingClientRect();
  const timeline = document.querySelector('.timeline').getBoundingClientRect();
  const top = dom.modes.getBoundingClientRect().bottom + 16,bottom = timeline.top - 16;
  const availableWidth = panel.left - canvas.left - 32;
  const pageSize = availableWidth < 670 || bottom - top < 456 ? 2 : 4;
  if (pageSize !== floatingPageSize) {floatingPageSize = pageSize;floatingPage = 0;renderFloatingWork();}
  // Reading, clicking and keyboard navigation must never chase moving windows.
  if (windows.matches(':hover, :focus-within')) return;
  pv.copy(N[selected].p).project(cam);
  const width = windows.offsetWidth,height = windows.offsetHeight;
  const minX = canvas.left + 14,maxX = panel.left - width - 18;
  const personX = canvas.left + (pv.x * .5 + .5) * w;
  const personY = canvas.top + (-pv.y * .5 + .5) * h;
  const desiredX = floatingPageSize === 4 ? personX - width / 2 : personX - width - 45;
  windows.style.left = Math.max(minX, Math.min(maxX, desiredX)) + 'px';
  windows.style.top = Math.max(top, Math.min(bottom - height, personY - height / 2)) + 'px';
}

// ---------------- public API ----------------
// Search (universe2-search.js): everyone known on the selected date, with the facts the result rows show.
export function searchPeople() {
  if (!mounted) return [];
  return state.snapshot.connections.nodes.filter((n) => people[n.person_id] && n.person_id !== PERSONA_ID).map((n) => {
    const p = people[n.person_id];
    return { id: p.id, name: p.name, nameZh: p.name_zh || '', role: p.role_zh || p.role || '', rel: relLabel(p), org: orgs[p.organisation_id]?.name || '',
      color: GROUP_CSS[groupOf(p)], ai: p.kind === 'agent', count: M.counts[p.id] || 0, initials: initials(p.name), historical: historicalPeople.has(p.id),
      projects: sharedProjects(p.id).filter((pid) => pid !== DAILY_PROJECT).map((pid) => short[pid] || pid) };
  }).sort((a, b) => b.count - a.count);
}
// Directory (universe2-gallery.js): everyone and every project known on the selected date, with factual numbers only.
export const GALLERY_GROUPS = [['line', 'My managers'], ['team', 'My team'], ['dept', 'Other teams'], ['ext', 'Outside organisations'], ['auth', 'Approving bodies'], ['ai', 'AI assistants']];
// seniority inside the office, from the title: principal, associate director, senior associate, associate,
// architect, designer, assistant, studio manager (others keep their count order)
const LEVELS = [/principal|head of the studio/i, /associate director|director/i, /senior associate/i, /\bassociate\b/i, /architect\b/i, /designer/i, /assistant/i, /studio manager|manager/i];
const levelOf = (p) => {const i = LEVELS.findIndex((re) => re.test(p.role || ''));return p.organisation_id === HOME_ORG && i >= 0 ? i : 9;};
export function galleryPeople() {
  if (!mounted) return [];
  const hist = historicalPeopleAt(DATA, CONFIG, state.snapshot);
  return state.snapshot.connections.nodes.filter((n) => people[n.person_id] && n.person_id !== PERSONA_ID).map((n) => {
    const p = people[n.person_id],g = groupOf(p),byCh = n.signals?.by_channel;
    return { id: p.id, person: p, name: p.name, nameZh: p.name_zh || '', role: p.role_zh || p.role || '', rel: relLabel(p), org: orgs[p.organisation_id]?.name || '',
      group: g, color: GROUP_CSS[g], hex: GROUP_COL[g], ai: p.kind === 'agent', initials: initials(p.name),
      count: byCh ? Object.values(byCh).reduce((a, b) => a + b, 0) : 0, first: (n.first_observed_at || '').slice(0, 10), last: (n.signals?.last_contact_at || '').slice(0, 10),
      waiting: (attention[p.id] || []).length, historical: hist.has(p.id), projects: sharedProjects(p.id).filter((pid) => pid !== DAILY_PROJECT),
      groupRank: GALLERY_GROUPS.findIndex(([k]) => k === g), level: levelOf(p) };
  });
}
export function galleryProjects() {
  if (!mounted) return [];
  return projectsAt(DATA, CONFIG, state.snapshot).map((p) => {
    const src = DATA.projects.find((x) => x.id === p.id),at = state.snapshot.desk.project_states.find((x) => x.id === p.id);
    const phases = (src?.phases || []).filter((ph) => ph.id !== 'closed'),i = phases.findIndex((ph) => ph.id === at?.phase);
    const team = [...new Set(state.visible.filter((r) => r.project_id === p.id).flatMap((r) => r.participant_ids))].filter((id) => id !== PERSONA_ID && people[id]);
    const mine = (src?.grace_periods || []).map((g) => [g.from, g.to || null]);
    return { ...p, outcome: at?.outcome || null, phases: phases.map((ph) => ph.label_zh || ph.id), at: at?.status === 'closed' ? phases.length : Math.max(0, i + 1),
      team, faces: team.slice(0, 5).map((id) => ({ initials: initials(people[id].name), color: GROUP_CSS[groupOf(people[id])] })), mine, kind: src?.kind || '', building: src?.building_type || '',
      left: mine.length && mine.at(-1)[1] && mine.at(-1)[1] < state.snapshot.date };
  });
}
// Select a person from outside the scene: switch to Connections, reveal them if they are a hidden past contact, then
// select exactly as a click would (the camera flies to them and their work cards open).
export function focusPerson(id) {
  if (!mounted || !N[id]) return;
  if (view !== 'network') actions.setView?.('network');
  if (!M.ids.includes(id) && historicalPeople.has(id)) {
    const box = document.getElementById('uv2PeopleHistory');
    if (box && !box.checked) {box.checked = true;box.dispatchEvent(new Event('change'));}
  }
  select(id, false);
}
export function focusProject(pid) {
  if (!mounted) return;
  if (view !== 'network') actions.setView?.('network');
  select(null);chooseProject(pid);
}
export function mountUniverse(root, styleId) {
  S = findStyle(styleId) || STYLES[0];
  ORG = S.id === 'universe' ? findStyle('org') : null;
  if (S.camera?.phi) phi = S.camera.phi;
  document.body.classList.toggle('uv-light', S.theme === 'light');
  buildDom(root);
  try {R = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true });}
  catch (e) {root.insertAdjacentHTML('beforeend', '<div class="uv-glass uv-fallback">3D display is not supported on this device. Please switch to “Classic Between”.</div>');return;}
  R.setPixelRatio(Math.min(devicePixelRatio, 2));
  M = model();
  buildScene();bindPointer();mounted = true;
  document.getElementById('uv2ResetView').onclick = resetOverview;
  // Dev aid: lets tests advance physics and render when the browser tab is hidden (rAF paused).
  window.__uvDebug = { N, S, targetR, ANGLE, ctxFor, tick: (n) => {for (let i = 0; i < n; i++) step();}, frame: () => frame(performance.now()) };
  const resize = () => {const w = dom.canvas.clientWidth,h = dom.canvas.clientHeight;R.setSize(w, h, false);cam.aspect = w / Math.max(1, h);cam.updateProjectionMatrix();};
  new ResizeObserver(resize).observe(dom.canvas);resize();
  refreshUniverse();
  try {
    scenarioEntryPending = sessionStorage.getItem('between:enter-scenario') === CONFIG.id;
    sessionStorage.removeItem('between:enter-scenario');
  } catch {/* The normal entry remains available when storage is blocked. */}
  requestAnimationFrame(frame);
}
// Calculate the new arrangement off screen, then animate from the currently drawn
// state. Never inject new people into a shared central point with large forces.
function finishPeopleTransition(snap = true) {
  if (!peopleTransition) return;
  const transition = peopleTransition;peopleTransition = null;
  for (const [id, target] of Object.entries(transition.to)) {
    const n = N[id];
    if (snap && !n.manual) n.p.set(...target.position);
    n.presence = n.visible ? 1 : 0;n.v.set(0, 0, 0);
  }
  edges = transition.edges;
}
function advancePeopleTransition(dt) {
  const transition = peopleTransition;
  transition.elapsed += dt;
  for (const [id, target] of Object.entries(transition.to)) {
    const n = N[id],sample = samplePeopleTransition(transition.from[id], target, transition.elapsed);
    if (!n.manual) n.p.set(...sample.position);
    n.presence = sample.opacity;
  }
  if (transition.elapsed >= PEOPLE_TRANSITION_SECONDS) finishPeopleTransition();
}
// Called on date changes and history filters. Only the same-date people filter
// fades outgoing nodes; a date change immediately removes unknown future people.
export function refreshUniverse({ animatePeople = false } = {}) {
  if (!mounted) return;
  const sameDate = layoutDate === state.snapshot.date;
  const animate = animatePeople && sameDate && !reduced && view === 'network';
  const before = Object.fromEntries(Object.entries(N).map(([id, n]) => [id, { position: n.p.toArray(), opacity: n.presence ?? (n.visible ? 1 : 0) }]));
  const oldEdges = edges;
  peopleTransition = null;
  if (!sameDate) {clearManualLayout();layoutDate = state.snapshot.date;}
  M = model();refreshOrgLayout();edges = M.edges.filter(([a, b]) => N[a] && N[b]);
  const visible = new Set(M.ids);
  for (const [id, n] of Object.entries(N)) {
    if (id === 'me') {n.presence = 1;continue;}
    const v = visible.has(id);
    if (v && !n.hasPlacement && !n.manual) {
      // Deterministic distributed seed; toggling never randomizes existing people.
      const hash = [...id].reduce((h, c) => h * 31 + c.charCodeAt(0) >>> 0, 0);
      const a = hash * 2.399963229728653,r = targetR(id);
      const position = mode === 'org' ? orgLayout.positions[id] : null;
      if (position) n.p.set(...position);else n.p.set(Math.cos(a) * r, n.yT, Math.sin(a) * r);
      n.hasPlacement = true;
    }
    n.visible = v;n.presence = v ? 1 : 0;n.v.set(0, 0, 0);
  }
  if (animate) {
    const finalEdges = edges;
    for (let i = 0; i < 240; i++) step();
    const to = Object.fromEntries(Object.entries(N).map(([id, n]) => [id, { position: n.p.toArray(), opacity: n.visible ? 1 : 0 }]));
    for (const [id, n] of Object.entries(N)) {
      if (before[id].opacity === 0) before[id].position = to[id].position;
      n.p.set(...before[id].position);n.presence = before[id].opacity;n.v.set(0, 0, 0);
    }
    edges = [...new Map([...oldEdges, ...finalEdges].map((e) => [e.slice(0, 2).join('|'), e])).values()];
    peopleTransition = { from: before, to, elapsed: 0, edges: finalEdges };
  }
  renderReminders();renderDesk();projectLayer?.refresh();renderLegend();updateFilterChip();
  if (selected && !visible.has(selected)) select(null);else if (selected) select(selected);
}

// The two views, same as the classic style: My Desk (my desk and today) and Connections (the people graph).
export function setUniverseView(v) {
  const nextView = v === 'desk' ? 'desk' : 'network';
  if (mounted && nextView !== view) {
    clearManualLayout();panOffset.set(0, 0, 0);
    theta = nextView === 'desk' ? -.75 : mode === 'org' ? 0 : .6;
    if (nextView === 'desk') phi = 1.12;
    zoom = defaultZoom(nextView, mode);
  }
  if (nextView !== view) deskPanelOpen = false;
  view = nextView;
  if (!mounted) return;
  if (view === 'desk') {select(null);N.me.p.set(0, 0, 0);} else
  if (mode === 'org') N.me.p.set(...orgLayout.positions[PERSONA_ID]);
  projectLayer?.setView(view);
  document.body.classList.toggle('uv2-org-mode', view === 'network' && mode === 'org');
  dom.desk.hidden = view !== 'desk' || !deskPanelOpen;dom.modes.hidden = view === 'desk' || !ORG;dom.legend.hidden = view === 'desk';
  if (view === 'network') setLayoutMode(mode);
  updateDetailsVisibility();
}
function renderDesk() {
  dom.desk.hidden = view !== 'desk' || !deskPanelOpen;
  const desk = state.snapshot.desk,nameOf = (id) => people[id]?.name || id;
  deskPeople = deskPeopleAt(DATA, state.snapshot, PERSONA_ID);
  if (deskEntry === 'person' && !deskPeople.some((p) => p.id === deskPerson)) {deskPerson = null;deskEntry = 'today';}
  deskCompanions?.update(deskPeople, deskPanelOpen && deskEntry === 'person' ? deskPerson : null);
  const tabs = `<nav class="tabs">${[['today', 'Today'], ['notebook', 'Notes'], ['projects', 'Projects']].map(([k, t]) => `<button data-entry="${k}" class="${k === deskEntry ? 'on' : ''}">${t}</button>`).join('')}</nav>`;
  let body = '';
  if (deskEntry === 'person') {
    const row = deskPeople.find((p) => p.id === deskPerson);
    const list = (items, title, tone) => `<h4 class="desk-status-heading ${tone}">${title}<span class="desk-status-count">${items.length}</span></h4><ul>${items.map((item) => `<li><button class="rec desk-task ${tone}${item.overdue ? ' overdue' : ''}" data-rid="${esc(item.recordId)}"><b>${esc(item.text)}</b><span class="desk-task-meta">${esc(short[item.projectId] || '')}${item.dueDate ? ' · due ' + esc(dayText(item.dueDate)) : ''}</span><span class="desk-task-status ${item.overdue ? 'overdue' : tone}">${esc(item.label)}</span></button></li>`).join('') || '<li><span>Nothing here</span></li>'}</ul>`;
    body = `<h3>${esc(nameOf(row.id))}</h3><p class="sub">${esc(fullDate(state.snapshot.date))}</p>` + list(row.mine, '! My action items', 'mine') + list(row.waiting, '◷ Awaiting them', 'waiting');
  } else if (deskEntry === 'today') {
    // Reminders-style: round tick circles, a due tag (red when late, Today / Tomorrow / weekday / date), project and person
    const today = state.snapshot.date,days = (d) => Math.round((Date.parse(d) - Date.parse(today)) / 864e5);
    const WD = WEEKDAYS;
    const due = (d) => {if (!d) return '';const n = days(d);const t = n < 0 ? `${plural(-n, 'day')} overdue` : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 7 ? WD[new Date(d + 'T00:00:00Z').getUTCDay()] : dayText(d);return `<span class="rm-due${n < 0 ? ' late' : n <= 1 ? ' soon' : ''}">${t}</span>`;};
    const todo = (t, tone, done = false) => `<li><button class="rm-row ${tone}${done ? ' done' : ''}" data-rid="${esc(t.source_ids?.at(-1) || '')}"><i class="rm-circle" aria-hidden="true"></i><span class="rm-main"><b>${esc(t.title)}</b><span class="rm-meta">${done ? '' : due(t.due_date)}<span class="rm-proj"><i style="background:${projectColor(t.project_id)}"></i>${esc(short[t.project_id] || '')}</span><span>${t.owner_id === PERSONA_ID ? 'For ' + esc(nameOf(t.counterparty_id).split(' ')[0]) : 'From ' + esc(nameOf(t.owner_id).split(' ')[0])}</span></span></span></button></li>`;
    const doneRecently = state.snapshot.task_states.filter((t) => t.status === 'completed' && (t.owner_id === PERSONA_ID || t.counterparty_id === PERSONA_ID) && records[t.source_ids?.at(-1)] && days(records[t.source_ids.at(-1)].occurred_at.slice(0, 10)) >= -7);
    const focus = desk.focus_project_id ? short[desk.focus_project_id] : null,d0 = new Date(today + 'T00:00:00Z');
    const recent = state.visible.filter((r) => ['email', 'meeting', 'chat'].includes(r.kind) && !isSmallTalkOnly(r)).slice(-4).reverse();
    const rem = M.ids.map((id) => ({ id, ins: insightFor(id, M) })).filter((x) => x.ins.score > 0).sort((a, b) => b.ins.score - a.ins.score).slice(0, 3);
    body = `<div class="rm-head"><b>${WD[d0.getUTCDay()]} ${dayMonth(today)}</b><span>${today.slice(0, 4)}</span>${focus ? `<span class="rm-focus">Today’s focus · ${esc(focus)}</span>` : ''}</div>
    <div class="rm-tiles"><div class="rm-tile mine"><i>!</i><b>${desk.my_open_tasks.length}</b><span>My action items</span></div><div class="rm-tile waiting"><i>◷</i><b>${desk.waiting_on_others.length}</b><span>Awaiting them</span></div><div class="rm-tile late"><i>⚑</i><b>${[...desk.my_open_tasks, ...desk.waiting_on_others].filter((t) => t.due_date && t.due_date < today).length}</b><span>Overdue</span></div></div>
    <h4 class="rm-list mine">My action items</h4><ul class="rm">${desk.my_open_tasks.map((t) => todo(t, 'mine')).join('') || '<li class="rm-empty">No open commitments right now.</li>'}</ul>
    <h4 class="rm-list waiting">Awaiting them</h4><ul class="rm">${desk.waiting_on_others.map((t) => todo(t, 'waiting')).join('') || '<li class="rm-empty">Nothing you are waiting on.</li>'}</ul>
    ${doneRecently.length ? `<details class="rm-done"><summary>Done in the last 7 days · ${doneRecently.length}</summary><ul class="rm">${doneRecently.map((t) => todo(t, 'mine', true)).join('')}</ul></details>` : ''}
    <h4 class="rm-sub">${ICON.ai} AI reminders</h4><ul class="people">${rem.map(({ id, ins }) => `<li><button data-id="${id}"><span class="av" style="background:${GROUP_CSS[groupOf(people[id])]}">${initials(people[id].name)}</span><span><b>${esc(people[id].name)}</b><span>${esc(ins.title)}</span></span></button></li>`).join('') || '<li><span>Nothing needs a reminder right now.</span></li>'}</ul>
    <h4 class="rm-sub">Latest exchanges</h4><ul class="rm-recent">${recent.map((r) => `<li><button data-rid="${r.id}" class="rec"><b>${esc(r.title)}</b><span>${dayText(r.occurred_at)} · ${channel(r)} · ${esc(short[r.project_id])}</span></button></li>`).join('')}</ul>`;
  } else if (deskEntry === 'notebook') {
    // Notes-style: grouped by month; the first sentence is the title, then the date and a one-line preview
    const notes = state.visible.filter((r) => ['journal', 'weekly_report', 'note'].includes(r.kind) && r.actor_id === PERSONA_ID).slice().reverse();
    const clean = (t) => t.replace(/\s*\[R-[^\]]*\]/g, '').trim(); // drop source ids such as [R-LK-076]
    const lines = (r) => (r.body || '').split('\n').map((x) => clean(x.replace(/^[-•]\s*/, ''))).filter((x) => x && !/^(Projects|Done|Next|This week|Next week):?$/i.test(x));
    const firstSentence = (r) => r.kind === 'weekly_report' ? lines(r)[0] || r.title : (lines(r)[0] || r.title).split(/(?<=[.!?。])\s/)[0];
    const titleOf = (r) => {const t = firstSentence(r);return t.length > 44 ? t.slice(0, 42) + '…' : t;};
    const preview = (r) => {const all = lines(r).join(' '),t = firstSentence(r),rest = (all.startsWith(t) ? all.slice(t.length) : all).trim();return rest.length > 70 ? rest.slice(0, 68) + '…' : rest;};
    const byMonth = new Map();for (const r of notes) {const k = r.occurred_at.slice(0, 7);(byMonth.get(k) || byMonth.set(k, []).get(k)).push(r);}
    body = `<div class="nt-head"><b>Work notes</b><span>${plural(notes.length, 'note')}</span></div>` + ([...byMonth].map(([k, rs]) => `<h4 class="nt-month">${MONTHS_LONG[+k.slice(5) - 1]}${k.slice(0, 4) !== state.snapshot.date.slice(0, 4) ? ' ' + k.slice(0, 4) : ''}</h4><ul class="nt">${rs.map((r) => `<li><button data-rid="${r.id}" class="nt-row"><b>${esc(titleOf(r))}</b><span><time>${dayText(r.occurred_at)}</time>${r.kind === 'weekly_report' ? '<em>Weekly report</em>' : ''}${esc(preview(r))}</span></button></li>`).join('')}</ul>`).join('') || '<p class="rm-empty">No notes yet.</p>');
  } else {
    // project cards: a progress ring by phase, status, current phase, open items and the team's faces
    const ps = desk.project_states.filter((p) => p.id !== DAILY_PROJECT);
    const OUT = { lost: 'not won', built: 'built', delivered_not_proceeding: 'delivered · client did not go ahead' };
    const statusOf = (p) => p.status === 'closed' ? ['done', 'Finished' + (OUT[p.outcome] ? ' · ' + OUT[p.outcome] : '')] : p.status === 'on_hold' ? ['hold', 'Paused'] : DATA.projects.find((x) => x.id === p.id)?.grace_periods?.at(-1)?.to && DATA.projects.find((x) => x.id === p.id).grace_periods.at(-1).to < state.snapshot.date ? ['left', 'Handed back'] : ['active', 'In progress'];
    const open = (id) => [...desk.my_open_tasks, ...desk.waiting_on_others].filter((t) => t.project_id === id).length;
    const card = (p) => {
      const proj = DATA.projects.find((x) => x.id === p.id),phases = (proj?.phases || []).filter((ph) => ph.id !== 'closed'),i = phases.findIndex((ph) => ph.id === p.phase);
      const frac = p.status === 'closed' ? 1 : phases.length ? Math.max(0, i + 1) / phases.length : 0,[st, label] = statusOf(p),color = projectColor(p.id);
      const phase = phases[i]?.label_zh || '',team = [...new Set(state.visible.filter((r) => r.project_id === p.id).flatMap((r) => r.participant_ids))].filter((id) => id !== PERSONA_ID && people[id]);
      const C = 2 * Math.PI * 15;
      return `<li><button class="pj-card ${st}" data-project="${p.id}" style="--pc:${color}">
        <svg class="pj-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15"/><circle cx="18" cy="18" r="15" class="v" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}"/>${st === 'done' ? '<path d="m12 18.5 4 4 8-9" class="tick"/>' : ''}</svg>
        <span class="pj-main"><b>${esc(short[p.id] || p.id)}</b><span class="pj-st">${esc(label)}${phase && st !== 'done' && !sameWords(label, phase) ? ` · ${esc(phase)}` : ''}</span>
        <span class="pj-foot"><span class="pj-faces">${team.slice(0, 4).map((id) => `<i style="background:${GROUP_CSS[groupOf(people[id])]}">${initials(people[id].name)}</i>`).join('')}${team.length > 4 ? `<em>+${team.length - 4}</em>` : ''}</span>${open(p.id) ? `<span class="pj-open">${open(p.id)} open</span>` : ''}</span></span></button></li>`;
    };
    const groups = [['active', 'In progress'], ['left', 'Handed back'], ['hold', 'Paused'], ['done', 'Finished']].map(([k, t]) => [k, t, ps.filter((p) => statusOf(p)[0] === k)]).filter((g) => g[2].length);
    body = `<div class="nt-head"><b>Shared projects</b><span>${plural(ps.length, 'project')}</span></div>` + groups.map(([k, t, list]) => k === 'done' ?
    `<details class="pj-group"><summary>${t} · ${list.length}</summary><ul class="pj">${list.map(card).join('')}</ul></details>` :
    `<h4 class="nt-month">${t} · ${list.length}</h4><ul class="pj">${list.map(card).join('')}</ul>`).join('');
  }
  dom.desk.innerHTML = `<div class="uv2-desk-panel-header">${tabs}<button class="uv2-desk-collapse" aria-label="Collapse panel" title="Collapse panel">×</button></div>` + body;
  dom.desk.querySelector('.uv2-desk-collapse').onclick = () => {deskPanelOpen = false;renderDesk();};
  dom.desk.querySelectorAll('[data-entry]').forEach((b) => b.onclick = () => {deskEntry = b.dataset.entry;renderDesk();});
  dom.desk.querySelectorAll('[data-project]').forEach((b) => b.onclick = () => chooseProject(b.dataset.project));
  dom.desk.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => {actions.setView?.('network');select(b.dataset.id);});
  dom.desk.querySelectorAll('[data-rid]').forEach((b) => b.onclick = () => openRecord(b.dataset.rid));
}
