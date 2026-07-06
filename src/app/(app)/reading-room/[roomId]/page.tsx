import { CanvasMount } from '@/components/reading-room/canvas-mount';
import { loadCanvas } from '@/lib/db/canvas';
import { ensureStubSources, listSources } from '@/lib/db/sources';
import type { SourceView } from '@/lib/reading-room/canvas-types';
import type { Source } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

function toSourceView(source: Source): SourceView {
  return {
    id: source.id,
    title: source.title,
    authors: source.authors,
    venue: source.venue,
    year: source.year,
  };
}

export default async function ReadingRoomCanvasPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  // P0 stub: the Library owns Sources; here we seed a few so a card references
  // something real by ID. Idempotent.
  await ensureStubSources();
  const sources = (await listSources()).map(toSourceView);
  const initialCanvas = await loadCanvas(roomId);

  return (
    <CanvasMount
      roomId={roomId}
      sources={sources}
      initialCanvas={initialCanvas}
    />
  );
}
