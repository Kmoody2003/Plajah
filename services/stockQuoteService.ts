// stockQuoteService.ts — live quotes for the user's FOLLOWED STOCKS (favoriteStocks).
// Hits the same-origin server proxy (server.ts → GET /api/markets/stocks), which
// keeps any provider key server-side and dodges browser CORS. The proxy prefers a
// keyless Yahoo Finance source and falls back to Finnhub when FINNHUB_API_KEY is set.
// Degrades to [] on any failure so callers (e.g. the Signal ticker) can fall back.

export interface StockQuote {
  symbol: string;
  price: number;
  changePct: number;
  currency?: string;
}

/**
 * Fetch live quotes for the given stock symbols. Returns [] on empty input or any
 * failure — never throws.
 */
export async function fetchStockQuotes(symbols: string[]): Promise<StockQuote[]> {
  try {
    const clean = (symbols || [])
      .map(s => String(s || '').trim().toUpperCase())
      .filter(Boolean);
    if (clean.length === 0) return [];
    const res = await fetch(`/api/markets/stocks?symbols=${encodeURIComponent(clean.join(','))}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((q: any) => q && typeof q.symbol === 'string' && typeof q.price === 'number' && typeof q.changePct === 'number')
      .map((q: any) => ({
        symbol: q.symbol,
        price: q.price,
        changePct: q.changePct,
        currency: typeof q.currency === 'string' ? q.currency : undefined,
      }));
  } catch {
    return [];
  }
}
