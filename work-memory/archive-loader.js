// Shared release loader for the desk, project room, timeline and contribution archive.
// Local development continues to use its normal scenario files. No Demo badge is shown.
const root = new URL('./', import.meta.url);
export function dataMode(search = location.search) { return new URLSearchParams(search).get('mode') || 'demo'; }
export async function resolveArchive({manifest, mode, fetchJSON}) {
  const valid = async payload => {
    if (!payload?.data?.snapshots?.length || !payload?.config || !payload?.stories || !payload?.report?.months) throw Error('Incomplete archive');
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
    if (hash !== manifest.version) throw Error('Archive version mismatch');
    return payload;
  };
  if (mode === 'demo') {
    try { return {payload: await valid(await fetchJSON(manifest.file)), source:'packaged'}; }
    catch { /* Missing or invalid packaged data: recover the identical version from Firestore. */ }
  }
  return {payload: await valid(await fetchJSON(`api/archive/${manifest.version}`)), source:'firestore'};
}
let pending;
export async function loadReleaseArchive() {
  if (typeof window === 'undefined') return null; // Node model tests read the source fixtures.
  // Same-origin embedded views reuse the unmodified archive, never localized mutable app state.
  if (window.parent !== window) {
    try { if (window.parent.betweenArchive && (new URLSearchParams(window.parent.location.search).get('mode') || 'demo') === dataMode()) {
      const archive = await window.parent.betweenArchive;
      document.documentElement.dataset.dataSource = window.parent.document.documentElement.dataset.dataSource;
      document.documentElement.dataset.dataVersion = window.parent.document.documentElement.dataset.dataVersion;
      return archive;
    } } catch {}
  }
  if (!pending) {
    pending = (async () => {
      const response = await fetch(new URL('archive-manifest.json', root));
      if (response.status === 404) {
        if (dataMode() !== 'demo') throw Error('Cloud data is not configured in this local preview');
        return null;
      }
      if (!response.ok) throw Error('Archive configuration unavailable');
      const manifest = await response.json();
      const result = await resolveArchive({manifest, mode:dataMode(), fetchJSON: async route => {
        const r = await fetch(new URL(route, root), {signal:AbortSignal.timeout(60000)});
        if (!r.ok) throw Error(`Archive unavailable (${r.status})`);
        return r.json();
      }});
      document.documentElement.dataset.dataSource = result.source;
      document.documentElement.dataset.dataVersion = manifest.version;
      return result.payload;
    })().catch(error => { pending = undefined; throw error; });
  }
  return pending;
}
