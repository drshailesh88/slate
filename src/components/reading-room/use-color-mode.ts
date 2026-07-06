'use client';

import { useEffect, useState } from 'react';
import type { ColorMode } from '@xyflow/react';

// Wire React Flow's colorMode to the app's data-theme attribute. The app
// defaults to Cool Slate (light); dark activates only when data-theme='dark' is
// set on <html>. Observed live so a theme flip re-skins the canvas immediately.
function readThemeMode(): ColorMode {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function useColorMode(): ColorMode {
  // This hook only runs client-side (the canvas is dynamically imported with
  // ssr:false), so the lazy initializer reads the real theme on first render.
  const [mode, setMode] = useState<ColorMode>(readThemeMode);

  useEffect(() => {
    const observer = new MutationObserver(() => setMode(readThemeMode()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return mode;
}
