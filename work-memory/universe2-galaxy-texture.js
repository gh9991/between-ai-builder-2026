// Render once at high resolution: inclined stellar disc, fragmented dust lanes,
// warm bulge and blue outer arms. Only the gentle CSS glow animates.
export function drawGalaxy(canvas, { faceOn = false } = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width,h = canvas.height;
  let seed = 731;
  const random = () => {seed = seed * 16807 % 2147483647;return (seed - 1) / 2147483646;};
  const hash = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const noise = (x, y) => {
    const ix = Math.floor(x),iy = Math.floor(y);
    let fx = x - ix,fy = y - iy;
    fx *= fx * (3 - 2 * fx);fy *= fy * (3 - 2 * fy);
    return (hash(ix, iy) * (1 - fx) + hash(ix + 1, iy) * fx) * (1 - fy) +
    (hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx) * fy;
  };
  const pixels = ctx.createImageData(w, h);
  const tilt = faceOn ? 0 : .32,cos = Math.cos(tilt),sin = Math.sin(tilt);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const sx = (px - w / 2) / (w * .44),sy = (py - h / 2) / (w * .44);
    const x = sx * cos + sy * sin,y = (-sx * sin + sy * cos) / (faceOn ? 1 : .37);
    const r = Math.hypot(x, y),a = Math.atan2(y, x);
    const n = noise(x * 13 + 50, y * 13 + 50) * .52 + noise(x * 35 + 90, y * 35 + 90) * .3 + noise(x * 94, y * 94) * .18;
    const spiral = .5 + .5 * Math.sin(2 * a - r * 10 + n * 3);
    const edge = Math.max(0, 1 - r / 1.12);
    const disc = Math.exp(-r * r * 2.2) * Math.min(1, edge * 7);
    const clouds = disc * (.19 + n * .72 + spiral * .32);
    // Offset broken lanes cross the near side, leaving the central bulge luminous.
    const lanePhase = r * 24 - a * 1.6 + n * 3;
    const lane = Math.pow(.5 + .5 * Math.sin(lanePhase), 12) * (y > -.13 ? .78 : .28) *
    Math.min(1, r * 7) * (.45 + n * .65);
    const bulge = Math.exp(-(x * x / .028 + y * y / .095));
    const core = Math.exp(-(x * x / .0026 + y * y / .014));
    const mist = Math.exp(-r * r * 3.2) * .16;
    const light = clouds * (1 - lane) * .84;
    // Violet inner dust shifts towards pale blue in the outer/right-hand arm.
    const blue = Math.max(0, Math.min(1, .35 + r * .55 + x * .48 + (n - .5) * .35));
    const nucleus = bulge * .82 + core * .42;
    const i = (py * w + px) * 4;
    pixels.data[i] = Math.min(255, (177 - blue * 52) * light + nucleus * 247 + mist * 84);
    pixels.data[i + 1] = Math.min(244, (113 + blue * 76) * light + nucleus * 226 + mist * 62);
    pixels.data[i + 2] = Math.min(229, (211 + blue * 21) * light + nucleus * 192 + mist * 112);
    pixels.data[i + 3] = Math.min(255, (disc * 2 + bulge + mist) * 255);
  }
  ctx.putImageData(pixels, 0, 0);
  // Fine resolved stars follow the disc, with irregular clumps in the arms.
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 14500; i++) {
    const r = Math.sqrt(random()) * 1.05;
    const a = random() * Math.PI * 2;
    const arm = .5 + .5 * Math.sin(2 * a - r * 10);
    if (random() > .32 + arm * .55) continue;
    const dx = Math.cos(a) * r,dy = Math.sin(a) * r * (faceOn ? 1 : .37);
    const x = w / 2 + (dx * cos - dy * sin) * w * .44,y = h / 2 + (dx * sin + dy * cos) * w * .44;
    const bright = random(),size = .25 + Math.pow(bright, 5) * 1.15;
    ctx.globalAlpha = (.15 + bright * .58) * Math.min(1, (1.1 - r) * 3);
    ctx.fillStyle = i % 5 === 0 ? '#ffddb6' : i % 3 === 0 ? '#a8d5ff' : '#d6b7ec';
    ctx.beginPath();ctx.arc(x, y, size, 0, Math.PI * 2);ctx.fill();
  }
  // A sparse local halo blends naturally into the scene's existing starfield.
  for (let i = 0; i < 240; i++) {
    const x = random() * w,y = random() * h;
    const edge = Math.max(0, 1 - Math.hypot((x - w / 2) / (w * .5), (y - h / 2) / (h * .5)));
    ctx.globalAlpha = edge * (.15 + random() * .7);
    ctx.fillStyle = '#d7e9ff';ctx.fillRect(x, y, .6 + random(), .6 + random());
  }
  for (const [x, y, size] of [[.34, .25, 10], [.76, .65, 7], [.22, .46, 5]]) {
    ctx.globalAlpha = .8;
    const glow = ctx.createRadialGradient(w * x, h * y, 0, w * x, h * y, size);
    glow.addColorStop(0, '#fff9ed');glow.addColorStop(.15, '#fff2dd');glow.addColorStop(.4, '#b5ccff88');glow.addColorStop(1, '#88adff00');
    ctx.fillStyle = glow;ctx.fillRect(w * x - size, h * y - size, size * 2, size * 2);
  }
  ctx.globalAlpha = 1;ctx.globalCompositeOperation = 'source-over';
}
