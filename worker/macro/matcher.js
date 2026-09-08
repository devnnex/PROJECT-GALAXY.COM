import { normalizeName } from './normalizer.js';

function exact(value, expected) { return value && expected && normalizeName(value) === normalizeName(expected); }

export function matchMacroComponent(event, configs) {
  if (normalizeName(event?.country) !== 'united states') return { match: null, reason: 'UNEXPECTED_EVENT' };
  const ranked = [];
  for (const config of configs.filter((item) => item.enabled !== false)) {
    let rank = 0;
    if (exact(event.symbol, config.symbol)) rank = 100;
    else if (exact(event.ticker, config.ticker)) rank = 90;
    else if (exact(event.category, config.label) || exact(event.category, config.indicator)) rank = 80;
    else if (exact(event.event, config.label) || exact(event.event, config.indicator)) rank = 70;
    else if ((config.aliases || []).some((alias) => exact(event.category, alias) || exact(event.event, alias))) rank = 60;
    if (rank) ranked.push({ config, rank });
  }
  ranked.sort((a, b) => b.rank - a.rank || a.config.priority - b.config.priority);
  if (!ranked.length) return { match: null, reason: 'UNEXPECTED_EVENT' };
  if (ranked[1]?.rank === ranked[0].rank && ranked[1].config.indicator !== ranked[0].config.indicator) return { match: null, reason: 'AMBIGUOUS_EVENT' };
  return { match: ranked[0].config, reason: null };
}
