import { evaluateMacroRelease } from './macro/engine.js';
import { DEFAULT_ENGINE_CONFIG } from './macro/registry.js';

const engine = String(process.argv[2] || 'CPI').toUpperCase();
const scenario = String(process.argv[3] || 'below').toLowerCase();
const values = {
  CPI: { CORE_CPI_MOM: [.1, .2], CPI_MOM: [.2, .4], CORE_CPI_YOY: [3.1, 3.2], CPI_YOY: [2.7, 2.8] },
  PPI: { CORE_PPI_MOM: [.1, .3], PPI_MOM: [.1, .3], CORE_PPI_YOY: [2.4, 2.6], PPI_YOY: [2.1, 2.4] },
  NFP: { NON_FARM_PAYROLLS: [120000, 180000], UNEMPLOYMENT_RATE: [4.3, 4.1], AVERAGE_HOURLY_EARNINGS_MOM: [.2, .3] },
  PCE: { CORE_PCE_MOM: [.1, .2], PCE_MOM: [.1, .2], CORE_PCE_YOY: [2.6, 2.7], PCE_YOY: [2.4, 2.5] },
  RETAIL_SALES: { RETAIL_SALES_MOM: [-.2, .3], RETAIL_SALES_EX_AUTOS: [0, .2], RETAIL_CONTROL_GROUP: [.1, .3] },
  FOMC: { FEDERAL_FUNDS_RATE: [4.25, 4.5] },
};

if (!values[engine]) throw new Error(`Unknown engine ${engine}. Use CPI, PPI, NFP, PCE, RETAIL_SALES or FOMC.`);
const components = Object.entries(values[engine]).map(([indicator, pair], index) => ({
  indicator, actual: scenario === 'expected' ? pair[1] : scenario === 'above' ? pair[1] + Math.abs(pair[1] - pair[0]) : pair[0],
  forecast: pair[1], previous: pair[1], revised: null, unit: indicator.includes('PAYROLL') ? 'K' : '%', receivedAt: new Date(Date.now() - 12 - index).toISOString(),
}));
const result = evaluateMacroRelease({ engine, country: 'United States', components }, DEFAULT_ENGINE_CONFIG, { feedHealth: { connected: true, stale: false } });
console.log(JSON.stringify({ simulationOnly: true, productionWritten: false, engine, scenario, result }, null, 2));
