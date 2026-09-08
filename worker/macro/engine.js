import { ENGINE_META, configsForEngine } from './registry.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, precision = 2) => Number(value.toFixed(precision));

function classify(score) {
  if (score >= 60) return 'STRONG_BUY';
  if (score >= 30) return 'BUY';
  if (score <= -60) return 'STRONG_SELL';
  if (score <= -30) return 'SELL';
  return score === 0 ? 'NEUTRAL' : 'WAIT';
}

function qualityFailure(release, components, feedHealth) {
  if (!feedHealth?.connected) return 'FEED_DISCONNECTED';
  if (feedHealth.stale) return 'STALE_DATA';
  if (release?.country && release.country !== 'United States') return 'UNEXPECTED_EVENT';
  if (!components.length) return 'INSUFFICIENT_COMPONENTS';
  if (components.some((item) => item.actual === null || !Number.isFinite(item.actual))) return 'INVALID_VALUE';
  if (components.some((item) => item.forecast === null || !Number.isFinite(item.forecast))) return 'MISSING_FORECAST';
  return null;
}

function componentExplanation(item) {
  const relation = item.surprise === 0 ? 'igual al consenso' : item.surprise < 0 ? 'inferior al consenso' : 'superior al consenso';
  const gold = item.goldScore === 0 ? 'neutral para oro' : item.goldScore > 0 ? 'favorable al oro' : 'desfavorable al oro';
  return `${item.label}: dato ${relation}; lectura ${gold}.`;
}

export function evaluateMacroRelease(release, engineConfig, options = {}) {
  const engine = release.engine; const configs = configsForEngine(engine, engineConfig);
  const byIndicator = new Map((release.components || []).map((item) => [item.indicator, item]));
  const received = configs.map((config) => ({ ...config, ...(byIndicator.get(config.indicator) || {}) })).filter((item) => byIndicator.has(item.indicator));
  const feedHealth = options.feedHealth || { connected: true, stale: false };
  const failure = qualityFailure(release, received, feedHealth);
  const generatedAt = options.generatedAt ? new Date(options.generatedAt) : new Date();
  const receivedAt = received.reduce((latest, item) => Math.max(latest, new Date(item.receivedAt || 0).getTime()), 0);
  const base = {
    engine, engineVersion: ENGINE_META[engine]?.version || `${engine} ENGINE v1`, generatedAt: generatedAt.toISOString(),
    receivedAt: receivedAt ? new Date(receivedAt).toISOString() : null,
    processingMs: receivedAt ? Math.max(0, generatedAt.getTime() - receivedAt) : null,
  };
  if (failure) return { ...base, signal: 'NO_SIGNAL', galaxyScore: 0, confidence: 'LOW', status: 'REJECTED', reason: failure, explanation: [failure], componentScores: [] };

  const requiredMissing = configs.filter((item) => item.required && !byIndicator.has(item.indicator));
  const componentScores = received.map((item) => {
    const surprise = item.actual - item.forecast;
    const normalizedSurprise = clamp(surprise / item.surpriseThreshold, -2, 2);
    const goldScore = normalizedSurprise * item.directionForGold * item.weight;
    return { indicator: item.indicator, label: item.label, actual: item.actual, forecast: item.forecast, previous: item.previous ?? null,
      revised: item.revised ?? null, unit: item.unit || '', weight: item.weight, directionForGold: item.directionForGold,
      surpriseThreshold: item.surpriseThreshold, surprise: round(surprise, 6), normalizedSurprise: round(normalizedSurprise, 4), goldScore: round(goldScore, 4), required: item.required };
  });
  const availableWeight = componentScores.reduce((total, item) => total + item.weight, 0);
  let score = availableWeight ? Math.round(clamp(componentScores.reduce((total, item) => total + item.goldScore, 0) / (availableWeight * 2) * 100, -100, 100)) : 0;

  // NFP revisions are secondary and can move the result by at most ten points.
  if (engine === 'NFP') {
    const payrolls = received.find((item) => item.indicator === 'NON_FARM_PAYROLLS');
    if (Number.isFinite(payrolls?.previous) && Number.isFinite(payrolls?.revised)) {
      const revisionPoints = clamp((payrolls.previous - payrolls.revised) / 50000 * -10, -10, 10);
      score = Math.round(clamp(score + revisionPoints, -100, 100));
    }
  }

  const primary = componentScores.filter((item) => item.required && Math.abs(item.normalizedSurprise) >= .25);
  const contradictory = primary.some((item) => item.goldScore > 0) && primary.some((item) => item.goldScore < 0);
  const allRequired = requiredMissing.length === 0;
  let signal = contradictory ? 'MIXED' : classify(score);
  if (!allRequired && signal.startsWith('STRONG_')) signal = score >= 0 ? 'BUY' : 'SELL';

  if (engine === 'FOMC' && componentScores[0]?.surprise === 0) {
    return { ...base, signal: 'WAIT', galaxyScore: 0, confidence: 'MEDIUM', status: 'WAIT_FOR_STATEMENT', reason: 'RATE_AS_EXPECTED',
      explanation: ['RATE AS EXPECTED', 'WAITING FOR FOMC GUIDANCE'], componentScores };
  }

  const fresh = !feedHealth.stale && feedHealth.connected;
  const confidence = allRequired && !contradictory && fresh ? 'HIGH' : received.length >= 1 && fresh ? 'MEDIUM' : 'LOW';
  const status = allRequired ? 'CONFIRMED' : 'PRELIMINARY';
  const explanation = componentScores.map(componentExplanation);
  if (contradictory) explanation.push('Los componentes principales se contradicen; la lectura se clasifica como MIXED.');
  else if (signal.includes('BUY')) explanation.push('El balance matemático del release es favorable al oro.');
  else if (signal.includes('SELL')) explanation.push('El balance matemático del release es desfavorable al oro.');
  else explanation.push('La sorpresa agregada no supera un umbral direccional fiable.');
  if (!allRequired) explanation.push(`Faltan componentes principales: ${requiredMissing.map((item) => item.label).join(', ')}.`);
  return { ...base, signal, galaxyScore: score, confidence, status, reason: allRequired ? null : 'INSUFFICIENT_COMPONENTS', explanation, componentScores };
}
