// The offline ticker list. It is searched BEFORE Alpha Vantage, so a symbol found here costs no request.
// Each entry: { symbol, name, type: 'stock' | 'etf' | 'fund' | 'bond', region, currency, country } (country is one of us, in, uk, au, ch, ie).
// It is empty for now: the full list will be added here (or imported) later.
export const LOCAL_TICKERS = []
