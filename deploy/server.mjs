// Static release plus a read-only, version-pinned Firestore endpoint.
import http from 'node:http';
import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {firestoreClient, readArchive} from './firestore.mjs';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL, fileURLToPath} from 'node:url';

const types = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.txt':'text/plain; charset=utf-8'};
export async function createApp(root, {loadArchive = version => readArchive(firestoreClient(), version)} = {}) {
  const assets = new Map();
  async function scan(dir, prefix = '') {
    for (const entry of await fs.readdir(dir, {withFileTypes:true})) {
      const file = path.join(dir, entry.name), url = `${prefix}/${entry.name}`;
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) await scan(file, url);
      else if (entry.isFile() && !entry.name.startsWith('.') && !entry.name.endsWith('.gz')) {
        const bytes = await fs.readFile(file);
        const compressed = await fs.stat(file + '.gz').catch(() => null);
        assets.set(url, {file, size:bytes.length, compressed:compressed?.size,
          etag:'W/"' + createHash('sha256').update(bytes).digest('hex') + '"'});
      }
    }
  }
  await scan(root);
  const version = JSON.parse(await fs.readFile(path.join(root, 'version.json'), 'utf8'));
  if (!assets.has('/between.html')) throw Error('Missing standalone entry');
  const manifest = await fs.readFile(path.join(root, 'archive-manifest.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  let archivePromise;
  // Immutable version: successful reads are reused for this process lifetime.
  const cachedArchive = () => archivePromise ||= loadArchive(manifest.version).then(json => ({json, gzip:gzipSync(json)})).catch(error => {archivePromise = null; throw error;});
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-cache');
    const end = (status, text) => {res.writeHead(status, {'Content-Type':'text/plain; charset=utf-8'}); res.end(req.method === 'HEAD' ? undefined : text);};
    if (!['GET', 'HEAD'].includes(req.method)) {res.setHeader('Allow','GET, HEAD'); return end(405, 'Method not allowed');}
    let url;
    try {url = decodeURIComponent(req.url.split('?')[0]);} catch {return end(400, 'Bad path');}
    if (url.startsWith('/api/')) {
      if (!manifest || url !== `/api/archive/${manifest.version}`) return end(404, 'Not found');
      try {
        const archive = await cachedArchive();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Between-Data-Source', 'firestore');
        res.setHeader('X-Between-Data-Version', manifest.version);
        res.setHeader('Vary', 'Accept-Encoding');
        const gzip = /(?:^|,)\s*gzip\s*(?:,|$)/.test(req.headers['accept-encoding'] || '');
        if (gzip) res.setHeader('Content-Encoding', 'gzip');
        res.writeHead(200); return res.end(req.method === 'HEAD' ? undefined : gzip ? archive.gzip : archive.json);
      } catch (error) {console.error('Archive read failed:', error.message); return end(503, 'Work archive temporarily unavailable');}
    }
    if (url === '/healthz') {
      res.writeHead(200, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({status:'ok', ...version}));
    }
    // The site's address is the app itself: the root serves the standalone UI, with no redirect or query.
    // Old /between.html links keep working.
    if (url === '/' || url === '/index.html') url = '/between.html';
    const asset = assets.get(url);
    if (!asset) return end(404, 'Not found');
    res.setHeader('ETag',asset.etag);
    res.setHeader('Vary','Accept-Encoding');
    if (req.headers['if-none-match']?.split(',').map(x=>x.trim()).includes(asset.etag)) {res.writeHead(304); return res.end();}
    const gzip = !!asset.compressed && String(req.headers['accept-encoding'] || '').split(',').some(part => {
      const [coding, ...params] = part.trim().split(';');
      const q = params.find(x=>x.trim().startsWith('q='));
      return coding === 'gzip' && (!q || Number(q.trim().slice(2)) > 0);
    });
    res.setHeader('Content-Type', types[path.extname(url)] || 'application/octet-stream');
    res.setHeader('Content-Length', gzip ? asset.compressed : asset.size);
    if (gzip) res.setHeader('Content-Encoding','gzip');
    res.writeHead(200);
    if (req.method === 'HEAD') return res.end();
    const stream = createReadStream(asset.file + (gzip ? '.gz' : ''));
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.env.PUBLIC_DIR || fileURLToPath(new URL('./public/', import.meta.url));
  const server = await createApp(root);
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('Between listening'));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
