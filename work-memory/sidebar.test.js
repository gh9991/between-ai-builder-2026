import assert from 'node:assert/strict';
class Element {
  constructor(tag) {this.tagName = tag;this.children = [];this.dataset = {};this.style = { setProperty() {} };this.open = false;this._text = '';}
  set textContent(t) {this._text = String(t ?? '');this.children = [];}
  get textContent() {return this._text + this.children.map((c) => c.textContent).join(' ');}
  get childNodes() {return this.children;}
  append(...xs) {this.children.push(...xs);}
  replaceChildren(...xs) {this.children = xs;}
  querySelector(selector) {return walk(this).find((e) => e.className === selector.slice(1));}
}
const walk = (e) => e.children.flatMap((c) => [c, ...walk(c)]);
const ids = new Map();
globalThis.document = { createElement: (t) => new Element(t), getElementById: (id) => {if (!ids.has(id)) ids.set(id, new Element('div'));return ids.get(id);} };
globalThis.location = { search: '?scenario=architect' };
const { state, DATA, actions } = await import('./state.js');
const { renderSidebar, renderProjectRail, isEndedProject } = await import('./sidebar.js');
const at = (date) => {state.snapshot = DATA.snapshots.find((s) => s.date === date);assert(state.snapshot);renderSidebar();renderProjectRail();};
const labels = (root) => walk(root).filter((e) => e.tagName === 'button').map((e) => e.children.find((c) => c.tagName === 'b')?.textContent || e.textContent);
state.view = 'network';at('2026-09-30');
const list = ids.get('projectList'),rail = ids.get('projectRail');
let archive = list.querySelector('.ended-projects');
assert.equal(archive.open, false, 'archive defaults to collapsed');
assert.equal(archive.children[0].textContent, 'Finished projects 7');
assert(labels(archive).some((t) => t.includes('Hong Kong tower') && t.includes('Handed back to Hong Kong')));
assert(!labels(rail).includes('Library competition'));
assert(!labels(rail).includes('Hong Kong tower'));
assert(labels(rail).includes('Hospital site plan'), 'on-hold work stays visible');
assert(labels(rail).includes('School'));
assert.equal(labels(rail).length, 5);
archive.open = true;
let picked;
actions.selectProject = (id) => {picked = id;state.selectedProject = id;renderSidebar();renderProjectRail();};
walk(archive).find((e) => e.tagName === 'button' && e.textContent.includes('Library competition')).onclick();
assert.equal(picked, 'harbour_library');
assert.equal(list.querySelector('.ended-projects').open, true, 'archive stays open after selecting history');
assert(!labels(rail).includes('Library competition'), 'selected archived work must not reappear in active rail');
list.querySelector('.ended-projects').open = false;renderSidebar();
assert.equal(list.querySelector('.ended-projects').open, false, 'user can collapse selected archive');
at('2025-11-20');
assert(labels(rail).includes('Library competition'), 'not-yet-closed competition appears in historical rail');
assert(labels(rail).includes('Hong Kong tower'), 'hand-back is not applied to earlier history');
assert(!list.querySelector('.ended-projects'));
assert.equal(isEndedProject({ status: 'pilot' }), false);
assert.equal(isEndedProject({ status: 'awaiting_approval' }), false);
assert.equal(isEndedProject({ status: 'completed' }), true);
console.log('PASS: ended-project grouping, archive selection/collapse, active rail, hand-back distinction and historical placement.');
