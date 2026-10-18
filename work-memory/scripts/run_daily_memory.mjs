import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inputFor, authoredFacts, createLedger, currentFacts, appendDay, dates, reportMarkdown, VERSION } from '../daily-memory/model.js';
import { extractGemini, PROMPT_VERSION } from '../daily-memory/gemini.js';
import { extractLocal } from '../daily-memory/lmstudio.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2),options = {};
for (let i = 0; i < args.length; i += 2) {if (!['--provider', '--through', '--out'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: node scripts/run_daily_memory.mjs --provider authored|gemini|lmstudio --through YYYY-MM-DD --out DIRECTORY');options[args[i].slice(2)] = args[i + 1];}
const provider = options.provider || 'authored';
if (!['authored', 'gemini', 'lmstudio'].includes(provider)) throw new Error('Unknown provider');
const bytes = await fs.readFile(path.join(root, 'data/scenarios/architect/worklife.json'));
const data = JSON.parse(bytes),hash = createHash('sha256').update(bytes).digest('hex');
const through = options.through || (provider !== 'authored' ? data.manifest.start : data.manifest.end);
if (!dates(data.manifest.start, data.manifest.end).includes(through)) throw new Error('Date outside Grace archive');
const model = provider === 'gemini' ? process.env.GEMINI_MODEL : provider === 'lmstudio' ? process.env.LM_STUDIO_MODEL : null,apiKey = process.env.GEMINI_API_KEY;
if (provider === 'gemini' && (!model || !apiKey)) throw new Error('Missing GEMINI_API_KEY or GEMINI_MODEL. Configure in local environment; no AI call made.');
if (provider === 'lmstudio' && (!model || !process.env.LM_STUDIO_URL)) throw new Error('Missing LM_STUDIO_URL or LM_STUDIO_MODEL.');
const out = path.resolve(options.out || path.join(root, 'daily-memory/runs', provider));
await fs.mkdir(out, { recursive: true });
const lock = await fs.open(path.join(out, '.lock'), 'wx').catch(() => {throw new Error('Run directory is locked. Use a different directory or resolve the previous run.');});
const atomic = async (file, value) => {await fs.writeFile(file + '.tmp', value);await fs.rename(file + '.tmp', file);};
try {
  let ledger;
  try {ledger = JSON.parse(await fs.readFile(path.join(out, 'ledger.json'), 'utf8'));} catch (e) {if (e.code !== 'ENOENT') throw e;ledger = createLedger(data, provider, model);ledger.manifest.input_sha256 = hash;ledger.manifest.prompt_version = PROMPT_VERSION;}
  if (ledger.manifest.version !== VERSION || ledger.manifest.input_sha256 !== hash || ledger.manifest.provider !== provider || ledger.manifest.model !== model || ledger.manifest.prompt_version !== PROMPT_VERSION) throw new Error('Input or provider changed; use a fresh run directory to preserve old daily snapshots.');
  const names = Object.fromEntries(data.people.map((p) => [p.id, p.name]));
  for (const date of dates(data.manifest.start, through)) {
    if (ledger.days.some((d) => d.date === date)) continue;
    const input = inputFor(data, date, ledger.days.at(-1));
    const extraction = provider === 'authored' ? { accepted: authoredFacts(data, input), rejected: [], usage: null } : provider === 'lmstudio' ? await extractLocal(input, currentFacts(ledger), { baseURL: process.env.LM_STUDIO_URL, model }) : await extractGemini(input, currentFacts(ledger), { apiKey, model });
    if (extraction.raw) {await fs.mkdir(path.join(out, 'raw'), { recursive: true });await atomic(path.join(out, 'raw', date + '.json'), JSON.stringify(extraction.raw, null, 2));}
    const day = appendDay(ledger, input, extraction.accepted, extraction.rejected);day.usage = extraction.usage;day.format_notes = extraction.format_notes || [];
    await atomic(path.join(out, 'ledger.json'), JSON.stringify(ledger));
    console.log(`${date}: +${day.stats.new_records} records, +${day.stats.changed} versions, ${day.rejected.length} rejected`);
  }
  // Recreate derivative reports after interruption; immutable ledger days are not replayed.
  await fs.mkdir(path.join(out, 'days'), { recursive: true });
  for (const day of ledger.days) {
    await atomic(path.join(out, 'days', day.date + '.json'), JSON.stringify({ ...day, facts: currentFacts(ledger, day) }, null, 2));
    await atomic(path.join(out, 'days', day.date + '.md'), reportMarkdown(ledger, day, names));
  }
  const last = ledger.days.at(-1);
  await atomic(path.join(out, 'handover.md'), reportMarkdown(ledger, last, names));
  console.log(`Saved ${ledger.days.length} daily snapshots; ${ledger.facts.length} fact versions. Provider: ${provider}.`);
} finally {await lock.close();await fs.unlink(path.join(out, '.lock'));}
