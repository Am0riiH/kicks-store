import { useEffect, useRef } from 'react';
import { useProgress } from '@react-three/drei';
import { useScene } from '../context/SceneContext.jsx';

export default function ProgressBridge() {
  const { setLoadProgress } = useScene();
  const prev = useRef(-1);

  useEffect(() => {
    const unsubscribe = useProgress.subscribe((state) => {
      console.log(
        `[PROGRESS] item: ${state.item} | loaded: ${state.loaded} | total: ${state.total} | progress: ${state.progress.toFixed(2)}`
      );
      const rounded = Math.round(state.progress);
      if (rounded !== prev.current) {
        prev.current = rounded;
        setLoadProgress(rounded);
      }
    });

    const current = Math.round(useProgress.getState().progress);
    if (current !== prev.current) {
      prev.current = current;
      setLoadProgress(current);
    }

    return unsubscribe;
  }, [setLoadProgress]);

  return null;
}
