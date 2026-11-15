import {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
} from 'react';

// Holds refs that live inside the global, route-persistent <Canvas>

export const SceneContext = createContext(null);

export function SceneProvider({ children }) {
  const shoeGroupRef = useRef();
  const [isModelLoaded, setModelLoaded] = useState(false);

  const [isSceneReady, setSceneReady] = useState(false);

  const [sceneError, setSceneError] = useState(null);

  const [loadProgress, setLoadProgress] = useState(-1);

  const markSceneReady = useCallback(() => setSceneReady(true), []);

  useEffect(() => {
    if (import.meta.env.DEV && isModelLoaded && shoeGroupRef.current) {
      window.__isModelLoaded = true;
      window.__shoeGroup = shoeGroupRef.current;
    }
  }, [isModelLoaded]);

  const value = {
    shoeGroupRef,
    isModelLoaded,
    setModelLoaded,
    isSceneReady,
    markSceneReady,
    sceneError,
    setSceneError,
    loadProgress,
    setLoadProgress,
  };
  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}

export function useScene() {
  const ctx = useContext(SceneContext);
  if (!ctx) throw new Error('useScene must be used inside SceneProvider');
  return ctx;
}
