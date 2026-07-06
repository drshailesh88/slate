import type { Edge, Node } from '@xyflow/react';
import type { CanvasState, CanvasNodeRef, SourceView } from './canvas-types';

// React Flow node data. `source` is hydrated at render time from a SourceView
// map and is NEVER serialized back — flowToPersisted drops it.
export type SourceNodeData = {
  ref: CanvasNodeRef;
  source: SourceView | null;
};

export type SynthesisNodeData = {
  prompt: string;
};

export type FlowNode =
  | (Node<SourceNodeData> & { type: 'source' })
  | (Node<SynthesisNodeData> & { type: 'synthesis' });

export function persistedToFlow(
  state: CanvasState,
  sourcesById: Map<string, SourceView>,
): { nodes: FlowNode[]; edges: Edge[] } {
  const nodes: FlowNode[] = state.nodes.map((node) => {
    if (node.type === 'source') {
      const source = node.ref ? (sourcesById.get(node.ref.id) ?? null) : null;
      return {
        id: node.id,
        type: 'source',
        position: node.position,
        data: {
          ref: node.ref ?? { kind: 'source', id: '' },
          source,
        },
      };
    }
    return {
      id: node.id,
      type: 'synthesis',
      position: node.position,
      data: { prompt: node.config.prompt ?? '' },
    };
  });

  const edges: Edge[] = state.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
  }));

  return { nodes, edges };
}

// Mirror of the server serializer: strip flow nodes down to type + position +
// FK + config. The hydrated `source` payload is intentionally not read.
export function flowToPersisted(nodes: Node[], edges: Edge[]): CanvasState {
  return {
    nodes: nodes.map((node) => {
      const data = (node.data ?? {}) as SourceNodeData & SynthesisNodeData;
      const isSource = node.type === 'source';
      return {
        id: node.id,
        type: isSource ? ('source' as const) : ('synthesis' as const),
        position: { x: node.position.x, y: node.position.y },
        ref:
          isSource && data.ref?.id ? { kind: 'source', id: data.ref.id } : null,
        config: !isSource && data.prompt ? { prompt: data.prompt } : {},
      };
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    })),
  };
}
