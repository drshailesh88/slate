// The persisted shape of a Reading Room synthesis canvas.
//
// The load-bearing invariant (anti-frankenstein doctrine §4): a canvas node is
// a REFERENCE, never a clone. It stores a type + a foreign key + layout, and
// NEVER a content payload. Deleting a canvas deletes an arrangement — never a
// Source. Source titles/authors are hydrated at render time by ID; they are not
// written back into the canvas row.

export type CanvasNodeKind = 'source' | 'synthesis';

// The foreign key a node points at. For a source card this is a `sources.id`.
// For a synthesis node there is no backing row in P0, so `ref` is null and the
// prompt lives in `config`.
export type CanvasNodeRef = {
  kind: 'source';
  id: string;
};

export type CanvasNodeConfig = {
  // Synthesis prompt text. Empty for source cards.
  prompt?: string;
};

export type CanvasNode = {
  id: string;
  type: CanvasNodeKind;
  position: { x: number; y: number };
  ref: CanvasNodeRef | null;
  config: CanvasNodeConfig;
};

export type CanvasEdge = {
  id: string;
  source: string;
  target: string;
};

export type CanvasState = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

export const EMPTY_CANVAS: CanvasState = { nodes: [], edges: [] };

// A plain, client-safe projection of a Library Source. The server hands these
// to the canvas so a Source card can render title/authors/venue by ID, WITHOUT
// pulling any server-only (db driver) code into the client bundle. This is a
// render-time hydration — it is never written back into the canvas row.
export type SourceView = {
  id: string;
  title: string;
  authors: string | null;
  venue: string | null;
  year: number | null;
};
