import { useRef, useEffect, useState } from 'react';
import { useScene } from '../context/SceneContext.jsx';

/**
 * LoadingBar
 *
 * A slim horizontal progress bar with a photo-real sneaker marker that travels
 * along it as the GLB model downloads.
 *
 * Position:
 *   Tracks the exact bounding box of the "AIR JORDAN" watermark (passed via textRef)
 *   so it perfectly underlines the wordmark.
 *
 * Progress source:
 *   loadProgress from SceneContext (-1 = canvas not mounted / indeterminate,
 *   0-100 = real XHR progress via drei's useProgress).
 */

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function LoadingBar({ textRef }) {
  const { loadProgress, isSceneReady, sceneError } = useScene();
  const barRef = useRef();
  const [visible, setVisible] = useState(true);
  const [metrics, setMetrics] = useState({ width: 300, top: 0, left: 0 });

  // Determine whether we're in indeterminate mode (canvas not mounted yet)
  const isIndeterminate = loadProgress < 0;
  // Clamp to 0-100
  const pct = isIndeterminate ? 0 : Math.min(100, Math.max(0, loadProgress));

  // Fade out and unmount when scene is ready or errored
  useEffect(() => {
    if ((isSceneReady || sceneError) && barRef.current) {
      // Fade out over 400ms, then unmount
      barRef.current.style.transition = 'opacity 0.4s ease-out';
      barRef.current.style.opacity = '0';
      const timer = setTimeout(() => setVisible(false), 420);
      return () => clearTimeout(timer);
    }
  }, [isSceneReady, sceneError]);

  // Track the text bounds to position the bar perfectly under it
  useEffect(() => {
    if (!textRef?.current || !visible) return;
    
    const updateMetrics = () => {
      const rect = textRef.current.getBoundingClientRect();
      if (rect.width > 0) {
        setMetrics({
          width: rect.width,
          top: rect.bottom, // Sit right at the baseline
          left: rect.left
        });
      }
    };
    
    // 1. Initial read
    updateMetrics();

    // 2. Track window resizes (which changes the clamp() font-size)
    const observer = new ResizeObserver(updateMetrics);
    // Observe both the text element and the window/body just to be safe
    observer.observe(textRef.current);
    observer.observe(document.body);

    // 3. Track the GSAP intro animation scaling
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
        top: metrics.top + 4, // 4px gap below baseline
        left: metrics.left,
      }}
    >
      {/* Track */}
      <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-white/10">
        {/* Fill bar */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: isIndeterminate ? '30%' : `${pct}%`,
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

      {/* Sneaker + percentage row */}
      <div className="relative h-6 w-full">
        {/* Sneaker marker that travels along the bar */}
        <div
          className="absolute flex items-center justify-center pointer-events-none"
          style={{
            bottom: '4px', // Sit perfectly on the bar
            left: `${isIndeterminate ? 0 : pct}%`,
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
          {/* Photo-real sneaker marker recovered from poster */}
          <img 
            src="/ui/sneaker-marker.webp" 
            alt="" 
            aria-hidden="true"
            className="w-[48px] h-auto drop-shadow-lg"
          />
        </div>
        {/* Percentage text */}
        <span
          className="absolute right-0 top-0 font-mono text-[0.6rem] uppercase tracking-[0.2em] tabular-nums"
          style={{ color: 'rgba(220,38,38,0.8)' }}
        >
          {isIndeterminate ? 'Initializing…' : `${pct}%`}
        </span>
      </div>

      {/* Keyframes for indeterminate shimmer */}
      <style>{`
        @keyframes loadbar-shimmer {
          0%, 100% { transform: translateX(0%); }
          50% { transform: translateX(230%); }
        }
      `}</style>
    </div>
  );
}
