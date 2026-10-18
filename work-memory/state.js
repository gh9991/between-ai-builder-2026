// Scenario data, lookup tables and the shared UI state that every module reads and writes.
import { SCENARIOS as REGISTERED_SCENARIOS } from './data/scenarios/index.js';
import { visibleWorkEvents } from './work-model.js';
import { EN, localizeScenario } from './i18n.js';

// Each entry may limit its examples without deleting shared source datasets.
const allowedScenarios = document.body?.dataset?.scenarios?.split(',');
// English pages offer only the datasets written in English too (Iris is Chinese only).
export const SCENARIOS = REGISTERED_SCENARIOS.filter((s) => (!allowedScenarios || allowedScenarios.includes(s.config.id)) && (!EN || s.config.title_en));

// Scenario selection: ?scenario=<id> picks a dataset from data/scenarios/index.js; the first entry is the default.
const requestedScenario = new URLSearchParams(location.search).get('scenario');
export const SCENARIO = SCENARIOS.find((s) => s.config.id === requestedScenario) || SCENARIOS[0];
if ((allowedScenarios || EN) && requestedScenario && requestedScenario !== SCENARIO.config.id) {
  const url = new URL(location.href);
  if (SCENARIO === SCENARIOS[0]) url.searchParams.delete('scenario');else url.searchParams.set('scenario', SCENARIO.config.id);
  history.replaceState(null, '', url);
}
// English pages (body data-lang="en") read the English fields of the dataset; see i18n.js.
localizeScenario(SCENARIO);
if (EN) for (const s of SCENARIOS) if (s.config.title_en) s.config.title = s.config.title_en;
export const CONFIG = SCENARIO.config,DATA = SCENARIO.data,STORIES = SCENARIO.stories;
export const PERSONA_ID = CONFIG.persona_id,HOME_ORG = CONFIG.home_org_id,DAILY_PROJECT = CONFIG.daily_project_id;

export const people = Object.fromEntries(DATA.people.map((p) => [p.id, p]));
export const orgs = Object.fromEntries(DATA.organisations.map((o) => [o.id, o]));
export const projects = Object.fromEntries(DATA.projects.map((p) => [p.id, p]));
export const records = Object.fromEntries(DATA.records.map((r) => [r.id, r]));
export const PERSONA = DATA.manifest?.persona || people[PERSONA_ID];
export const PERSONA_FIRST_NAME = PERSONA.name.split(' ')[0];

// Label maps fall back to the raw key so a scenario with new vocabulary never renders "undefined".
export const labelMap = (m, fallback = (k) => String(k)) => new Proxy(m || {}, { get: (t, k) => t[k] ?? fallback(k) });
export const KIND = labelMap(CONFIG.kind_labels),STATUS = labelMap(CONFIG.status_labels);
export const hex = (c) => parseInt(c, 16);

const ORGCFG = CONFIG.orgs || {},PROJCFG = CONFIG.projects || {};
export const ORGCOL = Object.fromEntries(Object.entries(ORGCFG).map(([id, o]) => [id, hex(o.color)]));
export const ORGPOS = Object.fromEntries(Object.entries(ORGCFG).filter(([id]) => {
  if (!orgs[id]) console.warn(`scenario ${CONFIG.id}: org "${id}" is configured but absent from the data; skipped`);
  return !!orgs[id];
}).map(([id, o]) => [id, o.position]));
export const COLORS = Object.fromEntries(Object.entries(PROJCFG).map(([id, p]) => [id, hex(p.color)]));
export const projectColor = (id) => '#' + (PROJCFG[id]?.color ?? '829b83');
export const short = labelMap(Object.fromEntries(Object.entries(PROJCFG).map(([id, p]) => [id, p.short])), (id) => projects[id]?.name_zh || projects[id]?.name || String(id));
export const PROJECT_GOALS = labelMap(Object.fromEntries(Object.entries(PROJCFG).map(([id, p]) => [id, p.goal])), () => '');
export const STAGES = CONFIG.stages || [];
export const DAYS = DATA.snapshots.length,LAST = DAYS - 1;

const defaultDay = DATA.snapshots.findIndex((s) => s.date === DATA.manifest?.default_snapshot);
const startDay = defaultDay >= 0 ? defaultDay : LAST;

// Shared, mutable UI state. Modules read and assign fields on this object (ES module bindings cannot be reassigned by importers).
export const state = {
  dayIndex: startDay,
  view: 'desk', // 'desk' | 'network'
  selectedPerson: null,
  selectedOrg: null,
  selectedProject: null,
  personTab: 'projects',
  detailMode: 'overview', // 'overview' | 'person' | 'org' | 'project' | 'projects' | 'notebook' | 'files'
  playTimer: null,
  noticeTimer: null,
  snapshot: DATA.snapshots[startDay],
  visible: [], // records known on the selected day (first_seen_at <= as_of)
  visibleIds: new Set()
};

// Navigation actions are registered by app.js so modules can trigger them without import cycles.
export const actions = {};

export function personRecords(id) {
  return state.visible.filter((r) => r.participant_ids.includes(id) && !['journal', 'calendar', 'weekly_report'].includes(r.kind));
}
export function activeNodes() {
  return state.snapshot.connections.nodes.filter((n) => !state.selectedProject || personRecords(n.person_id).some((r) => r.project_id === state.selectedProject));
}
export function workEvents(pid = null, personId = null) {
  return visibleWorkEvents(STORIES, DATA.records, state.snapshot.as_of, pid, personId);
}
