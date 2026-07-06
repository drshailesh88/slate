'use client';

import { createContext, useContext } from 'react';

// Lets the synthesis node update its prompt without stuffing a callback into
// node.data (which would then need stripping before persistence). Node data
// stays purely serializable; behavior comes from context.
type CanvasContextValue = {
  onPromptChange: (nodeId: string, prompt: string) => void;
};

export const CanvasContext = createContext<CanvasContextValue | null>(null);

export function useCanvasContext(): CanvasContextValue {
  const value = useContext(CanvasContext);
  if (!value) {
    throw new Error('useCanvasContext must be used within a Canvas provider.');
  }
  return value;
}
