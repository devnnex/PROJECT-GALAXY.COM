const component = (engine, indicator, label, aliases, weight, directionForGold, surpriseThreshold, required, priority, verified = {}) => ({
  engine, indicator, label, aliases, weight, directionForGold, surpriseThreshold, required, priority,
  ticker: verified.ticker || null, symbol: verified.symbol || null, enabled: true,
});

// Tickers are present only when verified in Trading Economics' official API documentation.
export const DEFAULT_ENGINE_CONFIG = Object.freeze([
  component('CPI', 'CORE_CPI_MOM', 'Core CPI MoM', ['Core CPI MoM', 'Core Inflation Rate MoM', 'CPI ex Food and Energy MoM'], .45, -1, .1, true, 1),
  component('CPI', 'CPI_MOM', 'CPI MoM', ['CPI MoM', 'Inflation Rate MoM'], .30, -1, .1, true, 2),
  component('CPI', 'CORE_CPI_YOY', 'Core CPI YoY', ['Core CPI YoY', 'Core Inflation Rate YoY'], .15, -1, .2, false, 3, { ticker: 'USACORECPIRATE', symbol: 'USACORECPIRATE' }),
  component('CPI', 'CPI_YOY', 'CPI YoY', ['CPI YoY', 'Inflation Rate YoY'], .10, -1, .2, false, 4),

  component('PPI', 'CORE_PPI_MOM', 'Core PPI MoM', ['Core PPI MoM', 'Core Producer Prices MoM', 'PPI ex Food and Energy MoM'], .40, -1, .2, true, 1),
  component('PPI', 'PPI_MOM', 'PPI MoM', ['PPI MoM', 'Producer Price Inflation MoM'], .35, -1, .2, true, 2),
  component('PPI', 'CORE_PPI_YOY', 'Core PPI YoY', ['Core PPI YoY', 'Core Producer Prices YoY'], .15, -1, .3, false, 3),
  component('PPI', 'PPI_YOY', 'PPI YoY', ['PPI YoY', 'Producer Price Inflation YoY'], .10, -1, .3, false, 4),

  component('NFP', 'NON_FARM_PAYROLLS', 'Non Farm Payrolls', ['Non Farm Payrolls', 'Nonfarm Payrolls'], .45, -1, 50000, true, 1, { ticker: 'NFP TCH', symbol: 'NFP TCH' }),
  component('NFP', 'UNEMPLOYMENT_RATE', 'Unemployment Rate', ['Unemployment Rate'], .30, 1, .1, true, 2, { ticker: 'USURTOT', symbol: 'USURTOT' }),
  component('NFP', 'AVERAGE_HOURLY_EARNINGS_MOM', 'Average Hourly Earnings MoM', ['Average Hourly Earnings MoM', 'Average Earnings MoM'], .25, -1, .1, true, 3),

  component('PCE', 'CORE_PCE_MOM', 'Core PCE Price Index MoM', ['Core PCE Price Index MoM', 'Core PCE MoM'], .50, -1, .1, true, 1, { ticker: 'USACPPIM', symbol: 'USACPPIM' }),
  component('PCE', 'PCE_MOM', 'PCE Price Index MoM', ['PCE Price Index MoM', 'PCE MoM'], .25, -1, .1, false, 2),
  component('PCE', 'CORE_PCE_YOY', 'Core PCE Price Index YoY', ['Core PCE Price Index YoY', 'Core PCE YoY'], .15, -1, .2, false, 3),
  component('PCE', 'PCE_YOY', 'PCE Price Index YoY', ['PCE Price Index YoY', 'PCE YoY'], .10, -1, .2, false, 4),

  component('RETAIL_SALES', 'RETAIL_SALES_MOM', 'Retail Sales MoM', ['Retail Sales MoM'], .45, -1, .3, true, 1, { ticker: 'RSTAMOM', symbol: 'RSTAMOM' }),
  component('RETAIL_SALES', 'RETAIL_SALES_EX_AUTOS', 'Retail Sales Ex Autos', ['Retail Sales Ex Autos MoM', 'Retail Sales Ex Autos', 'Core Retail Sales MoM'], .35, -1, .3, true, 2),
  component('RETAIL_SALES', 'RETAIL_CONTROL_GROUP', 'Retail Sales Control Group', ['Retail Sales Control Group', 'Retail Sales Control Group MoM'], .20, -1, .3, false, 3),

  component('FOMC', 'FEDERAL_FUNDS_RATE', 'Federal Funds Rate', ['Fed Interest Rate Decision', 'Federal Funds Rate', 'Interest Rate Decision'], 1, -1, .25, true, 1),
]);

export const ENGINE_META = Object.freeze({
  CPI: { label: 'CPI', version: 'CPI ENGINE v1' },
  PPI: { label: 'PPI', version: 'PPI ENGINE v1' },
  NFP: { label: 'NFP', version: 'NFP ENGINE v1' },
  PCE: { label: 'PCE', version: 'PCE ENGINE v1' },
  RETAIL_SALES: { label: 'RETAIL SALES', version: 'RETAIL SALES ENGINE v1' },
  FOMC: { label: 'FOMC', version: 'FOMC ENGINE v1' },
});

export function configsForEngine(engine, config = DEFAULT_ENGINE_CONFIG) {
  return config.filter((item) => item.engine === engine && item.enabled !== false).sort((a, b) => a.priority - b.priority);
}
