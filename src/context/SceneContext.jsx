import { createContext, useContext, useRef, useState } from 'react';

// Holds refs that live inside the global, route-persistent <Canvas>
// so page components (Home.jsx) can reach in and GSAP-animate the
// actual Three.js objects without re-mounting the Canvas per route.
const SceneContext = createContext(null);

export function SceneProvider({ children }) {
  const shoeGroupRef = useRef();
  const [isModelLoaded, setModelLoaded] = useState(false);
  const value = { shoeGroupRef, isModelLoaded, setModelLoaded };
  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}


export function useScene() {
  const ctx = useContext(SceneContext);
  if (!ctx) throw new Error('useScene must be used inside SceneProvider');
  return ctx;
}
