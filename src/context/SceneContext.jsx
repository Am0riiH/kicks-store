import { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';

// Holds refs that live inside the global, route-persistent <Canvas>
// so page components (Home.jsx) can reach in and GSAP-animate the
// actual Three.js objects without re-mounting the Canvas per route.
export const SceneContext = createContext(null);

export function SceneProvider({ children }) {
  const shoeGroupRef = useRef();
  const [isModelLoaded, setModelLoaded] = useState(false);

  // isSceneReady = model loaded AND the renderer has painted at least one
  // frame with the shoe in it.  This is the gate for the poster→3D crossfade
  // — swapping on isModelLoaded alone can flash an empty canvas for 1-2 frames.
  const [isSceneReady, setSceneReady] = useState(false);

  // If the dynamic import for SceneCanvas fails, or WebGL/GLTF load errors,
  // the error boundary sets this.  Home.jsx checks it and keeps the poster.
  const [sceneError, setSceneError] = useState(null);

  // Real GLB download progress (0–100), written by ProgressBridge inside the
  // R3F tree and read by the DOM-based LoadingBar in Home.jsx.
  // -1 = canvas not mounted yet (indeterminate), 0–99 = downloading, 100 = done.
  const [loadProgress, setLoadProgress] = useState(-1);

  const markSceneReady = useCallback(() => setSceneReady(true), []);

  // Dev-only: expose refs on window for external tooling (Puppeteer capture scripts)
  useEffect(() => {
    if (import.meta.env.DEV && isModelLoaded && shoeGroupRef.current) {
      window.__isModelLoaded = true;
      window.__shoeGroup = shoeGroupRef.current;
    }
  }, [isModelLoaded]);

  const value = {
    shoeGroupRef,
    isModelLoaded, setModelLoaded,
    isSceneReady, markSceneReady,
    sceneError, setSceneError,
    loadProgress, setLoadProgress,
  };
  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}


export function useScene() {
  const ctx = useContext(SceneContext);
  if (!ctx) throw new Error('useScene must be used inside SceneProvider');
  return ctx;
}
