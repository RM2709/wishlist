import { and, eq } from 'drizzle-orm';
import { db, wishlistItems } from '../db/index';
import { fetchPrice } from './price';

export interface RefreshResult {
  ok: boolean;
  changed: boolean;
  price?: number;
  error?: string;
}

const DELAY_BETWEEN_ITEMS_MS = 2000;
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function recordError(itemId: string, message: string) {
  await db
    .update(wishlistItems)
    .set({ priceCheckedAt: new Date(), priceCheckError: message.slice(0, 200) })
    .where(eq(wishlistItems.id, itemId));
}

/**
 * Re-reads the price from the item's first purchase URL and saves it.
 * On failure the old price is kept and the error is stored on the item.
 */
export async function refreshItemPrice(itemId: string): Promise<RefreshResult> {
  const rows = await db.select().from(wishlistItems).where(eq(wishlistItems.id, itemId)).limit(1);
  const item = rows[0];
  if (!item) return { ok: false, changed: false, error: 'Item not found' };

  const sourceUrl = item.purchaseUrls?.find((u) => u.url && u.url.trim())?.url.trim();
  if (!sourceUrl) {
    const error = 'No purchase URL to check';
    await recordError(itemId, error);
    return { ok: false, changed: false, error };
  }

  try {
    const { price } = await fetchPrice(sourceUrl);
    const rounded = Math.round(price * 100) / 100;
    const changed = item.price === null || Math.abs(item.price - rounded) >= 0.005;
    const now = new Date();

    await db
      .update(wishlistItems)
      .set({
        ...(changed ? { price: rounded, updatedAt: now } : {}),
        priceCheckedAt: now,
        priceCheckError: null,
      })
      .where(eq(wishlistItems.id, itemId));

    return { ok: true, changed, price: rounded };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await recordError(itemId, message);
    return { ok: false, changed: false, error: message };
  }
}

const globalState = globalThis as unknown as {
  __priceCheckRunning?: boolean;
  __priceSchedulerStarted?: boolean;
};

/** Checks every item that has automatic price updates turned on. */
export async function runPriceCheck() {
  if (globalState.__priceCheckRunning) return;
  globalState.__priceCheckRunning = true;

  try {
    const items = await db
      .select()
      .from(wishlistItems)
      .where(
        and(
          eq(wishlistItems.autoUpdatePrice, true),
          eq(wishlistItems.isArchived, false),
          eq(wishlistItems.isPurchased, false)
        )
      );

    let updated = 0;
    let failed = 0;

    for (const item of items) {
      const result = await refreshItemPrice(item.id);
      if (!result.ok) failed++;
      else if (result.changed) updated++;
      await sleep(DELAY_BETWEEN_ITEMS_MS); // be polite to shops
    }

    console.log(`💶 Price check done: ${items.length} checked, ${updated} updated, ${failed} failed`);
  } catch (error) {
    console.error('Price check failed:', error);
  } finally {
    globalState.__priceCheckRunning = false;
  }
}

/** Starts the periodic check. Interval via PRICE_CHECK_INTERVAL_HOURS (default 24, 0 = off). */
export function startPriceScheduler() {
  if (globalState.__priceSchedulerStarted) return;

  const hours = parseFloat(process.env.PRICE_CHECK_INTERVAL_HOURS ?? '24');
  if (!(hours > 0)) {
    console.log('Automatic price checks are disabled (PRICE_CHECK_INTERVAL_HOURS=0)');
    return;
  }

  globalState.__priceSchedulerStarted = true;
  const intervalMs = hours * 60 * 60 * 1000;

  setTimeout(() => {
    void runPriceCheck();
    const timer = setInterval(() => void runPriceCheck(), intervalMs);
    timer.unref?.();
  }, FIRST_RUN_DELAY_MS).unref?.();

  console.log(`💶 Automatic price checks scheduled every ${hours}h`);
}
