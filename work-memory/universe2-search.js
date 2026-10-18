// Universe 2 search: a dark command palette in the universe's own glass style (replaces the classic paper dialog).
// Type to find a person, a project or a work record known on the selected date. Choosing a person closes the palette,
// switches to Connections and selects them in the scene — the camera flies to them and their work cards open, exactly as
// a click on them would. ↑ ↓ move, Enter chooses, Esc closes.
import { state, actions, DATA, DAILY_PROJECT, short, STATUS } from './state.js';
import { isWorkRecord, workRecordTitle, workRecordText, openRecord } from './records.js';
import { searchPeople, focusPerson, focusProject } from './universe2.js';
import { icon } from './universe2-icons.js';
import { dayMonth, fullDate } from './i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KIND = { email: 'Email', chat: 'Teams', meeting: 'Meeting', document: 'File', task_update: 'Task', note: 'Note', calendar: 'Calendar' };
const ICON = { email: 'Mail', chat: 'Chat', meeting: 'Meet', document: 'File', task_update: 'Task', note: 'Note', calendar: 'Cal' };
const md = (iso) => dayMonth(iso);
let root = null;

function mark(text, q) {// highlight the matched part of a label
  const t = String(text ?? ''),i = q ? t.toLowerCase().indexOf(q) : -1;
  return i < 0 ? esc(t) : `${esc(t.slice(0, i))}<mark>${esc(t.slice(i, i + q.length))}</mark>${esc(t.slice(i + q.length))}`;
}

export function openSearch() {
  actions.pause?.();
  if (root) {root.querySelector('input').select();return;}
  root = document.createElement('div');
  root.className = 'uv2-search';
  root.innerHTML = `<div class="uv2-search-box uv-glass" role="dialog" aria-modal="true" aria-label="Search work memory">
    <div class="uv2-search-field">${icon('search')}<input type="search" placeholder="Find a person, a project or a piece of work…" aria-label="Search people, projects or work records" autocomplete="off"><kbd>Esc</kbd></div>
    <nav class="uv2-search-tabs" aria-label="Search scope"><button data-scope="all" aria-pressed="true">All</button><button data-scope="people" aria-pressed="false">People</button><button data-scope="projects" aria-pressed="false">Projects</button><button data-scope="records" aria-pressed="false">Records</button></nav>
    <div class="uv2-search-results" role="listbox" aria-label="Search results"></div>
    <div class="uv2-search-foot"><span>↑ ↓ choose · Enter opens · what was known by ${esc(fullDate(state.snapshot.date))}</span></div>
  </div>`;
  document.body.append(root);
  const input = root.querySelector('input'),list = root.querySelector('.uv2-search-results');
  let scope = 'all',items = [],active = 0;
  const people = searchPeople();
  const projects = (state.snapshot.desk.project_states || []).filter((p) => p.id !== DAILY_PROJECT).
  map((p) => ({ id: p.id, name: short[p.id] || p.id, status: STATUS?.[p.status] || p.status || '',
    phase: DATA.projects.find((x) => x.id === p.id)?.phases?.find((ph) => ph.id === p.phase)?.label_zh || '' }));

  function draw() {
    const q = input.value.trim().toLowerCase();
    const hit = (...xs) => !q || xs.some((x) => String(x ?? '').toLowerCase().includes(q));
    const ps = people.filter((p) => hit(p.name, p.nameZh, p.role, p.rel, p.org, ...p.projects)).slice(0, q ? 8 : 6);
    const pj = q ? projects.filter((p) => hit(p.name, p.id)).slice(0, 4) : [];
    const rs = q ? state.visible.filter((r) => isWorkRecord(r) && KIND[r.kind] && hit(workRecordTitle(r), workRecordText(r))).slice(-6).reverse() : [];
    items = [];
    let html = '';
    const section = (title, rows) => {if (rows.length) html += `<h3>${title}</h3>` + rows.join('');};
    if (scope === 'all' || scope === 'people') section(q ? 'People' : 'Most exchanges', ps.map((p) => {
      items.push({ type: 'person', id: p.id });
      return `<button class="uv2-search-row" role="option" data-i="${items.length - 1}">
        <i class="av${p.ai ? ' ai' : ''}" style="--c:${p.color}">${p.ai ? '◇' : esc(p.initials)}</i>
        <span class="main"><b>${mark(p.name, q)}${p.nameZh && p.nameZh !== p.name ? ` <small>${mark(p.nameZh, q)}</small>` : ''}</b><em>${mark(p.role, q)}${p.rel && !p.role.includes(p.rel) ? ' · ' + mark(p.rel, q) : ''}</em></span>
        <span class="side">${p.historical ? '<span class="tag">Past contact</span>' : ''}<span>${p.count} ${p.count === 1 ? 'exchange' : 'exchanges'} so far</span><span class="pj">${p.projects.slice(0, 2).map((x) => mark(x, q)).join(' · ')}</span></span>
      </button>`;
    }));
    if (scope === 'all' || scope === 'projects') section('Projects', (scope === 'projects' && !q ? projects : pj).map((p) => {
      items.push({ type: 'project', id: p.id });
      return `<button class="uv2-search-row" role="option" data-i="${items.length - 1}"><i class="av pj" aria-hidden="true">◇</i>
        <span class="main"><b>${mark(p.name, q)}</b><em>${esc([p.status, p.phase].filter(Boolean).join(' · '))}</em></span><span class="side"><span>Open project space</span></span></button>`;
    }));
    if (scope === 'all' || scope === 'records') section(q ? 'Work records' : '', rs.map((r) => {
      items.push({ type: 'record', id: r.id });
      return `<button class="uv2-search-row rec" role="option" data-i="${items.length - 1}"><i class="av rec" aria-hidden="true">${esc(ICON[r.kind] || '')}</i>
        <span class="main"><b>${mark(workRecordTitle(r), q)}</b><em>${md(r.occurred_at)} · ${esc(KIND[r.kind] || r.kind)} · ${esc(short[r.project_id] || '')}</em></span></button>`;
    }));
    if (!items.length) html = `<p class="empty">${q ? `Nothing found for “${esc(input.value.trim())}” as of ${esc(fullDate(state.snapshot.date))}.` : 'Type a name, a project or a keyword to start.'}</p>`;
    list.innerHTML = html;
    active = Math.min(active, Math.max(0, items.length - 1));
    paint();
    list.querySelectorAll('[data-i]').forEach((b) => {b.onclick = () => choose(+b.dataset.i);b.onmousemove = () => {if (active !== +b.dataset.i) {active = +b.dataset.i;paint();}};});
  }
  function paint() {
    list.querySelectorAll('[data-i]').forEach((b) => {const on = +b.dataset.i === active;b.classList.toggle('on', on);b.setAttribute('aria-selected', on);if (on) b.scrollIntoView({ block: 'nearest' });});
  }
  function choose(i) {
    const it = items[i];if (!it) return;
    close();
    if (it.type === 'person') focusPerson(it.id);else
    if (it.type === 'project') focusProject(it.id);else
    openRecord(it.id);
  }
  input.oninput = () => {active = 0;draw();};
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') {e.preventDefault();active = Math.min(items.length - 1, active + 1);paint();} else
    if (e.key === 'ArrowUp') {e.preventDefault();active = Math.max(0, active - 1);paint();} else
    if (e.key === 'Enter') {e.preventDefault();choose(active);} else
    if (e.key === 'Escape') {e.preventDefault();close();}
  };
  root.querySelectorAll('[data-scope]').forEach((b) => b.onclick = () => {
    scope = b.dataset.scope;active = 0;
    root.querySelectorAll('[data-scope]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    draw();input.focus();
  });
  root.onmousedown = (e) => {if (e.target === root) close();};
  draw();
  requestAnimationFrame(() => {root?.classList.add('open');input.focus();});
}

function close() {if (!root) return;root.remove();root = null;}
