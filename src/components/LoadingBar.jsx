import { useRef, useEffect, useState } from 'react';
import { useScene } from '../context/SceneContext.jsx';

/**
 * LoadingBar
 *
 * A slim horizontal progress bar with a sneaker silhouette that travels
 * along it as the GLB model downloads.  Positioned at the bottom of the
 * hero area, layered ON TOP of the poster image.
 *
 * Progress source:
 *   loadProgress from SceneContext (-1 = canvas not mounted / indeterminate,
 *   0–100 = real XHR progress via drei's useProgress → ProgressBridge).
 *
 * Lifecycle:
 *   - Visible immediately on mount.
 *   - When loadProgress === -1 (canvas still lazy-loading), shows a gentle
 *     indeterminate shimmer so it doesn't look frozen.
 *   - When loadProgress >= 0, switches to determinate mode and tracks the
 *     real download.
 *   - On completion (isSceneReady || sceneError), fades out via the parent
 *     (Home.jsx controls the fade-out to coordinate with the poster crossfade).
 *
 * All motion is pure CSS transform — no WebGL, no JS animation loops.
 */

/* ── Sneaker silhouette SVG (inline, no external asset) ─────────────────── */
function SneakerIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 18"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Simplified Air Jordan 1 high-top silhouette */}
      <path d="M6 16.5C6 16.5 5.5 14 5.5 12C5.5 10 6 8.5 6.5 7.5C7 6.5 8 5 9 4C10 3 11.5 2 13 1.5C14.5 1 16 1 17 1.5C18 2 18.5 3 19 4L20 5.5L22 5C23 4.8 24.5 4.5 26 5C27.5 5.5 28.5 6.5 29 7.5C29.5 8.5 30 10 30 11.5C30 13 29.5 14 29 15C28.5 16 28 16.5 28 16.5L6 16.5Z" />
      {/* Sole line */}
      <rect x="4" y="16" width="27" height="1.5" rx="0.75" />
    </svg>
  );
}

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function LoadingBar() {
  const { loadProgress, isSceneReady, sceneError } = useScene();
  const barRef = useRef();
  const [visible, setVisible] = useState(true);

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

  if (!visible) return null;

  return (
    <div
      ref={barRef}
      aria-hidden="true"
      className="pointer-events-none absolute z-30 left-0 right-0"
      style={{ bottom: '5.5rem' }}
    >
      <div className="mx-auto flex max-w-xs flex-col items-center gap-2 px-6 sm:max-w-sm">
        {/* Track */}
        <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-white/10">
          {/* Fill bar */}
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: isIndeterminate ? '30%' : `${pct}%`,
              background: 'linear-gradient(90deg, rgba(215,255,62,0.4), #D7FF3E)',
              transition: isIndeterminate
                ? 'none'
                : REDUCED_MOTION
                  ? 'width 0.3s linear'
                  : 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              // Indeterminate shimmer animation
              ...(isIndeterminate && !REDUCED_MOTION
                ? { animation: 'loadbar-shimmer 1.5s ease-in-out infinite' }
                : {}),
            }}
          />
        </div>

        {/* Sneaker + percentage row */}
        <div className="relative h-5 w-full">
          {/* Sneaker icon that travels along the bar */}
          <div
            className="absolute top-0 flex items-center gap-1"
            style={{
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
            <SneakerIcon className="h-3.5 w-auto text-volt drop-shadow-[0_0_4px_rgba(215,255,62,0.5)]" />
          </div>
          {/* Percentage text */}
          <span
            className="absolute right-0 top-0 font-mono text-[0.6rem] uppercase tracking-[0.2em] tabular-nums"
            style={{ color: 'rgba(215,255,62,0.6)' }}
          >
            {isIndeterminate ? 'Initializing…' : `${pct}%`}
          </span>
        </div>
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
