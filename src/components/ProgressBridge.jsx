import { useEffect, useRef } from 'react';
import { useProgress } from '@react-three/drei';
import { useScene } from '../context/SceneContext.jsx';

/**
 * ProgressBridge
 *
 * A zero-visual component that lives inside the R3F <Canvas> tree.
 * It reads drei's useProgress store and pushes the percentage into
 * SceneContext so DOM-layer components (LoadingBar) can display it.
 *
 * IMPORTANT: We subscribe to the raw zustand store imperatively rather
 * than using `useProgress()` as a React hook. Using the hook would cause
 * this component to re-render when the store updates, and zustand's
 * `useSyncExternalStore` can fire those re-renders synchronously during
 * the render phase of OTHER R3F components (like EnvironmentCube), which
 * triggers React's "Cannot update a component while rendering a different
 * component" warning. By subscribing imperatively in useEffect, we avoid
 * participating in React's render cycle entirely.
 *
 * Renders null — no geometry, no mesh, no overhead.
 */
export default function ProgressBridge() {
  const { setLoadProgress } = useScene();
  const prev = useRef(-1);

  useEffect(() => {
    // useProgress is also the zustand store itself — it exposes .subscribe()
    // and .getState() as a vanilla zustand store.
    const unsubscribe = useProgress.subscribe((state) => {
      console.log(`[PROGRESS] item: ${state.item} | loaded: ${state.loaded} | total: ${state.total} | progress: ${state.progress.toFixed(2)}`);
      const rounded = Math.round(state.progress);
      if (rounded !== prev.current) {
        prev.current = rounded;
        setLoadProgress(rounded);
      }
    });

    // Push current value immediately (in case loading already started)
    const current = Math.round(useProgress.getState().progress);
    if (current !== prev.current) {
      prev.current = current;
      setLoadProgress(current);
    }

    return unsubscribe;
  }, [setLoadProgress]);

  return null;
}
