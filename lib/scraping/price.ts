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

export async function fetchPrice(url: string): Promise<PriceResult> {
  const normalized = url.startsWith('http') ? url : `https://${url}`;
  new URL(normalized); // throws on invalid URLs

  let html: string;
  try {
    const response = await axios.get(normalized, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'hr,en;q=0.8',
      },
      timeout: 15000,
      maxContentLength: 5 * 1024 * 1024,
      responseType: 'text',
    });
    html = typeof response.data === 'string' ? response.data : String(response.data);
  } catch (error) {
    throw new Error(`Could not load page: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  const result = extractPriceFromHtml(html);
  if (!result) {
    throw new Error('No price found on the page');
  }
  return result;
}
