import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { readingRoomCanvas } from './schema';
import {
  EMPTY_CANVAS,
  type CanvasState,
} from '@/lib/reading-room/canvas-types';

export async function loadCanvas(roomId: string): Promise<CanvasState> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(readingRoomCanvas)
    .where(eq(readingRoomCanvas.roomId, roomId))
    .limit(1);

  if (!row) return EMPTY_CANVAS;
  return { nodes: row.nodes, edges: row.edges };
}

// Upsert layout + graph for a room. Only refs are stored (see canvas-types.ts);
// callers must serialize away any hydrated source payload before saving.
export async function saveCanvas(
  roomId: string,
  state: CanvasState,
): Promise<void> {
  const db = getDb();
  await db
    .insert(readingRoomCanvas)
    .values({
      roomId,
      nodes: state.nodes,
      edges: state.edges,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: readingRoomCanvas.roomId,
      set: {
        nodes: state.nodes,
        edges: state.edges,
        updatedAt: new Date(),
      },
    });
}
