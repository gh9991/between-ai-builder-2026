import assert from 'node:assert/strict';

// Minimal DOM for behavioral checks; actual layout is checked in the preview browser.
class Element {
  constructor(tag) {this.tagName = tag;this.children = [];this.dataset = {};this.attributes = {};this.className = '';this._text = '';}
  set textContent(text) {this._text = String(text ?? '');this.children = [];}
  set innerHTML(html) {this._text = String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');this.children = [];} // text of rendered markup, enough for content checks
  get textContent() {return this._text + this.children.map((c) => c.textContent).join(' ');}
  append(...children) {children.forEach((c) => {c.parent = this;this.children.push(c);});}
  prepend(...children) {children.forEach((c) => {c.parent = this;});this.children.unshift(...children);}
  replaceChildren(...children) {this._text = '';this.children = [];this.append(...children);}
  setAttribute(key, value) {this.attributes[key] = value;}
  remove() {this.parent.children = this.parent.children.filter((c) => c !== this);}
  showModal() {this.open = true;}
  querySelector(selector) {
    const parts = selector.split(' '),matches = (e, p) => p.startsWith('.') ? e.className.split(' ').includes(p.slice(1)) : e.tagName === p;
    return walk(this).find((e) => matches(e, parts.at(-1)) && (parts.length === 1 || ancestors(e).some((a) => matches(a, parts[0]))));
  }
}
const walk = (root) => root.children.flatMap((c) => [c, ...walk(c)]);
const ancestors = (e) => e.parent ? [e.parent, ...ancestors(e.parent)] : [];
const ids = new Map(),store = new Map();
globalThis.document = { createElement: (tag) => new Element(tag), getElementById: (id) => {if (!ids.has(id)) ids.set(id, new Element('div'));return ids.get(id);} };
globalThis.location = { search: '?scenario=architect' };
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
const { DATA, state, records, people, actions } = await import('./state.js');
const originalUnits = DATA.work_units;
const at = (day) => `2026-09-${day}T12:00:00+08:00`;
const base = { kind: 'chat', project_id: 'riverside', actor_id: 'dian', participant_ids: ['grace', 'dian'], occurred_at: at('29'), first_seen_at: at('29'), body: 'Only known work', title: 'Feedback', linked_record_ids: [] };
for (const [id, props] of Object.entries({ testFeedback: {}, testEvidence: { first_seen_at: at('30') }, testFuture: { first_seen_at: '2026-10-01T12:00:00+08:00' }, testSmall: { body: 'HIDDEN SMALL TALK' }, testMixed: { body: 'HIDDEN MIXED GREETING', title: 'HIDDEN MIXED TITLE' } })) records[id] = { ...base, ...props, id };
DATA.work_units = [
{ id: 'test-fb', type: 'feedback', record_id: 'testFeedback', project_id: 'riverside', from_id: 'dian', to_ids: ['grace'], group_id: 'test-group', text: 'Widen frontage', status_history: [{ at: at('29'), status: 'open' }, { at: at('30'), status: 'likely_addressed', evidence_ids: ['testEvidence'], note: 'Revised plan' }] },
{ id: 'test-future', type: 'feedback', record_id: 'testFuture', project_id: 'riverside', from_id: 'dian', to_ids: ['grace'], text: 'HIDDEN FUTURE' },
{ id: 'test-small', type: 'small_talk', record_id: 'testSmall', from_id: 'dian', to_ids: ['grace'], text: 'HIDDEN SMALL TALK' },
{ id: 'test-mixed-small', type: 'small_talk', record_id: 'testMixed', from_id: 'dian', to_ids: ['grace'], text: 'HIDDEN MIXED GREETING' },
{ id: 'test-mixed-work', type: 'update', record_id: 'testMixed', project_id: 'riverside', from_id: 'dian', to_ids: ['grace'], text: 'Safe work excerpt' }];

const { renderPersonView, beginPersonVisit, personNewCount } = await import('./person-view.js');
const { openRecord, isWorkRecord } = await import('./records.js');
actions.pause = () => {};
function day(date) {
  state.snapshot = structuredClone(DATA.snapshots.find((s) => s.date === date));
  state.snapshot.desk.focus_project_id = 'riverside';
  state.snapshot.task_states = [
  { id: 'test-parent', project_id: 'riverside', owner_id: 'grace', counterparty_id: 'dian', title: 'Revise plan', status: 'open', source_ids: ['testFeedback'] },
  { id: 'test-child', project_id: 'riverside', owner_id: 'siyi', counterparty_id: 'grace', delegated_by: 'grace', parent_task_id: 'test-parent', title: 'Update area schedule', status: 'in_progress', source_ids: ['testFeedback'] }];

  state.visible = Object.values(records).filter((r) => r.first_seen_at <= state.snapshot.as_of);
  state.visibleIds = new Set(state.visible.map((r) => r.id));
}
const root = new Element('div');
function render(id = 'dian', visit = false) {
  state.selectedPerson = id;
  if (visit) beginPersonVisit(id);
  root.replaceChildren();renderPersonView(root, people[id], state.snapshot.connections.nodes.find((n) => n.person_id === id));
  return root.textContent;
}
const click = (label) => {const target = walk(root).find((e) => e.tagName === 'button' && e.textContent === label);assert(target, label);target.onclick();};
day('2026-09-29');
render('dian', true);assert(!walk(root).some((e) => e.className.includes('pv-status-likely_addressed')));
assert(!root.textContent.includes('HIDDEN'));
assert(root.textContent.includes('Update area schedule'));
assert.equal(walk(root).filter((e) => e.className === 'pv-block' && e.parent.className === 'pv-first').length, 3);
assert.equal(walk(root).find((e) => e.className === 'pv-lens' && e.attributes['aria-pressed'] === 'true').textContent, 'Mall competition');
day('2026-09-30');
render();assert(walk(root).some((e) => e.className.includes('pv-status-likely_addressed')));
click('Confirm');
assert(walk(root).some((e) => e.className.includes('pv-status-addressed')));
assert([...store.keys()].some((k) => k.includes('architect:status:test-fb')));
day('2026-09-29');
render();assert(!walk(root).some((e) => e.className.includes('pv-status-addressed')));
day('2026-09-30');render();click('Reopen');
assert(walk(root).some((e) => e.className.includes('pv-status-reopened')));
click('Pass on…');
const modal = document.getElementById('modalBody');
assert(walk(modal).find((e) => e.tagName === 'textarea').value.includes('Widen frontage'));
assert(walk(modal).filter((e) => e.tagName === 'button').every((e) => !e.textContent.includes('Send')));
assert.equal(isWorkRecord(records.testSmall), false);
openRecord('testMixed');
assert(modal.textContent.includes('Safe work excerpt'));
assert(!modal.textContent.includes('HIDDEN'));
beginPersonVisit('dian');assert.equal(personNewCount('dian'), 0);
day('2026-08-20');assert(!render().includes('Widen frontage'));
// Malformed or blocked storage must never break person navigation.
for (const key of store.keys()) store.set(key, '{bad json');
render('siyi', true);
globalThis.localStorage = { getItem() {throw Error('blocked');}, setItem() {throw Error('blocked');} };
assert.doesNotThrow(() => render('dian', true));
day('2026-09-30');
for (const [id, headings] of [
['siyi', ['Tasks I assigned to them', 'Their latest updates and files', 'Questions awaiting my response']],
['pai', ['Decisions they contributed to', 'Project items they are following', 'To report next time']],
['jonas', ['Where we left off', 'Their commitments and dates', 'Latest shared versions']],
['rachel', ['Their requests and decisions', 'To do / Awaiting them', 'Next meeting / milestone']],
['mark', ['Submitted material', 'Feedback and status', 'Time awaiting reply']],
['revit_audit', ['Latest findings / outputs', 'Recipients', 'Follow-up']]])
{
  render(id, true);
  const first = walk(root).find((e) => e.className === 'pv-first');
  assert.deepEqual(first.children.map((section) => section.querySelector('h3').textContent), headings);
}
DATA.work_units = undefined;
assert(render('dian', true).includes('Shared projects'));
DATA.work_units = originalUnits;
// Actual scenario: school-only contacts must never inherit the mall focus as a tab.
const activeLens = () => walk(root).find((e) => e.className === 'pv-lens' && e.attributes['aria-pressed'] === 'true').textContent;
state.selectedProject = 'lakeside';
day('2026-09-30');
render('dian', true);
assert.equal(activeLens(), 'School');
click('Mall competition');render();
assert.equal(activeLens(), 'Mall competition', 'manual lens survives redraw');
state.selectedProject = 'northgate';render();
assert.equal(activeLens(), 'Office tower design', 'new world context replaces the previous lens');
state.selectedProject = 'lakeside';
for (const id of ['robert', 'mark']) {
  render(id, true);
  assert.equal(activeLens(), 'School');
  assert.deepEqual(walk(root).filter((e) => e.className === 'pv-lens').map((e) => e.textContent), ['School', 'All']);
}
assert(root.textContent.includes('Building permit approved with standard conditions'));
state.selectedProject = null;
render('robert', true);
assert.equal(activeLens(), 'School', 'unrelated daily focus falls back to shared work');
state.selectedProject = 'riverside';render('robert', true);
assert.equal(activeLens(), 'School', 'unrelated world context cannot invent participation');
state.selectedProject = null;
day('2026-07-01');render('dian', true);
assert(!walk(root).some((e) => e.className === 'pv-lens' && e.textContent === 'Mall competition'), 'future participation must not create a tab');
console.log('PASS: person lenses, source/status knowledge time, local confirm/reopen history, task delegation draft, small-talk filtering, visit counts, blocked storage and legacy fallback.');
