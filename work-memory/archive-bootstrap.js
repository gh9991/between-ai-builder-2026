import { loadReleaseArchive } from './archive-loader.js';
window.betweenArchive = loadReleaseArchive();
try {
  window.betweenRuntimeScenario = structuredClone(await window.betweenArchive);
  if (!window.betweenRuntimeScenario) throw Error('Release archive missing');
  const script = document.createElement('script');script.src = './universe2.bundle.js';document.body.append(script);
} catch (error) {
  console.error('Between archive could not load', error);
  document.body.style.visibility = 'visible';
  const message = document.createElement('p');message.setAttribute('role', 'alert');
  message.textContent = 'Work archive could not load. Please reload to try again.';
  message.style.cssText = 'position:fixed;inset:35% 10%;color:#fff;z-index:9999';document.body.append(message);
}
