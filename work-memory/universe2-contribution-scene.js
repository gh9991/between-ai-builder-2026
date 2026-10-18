import * as THREE from './vendor/three.module.js';
import { distanceToFrame } from './universe2-orbit.js';
import { buildNebula } from './universe2-nebula.js';

// Fixed world placement; neither its position nor its orientation follows the camera.
export const GALAXY_POSITION = [.6, 3.5, -1.3];
export const GALAXY_RADIUS = 2.25;
export function galaxyTransform(group) {
  group.position.set(...GALAXY_POSITION);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-.12, .94, .32).normalize());
  group.scale.setScalar(.76);
}

export function createContributionGalaxy({ scene, labels, onOpen, anisotropy = 1, projects = [] }) {
  const group = new THREE.Group();group.name = 'personal-contribution-galaxy';
  galaxyTransform(group);group.visible = false;scene.add(group);
  // The volumetric nebula (universe2-nebula.js), built in its own XZ plane: turn it so its plane is the group's XY
  // plane (the disc the hit area and label are measured on) and scale its radius to GALAXY_RADIUS.
  const holder = new THREE.Group();holder.rotation.x = Math.PI / 2;holder.scale.setScalar(GALAXY_RADIUS / 1.55);group.add(holder);
  const nebula = new THREE.Group();holder.add(nebula);
  const tick = buildNebula(nebula, { projects });
  nebula.traverse((o) => {if (o.material) {o.material.fog = false;o.material.toneMapped = false;}});
  // Use a shallow ellipsoid rather than the rectangular transparent texture bounds.
  const hitMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ visible: false }));
  hitMesh.scale.set(GALAXY_RADIUS, GALAXY_RADIUS, .32);group.add(hitMesh);
  const label = document.createElement('button');label.className = 'uv2-contribution-label';
  label.textContent = 'My Contributions';label.setAttribute('aria-label', 'My Contributions · open my work record');
  label.setAttribute('aria-haspopup', 'dialog');label.hidden = true;label.onclick = onOpen;labels.append(label);
  const projected = new THREE.Vector3(),local = new THREE.Vector3();
  group.updateWorldMatrix(true, false);
  const rim = Array.from({ length: 24 }, (_, i) => {
    const a = i * Math.PI / 12;
    return new THREE.Vector3(Math.cos(a) * GALAXY_RADIUS, Math.sin(a) * GALAXY_RADIUS, 0).
    applyMatrix4(group.matrixWorld).toArray();
  });
  return {
    framingDistance(target, orbit, fov, width, height, topInset) {
      // 40px for the title and its gap; side margins also reserve the title width.
      return distanceToFrame(rim, target, orbit, fov, width, height,
      { top: topInset + 40, left: 100, right: 100, bottom: 20 });
    },
    frame(camera, width, height, visible) {
      group.visible = visible;label.hidden = true;if (!visible) return;
      tick(performance.now() / 1000);nebula.rotation.x = 0; // turns slowly; the scene camera already shows its depth, so no rocking here
      group.updateWorldMatrix(true, true);
      let top = Infinity,cx = 0;let valid = false;
      // Screen-facing label above the projected rim (below it sits the desk and the people waiting), independent of disc inclination.
      for (let i = 0; i < 24; i++) {
        const a = i * Math.PI / 12;
        local.set(Math.cos(a) * GALAXY_RADIUS, Math.sin(a) * GALAXY_RADIUS, 0);
        projected.copy(local).applyMatrix4(group.matrixWorld).project(camera);
        if (projected.z < -1 || projected.z > 1) continue;
        top = Math.min(top, (-projected.y * .5 + .5) * height);valid = true;
      }
      projected.copy(group.position).project(camera);cx = (projected.x * .5 + .5) * width;
      label.hidden = !valid || projected.z < -1 || projected.z > 1 || cx < 0 || cx > width || top < 40 || top > height;
      if (!label.hidden) {label.style.left = cx + 'px';label.style.top = top - 6 + 'px';}
    },
    hit(ray) {return group.visible && !!ray.intersectObject(hitMesh, false).length;}
  };
}
