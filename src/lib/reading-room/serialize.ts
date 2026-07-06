import type { CanvasEdge, CanvasNode, CanvasState } from './canvas-types';

// The boundary that enforces reference-not-clone. Whatever shape a client sends,
// only these keys survive to the database: a type + position + FK + config.
// Any hydrated source payload (title/authors/venue) is dropped here.

function toPersistedNode(input: unknown): CanvasNode | null {
  if (typeof input !== 'object' || input === null) return null;
  const node = input as Record<string, unknown>;

  const id = node.id;
  const type = node.type;
  const position = node.position as Record<string, unknown> | undefined;

  if (typeof id !== 'string') return null;
  if (type !== 'source' && type !== 'synthesis') return null;
  if (
    !position ||
    typeof position.x !== 'number' ||
    typeof position.y !== 'number'
  ) {
    return null;
  }

  const rawRef = node.ref as Record<string, unknown> | null | undefined;
  const ref =
    rawRef && rawRef.kind === 'source' && typeof rawRef.id === 'string'
      ? { kind: 'source' as const, id: rawRef.id }
      : null;

  const rawConfig = node.config as Record<string, unknown> | undefined;
  const config =
    rawConfig && typeof rawConfig.prompt === 'string'
      ? { prompt: rawConfig.prompt }
      : {};

  return {
    id,
    type,
    position: { x: position.x, y: position.y },
    ref,
    config,
  };
}

function toPersistedEdge(input: unknown): CanvasEdge | null {
  if (typeof input !== 'object' || input === null) return null;
  const edge = input as Record<string, unknown>;
  if (
    typeof edge.id !== 'string' ||
    typeof edge.source !== 'string' ||
    typeof edge.target !== 'string'
  ) {
    return null;
  }
  return { id: edge.id, source: edge.source, target: edge.target };
}

export function toPersistedCanvas(input: {
  nodes: unknown[];
  edges: unknown[];
}): CanvasState {
  return {
    nodes: input.nodes.map(toPersistedNode).filter(isCanvasNode),
    edges: input.edges.map(toPersistedEdge).filter(isCanvasEdge),
  };
}

function isCanvasNode(node: CanvasNode | null): node is CanvasNode {
  return node !== null;
}

function isCanvasEdge(edge: CanvasEdge | null): edge is CanvasEdge {
  return edge !== null;
}
