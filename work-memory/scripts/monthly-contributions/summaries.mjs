import { createHash } from 'node:crypto';

const canonical = (value) => Array.isArray(value) ? value.map(canonical) :
value && typeof value === 'object' ?
Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const digest = (card) => createHash('sha256').update(JSON.stringify(canonical(card))).digest('hex');

// Bind editorial summaries to exact retained cards. Changed evidence requires review.
export function prepareSummaries(source, months) {
  if (source.review_status !== 'pending_semantic_review') throw Error('Summaries must remain pending review');
  const cards = months.flatMap((m) => m.report.cards.map((card, i) => ({
    month: m.report.month, card, id: `work-${m.report.month}-${i}`
  })));
  const prepare = (entry, monthly) => {
    for (const field of ['title', 'text']) for (const lang of ['en']) {
      if (!entry[field]?.[lang]?.trim()) throw Error('Summary is missing English text');
    }
    if (!entry.references?.length) throw Error('Summary has no card references');
    const references = entry.references.map((ref) => {
      const matches = cards.filter((c) => c.month === ref.month && c.card.title === ref.card_title);
      if (matches.length !== 1) throw Error(`Summary card missing or ambiguous: ${ref.month} / ${ref.card_title}`);
      const match = matches[0];
      if (match.card.project_id !== entry.project_id || monthly && match.month !== entry.month) throw Error('Summary crosses its project or month');
      if (digest(match.card) !== ref.card_sha256) throw Error(`Summary needs review after card change: ${ref.card_title}`);
      return { month: match.month, card_id: match.id, card_title: match.card.title };
    });
    return { ...entry, references };
  };
  const result = { ...source, overview: source.overview.map((e) => prepare(e, false)), monthly: source.monthly.map((e) => prepare(e, true)) };
  for (const section of ['overview', 'monthly']) {
    const covered = new Set(result[section].flatMap((e) => e.references.map((r) => r.card_id)));
    if (cards.some((c) => !covered.has(c.id))) throw Error(`Missing ${section} summary coverage for a work card`);
  }
  return result;
}
