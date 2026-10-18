import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from './vendor/three.module.js';
import { draggedPitch, orbitFrame } from './universe2-orbit.js';
const target = new Vector3(3, -2, 1);
function camera(theta, phi) {
  const frame = orbitFrame(theta, phi),cam = new PerspectiveCamera();
  cam.position.set(...frame.direction).multiplyScalar(40).add(target);
  cam.up.set(...frame.up);cam.lookAt(target);
  return cam;
}
assert(draggedPitch(1.32, -600, true) > Math.PI);
assert(draggedPitch(1.32, 600, true) < 0);
assert.equal(draggedPitch(1.32, -600), 1.45);
assert.equal(draggedPitch(1.32, 600), .25);
for (const theta of [0, .6, -2, 7]) {
  for (const pole of [-Math.PI, 0, Math.PI, 2 * Math.PI]) {
    const before = camera(theta, pole - .0001),at = camera(theta, pole),after = camera(theta, pole + .0001);
    assert(before.quaternion.angleTo(after.quaternion) < .001, 'Crossing a pole must not flip orientation');
    assert(at.getWorldDirection(new Vector3()).distanceTo(target.clone().sub(at.position).normalize()) < 1e-10);
  }
  const start = camera(theta, 1.32),turn = camera(theta, 1.32 + Math.PI * 2);
  assert(start.position.distanceTo(turn.position) < 1e-10);
  assert(start.quaternion.angleTo(turn.quaternion) < 1e-7);
  // The normal starting pose is unchanged from the former world-up camera.
  const old = new PerspectiveCamera();old.position.copy(start.position);old.lookAt(target);
  assert(start.quaternion.angleTo(old.quaternion) < 1e-7);
}
console.log('PASS: unrestricted organisation pitch, continuous pole crossings, complete turns and original default orientation.');

// A point on the focus plane follows the pointer by the same pixel distance,
// including zoomed-out and upside-down views. Panning preserves orientation.
const { draggedPan } = await import('./universe2-orbit.js');
for (const phi of [-.5, 1.32, Math.PI, 4.7]) for (const distance of [6, 40, 100]) {
  const cam = camera(.6, phi),width = 1400,height = 800;
  cam.fov = 48;cam.aspect = width / height;cam.updateProjectionMatrix();
  cam.position.sub(target).normalize().multiplyScalar(distance).add(target);
  cam.updateMatrixWorld();
  const before = target.clone().project(cam),orientation = cam.quaternion.clone();
  const right = new Vector3(1, 0, 0).applyQuaternion(cam.quaternion).toArray();
  const up = new Vector3(0, 1, 0).applyQuaternion(cam.quaternion).toArray();
  const scale = 2 * distance * Math.tan(cam.fov * Math.PI / 360) / height;
  const delta = new Vector3(...draggedPan([0, 0, 0], 180, -90, right, up, scale));
  cam.position.add(delta);cam.lookAt(target.clone().add(delta));cam.updateMatrixWorld();
  const after = target.clone().project(cam);
  assert(Math.abs((after.x - before.x) * width / 2 - 180) < 1e-8);
  assert(Math.abs(-(after.y - before.y) * height / 2 + 90) < 1e-8);
  assert(cam.quaternion.angleTo(orientation) < 1e-7);
  assert.deepEqual(draggedPan([3, 4, 5], 0, 0, right, up, scale), [3, 4, 5]);
}
console.log('PASS: screen-aligned pan at multiple zooms and rotations, unchanged camera orientation and zero-drag offset.');

// Verify the fit with an actual perspective projection, including a short/wide viewport.
const { distanceToFrame } = await import('./universe2-orbit.js');
const rim = [[-1.2, 3.5, -1.3], [.6, 5.2, -1.3], [2.4, 3.5, -1.3], [.6, 1.8, -1.3]];
const deskTarget = new Vector3(.5, .7, -1.4),deskOrbit = orbitFrame(-.75, 1.12);
for (const [width, height] of [[1536, 680], [1920, 780], [1280, 720], [800, 600]]) {
  const top = 120;
  const distance = distanceToFrame(rim, deskTarget, deskOrbit, 48, width, height, { top, left: 100, right: 100, bottom: 20 });
  const cam = new PerspectiveCamera(48, width / height, .1, 600);
  cam.position.set(...deskOrbit.direction).multiplyScalar(distance).add(deskTarget);
  cam.up.set(...deskOrbit.up);cam.lookAt(deskTarget);cam.updateMatrixWorld();
  for (const point of rim) {
    const projected = new Vector3(...point).project(cam);
    const x = (projected.x + 1) * width / 2,y = (1 - projected.y) * height / 2;
    assert(x >= 100 - 1e-8 && x <= width - 100 + 1e-8);
    assert(y >= top - 1e-8 && y <= height - 20 + 1e-8, 'Galaxy rim must leave room for its label below navigation');
  }
}
console.log('PASS: default desk framing reserves title and navigation space at multiple viewport shapes.');


// Desk overlays project before render; Universe labels project after render.
// Both must see the same camera, including on the first frame of a changed angle.
const { positionOrbitCamera } = await import('./universe2-orbit.js');
const overlayCamera = new PerspectiveCamera(48, 1536 / 680, .1, 600);
const anchors = [new Vector3(-1.7, 0, -4.7), new Vector3(.6, 3.5, -1.3), new Vector3(0, 2.1, 0)];
for (const [theta, phi, distance] of [[-.75, 1.12, 13], [-.80, 1.16, 13], [.2, .5, 10], [-1.1, 1.4, 18]]) {
  positionOrbitCamera(overlayCamera, orbitFrame(theta, phi), distance, deskTarget);
  const beforeRender = anchors.map((p) => p.clone().project(overlayCamera));
  overlayCamera.updateMatrixWorld(); // The renderer's camera update must not move the labels.
  anchors.forEach((p, i) => {
    const rendered = p.clone().project(overlayCamera);
    assert(beforeRender[i].distanceTo(rendered) < 1e-10, 'Pre-render desk labels must align with the rendered frame');
  });
}
console.log('PASS: desk labels and rendered geometry share the current camera during rotation and zoom.');
