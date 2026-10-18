// Project models for the design-style pages: one small object per project that says what kind of work it is.
// Architect projects are buildings (mall / tower / school); the AI engineer's are a chat screen, a document being read
// and a chip; the student's are a team table, books and a briefcase. scenario.json sets projects.<id>.model.
// Parts are boxes or cylinders in "world" units (footprint ≈ 1.8 × 1.2, tallest ≈ 2.2); y is the bottom of the part.
// a: 1 marks an accent part (drawn in the project colour). Every part is a direct child mesh, so pages can outline them.

const ring = (n, r, f) => Array.from({ length: n }, (_, i) => f(Math.cos(i / n * Math.PI * 2) * r, Math.sin(i / n * Math.PI * 2) * r, i / n * Math.PI * 2));

export const MODEL_PARTS = {
  mall: [{ w: 1.8, h: .36, d: 1.2 }, { w: 1.2, h: .32, d: .84, x: -.15, y: .36 }, { w: .56, h: .28, d: .56, x: .4, z: .1, y: .36, a: 1 }],
  tower: [{ w: 1.2, h: .24, d: 1 }, { w: .64, h: 2.2, d: .64 }, { w: .66, h: .06, d: .66, y: 2.2, a: 1 }],
  school: [{ w: 1.4, h: .28, d: .4, z: -.36 }, { w: .4, h: .28, d: 1, x: -.5, z: .1 }, { w: .7, h: .02, d: .55, x: .3, z: .25, a: 1 }],
  // more architect building types (one-year dataset)
  library: [{ w: 1.8, h: .5, d: 1.1 }, { w: 1.9, h: .08, d: 1.25, y: .5, a: 1 }, ...[-.6, -.2, .2, .6].map((x) => ({ w: .08, h: .5, d: .08, x, z: .62 }))],
  hall: [{ w: 1.6, h: .45, d: 1.1 }, { w: 1.7, h: .06, d: 1.2, y: .45, rz: .12, x: -.05 }, { w: 1.7, h: .06, d: 1.2, y: .62, rz: -.12, x: .05, a: 1 }],
  clinic: [{ w: 1.5, h: .7, d: 1 }, { w: .5, h: .14, d: .06, y: .45, z: .52, a: 1 }, { w: .14, h: .5, d: .06, y: .27, z: .52, a: 1 }],
  hotel: [{ w: 1.4, h: .3, d: 1.1 }, { w: .9, h: 1.7, d: .5, y: .3 }, { w: .92, h: .06, d: .52, y: 2, a: 1 }],
  houses: [-.6, 0, .6].flatMap((x) => [{ w: .5, h: .5, d: .9, x }, { w: .52, h: .2, d: .92, x, y: .5, a: 1 }]),
  hospital: [{ w: 1.8, h: .4, d: 1 }, { w: .7, h: .9, d: .7, x: -.4, y: .4 }, { w: .3, h: .1, d: .06, x: -.4, y: 1, z: .36, a: 1 }, { w: .1, h: .3, d: .06, x: -.4, y: .9, z: .36, a: 1 }],
  apartments: [{ w: .9, h: 1.3, d: .7 }, ...[.25, .55, .85, 1.15].map((y) => ({ w: .96, h: .04, d: .78, y, a: 1 }))],
  cafe: [{ w: 1.2, h: .6, d: .9 }, { w: 1.3, h: .05, d: .5, y: .45, z: .6, rx: -.25, a: 1 }, { t: 'cyl', r: .14, h: .3, x: .55, z: .9 }],
  // AI engineer
  chat: [{ w: .9, h: .06, d: .6 }, { w: .12, h: .55, d: .12, y: .06 }, { w: 1.6, h: 1, d: .08, y: .55 }, { w: 1.42, h: .82, d: .1, y: .64, a: 1 },
  { w: .72, h: .42, d: .12, x: .78, y: 1.42, a: 1 }, { w: .16, h: .16, d: .12, x: .52, y: 1.36, rz: .785, a: 1 }],
  document: [{ w: 1.1, h: .05, d: 1.4 }, { w: 1.1, h: .05, d: 1.4, y: .05, ry: .12 }, { w: 1.1, h: .05, d: 1.4, y: .1, ry: -.08 }, { w: 1.1, h: .05, d: 1.4, y: .15, ry: .04 },
  ...[0, 1, 2, 3].map((i) => ({ w: .72 - i % 2 * .2, h: .012, d: .07, x: -.08, y: .2, z: -.42 + i * .26, a: 1 })), { w: 1.6, h: .07, d: .12, y: .62, z: .1, a: 1 }],
  chip: [{ w: 1.3, h: .2, d: 1.3 }, { w: .62, h: .12, d: .62, y: .2, a: 1 },
  ...[-.45, -.15, .15, .45].flatMap((p) => [{ w: .1, h: .06, d: .3, x: p, z: .78 }, { w: .1, h: .06, d: .3, x: p, z: -.78 }, { w: .3, h: .06, d: .1, x: .78, z: p }, { w: .3, h: .06, d: .1, x: -.78, z: p }]),
  { w: .08, h: .7, d: .08, x: .5, y: .2, z: .5 }, { w: .34, h: .34, d: .06, x: .5, y: .9, z: .5, a: 1 }],
  // student
  team: [{ t: 'cyl', r: .78, h: .08, y: .45 }, { t: 'cyl', r: .08, h: .45 },
  ...ring(4, .5, (x, z, a) => ({ w: .32, h: .03, d: .22, x, z, y: .53, ry: -a })),
  ...ring(4, .62, (x, z, a) => ({ w: .32, h: .22, d: .02, x, z, y: .56, ry: -a + Math.PI / 2, a: 1 })),
  { w: 1, h: 1.3, d: .04, z: -1.05 }, ...[.45, .75, 1.05].map((h, i) => ({ w: .18, h, d: .06, x: -.28 + i * .28, y: .1, z: -1.0, a: 1 }))],
  book: [{ w: 1.3, h: .18, d: .9, ry: .05 }, { w: 1.2, h: .16, d: .85, y: .18, ry: -.1, a: 1 }, { w: 1.25, h: .17, d: .88, y: .34, ry: .08 },
  { w: .62, h: .04, d: .8, x: -.3, y: .55, rz: .14 }, { w: .62, h: .04, d: .8, x: .3, y: .55, rz: -.14 }, { w: .04, h: .5, d: .04, x: .1, y: .6, z: .2, rz: -.5, a: 1 }],
  briefcase: [{ w: 1.4, h: .9, d: .45 }, { w: 1.42, h: .06, d: .47, y: .6, a: 1 }, { w: .18, h: .12, d: .49, y: .5, a: 1 },
  { w: .08, h: .26, d: .08, x: -.25, y: .9 }, { w: .08, h: .26, d: .08, x: .25, y: .9 }, { w: .58, h: .08, d: .08, y: 1.14 }],
  desk: [{ w: 1.6, h: .06, d: .8, y: .7 }, ...[[-.72, -.34], [.72, -.34], [-.72, .34], [.72, .34]].map(([x, z]) => ({ w: .06, h: .7, d: .06, x, z })),
  { w: .5, h: .32, d: .03, y: .76, z: -.2, a: 1 }]
};

// The model kind for a project from the adapter (falls back to the architect slot names).
export const modelKind = (p) => p && MODEL_PARTS[p.massing] ? p.massing : 'desk';
export const modelHeight = (kind) => Math.max(...(MODEL_PARTS[kind] || MODEL_PARTS.desk).map((q) => (q.y || 0) + q.h));

// Three.js builder (works with the r128 global on the style pages and the r180 module in the app).
export function buildModel(THREE, parent, kind, mat, accentMat = mat) {
  const g = new THREE.Group();parent.add(g);
  for (const q of MODEL_PARTS[kind] || MODEL_PARTS.desk) {
    const geo = q.t === 'cyl' ? new THREE.CylinderGeometry(q.r, q.r, q.h, 28) : new THREE.BoxGeometry(q.w, q.h, q.d);
    const m = new THREE.Mesh(geo, q.a ? accentMat : mat);
    m.position.set(q.x || 0, (q.y || 0) + q.h / 2, q.z || 0);
    m.rotation.set(q.rx || 0, q.ry || 0, q.rz || 0);
    m.castShadow = m.receiveShadow = true;g.add(m);
  }
  return g;
}
