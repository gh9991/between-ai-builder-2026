// Camera-distance multipliers relative to the automatic overview/project framing.
// Keep finite bounds so the camera cannot cross its target or escape the scene.
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;

export function scaleZoom(current, factor) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current * factor));
}

export function wheelZoom(current, deltaY, deltaMode = 0, pageHeight = 800) {
  // WheelEvent units: pixels, lines, or pages. Trackpads usually supply pixels.
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : 1);
  return scaleZoom(current, Math.exp(pixels * 0.0015));
}
