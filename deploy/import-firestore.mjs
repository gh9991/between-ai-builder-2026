// Run explicitly in an authenticated Cloud Shell; never part of a public HTTP handler.
import {execFileSync} from 'node:child_process';
import {buildArchive, archiveDocuments} from './archive.mjs';
import {firestoreClient, readArchive} from './firestore.mjs';
const project = process.argv[2];
if (project !== 'between-511505') throw Error('Explicit project between-511505 required');
const archive = await buildArchive(new URL('../work-memory/', import.meta.url));
const {docs, layout} = archiveDocuments(archive.payload);
const credential = execFileSync('gcloud', ['auth', 'print-access-token'], {encoding:'utf8', timeout:60000}).trim();
const client = firestoreClient({project, token: () => credential});
const prefix = `${client.base.replace('https://firestore.googleapis.com/v1/', '')}/between_archives/${archive.version}`;
// Each retry writes the same immutable content. Publish ready only after every part succeeds.
for (let i = 0; i < docs.length; i += 10) {
  await client.request(':commit', {method:'POST', body:JSON.stringify({writes:docs.slice(i,i+10).map(doc => ({update:{name:`${prefix}/parts/${doc.id}`, fields:{json:{stringValue:doc.json}}}}))})});
  console.log(`Written ${Math.min(i + 10, docs.length)} / ${docs.length} archive parts`);
}
await client.request(':commit', {method:'POST', body:JSON.stringify({writes:[{update:{name:prefix,fields:{state:{stringValue:'ready'},scenario:{stringValue:'architect'},layout:{stringValue:JSON.stringify(layout)},version:{stringValue:archive.version}}}}]})});
const restored = await readArchive(client, archive.version);
if (restored !== archive.json) throw Error('Read-back differs from packaged data');
console.log(JSON.stringify({verified:true, project, database:'(default)', version:archive.version, documents:docs.length+1,
  records:archive.payload.data.records.length, snapshots:archive.payload.data.snapshots.length, stories:archive.payload.stories.length, months:archive.payload.report.months.length}));
