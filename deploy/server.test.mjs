import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createApp} from './server.mjs';

test('static server preserves queries, revalidates updates and excludes filesystem/private paths', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'between-server-'));
  const html = '<title>Between</title>';
  await fs.writeFile(path.join(root,'between.html'),html);
  await fs.writeFile(path.join(root,'between.html.gz'),gzipSync(html));
  await fs.writeFile(path.join(root,'version.json'),JSON.stringify({commit:'abcdef1'}));
  await fs.writeFile(path.join(root,'.env'),'must-not-be-served');
  await fs.symlink('/etc/hosts',path.join(root,'outside.txt'));
  const server = await createApp(root);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve)); await fs.rm(root,{recursive:true,force:true});});
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (route,opts={})=>fetch(base+route,opts);
  const home = await get('/',{redirect:'manual'});
  assert.equal(home.status,200);
  assert.equal(await home.text(),html);
  const res = await get('/between.html');
  assert.equal(await res.text(),html);
  assert.equal(res.headers.get('cache-control'),'no-cache');
  assert.equal((await get('/between.html',{headers:{'If-None-Match':res.headers.get('etag')}})).status,304);
  const raw = await get('/between.html',{headers:{'Accept-Encoding':'gzip;q=0'}});
  assert.equal(raw.headers.get('content-encoding'),null);
  assert.equal(await raw.text(),html);
  const compressed = await get('/between.html',{headers:{'Accept-Encoding':'gzip'}});
  assert.equal(compressed.headers.get('content-encoding'),'gzip');
  assert.equal(await compressed.text(),html);
  assert.equal(await (await get('/between.html',{method:'HEAD'})).text(),'');
  for (const route of ['/.env','/outside.txt','/%2e%2e%2fetc/hosts','/between.html.gz','/missing']) assert.equal((await get(route)).status,404,route);
  assert.equal((await get('/%ZZ')).status,400);
  assert.equal((await get('/between.html',{method:'PUT'})).status,405);
  assert.equal((await (await get('/healthz')).json()).commit,'abcdef1');
});

test('archive API is pinned, read-only, single-flight cached, and retries failures without a static fallback', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'between-api-'));
  await fs.writeFile(path.join(root,'between.html'),'<title>Between</title>');
  await fs.writeFile(path.join(root,'version.json'),'{}');
  const version='a'.repeat(64);
  await fs.writeFile(path.join(root,'archive-manifest.json'),JSON.stringify({version}));
  let calls=0;
  const server=await createApp(root,{loadArchive:async received=>{assert.equal(received,version);calls++;if(calls===1)throw Error('temporary');return '{"verified":true}';}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}/api/archive/`;
  assert.equal((await fetch(base+version)).status,503);
  const responses=await Promise.all(Array.from({length:5},()=>fetch(base+version)));
  for(const response of responses){assert.equal(response.status,200);assert.equal(response.headers.get('x-between-data-source'),'firestore');assert.deepEqual(await response.json(),{verified:true});}
  assert.equal(calls,2);
  assert.equal((await fetch(base+'other')).status,404);
  assert.equal((await fetch(base+version,{method:'POST'})).status,405);
});
