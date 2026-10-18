import assert from 'node:assert/strict';
import { samplePeopleTransition as sample, PEOPLE_TRANSITION_SECONDS as duration } from './universe2-transition.js';
const start = { position: [-4, 2, 9], opacity: 0 };
const end = { position: [7, -1, 3], opacity: 1 };
// Interrupted toggles start exactly at the last rendered position and opacity.
const interrupted = sample(start, end, .37);
assert.deepEqual(sample(interrupted, start, 0).position, interrupted.position);
assert.equal(sample(interrupted, start, 0).opacity, interrupted.opacity);
assert.deepEqual(sample(interrupted, start, duration).position, start.position);
assert.equal(sample(interrupted, start, duration).opacity, 0);
for (const elapsed of [-1, 0, .1, .5, duration, 10]) {
  const value = sample(start, end, elapsed);
  assert(value.opacity >= 0 && value.opacity <= 1);
  value.position.forEach((n, i) => assert(n >= Math.min(start.position[i], end.position[i]) && n <= Math.max(start.position[i], end.position[i])));
}
// Reduced motion finishes immediately; slow frames cannot overshoot the target.
assert.deepEqual(sample(start, end, 0, 0), { ...end, done: true });
assert.deepEqual(sample(start, end, 30), { ...end, done: true });
const pinned = { position: [3, 4, 5], opacity: 1 };
assert.deepEqual(sample(pinned, pinned, .6).position, pinned.position);
console.log('PASS: reversible transitions, bounded opacity/positions, fixed points and reduced motion.');

const { scenarioEntryMotion, SCENARIO_ENTRY_SECONDS } = await import('./universe2-transition.js');
assert.equal(scenarioEntryMotion(0), .15);
let previous = 0;
for (let i = 0; i <= 120; i++) {
  const scale = scenarioEntryMotion(i / 100);
  assert(scale >= previous && scale <= 1);previous = scale;
}
assert.equal(scenarioEntryMotion(SCENARIO_ENTRY_SECONDS), 1);
assert.equal(scenarioEntryMotion(30), 1);
console.log('PASS: identity arrival eases monotonically and restores full ongoing motion.');
