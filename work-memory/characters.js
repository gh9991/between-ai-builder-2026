// Procedural characters for the 3D world. Outfit follows the person's relationship to the user (architects, client,
// LDI, consultant, engineer, authority); hair, skin and colours vary deterministically by id so everyone looks different.
// AI assistants (people with kind "agent") are floating glowing orbs. No downloaded models or textures.
import * as THREE from './vendor/three.module.js';

const SKIN = [0xf1c9a8, 0xe0ac86, 0xc68b62, 0x9c6644, 0xf4d3ba, 0xd8a47f];
const HAIR = [0x2b2421, 0x4a3326, 0x8a5a3c, 0xc9a066, 0x1c1c1c, 0x6b6b6b, 0x3b2a20];
const STUDIO_TOPS = [0x1e2430, 0x3d4652, 0x4c6ef5, 0x6b7a8f, 0x7a5c48, 0x2f5d50, 0x8a8f98, 0xb4553a];
const SUITS = [0x2b2f38, 0x1f2a3a, 0x3a3f4a];
const PANTS = [0x2b3440, 0x3b3f46, 0x4a4136, 0x26303a];

function hash(id) {let h = 2166136261;for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);return h >>> 0;}
const pick = (arr, h, salt) => arr[(h >>> salt) % arr.length];

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, ...extra });
function add(parent, mesh, x, y, z) {mesh.position.set(x, y, z);mesh.castShadow = true;mesh.receiveShadow = true;parent.add(mesh);return mesh;}
const box = (p, w, h, d, c, x, y, z) => add(p, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)), x, y, z);
const cyl = (p, r1, r2, h, c, x, y, z) => add(p, new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 24), mat(c)), x, y, z);
const ball = (p, r, c, x, y, z) => add(p, new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat(c)), x, y, z);

// Map a person to an outfit. Uses relationship.type when the scenario provides it, otherwise only varies hair/skin.
function outfitFor(person, orgColor) {
  const h = hash(person.id),type = person.relationship?.type,role = (person.role || '').toLowerCase();
  const o = { skin: pick(SKIN, h, 3), hair: pick(HAIR, h, 7), hairStyle: (h >>> 11) % 5, pants: pick(PANTS, h, 13), top: orgColor ?? 0x3d4652 };
  if (!type) return o; // e.g. Iris: keep organisation colours
  if (['manager', 'skip_manager', 'peer', 'junior', 'colleague', 'partner_office'].includes(type)) {
    o.top = pick(STUDIO_TOPS, h, 17);
    o.turtle = (h >>> 19) % 2 === 0;
    if (type === 'skip_manager' || /principal|director/.test(role)) {o.top = 0x1e2430;o.glasses = true;o.turtle = true;}
  } else if (type === 'client' || type === 'client_pm') {o.top = pick(SUITS, h, 17);o.tie = true;} else
  if (type === 'ldi') {o.top = 0x5a6b8c;o.glasses = true;} else
  if (type === 'engineer' || type === 'contractor') {o.top = 0x5c5470;o.helmet = true;o.vest = true;o.hairStyle = 3;} else
  if (type === 'consultant') {o.top = 0x6d5a7e;o.glasses = (h >>> 19) % 2 === 0;} else
  if (type === 'authority') {o.top = 0x334155;o.badge = true;o.hairStyle = 4;}
  // what they carry (style B): architects a drawing roll, clients and officials a folder, consultants a tablet
  if (['manager', 'skip_manager', 'peer', 'junior', 'colleague', 'partner_office'].includes(type)) o.roll = true;
  if (type === 'client' || type === 'client_pm' || type === 'authority') o.folder = true;
  if (type === 'consultant' || type === 'ldi') o.tablet = true;
  return o;
}

// A simple friendly face on a head of radius r centred at (0, y, 0): two eyes and a smile.
function face(parent, y, r) {
  for (const x of [-r * .38, r * .38]) {const e = ball(parent, r * .12, 0x1b1b1f, x, y + r * .08, r * .86);e.scale.set(1, 1.15, .6);e.castShadow = false;}
  const smile = add(parent, new THREE.Mesh(new THREE.TorusGeometry(r * .2, r * .035, 6, 16, Math.PI), mat(0x7a3b2e)), 0, y - r * .32, r * .9);
  smile.rotation.z = Math.PI;smile.castShadow = false;
}

function createOrb(parent, id) {
  const g = new THREE.Group();
  parent.add(g);
  const float = new THREE.Group();
  float.position.y = .9;
  g.add(float);
  const core = new THREE.Mesh(new THREE.SphereGeometry(.26, 24, 18), new THREE.MeshStandardMaterial({ color: 0x7fe7dc, emissive: 0x14b8a6, emissiveIntensity: .85, roughness: .3 }));
  core.castShadow = true;
  float.add(core);
  float.add(new THREE.Mesh(new THREE.SphereGeometry(.44, 20, 14), new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: .18, depthWrite: false })));
  const halo = new THREE.Mesh(new THREE.TorusGeometry(.36, .02, 8, 40), new THREE.MeshBasicMaterial({ color: 0xe6fffb }));
  halo.rotation.x = Math.PI / 2.4;
  float.add(halo);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.34, .03, 8, 40), new THREE.MeshBasicMaterial({ color: 0xf9faf2 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = .02;
  g.add(ring);
  g.userData.personId = id;
  g.traverse((m) => {if (m.isMesh) m.userData.personId = id;});
  return { group: g, ring, float, halo, orb: true, phase: hash(id) % 628 / 100 };
}

// Returns {group, ring} like the original character, plus {float, halo, orb, phase} for AI assistants.
export function createCharacter(parent, person, orgColor, { seated = false } = {}) {
  if (person.kind === 'agent') return createOrb(parent, person.id);
  const o = outfitFor(person, orgColor);
  const g = new THREE.Group();
  parent.add(g);
  const body = new THREE.Group();
  body.scale.setScalar(.86);
  g.add(body);
  for (const x of [-.09, .09]) {
    box(body, .13, .34, .16, o.pants, x, .17, seated ? .28 : 0);
    if (seated) box(body, .14, .13, .35, o.pants, x, .34, .12);
  }
  if (!seated) for (const x of [-.09, .09]) box(body, .14, .06, .22, 0x1f1f24, x, .03, .03); // shoes
  cyl(body, .2, .22, .46, o.top, 0, .58, 0);
  ball(body, .2, o.top, 0, .8, 0);
  if (!seated) for (const s of [-1, 1]) {// arms and hands
    const a = cyl(body, .055, .05, .4, o.top, s * .25, .6, 0);a.rotation.z = s * .12;
    ball(body, .055, o.skin, s * .27, .39, 0);
  }
  ball(body, .17, o.skin, 0, 1.04, 0);
  face(body, 1.04, .17);
  if (!o.helmet) {const cap = ball(body, .178, o.hair, 0, 1.09, -.02);cap.scale.set(1, .72, 1);}
  if (o.hairStyle === 1 && !o.helmet) ball(body, .08, o.hair, 0, 1.2, -.12); // bun
  if (o.hairStyle === 2 && !o.helmet) box(body, .34, .3, .1, o.hair, 0, .95, -.12); // long
  if (o.hairStyle === 4 && !o.helmet) box(body, .36, .06, .36, o.hair, 0, 1.17, .02); // flat cap
  if (o.turtle) cyl(body, .1, .12, .08, o.top, 0, .98, 0);
  if (o.helmet) {const hm = ball(body, .2, 0xf5c518, 0, 1.1, 0);hm.scale.set(1, .7, 1);cyl(body, .25, .25, .03, 0xf5c518, 0, 1.06, .02);}
  if (o.vest) {cyl(body, .215, .23, .3, 0xf97316, 0, .6, 0);cyl(body, .218, .232, .04, 0xf4f2ec, 0, .62, 0);}
  if (o.tie) {box(body, .05, .28, .02, 0xb91c1c, 0, .66, .205);box(body, .16, .08, .02, 0xf4f2ec, 0, .8, .19);}
  if (o.badge) {box(body, .09, .11, .02, 0xf4f2ec, .08, .66, .215);box(body, .06, .03, .025, 0x3557d4, .08, .69, .22);}
  if (o.glasses) for (const x of [-.065, .065]) {const l = add(body, new THREE.Mesh(new THREE.TorusGeometry(.04, .008, 6, 16), mat(0x111111)), x, 1.06, .165);l.castShadow = false;}
  if (!seated && o.roll) {const r = cyl(body, .035, .035, .42, 0xf4f2ec, -.3, .5, .08);r.rotation.z = .9;r.rotation.y = .3;const b = cyl(body, .037, .037, .05, 0x3b82f6, -.3, .5, .08);b.rotation.z = .9;b.rotation.y = .3;}
  if (!seated && o.folder) box(body, .03, .26, .2, 0xc9a36a, .3, .48, .04);
  if (!seated && o.tablet) {const t = box(body, .18, .24, .02, 0x1f2937, .2, .58, .2);t.rotation.x = -.5;const sc = box(body, .15, .2, .005, 0x7dd3fc, .2, .58, .212);sc.rotation.x = -.5;}
  if (seated) {
    // Bent legs, chair and arms resting on the table: affiliation, not an animated work activity.
    body.position.y = .16;
    for (const x of [-.23, .23]) box(body, .1, .1, .36, o.top, x, .63, .16);
    box(g, .55, .09, .5, 0x6d8277, 0, .43, 0);
    box(g, .55, .6, .09, 0x6d8277, 0, .73, -.25);
    cyl(g, .05, .05, .4, 0x55635b, 0, .2, 0);
    box(g, .58, .05, .58, 0x55635b, 0, .03, 0);
    box(g, 1.85, .09, .9, 0xc8b28b, 0, .72, .9);
    for (const x of [-.78, .78]) box(g, .08, .72, .7, 0x8e9b8b, x, .34, .9);
    box(g, .66, .45, .06, 0x394b46, 0, 1.05, 1.1);
    box(g, .56, .34, .015, 0xd6e6e0, 0, 1.05, 1.061);
    box(g, .08, .18, .08, 0x53665a, 0, .83, 1.1);
    box(g, .5, .025, .19, 0xf3f0e3, 0, .78, .68);
    box(g, .35, .03, .45, 0xf5eedb, .59, .78, .86);
  }
  const ring = cyl(g, .38, .38, .035, 0xf9faf2, 0, -.01, 0);
  g.userData.personId = person.id;
  g.traverse((m) => {if (m.isMesh) m.userData.personId = person.id;});
  return { group: g, ring, seated };
}
