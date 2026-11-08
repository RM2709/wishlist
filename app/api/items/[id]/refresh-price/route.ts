import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, wishlistItems } from '@/lib/db';
import { verifyAccessToken } from '@/lib/auth/utils';
import { refreshItemPrice } from '@/lib/scraping/price-updater';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('access_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { id } = await params;

    const result = await refreshItemPrice(id);
    if (result.error === 'Item not found') {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    const updated = await db
      .select()
      .from(wishlistItems)
      .where(eq(wishlistItems.id, id))
      .limit(1);

    // A failed check is reported in the body (and stored on the item), not as a server error
    return NextResponse.json({
      success: result.ok,
      changed: result.changed,
      error: result.error,
      item: updated[0],
    });
  } catch (error) {
    console.error('Error refreshing price:', error);
    return NextResponse.json(
      { error: 'Failed to refresh price' },
      { status: 500 }
    );
  }
}
