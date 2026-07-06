'use client';

import '@xyflow/react/dist/style.css';
import './canvas-skin.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type IsValidConnection,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import type { CanvasState, SourceView } from '@/lib/reading-room/canvas-types';
import { flowToPersisted, persistedToFlow } from '@/lib/reading-room/flow-map';
import { saveCanvasAction } from '@/lib/reading-room/actions';
import { CanvasContext } from './canvas-context';
import { SourceNode } from './source-node';
import { SynthesisNode } from './synthesis-node';
import { Toolbar, type SaveStatus } from './toolbar';
import { useColorMode } from './use-color-mode';
import styles from './canvas.module.css';

const nodeTypes: NodeTypes = {
  source: SourceNode,
  synthesis: SynthesisNode,
};

const AUTOSAVE_DELAY_MS = 800;

export function Canvas({
  roomId,
  sources,
  initialCanvas,
}: {
  roomId: string;
  sources: SourceView[];
  initialCanvas: CanvasState;
}) {
  const sourcesById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );

  const initialFlow = useMemo(
    () => persistedToFlow(initialCanvas, sourcesById),
    [initialCanvas, sourcesById],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    initialFlow.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    initialFlow.edges,
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const colorMode = useColorMode();

  // Read current nodes inside isValidConnection without making it a dependency.
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const isValidConnection = useCallback<IsValidConnection>((connection) => {
    const current = nodesRef.current;
    const source = current.find((node) => node.id === connection.source);
    const target = current.find((node) => node.id === connection.target);
    return source?.type === 'source' && target?.type === 'synthesis';
  }, []);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((existing) => addEdge(connection, existing)),
    [setEdges],
  );

  const addSourceNode = useCallback(
    (source: SourceView) => {
      setNodes((existing) => [
        ...existing,
        {
          id: crypto.randomUUID(),
          type: 'source',
          position: { x: 80, y: 80 + existing.length * 40 },
          data: { ref: { kind: 'source', id: source.id }, source },
        },
      ]);
    },
    [setNodes],
  );

  const addSynthesisNode = useCallback(() => {
    setNodes((existing) => [
      ...existing,
      {
        id: crypto.randomUUID(),
        type: 'synthesis',
        position: { x: 460, y: 120 },
        data: { prompt: '' },
      },
    ]);
  }, [setNodes]);

  const onPromptChange = useCallback(
    (nodeId: string, prompt: string) => {
      setNodes((existing) =>
        existing.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, prompt } }
            : node,
        ),
      );
    },
    [setNodes],
  );

  // Debounced autosave. Persist only refs + layout + graph, and only when the
  // persisted projection actually changed (ignores selection/hover churn).
  const lastSavedRef = useRef<string>(JSON.stringify(initialCanvas));
  useEffect(() => {
    const persisted = flowToPersisted(nodes, edges);
    const serialized = JSON.stringify(persisted);
    if (serialized === lastSavedRef.current) return;

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      const result = await saveCanvasAction(roomId, persisted);
      if (result.ok) {
        lastSavedRef.current = serialized;
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
      }
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [nodes, edges, roomId]);

  const isEmpty = nodes.length === 0;

  return (
    <CanvasContext.Provider value={{ onPromptChange }}>
      <div className={styles.wrapper}>
        <Toolbar
          sources={sources}
          onAddSource={addSourceNode}
          onAddSynthesis={addSynthesisNode}
          saveStatus={saveStatus}
        />
        {isEmpty ? (
          <div className={styles.hint}>
            <p className={styles.hintTitle}>Your synthesis canvas</p>
            Add a source and a synthesis node, then draw a connection from the
            source to feed the prompt.
          </div>
        ) : null}
        <div className={styles.canvas}>
          <ReactFlow
            className="slate-canvas"
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            nodeTypes={nodeTypes}
            colorMode={colorMode}
            proOptions={{ hideAttribution: true }}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
    </CanvasContext.Provider>
  );
}
