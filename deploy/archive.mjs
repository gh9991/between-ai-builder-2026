// One immutable, content-addressed archive used by both the release and Firestore.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const digest = text => createHash('sha256').update(text).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export async function buildArchive(root) {
  const read = async name => JSON.parse(await fs.readFile(new URL(`data/scenarios/architect/${name}.json`, root), 'utf8'));
  const html = await fs.readFile(new URL('reports/architect.html', root), 'utf8');
  const embedded = id => JSON.parse(html.match(new RegExp(`id="${id}">([\\s\\S]*?)<\\/script>`))[1]);
  const payload = canonical({config: await read('scenario'), data: await read('worklife'), stories: await read('work-stories'),
    report: {months: embedded('data'), summaries: embedded('main-summaries')}});
  const json = JSON.stringify(payload), version = digest(json);
  return {version, json, payload};
}
// Group complete JSON entries by section. No single document approaches Firestore's 1 MiB limit.
export function archiveDocuments(payload) {
  const sections = {config: payload.config, stories: payload.stories, report: payload.report};
  for (const [key, value] of Object.entries(payload.data)) sections[`data.${key}`] = value;
  const docs = [], layout = [];
  for (const [section, value] of Object.entries(sections)) {
    const groups = [];
    if (Array.isArray(value)) {
      let group = [], size = 2;
      for (const item of value) {
        const n = Buffer.byteLength(JSON.stringify(item)) + 1;
        if (n > 800000) throw Error(`Oversized entry: ${section}`);
        if (group.length && size + n > 200000) { groups.push(group); group = []; size = 2; }
        group.push(item); size += n;
      }
      groups.push(group);
    } else groups.push(value);
    const ids = groups.map((group, i) => {
      const id = `${section}-${String(i).padStart(4, '0')}`, json = JSON.stringify(group);
      if (Buffer.byteLength(json) > 800000) throw Error(`Oversized document: ${id}`);
      docs.push({id, json}); return id;
    });
    layout.push({section, array: Array.isArray(value), ids});
  }
  return {docs, layout};
}
export function restoreArchive(layout, docs, version) {
  const payload = {data: {}};
  for (const {section, array, ids} of layout) {
    const values = ids.map(id => { if (!docs.has(id)) throw Error(`Missing archive part ${id}`); return JSON.parse(docs.get(id)); });
    const value = array ? values.flat() : values[0];
    if (section.startsWith('data.')) payload.data[section.slice(5)] = value;
    else payload[section] = value;
  }
  const json = JSON.stringify(canonical(payload));
  if (digest(json) !== version) throw Error('Archive checksum mismatch');
  return json;
}
