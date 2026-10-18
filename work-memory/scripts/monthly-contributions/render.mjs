import fs from 'node:fs/promises';
import path from 'node:path';
import { prepareSummaries } from './summaries.mjs';
const dir = path.resolve(process.argv[2] || '.');
const index = JSON.parse(await fs.readFile(path.join(dir, 'verified-index.json')));
const months = [];
const required = new Set();
for (const summary of index.months) {
  const result = JSON.parse(await fs.readFile(path.join(dir, summary.month + '-verified.json')));
  const input = JSON.parse(await fs.readFile(path.join(dir, summary.month + '-input.json')));
  result.project_names = Object.fromEntries(input.projects.map((p) => [p.id, p.name]));
  for (const name of Object.values(result.project_names)) required.add(name);
  for (const card of result.report.cards) {
    for (const text of [card.title, card.work_stage, ...card.unknowns]) required.add(text);
    for (const section of ['grace_contributions', 'guidance_and_collaboration', 'outputs_and_status', 'methods_and_tools']) {
      for (const claim of card[section]) required.add(claim.text);
    }
    if (card.independence_basis) required.add(card.independence_basis.text);
  }
  for (const project of result.report.uncovered_projects) required.add(project.reason);
  months.push(result);
}
const summaries = prepareSummaries(JSON.parse(await fs.readFile(new URL('./main-work-summaries.json', import.meta.url))), months);
const safeJSON = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');
const template = await fs.readFile(new URL('./report-template.html', import.meta.url), 'utf8');
const html = template.replace('__REPORT_DATA__', () => safeJSON(months)).replace('__MAIN_SUMMARIES__', () => safeJSON(summaries));
await fs.writeFile(path.join(dir, 'report.html'), html);
console.log(JSON.stringify({ report: path.join(dir, 'report.html'), months: months.length, cards: months.reduce((n, m) => n + m.summary.cards, 0) }));
