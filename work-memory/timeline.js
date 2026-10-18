// Time: the selected day, refresh of everything that depends on it, replay, and the timeline/date controls.
import { $, el, initials, dateText } from './format.js';
import { renderPanel } from './panels.js';
import { renderSidebar, renderProjectRail } from './sidebar.js';
import { updateScene } from './scene3d.js';
import { state, actions, SCENARIOS, CONFIG, DATA, PERSONA, DAYS, LAST } from './state.js';
import { EN, t } from './i18n.js';

// Recompute what is known on the selected day, then redraw every view.
export function refresh() {
  state.snapshot = DATA.snapshots[state.dayIndex];
  const { snapshot } = state;
  state.visible = DATA.records.filter((r) => r.first_seen_at <= snapshot.as_of);
  state.visibleIds = new Set(state.visible.map((r) => r.id));
  if (state.selectedPerson && !snapshot.connections.nodes.some((n) => n.person_id === state.selectedPerson)) state.selectedPerson = null;
  if (state.selectedOrg && !snapshot.connections.nodes.some((n) => n.organisation_id === state.selectedOrg)) state.selectedOrg = null;
  if (state.selectedProject && !snapshot.desk.project_states.some((p) => p.id === state.selectedProject)) {state.selectedProject = null;state.detailMode = 'overview';}
  $('dateInput').value = snapshot.date;
  $('timeSlider').value = state.dayIndex;
  const weekday = new Date(snapshot.date + 'T12:00:00+08:00').getUTCDay();
  $('dayType').textContent = (CONFIG.special_days || []).find((d) => snapshot.date >= d.from && snapshot.date <= d.to)?.label ?? (weekday === 0 || weekday === 6 ? 'Weekend' : 'Working day');
  $('timelineSummary').textContent =
  `Day ${state.dayIndex + 1} of ${DAYS} · ${snapshot.connections.nodes.length} contacts · ${state.visible.length} memories`;

  $('activityBars').childNodes.forEach((b, i) => b.className = i === state.dayIndex ? 'current' : i < state.dayIndex ? 'past' : '');
  renderSidebar();
  renderPanel();
  renderProjectRail();
  updateScene();
  actions.onDayChange?.();
}

export function setDay(index) {
  index = Math.max(0, Math.min(LAST, Number(index)));
  const before = new Set(state.snapshot.connections.nodes.map((n) => n.person_id));
  const direction = index - state.dayIndex;
  state.dayIndex = index;
  refresh();
  const added = state.snapshot.connections.nodes.filter((n) => !before.has(n.person_id));
  if (direction > 0 && added.length) {
    $('newNotice').textContent = `${'New contact'} · ${added.map((n) => n.name).join(', ')}`;
    $('newNotice').classList.add('visible');
    clearTimeout(state.noticeTimer);
    state.noticeTimer = setTimeout(() => $('newNotice').classList.remove('visible'), 2500);
  }
}

export function pause() {
  if (state.playTimer) clearInterval(state.playTimer);
  state.playTimer = null;
  $('playButton').textContent = '▶ Replay';
  $('playButton').setAttribute('aria-label', 'Replay my work history');
}

export function play() {
  if (state.playTimer) {pause();return;}
  actions.setView('network');
  if (state.dayIndex === LAST) setDay(0);
  $('playButton').textContent = 'Ⅱ Pause';
  $('playButton').setAttribute('aria-label', 'Pause the replay');
  state.playTimer = setInterval(() => {
    if (state.dayIndex >= LAST) {pause();return;}
    setDay(state.dayIndex + 1);
  }, Number($('speed').value));
}

// Scenario-dependent chrome: identity block, period label, date/slider ranges, month markers and the scenario switch.
function renderScenarioChrome() {
  $('personaInitials').textContent = initials(PERSONA);
  $('personaName').textContent = PERSONA.name;
  $('personaMeta').textContent = [PERSONA.name_zh, CONFIG.persona_role_label || PERSONA.role].filter(Boolean).join(' · ');
  $('periodLabel').textContent = CONFIG.period_label || '';
  const first = DATA.snapshots[0].date,last = DATA.snapshots[LAST].date;
  Object.assign($('dateInput'), { min: first, max: last, value: state.snapshot.date });
  Object.assign($('timeSlider'), { min: 0, max: LAST, value: state.dayIndex });
  const months = $('monthLabels');
  months.replaceChildren();
  for (const m of CONFIG.month_markers || []) {
    const i = DATA.snapshots.findIndex((s) => s.date === m.date);
    if (i < 0) {console.warn(`scenario ${CONFIG.id}: month marker ${m.date} is outside the snapshot range; skipped`);continue;}
    const b = el('button', '', m.label);
    b.dataset.day = i;
    months.append(b);
  }
  const end = el('button', '', dateText(last));
  end.dataset.day = LAST;
  months.append(end);
  const sel = $('scenarioSelect');
  sel.replaceChildren();
  for (const sc of SCENARIOS) {
    const o = el('option', '', sc.config.title || sc.config.id);
    o.value = sc.config.id;
    o.selected = sc.config.id === CONFIG.id;
    sel.append(o);
  }
  sel.disabled = SCENARIOS.length < 2; // a page with one dataset shows its name, not a menu
  sel.onchange = () => {
    pause();
    const u = new URL(location.href);
    u.searchParams.set('scenario', sel.value);
    if (document.body.classList.contains('uv2-standalone')) {
      try {sessionStorage.setItem('between:enter-scenario', sel.value);} catch {/* Navigation still works without storage. */}
    }
    location.href = u.href;
  };
}

export function bindTimeline() {
  renderScenarioChrome();
  for (let i = 0; i < DAYS; i++) {
    const date = DATA.snapshots[i].date;
    const count = DATA.records.filter((r) => r.first_seen_at.slice(0, 10) === date).length;
    const bar = el('i');
    bar.style.height = (count ? Math.min(25, 4 + count * 1.2) : 2) + 'px';
    $('activityBars').append(bar);
  }
  $('timeSlider').oninput = (e) => {pause();setDay(e.target.value);};
  $('dateInput').onchange = (e) => {
    pause();
    const i = DATA.snapshots.findIndex((s) => s.date === e.target.value);
    if (i >= 0) setDay(i);else e.target.value = state.snapshot.date;
  };
  document.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => {pause();setDay(b.dataset.day);});
  $('previousDay').onclick = () => {pause();setDay(state.dayIndex - 1);};
  $('nextDay').onclick = () => {pause();setDay(state.dayIndex + 1);};
  $('playButton').onclick = play;
  $('speed').onchange = () => {if (state.playTimer) {pause();play();}};
}
