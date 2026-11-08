import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseLocalizedPrice, parseStructuredPrice } from './price-parse';

export interface PriceResult {
  price: number;
  currency: string | null;
  source: string;
}

type Json = unknown;

function isProduct(node: Record<string, Json>): boolean {
  const type = node['@type'];
  if (Array.isArray(type)) return type.some((t) => t === 'Product');
  return type === 'Product';
}

function priceFromOffers(offers: Json): { price: number; currency: string | null } | null {
  const list = Array.isArray(offers) ? offers : [offers];
  for (const offer of list) {
    if (!offer || typeof offer !== 'object') continue;
    const o = offer as Record<string, Json>;
    const spec = (o.priceSpecification && typeof o.priceSpecification === 'object'
      ? (Array.isArray(o.priceSpecification) ? o.priceSpecification[0] : o.priceSpecification)
      : null) as Record<string, Json> | null;

    const price =
      parseStructuredPrice(o.price) ??
      parseStructuredPrice(o.lowPrice) ??
      parseStructuredPrice(spec?.price);

    if (price !== null) {
      const currency = (o.priceCurrency ?? spec?.priceCurrency) as string | undefined;
      return { price, currency: typeof currency === 'string' ? currency : null };
    }
  }
  return null;
}

/** Finds the first schema.org Product in a JSON-LD document and returns its offer price. */
function priceFromJsonLd(node: Json, depth = 0): { price: number; currency: string | null } | null {
  if (!node || typeof node !== 'object' || depth > 6) return null;

  if (Array.isArray(node)) {
    for (const child of node) {
      const found = priceFromJsonLd(child, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const obj = node as Record<string, Json>;
  if (isProduct(obj) && obj.offers) {
    const found = priceFromOffers(obj.offers);
    if (found) return found;
  }

  // Product usually sits inside @graph or a wrapper object
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage']) {
    if (obj[key]) {
      const found = priceFromJsonLd(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export function extractPriceFromHtml(html: string): PriceResult | null {
  const $ = cheerio.load(html);

  // 1. schema.org JSON-LD (most reliable)
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const script of scripts) {
    const text = $(script).contents().text();
    if (!text) continue;
    try {
      const found = priceFromJsonLd(JSON.parse(text));
      if (found) return { ...found, source: 'json-ld' };
    } catch {
      // Malformed JSON-LD is common; try the next block
    }
  }

  // 2. Meta tags
  const metaSelectors = [
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    'meta[itemprop="price"]',
  ];
  for (const selector of metaSelectors) {
    const price = parseStructuredPrice($(selector).first().attr('content'));
    if (price !== null) {
      const currency =
        $('meta[property="product:price:currency"], meta[property="og:price:currency"], meta[itemprop="priceCurrency"]')
          .first()
          .attr('content') || null;
      return { price, currency, source: 'meta' };
    }
  }

  // 3. Microdata and common price elements (last resort, less reliable)
  const itemprop = $('[itemprop="price"]').first();
  const itempropPrice =
    parseStructuredPrice(itemprop.attr('content')) ?? parseLocalizedPrice(itemprop.text());
  if (itempropPrice !== null) {
    return { price: itempropPrice, currency: null, source: 'microdata' };
  }

  const textSelectors = ['.a-price .a-offscreen', '.product-price', '.price'];
  for (const selector of textSelectors) {
    const price = parseLocalizedPrice($(selector).first().text());
    if (price !== null) {
      return { price, currency: null, source: selector };
    }
  }

  return null;
}

// Closer to what a real browser sends; many shops reject bare requests outright
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'hr-HR,hr;q=0.9,en;q=0.8',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

export async function fetchPrice(url: string): Promise<PriceResult> {
  const normalized = url.startsWith('http') ? url : `https://${url}`;
  new URL(normalized); // throws on invalid URLs

  let html: string | null = null;
  for (let attempt = 0; attempt < 2 && html === null; attempt++) {
    try {
      const response = await axios.get(normalized, {
        headers: BROWSER_HEADERS,
        timeout: 15000,
        maxContentLength: 5 * 1024 * 1024,
        responseType: 'text',
      });
      html = typeof response.data === 'string' ? response.data : String(response.data);
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;

      // Rate limited: wait (as the shop asks, up to 15s) and try once more
      if (status === 429 && attempt === 0 && axios.isAxiosError(error)) {
        const retryAfter = Number(error.response?.headers?.['retry-after']);
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 15) * 1000 : 5000;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (status === 403) {
        throw new Error('Blocked by the shop (403): it does not allow automated requests');
      }
      if (status === 429) {
        throw new Error('Rate limited by the shop (429): will try again at the next check');
      }
      throw new Error(`Could not load page: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  if (html === null) {
    throw new Error('Could not load page');
  }

  const result = extractPriceFromHtml(html);
  if (!result) {
    throw new Error('No price found on the page');
  }
  return result;
}
