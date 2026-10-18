// The volumetric contribution nebula: the desk galaxy's blue-violet palette, dust lanes and white nucleus, built as
// a volume — 13 painted slices at different heights, gas clouds sampled from the painting, dust grains, a thick
// bulge of tiny stars, resolved stars (a few in project colours) and halo stars above and below.
// Shared by the desk (universe2-contribution-scene.js) and the study page (styles/contribution-options.html).
import * as THREE from './vendor/three.module.js';
import { drawGalaxy } from './universe2-galaxy-texture.js';

const dot = (() => {const c = document.createElement('canvas');c.width = c.height = 64;const g = c.getContext('2d'),r = g.createRadialGradient(32, 32, 0, 32, 32, 32);r.addColorStop(0, '#fff');r.addColorStop(.25, 'rgba(255,255,255,.85)');r.addColorStop(1, 'rgba(255,255,255,0)');g.fillStyle = r;g.fillRect(0, 0, 64, 64);return new THREE.CanvasTexture(c);})();
const glowSprite = (color, size, opacity = .5) => {const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));s.scale.set(size, size, 1);return s;};
const points = (pos, col, size, opacity = .9) => {const g = new THREE.BufferGeometry();g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));return new THREE.Points(g, new THREE.PointsMaterial({ map: dot, size, vertexColors: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));};
const rng = (seed) => () => {seed = seed * 16807 % 2147483647;return (seed - 1) / 2147483646;};

// Builds the nebula in the XZ plane (radius ≈ 1.55) inside `group`; returns a tick(t) that turns and rocks it.
// projects: [{color}] tints a few stars.
export function buildNebula(group, { projects = [] } = {}) {
  const R = 1.55,N = 512,canvas = document.createElement('canvas');canvas.width = canvas.height = N;
  drawGalaxy(canvas, { faceOn: true });
  const px = canvas.getContext('2d').getImageData(0, 0, N, N).data;
  const sample = (x, z) => {const u = Math.round((x / (R * 1.0) * .5 * .88 + .5) * (N - 1)),v = Math.round((z / (R * 1.0) * .5 * .88 + .5) * (N - 1));if (u < 0 || v < 0 || u >= N || v >= N) return null;const i = (v * N + u) * 4;return [px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, px[i + 3] / 255];};
  // 1. the painted disc, in three thin slices so its edge has depth
  const tex = new THREE.CanvasTexture(canvas);tex.colorSpace = THREE.SRGBColorSpace;
  for (let k = -6; k <= 6; k++) {// 13 slices: the middle one carries the picture, the others thicken it like a cloud
    const y = k * .035,op = k ? .05 * Math.exp(-Math.abs(k) / 3) : .8,sc = 1 - Math.abs(k) * .045;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(R * 2 / .88, R * 2 / .88), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: k ? THREE.AdditiveBlending : THREE.NormalBlending }));
    plane.rotation.x = -Math.PI / 2;plane.position.y = y;plane.scale.setScalar(sc);plane.rotation.z = k * .03;group.add(plane);
  }
  const r = rng(29),gauss = () => (r() + r() + r() - 1.5) / 1.5;
  // 2. gas: soft clouds coloured by the nebula where it is bright, thicker towards the centre
  for (const [count, size, op] of [[1300, .3, .07], [2200, .14, .12]]) {
    const pos = [],col = [];
    while (pos.length < count * 3) {
      const a = r() * Math.PI * 2,rad = Math.sqrt(r()) * R,x = Math.cos(a) * rad,z = Math.sin(a) * rad,c = sample(x, z);
      if (!c || r() > c[3] * (c[0] + c[1] + c[2]) / 2.2 * Math.min(1, .1 + rad / .7)) continue; // fewer clouds over the core so it stays a small bright nucleus
      pos.push(x, gauss() * (.1 + .36 * Math.exp(-rad * rad * 1.8)), z);col.push(c[0] * 1.1, c[1] * 1.1, c[2] * 1.2);
    }
    group.add(points(pos, col, size, op));
  }
  // 3. dust: dark grains along the lanes (where the disc is present but dim), just above and below the plane
  {const pos = [];
    while (pos.length < 2200 * 3) {const a = r() * Math.PI * 2,rad = Math.sqrt(r()) * R * .95,x = Math.cos(a) * rad,z = Math.sin(a) * rad,c = sample(x, z);if (!c || c[3] < .35 || c[0] + c[1] + c[2] > .55 || rad < .25) continue;pos.push(x, gauss() * .09, z);}
    const g = new THREE.BufferGeometry();g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    group.add(new THREE.Points(g, new THREE.PointsMaterial({ map: dot, size: .12, color: 0x070a16, transparent: true, opacity: .35, depthWrite: false })));}
  // 4. a thick white core: a bright bulge of tiny stars with a pale glow (white, not a yellow ball)
  {const pos = [],col = [],c = new THREE.Color();
    for (let i = 0; i < 1600; i++) {const v = new THREE.Vector3(gauss(), gauss() * .8, gauss()).multiplyScalar(.3 * Math.pow(r(), 1.3));pos.push(v.x * 1.25, v.y, v.z);c.setHSL(.1 + r() * .55, .35, .82 + r() * .15);col.push(c.r, c.g, c.b);}
    group.add(points(pos, col, .035, .6));group.add(glowSprite(0xf4f0ff, .5, .38));group.add(glowSprite(0xb9a8ff, 2.2, .12));}
  // 5. resolved stars through the disc; a few carry a project's colour (this year's records), most are white-blue
  {const pos = [],col = [],c = new THREE.Color(),tints = projects.map((p) => p.color);
    for (let i = 0; i < 5200; i++) {const a = r() * Math.PI * 2,rad = Math.sqrt(r()) * R * 1.02,arm = .5 + .5 * Math.sin(2 * a - rad * 6.5);if (r() > .35 + arm * .6) continue;
      pos.push(Math.cos(a) * rad, gauss() * (.1 + .38 * Math.exp(-rad * rad * 1.6)), Math.sin(a) * rad);
      if (i % 9 === 0 && tints.length) c.set(tints[i % tints.length]).lerp(new THREE.Color(0xffffff), .35);else c.set(i % 5 === 0 ? 0xffe6c8 : i % 3 === 0 ? 0xaed4ff : 0xdcc6f2);
      col.push(c.r, c.g, c.b);}
    group.add(points(pos, col, .032, .85));}
  {const pos = [],col = [],c = new THREE.Color();
    for (let i = 0; i < 900; i++) {const v = new THREE.Vector3(gauss(), gauss() * .55, gauss()).multiplyScalar(R * .75);pos.push(v.x, v.y, v.z);c.set(i % 3 ? 0xdcd2f5 : 0xaed4ff);col.push(c.r, c.g, c.b);}
    group.add(points(pos, col, .026, .55));}
  group.rotation.x = .2;
  // turn, and rock gently so the depth shows while it turns
  return (t) => {group.rotation.y = t * .08;group.rotation.x = .2 + Math.sin(t * .35) * .22;};
}
