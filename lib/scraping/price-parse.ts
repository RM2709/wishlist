/**
 * Helpers for turning price text into numbers.
 * Handles European ("1.299,99 €") and US ("$1,299.99") formats.
 */

// First price-like token in a string: either with thousands groups or plain
const PRICE_TOKEN = /\d{1,3}(?:[.,\s\u00a0\u202f']\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/;

export function parseLocalizedPrice(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) && input > 0 ? input : null;
  }

  const match = input.match(PRICE_TOKEN);
  if (!match) return null;

  // Drop spaces / apostrophes used as thousands separators
  let token = match[0].replace(/[\s\u00a0\u202f']/g, '');

  const lastDot = token.lastIndexOf('.');
  const lastComma = token.lastIndexOf(',');

  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: whichever comes last is the decimal separator
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandsSep = decimalSep === '.' ? ',' : '.';
    token = token.split(thousandsSep).join('').replace(decimalSep, '.');
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ',';
    const parts = token.split(sep);
    if (parts.length > 2) {
      // Repeated separator -> thousands ("1.299.000")
      token = parts.join('');
    } else {
      const [intPart, fracPart] = parts;
      const looksLikeThousands = fracPart.length === 3 && intPart.length <= 3 && intPart !== '0';
      token = looksLikeThousands ? intPart + fracPart : `${intPart}.${fracPart}`;
    }
  }

  const value = parseFloat(token);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Prices from JSON-LD / meta tags: plain "1299.99" is always dot-decimal. */
export function parseStructuredPrice(input: unknown): number | null {
  if (typeof input === 'number') return parseLocalizedPrice(input);
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const value = parseFloat(trimmed);
    return value > 0 ? value : null;
  }
  return parseLocalizedPrice(trimmed);
}
