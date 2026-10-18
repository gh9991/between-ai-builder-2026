// Server-side Firestore REST access. Browser clients never receive Google credentials.
import {restoreArchive} from './archive.mjs';
const timeout = () => AbortSignal.timeout(30000);
export function firestoreClient({project = process.env.GOOGLE_CLOUD_PROJECT || 'between-511505', database = process.env.FIRESTORE_DATABASE || '(default)', token} = {}) {
  let credential;
  async function accessToken() {
    if (token) return token();
    if (credential && credential.until > Date.now()) return credential.value;
    const response = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {headers: {'Metadata-Flavor': 'Google'}, signal: timeout()});
    if (!response.ok) throw Error(`Runtime credentials unavailable (${response.status})`);
    const body = await response.json();
    credential = {value: body.access_token, until: Date.now() + (body.expires_in - 60) * 1000};
    return credential.value;
  }
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/${database}/documents`;
  async function request(suffix, options = {}) {
    const response = await fetch(base + suffix, {...options, headers: {'Authorization': `Bearer ${await accessToken()}`, 'Content-Type': 'application/json'}, signal: timeout()});
    if (!response.ok) throw Error(`Firestore request failed (${response.status})`);
    return response.json();
  }
  return {request, base};
}
export async function readArchive(client, version) {
  if (!/^[a-f0-9]{64}$/.test(version)) throw Error('Invalid archive version');
  const prefix = `/between_archives/${version}`;
  const manifest = await client.request(prefix);
  if (manifest.fields?.state?.stringValue !== 'ready') throw Error('Archive is not ready');
  const layout = JSON.parse(manifest.fields.layout.stringValue), docs = new Map();
  let pageToken;
  do {
    const query = new URLSearchParams({pageSize: '10'});
    if (pageToken) query.set('pageToken', pageToken);
    const page = await client.request(`${prefix}/parts?${query}`);
    for (const doc of page.documents || []) docs.set(doc.name.split('/').at(-1), doc.fields.json.stringValue);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return restoreArchive(layout, docs, version);
}
