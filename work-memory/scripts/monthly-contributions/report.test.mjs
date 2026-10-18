import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareSummaries } from './summaries.mjs';
const results = JSON.parse(fs.readFileSync(new URL('../../../docs/results/grace-monthly-contributions/results.json', import.meta.url)));
const summaries = JSON.parse(fs.readFileSync(new URL('./main-work-summaries.json', import.meta.url)));
const html = fs.readFileSync(new URL('../../../docs/results/grace-monthly-contributions/report.html', import.meta.url), 'utf8');
test('full-year report includes October exactly once and derives accurate totals', () => {
  assert.deepEqual(results.months.map((m) => m.report.month), Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2025, 9 + i, 1)).toISOString().slice(0, 7)));
  assert.equal(results.months[0].summary.records, 117);
  assert.equal(results.months[0].report.cards.length, 3);
  for (const key of ['records', 'cards', 'claims']) assert.equal(results.summary[key], results.months.reduce((n, m) => n + m.summary[key], 0));
  assert.equal(results.summary.records, 1337);
  const embedded = JSON.parse(html.match(/id="data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(embedded.map((m) => m.report.month), results.months.map((m) => m.report.month));
  assert.match(html, /reportRange\(\)/);
  assert.doesNotMatch(html, /November 2025 – September 2026/);
});
test('October is bound into monthly and whole-period narratives', () => {
  const prepared = prepareSummaries(summaries, results.months);
  assert.equal(prepared.monthly.filter((m) => m.month === '2025-10').length, 3);
  const missing = structuredClone(summaries);
  missing.monthly = missing.monthly.filter((m) => m.month !== '2025-10');
  assert.throws(() => prepareSummaries(missing, results.months), /Missing monthly summary coverage/);
  const changed = structuredClone(results.months);
  changed[0].report.cards[0].grace_contributions[0].text = 'Unsupported changed claim';
  assert.throws(() => prepareSummaries(summaries, changed), /Summary needs review/);
});

test('embedded history only exposes completed months, including the empty first month', async () => {
  const { runInNewContext } = await import('node:vm');
  const template = fs.readFileSync(new URL('./report-template.html', import.meta.url), 'utf8');
  const fn = template.slice(template.indexOf('function completedReportMonths('), template.indexOf('const allData ='));
  const completed = runInNewContext(fn + '\ncompletedReportMonths');
  const months = results.months;
  assert.equal(completed(months, '2025-10-01').length, 0);
  assert.equal(completed(months, '2025-10-31').length, 1);
  assert.equal(completed(months, '2026-02-27').length, 4);
  assert.equal(completed(months, '2026-02-28').length, 5);
  assert.equal(completed(months, '2026-09-30').length, 12);
  assert.equal(completed(months, 'invalid').length, 0);
  assert.equal(completed(months, null).length, 12);
});

test('monthly work details count distinct source records across displayed cards', async () => {
  const { runInNewContext } = await import('node:vm');
  const template = fs.readFileSync(new URL('./report-template.html', import.meta.url), 'utf8');
  const fn = template.slice(template.indexOf('function sourceCount('), template.indexOf('// A project\'s monthly summaries'));
  const cards = new Map();
  for (const m of results.months) m.report.cards.forEach((card, i) => cards.set(`work-${m.report.month}-${i}`, { card }));
  const label = runInNewContext(fn + '\nworkDetailsLabel', { cards });
  // October school has one card, seven citations and six distinct original records.
  const school = [{ card_id: 'work-2025-10-2' }];
  assert.equal(label(school), 'Work details · 6 sources');
  assert.equal(label([...school, ...school]), 'Work details · 6 sources');
  const single = {
    grace_contributions: [{ evidence: [{ source_id: 'same' }] }],
    guidance_and_collaboration: [], outputs_and_status: [], methods_and_tools: [],
    independence_basis: { evidence: [{ source_id: 'same' }] }
  };
  cards.set('first', { card: single });
  cards.set('second', { card: { ...single, methods_and_tools: [{ evidence: [{ source_id: 'another' }] }] } });
  assert.equal(label([{ card_id: 'first' }]), 'Work details · 1 source');
  assert.equal(label([{ card_id: 'first' }, { card_id: 'second' }]), 'Work details · 2 sources');
  const monthlyLabel = runInNewContext(fn + '\nmonthlyCardsLabel', { cards });
  assert.equal(monthlyLabel([{ references: [{ card_id: 'first' }] }]), 'Month by month (1) · Sources (1)');
  // Each month's deduplicated count contributes to the sum, including shared records.
  assert.equal(monthlyLabel([{ references: [{ card_id: 'first' }] }, { references: [{ card_id: 'second' }] }]), 'Month by month (2) · Sources (3)');
});
