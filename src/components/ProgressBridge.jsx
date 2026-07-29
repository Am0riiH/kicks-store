import { useEffect, useRef } from 'react';
import { useProgress } from '@react-three/drei';
import { useScene } from '../context/SceneContext.jsx';

/**
 * ProgressBridge
 *
 * A zero-visual component that lives inside the R3F <Canvas> tree.
 * It reads drei's useProgress() (which reports real XHR/fetch progress
 * for GLB files) and pushes the percentage into SceneContext so that
 * DOM-layer components (LoadingBar) can display it.
 *
 * The useEffect wrapper is critical: useProgress triggers during the
 * React render phase, and calling setLoadProgress directly in render
 * would violate React's "no setState during render" rule. The useEffect
 * defers the state update to after the commit phase.
 *
 * Renders null — no geometry, no mesh, no overhead.
 */
export default function ProgressBridge() {
  const { progress } = useProgress();
  const { setLoadProgress } = useScene();
  const prev = useRef(-1);

  useEffect(() => {
    const rounded = Math.round(progress);
    if (rounded !== prev.current) {
      prev.current = rounded;
      setLoadProgress(rounded);
    }
  }, [progress, setLoadProgress]);

  return null;
}
