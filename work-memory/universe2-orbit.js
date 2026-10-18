// Organisation views can pass both poles; other views keep their existing limits.
export function draggedPitch(start, deltaY, continuous = false) {
  const pitch = start - deltaY * .004;
  return continuous ? pitch : Math.max(.25, Math.min(1.45, pitch));
}

export function orbitFrame(theta, phi) {
  const st = Math.sin(theta),ct = Math.cos(theta),sp = Math.sin(phi),cp = Math.cos(phi);
  // The tangent stays perpendicular to the viewing direction at both poles.
  // A fixed world-up vector would become parallel there and flip the camera.
  return { direction: [st * sp, cp, ct * sp], up: [-st * cp, sp, -ct * cp] };
}

// Camera-target offset: screen-right/down drags move the scene with the pointer.
export function draggedPan(start, dx, dy, right, up, unitsPerPixel) {
  return start.map((value, i) => value + (-dx * right[i] + dy * up[i]) * unitsPerPixel);
}

// Minimum perspective distance that keeps world points within screen-space insets.
// Insets include the space used by labels and navigation, not just the 3D geometry.
export function distanceToFrame(points, target, orbit, fov, width, height, insets = {}) {
  const [dx, dy, dz] = orbit.direction,[ux, uy, uz] = orbit.up;
  const right = [uy * dz - uz * dy, uz * dx - ux * dz, ux * dy - uy * dx];
  const tanY = Math.tan(fov * Math.PI / 360),tanX = tanY * width / height;
  const limits = {
    left: Math.max(.1, 1 - 2 * (insets.left || 0) / width),
    right: Math.max(.1, 1 - 2 * (insets.right || 0) / width),
    top: Math.max(.1, 1 - 2 * (insets.top || 0) / height),
    bottom: Math.max(.1, 1 - 2 * (insets.bottom || 0) / height)
  };
  let distance = 0;
  for (const point of points) {
    const x = point[0] - target.x,y = point[1] - target.y,z = point[2] - target.z;
    const horizontal = x * right[0] + y * right[1] + z * right[2];
    const vertical = x * ux + y * uy + z * uz;
    const depth = x * dx + y * dy + z * dz;
    distance = Math.max(distance, depth + Math.abs(horizontal) / (tanX * limits[horizontal < 0 ? 'left' : 'right']),
    depth + Math.abs(vertical) / (tanY * limits[vertical < 0 ? 'bottom' : 'top']));
  }
  return distance;
}

// Publish the current camera transform before any DOM labels project through it.
// lookAt changes orientation, but the renderer otherwise updates its inverse matrix later.
export function positionOrbitCamera(camera, orbit, distance, target) {
  camera.position.set(...orbit.direction).multiplyScalar(distance).add(target);
  camera.up.set(...orbit.up);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}
