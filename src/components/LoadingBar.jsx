import { useRef, useEffect, useState } from 'react';
import { useScene } from '../context/SceneContext.jsx';

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function LoadingBar({ textRef }) {
  const { loadProgress, isSceneReady, sceneError } = useScene();
  const barRef = useRef();
  const [visible, setVisible] = useState(true);
  const [metrics, setMetrics] = useState({ width: 300, top: 0, left: 0 });

  const isIndeterminate = loadProgress < 0;

  const rawPct = isIndeterminate ? 0 : Math.min(100, Math.max(0, loadProgress));

  const maxPctRef = useRef(0);
  if (!isIndeterminate && rawPct > maxPctRef.current) {
    maxPctRef.current = rawPct;
  }

  const displayPct = isSceneReady ? 100 : maxPctRef.current;

  useEffect(() => {
    if ((isSceneReady || sceneError) && barRef.current) {
      barRef.current.style.transition = 'opacity 0.4s ease-out';
      barRef.current.style.opacity = '0';
      const timer = setTimeout(() => setVisible(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isSceneReady, sceneError]);

  useEffect(() => {
    if (!textRef?.current || !visible) return;

    const updateMetrics = () => {
      const rect = textRef.current.getBoundingClientRect();
      if (rect.width > 0) {
        const targetWidth = Math.max(180, Math.min(420, rect.width * 0.45));

        const targetLeft = rect.left + (rect.width - targetWidth) / 2;

        setMetrics({
          width: targetWidth,
          top: rect.bottom,
          left: targetLeft,
        });
      }
    };

    updateMetrics();

    const observer = new ResizeObserver(updateMetrics);

    observer.observe(textRef.current);
    observer.observe(document.body);

    window.addEventListener('watermark-update', updateMetrics);

    return () => {
      observer.disconnect();
      window.removeEventListener('watermark-update', updateMetrics);
    };
  }, [textRef, visible]);

  if (!visible) return null;

  return (
    <div
      ref={barRef}
      aria-hidden="true"
      className="pointer-events-none fixed z-30 flex flex-col gap-2"
      style={{
        width: metrics.width,
        top: metrics.top + 4,
        left: metrics.left,
      }}
    >
      <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: isIndeterminate ? '30%' : `${displayPct}%`,
            background: 'linear-gradient(90deg, rgba(220,38,38,0.4), #dc2626)',
            transition: isIndeterminate
              ? 'none'
              : REDUCED_MOTION
                ? 'width 0.3s linear'
                : 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            ...(isIndeterminate && !REDUCED_MOTION
              ? { animation: 'loadbar-shimmer 1.5s ease-in-out infinite' }
              : {}),
          }}
        />
      </div>

      <div className="relative h-6 w-full">
        <div
          className="absolute flex items-center justify-center pointer-events-none"
          style={{
            bottom: '4px',
            left: `${isIndeterminate ? 0 : displayPct}%`,
            transform: 'translateX(-50%)',
            transition: isIndeterminate
              ? 'none'
              : REDUCED_MOTION
                ? 'left 0.3s linear'
                : 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            ...(isIndeterminate && !REDUCED_MOTION
              ? { animation: 'loadbar-shimmer 1.5s ease-in-out infinite' }
              : {}),
          }}
        >
          <img
            src="/ui/sneaker-marker.webp"
            alt=""
            aria-hidden="true"
            className="w-[48px] h-auto drop-shadow-lg"
          />
        </div>

        <span
          className="absolute right-0 top-0 font-mono text-[0.6rem] uppercase tracking-[0.2em] tabular-nums"
          style={{ color: 'rgba(220,38,38,0.8)' }}
        >
          {isIndeterminate ? 'Initializing…' : `${displayPct}%`}
        </span>
      </div>

      <style>{`
        @keyframes loadbar-shimmer {
          0%, 100% { transform: translateX(0%); }
          50% { transform: translateX(230%); }
        }
      `}</style>
    </div>
  );
}
