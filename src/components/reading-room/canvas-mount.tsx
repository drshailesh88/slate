'use client';

import dynamic from 'next/dynamic';
import type { CanvasState, SourceView } from '@/lib/reading-room/canvas-types';

// React Flow reads window/DOM on mount, so it must not server-render. ssr:false
// is only allowed inside a Client Component under the App Router — hence this
// thin wrapper.
const Canvas = dynamic(() => import('./canvas').then((mod) => mod.Canvas), {
  ssr: false,
});

export function CanvasMount(props: {
  roomId: string;
  sources: SourceView[];
  initialCanvas: CanvasState;
}) {
  return <Canvas {...props} />;
}
