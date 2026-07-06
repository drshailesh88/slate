'use server';

import { saveCanvas } from '@/lib/db/canvas';
import { toPersistedCanvas } from './serialize';

export async function saveCanvasAction(
  roomId: string,
  state: { nodes: unknown[]; edges: unknown[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof roomId !== 'string' || roomId.length === 0) {
    return { ok: false, error: 'A roomId is required to save a canvas.' };
  }
  if (!Array.isArray(state?.nodes) || !Array.isArray(state?.edges)) {
    return {
      ok: false,
      error: 'Canvas state must have nodes and edges arrays.',
    };
  }

  try {
    await saveCanvas(roomId, toPersistedCanvas(state));
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, error: `Failed to save canvas: ${message}` };
  }
}
