import test from 'node:test';
import assert from 'node:assert/strict';
import {buildArchive, archiveDocuments, restoreArchive} from './archive.mjs';
import {readArchive} from './firestore.mjs';
import {resolveArchive} from '../work-memory/archive-loader.js';
const archive = await buildArchive(new URL('../work-memory/', import.meta.url));
const {docs, layout} = archiveDocuments(archive.payload);
test('entire architect archive round-trips without changing records, ordering or report provenance', () => {
  const restored = restoreArchive(layout, new Map(docs.map(d => [d.id,d.json])), archive.version);
  assert.equal(restored,archive.json);
  assert.equal(archive.payload.data.records.length,1337);
  assert.equal(archive.payload.data.snapshots.length,365);
  assert.equal(archive.payload.report.months.length,12);
  assert.equal(archive.payload.report.months.reduce((n,m)=>n+m.report.cards.length,0),56);
  assert.ok(docs.every(d=>Buffer.byteLength(d.json)<800000));
  assert.throws(()=>restoreArchive(layout,new Map(),archive.version),/Missing/);
  const changed = new Map(docs.map(d=>[d.id,d.json])); changed.set(docs[0].id,'{}');
  assert.throws(()=>restoreArchive(layout,changed,archive.version),/checksum/);
});
test('Firestore reader follows pages and verifies the assembled data', async () => {
  const client = {request:async path => path.endsWith(archive.version) ? {fields:{state:{stringValue:'ready'},layout:{stringValue:JSON.stringify(layout)}}} : {
    documents:(path.includes('pageToken=next') ? docs.slice(3) : docs.slice(0,3)).map(d=>({name:`parts/${d.id}`,fields:{json:{stringValue:d.json}}})),
    ...(!path.includes('pageToken=next') ? {nextPageToken:'next'} : {})
  }};
  assert.equal(await readArchive(client,archive.version),archive.json);
});
const manifest = {version:archive.version,file:'packaged.json'};
test('demo reads only packaged data; cloud skips it; absent, damaged and wrong-version files recover through API', async () => {
  for (const variant of ['demo','cloud','missing','invalid','old']) {
    const calls=[];
    const result=await resolveArchive({manifest,mode:variant==='cloud'?'cloud':'demo',fetchJSON:async route=>{
      calls.push(route);
      if (route===manifest.file) {
        if (variant==='missing') throw Error('404');
        if (variant==='invalid') return {};
        if (variant==='old') return {...archive.payload,stories:[]};
      }
      return archive.payload;
    }});
    assert.equal(result.source,variant==='demo'?'packaged':'firestore');
    assert.equal(calls.length,['demo','cloud'].includes(variant)?1:2);
    if (variant==='cloud') assert.ok(calls.every(p=>p.startsWith('api/')));
  }
});
test('cloud failure is surfaced, never hidden by bundled data', async()=>{
  await assert.rejects(resolveArchive({manifest,mode:'cloud',fetchJSON:async()=>{throw Error('unavailable');}}),/unavailable/);
});
