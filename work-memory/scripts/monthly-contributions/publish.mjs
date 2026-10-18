// Package the reviewed snapshot with the current UI; no private run files or API calls needed.
import fs from 'node:fs/promises';
const snapshot = await fs.readFile(new URL('../../../docs/results/grace-monthly-contributions/report.html', import.meta.url), 'utf8');
// The pinned snapshot predates the Ryan Cole -> Luke Matthews and Meridian -> Palm Tree Architects renames; the app's records now say Luke, so the
// published copy uses the current name (person id 'ryan' is unchanged). The snapshot itself is left as it was.
const renamed = (text) => text.replaceAll('Ryan Cole', 'Luke Matthews').replace(/\bRyan\b/g, 'Luke').
replaceAll('Meridian Design Partners', 'Palm Tree Architects').replace(/\bMeridian\b/g, 'Palm Tree'); // the practice's current name
let html = await fs.readFile(new URL('./report-template.html', import.meta.url), 'utf8');
// The page is English only: the Chinese strings and summary texts are not published.
const englishOnly = (id, json) => id !== 'main-summaries' ? json : JSON.stringify(JSON.parse(json), (key, value) => key === 'zh-CN' ? undefined : value).replaceAll('<', '\\u003c');
for (const [id, token] of [['data', '__REPORT_DATA__'], ['main-summaries', '__MAIN_SUMMARIES__']]) {
  const match = snapshot.match(new RegExp('id="' + id + '">([\\s\\S]*?)<\\/script>'));
  if (!match) throw Error('Report snapshot missing ' + id);
  const json = englishOnly(id, renamed(match[1]));
  JSON.parse(json);
  html = html.replace(token, () => json);
}
const output = new URL('../../reports/architect.html', import.meta.url);
await fs.mkdir(new URL('../../reports/', import.meta.url), { recursive: true });
await fs.writeFile(output, html);
console.log('Published architect work archive');
