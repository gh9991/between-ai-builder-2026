// Publish only the standalone UI, its embedded views and synthetic fixtures.
import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {buildArchive} from './archive.mjs';

const root = fileURLToPath(new URL('../work-memory/', import.meta.url));
const output = path.resolve(process.argv[2] || 'dist-cloud');
const commit = process.argv[3] || 'local';
if (!/^(local|[a-f0-9]{7,40})$/.test(commit)) throw Error('Expected a Git commit SHA');
if (output === root || root.startsWith(output + path.sep) || output.startsWith(root + path.sep)) throw Error('Output must be separate from work-memory');
// Refuse to overwrite an existing directory; callers use a fresh staging path.
await fs.mkdir(output);
// Compile a separate public bundle: hiding a selector does not remove embedded data.
const {build} = createRequire(new URL('../work-memory/package.json', import.meta.url))('esbuild');
const bundle = await build({
  absWorkingDir: root, entryPoints: ['app-universe2.js'], bundle: true,
  format: 'iife', minify: true, write: false, metafile: true,
  plugins: [{name: 'architect-only', setup(builder) {
    builder.onResolve({filter: /data\/scenarios\/index\.js$/}, args => {
      if (path.resolve(args.resolveDir, args.path) === path.join(root, 'data/scenarios/index.js')) {
        return {path: path.join(root, 'data/scenarios/runtime.js')};
      }
    });
  }}],
});
const dataInputs = Object.keys(bundle.metafile.inputs).filter(p => p.startsWith('data/scenarios/') && p.endsWith('.json'));
if (dataInputs.length) {
  throw Error(`Unexpected public scenario inputs: ${dataInputs.join(', ')}`);
}
const files = ['between.html', 'universe2.css', 'universe2.bundle.js', 'reports/architect.html',
  // Embedded pages load native ES modules rather than the main app bundle.
  'i18n.js', 'universe2-attention.js', 'archive-loader.js', 'archive-bootstrap.js',
  // The report header's 3D nebula, and the practice mark in the header.
  'universe2-nebula.js', 'universe2-galaxy-texture.js', 'assets/palm-tree-mark.png',
  'styles/timeline.html', 'styles/universe2-project-space.html'];
for (const dir of ['styles', 'vendor']) {
  for (const name of await fs.readdir(path.join(root, dir))) {
    if ((/\.(js|css)$/.test(name) && !name.includes('.test.')) || name === 'THREE-LICENSE.txt') files.push(`${dir}/${name}`);
  }
}
for (const persona of ['architect']) {
  for (const name of ['scenario.json', 'worklife.json']) files.push(`data/scenarios/${persona}/${name}`);
}
// A stylesheet can exist while its imported layout is missing from the release.
// Check every local CSS dependency before publishing any of the assets.
const publicFiles = new Set(files);
for (const file of files.filter(file => file.endsWith('.css'))) {
  const css = await fs.readFile(path.join(root, file), 'utf8');
  for (const match of css.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)) {
    const reference = match[1];
    if (/^(?:https?:|data:|\/\/)/.test(reference)) continue;
    const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(file), reference.split(/[?#]/)[0]));
    if (!publicFiles.has(dependency)) throw Error(`Missing stylesheet dependency: ${file} -> ${dependency}`);
  }
}
for (const file of files) {
  const source = path.join(root, file), dest = path.join(output, file);
  if (!(await fs.lstat(source)).isFile()) throw Error(`Not a regular file: ${file}`);
  let bytes = file === 'universe2.bundle.js' ? bundle.outputFiles[0].contents : await fs.readFile(source);
  if (file === 'between.html') bytes = Buffer.from(bytes.toString().replace(/<script src="universe2.bundle.js[^"]*"><\/script>/, '<script type="module" src="archive-bootstrap.js"></script>'));
  await fs.mkdir(path.dirname(dest), {recursive: true});
  await fs.writeFile(dest, bytes);
  if (bytes.length > 1024) await fs.writeFile(dest + '.gz', gzipSync(bytes, {level: 9}));
}
const archive = await buildArchive(new URL('../work-memory/', import.meta.url));
const archiveFile = `data/architect-${archive.version}.json`;
await fs.writeFile(path.join(output, archiveFile), archive.json);
await fs.writeFile(path.join(output, archiveFile + '.gz'), gzipSync(archive.json, {level:9}));
await fs.writeFile(path.join(output, 'archive-manifest.json'), JSON.stringify({version:archive.version, file:archiveFile}));
await fs.writeFile(path.join(output, 'version.json'), JSON.stringify({commit, product: 'Between', dataMode: 'synthetic-snapshot'}) + '\n');
console.log(`Packaged ${files.length} public assets for ${commit}`);
