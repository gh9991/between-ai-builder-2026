// Universe 2 project-space scene, independently editable.
import * as THREE from '../vendor/three.module.js';
import { t as tr } from '../i18n.js';
import { buildModel, modelKind } from './project-models.js';
import { projectTeamLayout } from './project-team.js?v=20261017-en2';
import { projectSignals } from './universe2-project-signals.js?v=20261017-en2';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export function createProjectSpaceScene(D, teams, read) {
  const PROJ = D.PROJ,P = D.P;
  function texGlow() {const c = document.createElement('canvas');c.width = c.height = 128;const x = c.getContext('2d');const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);g.addColorStop(0, 'rgba(255,255,255,1)');g.addColorStop(.2, 'rgba(255,255,255,.7)');g.addColorStop(.5, 'rgba(255,255,255,.15)');g.addColorStop(1, 'rgba(255,255,255,0)');x.fillStyle = g;x.fillRect(0, 0, 128, 128);return new THREE.CanvasTexture(c);}
  function texFlare() {const c = document.createElement('canvas');c.width = c.height = 256;const x = c.getContext('2d');x.translate(128, 128);for (const r of [0, Math.PI / 2]) {x.save();x.rotate(r);const g = x.createLinearGradient(-128, 0, 128, 0);g.addColorStop(0, 'rgba(255,255,255,0)');g.addColorStop(.5, 'rgba(255,255,255,1)');g.addColorStop(1, 'rgba(255,255,255,0)');x.fillStyle = g;x.fillRect(-128, -1.6, 256, 3.2);x.restore();}return new THREE.CanvasTexture(c);}
  const GLOW = texGlow(),FLARE = texFlare();
  function placed(o, x, y, z) {o.position.set(x, y, z);return o;}
  function sprite(tex, color, size, op = 1, additive = true) {const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: op, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false }));s.scale.set(size, size, 1);return s;}
  const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .82 }, o));
  function mesh(parent, geo, mat, x = 0, y = 0, z = 0) {const m = new THREE.Mesh(geo, mat);m.position.set(x, y, z);m.castShadow = true;m.receiveShadow = true;parent.add(m);return m;}
  const box = (p, w, h, d, c, x, y, z, o) => mesh(p, new THREE.BoxGeometry(w, h, d), M(c, o), x, y, z);
  const cyl = (p, r1, r2, h, c, x, y, z, o, s = 24) => mesh(p, new THREE.CylinderGeometry(r1, r2, h, s), M(c, o), x, y, z);
  const ball = (p, r, c, x, y, z, o) => mesh(p, new THREE.SphereGeometry(r, 18, 14), M(c, o), x, y, z);
  function starDust(scene, n = 2400, op = .75) {const pos = new Float32Array(n * 3),col = new Float32Array(n * 3);for (let i = 0; i < n; i++) {const r = 60 + Math.random() * 140,t = Math.random() * Math.PI * 2,u = Math.acos(2 * Math.random() - 1);pos.set([r * Math.sin(u) * Math.cos(t), Math.abs(r * Math.cos(u)) * .7 + 5, r * Math.sin(u) * Math.sin(t)], i * 3);const w = Math.random();col.set(w > .85 ? [1, .82, .6] : w > .7 ? [.7, .8, 1] : [.88, .9, .96], i * 3);}const g = new THREE.BufferGeometry();g.setAttribute('position', new THREE.BufferAttribute(pos, 3));g.setAttribute('color', new THREE.BufferAttribute(col, 3));const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: .6, vertexColors: true, transparent: true, opacity: op, depthWrite: false }));scene.add(pts);return pts;}
  function polyline(scene, pts, color, op = .5, dash = null) {const g = new THREE.BufferGeometry().setFromPoints(pts);const m = dash ? new THREE.LineDashedMaterial({ color, dashSize: dash[0], gapSize: dash[1], transparent: true, opacity: op }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity: op });const l = new THREE.Line(g, m);if (dash) l.computeLineDistances();scene.add(l);return l;}
  function circle(scene, r, color, op, y = .02) {const pts = [];for (let i = 0; i <= 160; i++) {const a = i / 160 * Math.PI * 2;pts.push(V(Math.cos(a) * r, y, Math.sin(a) * r));}return polyline(scene, pts, color, op);}
  const SKIN = [0xf1c9a8, 0xe0ac86, 0xc68b62, 0x9c6644, 0xf4d3ba],HAIR = [0x2b2421, 0x4a3326, 0x8a5a3c, 0xc9a066, 0x1c1c1c, 0x6b6b6b],TOPS = [0x1e2430, 0x3d4652, 0x4c6ef5, 0x6b7a8f, 0x7a5c48, 0x2f5d50, 0xb4553a];
  function hsh(s) {let h = 2166136261;for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);return h >>> 0;}
  // role-based figure (same rules as work-memory/characters.js)
  function figure(parent, p, scale = 1) {const g = new THREE.Group();parent.add(g);const b = new THREE.Group();b.scale.setScalar(.86 * scale);g.add(b);const h = hsh(p.id);
    let top = TOPS[(h >>> 17) % TOPS.length],o = {};const t = p.type;
    if (t === 'skip_manager') {top = 0x1e2430;o.glasses = 1;o.turtle = 1;} else if (['manager', 'junior', 'peer', 'colleague', 'partner_office', 'self'].includes(t)) {o.turtle = (h >>> 19) % 2 === 0;} else
    if (t === 'client' || t === 'client_pm') {top = 0x2b2f38;o.tie = 1;} else if (t === 'ldi') {top = 0x5a6b8c;o.glasses = 1;} else if (t === 'engineer') {top = 0x5c5470;o.helmet = 1;o.vest = 1;} else if (t === 'consultant') {top = 0x6d5a7e;o.glasses = 1;} else if (t === 'authority') {top = 0x334155;o.badge = 1;}
    if (p.type === 'self') {top = 0x1e2430;o.turtle = 1;}
    const skin = SKIN[(h >>> 3) % SKIN.length],hair = HAIR[(h >>> 7) % HAIR.length],style = (h >>> 11) % 4,pants = 0x2b3440;
    box(b, .13, .34, .16, pants, -.09, .17, 0);box(b, .13, .34, .16, pants, .09, .17, 0);cyl(b, .2, .22, .46, top, 0, .58, 0);ball(b, .2, top, 0, .8, 0);ball(b, .17, skin, 0, 1.04, 0);
    if (!o.helmet) {const cap = ball(b, .178, hair, 0, 1.09, -.02);cap.scale.set(1, .72, 1);if (style === 1) ball(b, .08, hair, 0, 1.2, -.12);if (style === 2) box(b, .34, .3, .1, hair, 0, .95, -.12);}
    if (o.turtle) cyl(b, .1, .12, .08, top, 0, .98, 0);
    if (o.helmet) {const hm = ball(b, .2, 0xf5c518, 0, 1.1, 0);hm.scale.set(1, .7, 1);}
    if (o.vest) cyl(b, .215, .23, .3, 0xf97316, 0, .6, 0);
    if (o.tie) {box(b, .05, .28, .02, 0xb91c1c, 0, .66, .205);box(b, .16, .08, .02, 0xf4f2ec, 0, .8, .19);}
    if (o.badge) box(b, .09, .11, .02, 0xf4f2ec, .08, .66, .215);
    if (o.glasses) box(b, .2, .04, .02, 0x111111, 0, 1.06, .165);
    return g;}
  function agentOrb(parent, color = 0x4FE3CF) {const g = new THREE.Group();parent.add(g);g.add(new THREE.Mesh(new THREE.SphereGeometry(.22, 20, 16), new THREE.MeshStandardMaterial({ color: 0x9ff3e8, emissive: color, emissiveIntensity: .9, roughness: .3 })));g.add(sprite(GLOW, color, 1.3, .55));const ring = new THREE.Mesh(new THREE.TorusGeometry(.32, .018, 8, 40), new THREE.MeshBasicMaterial({ color: 0xe6fffb }));ring.rotation.x = Math.PI / 2.4;g.add(ring);g.userData.ring = ring;return g;}
  function deskModel(parent, warm = true) {const g = new THREE.Group();parent.add(g);box(g, 1.9, .08, .95, warm ? 0xC4A77E : 0xD9CDB6, 0, .76, 0);for (const x of [-.85, .85]) for (const z of [-.38, .38]) box(g, .06, .76, .06, 0x8c947c, x, .38, z);box(g, .78, .5, .05, 0x2B3440, 0, 1.1, -.32);const scr = box(g, .72, .44, .01, 0xCFE3F5, 0, 1.1, -.29, { emissive: 0x9CC3E0, emissiveIntensity: .6 });box(g, .5, .02, .18, 0xE9E9DC, 0, .81, .1);cyl(g, .06, .05, .12, 0xF4F0E2, .6, .86, .2);return { g, scr };}
  function massing(parent, kind, mat) {return buildModel(THREE, parent, modelKind(PROJ[kind] || { massing: kind }), mat, mat.transparent ? mat : new THREE.MeshStandardMaterial({ color: PROJ[kind]?.color ?? 0xBBBBBB, roughness: .6 }));}
  function wireMassing(parent, kind, color) {const g = massing(parent, kind, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .14, depthWrite: false }));g.children.forEach((c) => {const e = new THREE.LineSegments(new THREE.EdgesGeometry(c.geometry), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .95 }));e.position.copy(c.position);e.rotation.copy(c.rotation);g.add(e);});return g;}

  // Match Desk in Space's stage, organisation platforms and relationship lines.
  const scene = new THREE.Scene();scene.background = new THREE.Color(0x070b16);
  scene.fog = new THREE.FogExp2(0x070b16, .015);
  scene.add(new THREE.HemisphereLight(0xbfd3ff, 0x1a2236, 1.8));
  const key = new THREE.DirectionalLight(0xfff1dc, 3);key.position.set(-6, 12, 8);key.castShadow = true;scene.add(key);
  const lamp = new THREE.PointLight(0xffc27a, 5, 9, 1.5);scene.add(lamp);
  const dust = starDust(scene, 2600, .8);
  const plat = new THREE.Group();scene.add(plat);
  cyl(plat, 1.9, 2.1, .18, 0x303c54, 0, -.09, 0, {}, 64);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2, .03, 8, 96), new THREE.MeshBasicMaterial({ color: 0xffd08a }));rim.rotation.x = Math.PI / 2;plat.add(rim);
  plat.add(placed(sprite(GLOW, 0xffc977, 6, .18), 0, .2, 0));
  const desk = deskModel(plat);desk.g.position.z = -.25;
  const me = figure(plat, { id: D.persona.id, type: 'self' });me.position.set(0, 0, .55);me.rotation.y = Math.PI;
  const people = {},holo = {},pickables = [],labels = [];
  let state = read(),lastKey = '',layout = null,signals = {},unitKey = '';
  const units = new THREE.Group();scene.add(units);
  for (const p of P) {
    const g = new THREE.Group();scene.add(g);const org = teams.organisation(p.org),color = org.color;
    let orb;
    if (p.cat === 'ai') {orb = agentOrb(g);orb.position.y = 1.2;} else
    {
      cyl(g, .42, .42, .07, 0x1c2333, 0, -.04, 0, {}, 6);
      const edge = new THREE.Mesh(new THREE.TorusGeometry(.42, .02, 6, 6), new THREE.MeshBasicMaterial({ color }));edge.rotation.x = Math.PI / 2;g.add(edge);
      figure(g, p, .85);
    }
    const glow = placed(sprite(GLOW, color, 1.6, .25), 0, .05, 0);g.add(glow);
    const head = placed(sprite(GLOW, color, .5, .9), 0, 1.55, 0);g.add(head);
    const flare = placed(sprite(FLARE, 0xffffff, 1.8, .9), 0, 1.55, 0);g.add(flare);flare.visible = false;
    const hit = new THREE.Mesh(new THREE.SphereGeometry(.6, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));hit.position.y = .8;hit.userData.pick = p.id;g.add(hit);pickables.push(hit);
    const thread = polyline(scene, Array.from({ length: 41 }, () => V()), color, .28, p.cat === 'authority' ? [.08, .18] : !org.internal ? [.3, .18] : null);
    people[p.id] = { g, glow, head, flare, thread, orb, phase: hsh(p.id) % 100 / 16 };
  }
  for (const [k, p] of Object.entries(PROJ)) {
    const g = new THREE.Group();scene.add(g);
    const model = wireMassing(g, k, p.hex);model.scale.setScalar(1.1);
    const disc = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.35, 64), new THREE.MeshBasicMaterial({ color: p.hex, transparent: true, opacity: .55, side: THREE.DoubleSide }));disc.rotation.x = -Math.PI / 2;g.add(disc);
    g.add(placed(sprite(GLOW, p.hex, 4.5, .18), 0, .6, 0));
    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));hit.userData.pick = k;g.add(hit);pickables.push(hit);
    holo[k] = { g, model };
  }
  const pos = (id) => people[id] ? people[id].g.position.clone().add(V(0, .9, 0)) : holo[id] ? holo[id].g.position.clone() : plat.position.clone();
  labels.push([D.persona.name + ' · me', 'me', null, () => plat.position.clone().add(V(0, 1.9, .55)), () => plat.visible]);
  labels.push(['Inside the organisation', 'sky', null, () => V(-5, 2.8, -5), () => !!layout], ['Outside the organisation', 'sky', null, () => V(5, 2.8, -5), () => !!layout]);
  for (const [k, p] of Object.entries(PROJ)) labels.push([p.short, 'big project-label', k, () => holo[k].g.position.clone().add(V(0, 2.8, 0)), () => holo[k].g.visible]);
  for (const p of P) labels.push([p.n, 'person-label', p.id, () => people[p.id].g.position.clone().add(V(0, 1.8, 0)), () => people[p.id].g.visible]);
  function rebuild() {
    layout = state.focusedProject ? projectTeamLayout(teams.team(PROJ[state.focusedProject].id, state.day)) : null;
    signals = state.focusedProject ? projectSignals(D, PROJ[state.focusedProject].id, state.day) : {};
    plat.position.set(0, 0, 3.4);lamp.position.copy(plat.position).add(V(.6, 1.6, .3));
    rim.material.color.set(teams.organisation(D.C.home_org_id).color);
    for (const p of P) {
      const o = people[p.id],point = layout?.positions[p.id];o.g.visible = !!point;
      if (point) o.g.position.set(...point);
      o.thread.visible = !!point;
    }
    for (const k in PROJ) {holo[k].g.visible = k === state.focusedProject && !!D.projectAt(k, state.day);if (layout) holo[k].g.position.set(...layout.model);}
  }
  function rebuildUnits() {
    for (const g of [...units.children]) {g.traverse((o) => {o.geometry?.dispose();o.material?.dispose();});units.remove(g);}
    const work = signals[state.selected]?.work || [];
    work.forEach((u, i) => {
      const g = new THREE.Group();g.add(new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), new THREE.MeshBasicMaterial({ color: u.color, transparent: true, opacity: u.done ? .35 : 1 })));
      if (!u.done) g.add(sprite(GLOW, u.color, .5, .8));
      g.userData = { a: i / work.length * Math.PI * 2, r: .85 + i % 2 * .18, tilt: (i % 3 - 1) * .25 };units.add(g);
    });
  }
  return { scene, labels, pickables, pos, elev: .55,
    focusFrame() {return { target: V(0, 1, 0), distance: Math.max(17, (layout?.radius || 8) * 2.35) };},
    extent() {return layout?.radius || 8;}, frameDist(e) {return Math.max(8, e * 1.75 + 4);},
    dragStart() {return null;}, dragTo() {}, dragEnd() {},
    signal(id) {return signals[id];},
    update(dt) {
      state = read();const next = [state.day, state.focusedProject].join(':');if (next !== lastKey) {lastKey = next;rebuild();}
      const nextUnits = next + ':' + state.selected;if (nextUnits !== unitKey) {unitKey = nextUnits;rebuildUnits();}
      for (const p of P) {
        const o = people[p.id];if (!o.g.visible) continue;
        const on = state.selected === p.id,hovered = state.hover === p.id,light = signals[p.id].light;
        o.g.position.y = Math.sin(state.T * 1.1 + o.phase) * .08;
        o.glow.material.opacity = on ? .5 : hovered ? .4 : .25;
        // Match Desk in Space: cast-wide attention ranking with its gentle pulse.
        const pulse = 1 + Math.sin(state.T * 3 + o.phase) * .1;
        o.head.scale.setScalar(light.size * pulse);o.head.material.opacity = light.opacity;
        o.flare.visible = light.flare;o.flare.scale.setScalar(light.flareSize * (1 + Math.sin(state.T * 3) * .12));o.flare.material.opacity = light.flareOpacity;
        if (o.orb) o.orb.userData.ring.rotation.z = state.T;
        o.thread.visible = state.showLinks;
        o.thread.material.opacity = on ? .85 : hovered ? .65 : .28;
        const start = plat.position.clone().add(V(0, .85, 0)),end = o.g.position.clone().add(V(0, .7, 0)),mid = start.clone().lerp(end, .5).setY(.9);
        const points = new THREE.QuadraticBezierCurve3(start, mid, end).getPoints(40),attr = o.thread.geometry.attributes.position;
        points.forEach((v, i) => attr.setXYZ(i, v.x, v.y, v.z));attr.needsUpdate = true;o.thread.geometry.computeBoundingSphere();o.thread.computeLineDistances();
      }
      units.visible = !!people[state.selected]?.g.visible;
      if (units.visible) {units.position.copy(pos(state.selected));for (const g of units.children) {const u = g.userData,a = u.a + state.T * .6;g.position.set(Math.cos(a) * u.r, Math.sin(a) * u.tilt, Math.sin(a) * u.r);}}
      for (const k in PROJ) if (holo[k].g.visible) holo[k].model.rotation.y = state.T * .2;
      dust.rotation.y = state.T * .004;desk.scr.material.emissiveIntensity = .5 + Math.sin(state.T * 2) * .1;
    }
  };
}
