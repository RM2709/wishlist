import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, wishlistItems } from '@/lib/db';
import { verifyAccessToken } from '@/lib/auth/utils';

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
    const body = await request.json();
    const { newSortOrder } = body;

    if (newSortOrder === undefined || typeof newSortOrder !== 'number') {
      return NextResponse.json(
        { error: 'newSortOrder is required and must be a number' },
        { status: 400 }
      );
    }

    // Validate newSortOrder is not negative
    if (newSortOrder < 0) {
      return NextResponse.json(
        { error: 'newSortOrder must be a non-negative number' },
        { status: 400 }
      );
    }

    // Check if item exists
    const existingItem = await db
      .select()
      .from(wishlistItems)
      .where(eq(wishlistItems.id, id))
      .limit(1);

    if (existingItem.length === 0) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    const movingItem = existingItem[0];
    const wishlistId = movingItem.wishlistId;

    // Items are displayed priority-first, then by manual sortOrder, and
    // newSortOrder is an index into that displayed list. An item can only be
    // moved within its own group (priority or regular).
    const allItems = await db
      .select()
      .from(wishlistItems)
      .where(eq(wishlistItems.wishlistId, wishlistId))
      .orderBy(wishlistItems.sortOrder);

    // Validate newSortOrder is within bounds
    if (newSortOrder >= allItems.length) {
      return NextResponse.json(
        { error: `newSortOrder must be less than ${allItems.length}` },
        { status: 400 }
      );
    }

    const priorityCount = allItems.filter((item) => item.isPriority).length;
    const groupOffset = movingItem.isPriority ? 0 : priorityCount;
    const group = allItems.filter((item) => item.isPriority === movingItem.isPriority);
    const targetIndex = newSortOrder - groupOffset;

    if (targetIndex < 0 || targetIndex >= group.length) {
      return NextResponse.json(
        { error: 'Items cannot be moved across the priority boundary' },
        { status: 400 }
      );
    }

    const currentIndex = group.findIndex((item) => item.id === id);

    // Safety check: ensure item was found in its group
    if (currentIndex === -1) {
      console.error(`Item ${id} not found in wishlist items array`);
      return NextResponse.json(
        { error: 'Item not found in wishlist' },
        { status: 500 }
      );
    }

    // Skip if no change needed
    if (currentIndex === targetIndex) {
      return NextResponse.json({
        success: true,
        item: movingItem,
      });
    }

    // Move the item within its group
    group.splice(currentIndex, 1);
    group.splice(targetIndex, 0, movingItem);

    // Put the reordered group back into the slots it occupied, so the other
    // group (and the item's place if priority is later toggled off) is untouched
    let groupCursor = 0;
    const reordered = allItems.map((item) =>
      item.isPriority === movingItem.isPriority ? group[groupCursor++] : item
    );

    // Update all sortOrders in a transaction for atomicity
    // Note: better-sqlite3 is synchronous, so the transaction callback must not be async
    const updatedItem = db.transaction((tx) => {
      // Update all sortOrders
      for (let i = 0; i < reordered.length; i++) {
        tx
          .update(wishlistItems)
          .set({
            sortOrder: i,
            updatedAt: new Date(),
          })
          .where(eq(wishlistItems.id, reordered[i].id))
          .run();
      }

      // Get the updated moving item
      const result = tx
        .select()
        .from(wishlistItems)
        .where(eq(wishlistItems.id, id))
        .limit(1)
        .all();

      return result[0];
    });

    return NextResponse.json({
      success: true,
      item: updatedItem,
    });
  } catch (error) {
    console.error('Error reordering item:', error);
    return NextResponse.json(
      { error: 'Failed to reorder item' },
      { status: 500 }
    );
  }
}
