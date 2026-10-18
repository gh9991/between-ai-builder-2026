import assert from 'node:assert/strict';
import { MIN_ZOOM, MAX_ZOOM, scaleZoom, wheelZoom } from './world-zoom.js';

const close = (a, b) => assert(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
// Same motion in different event units/devices should produce the same distance.
close(wheelZoom(1, 48), wheelZoom(1, 3, 1));
close(wheelZoom(1, 800), wheelZoom(1, 1, 2, 800));
let split = 1;
for (let i = 0; i < 10; i++) split = wheelZoom(split, 10);
close(split, wheelZoom(1, 100));
close(wheelZoom(wheelZoom(1, 100), -100), 1);
assert(wheelZoom(1, 500) > 1.8); // old zoom-out stop
assert(wheelZoom(1, -500) < 0.5); // old zoom-in stop
assert.equal(wheelZoom(1, 1e6), MAX_ZOOM);
assert.equal(wheelZoom(1, -1e6), MIN_ZOOM);
assert(wheelZoom(MAX_ZOOM, -1) < MAX_ZOOM); // reverse immediately at either bound
assert(wheelZoom(MIN_ZOOM, 1) > MIN_ZOOM);
close(scaleZoom(scaleZoom(1, 1.2), 1 / 1.2), 1);
console.log('PASS: proportional wheel zoom, event units, extended bounds, reversal and matching buttons.');
