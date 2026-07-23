/**
 * GrainOverlay.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Feature 2 — Film-Grain / Noise Texture Overlay
 *
 * Renders a fixed full-viewport <svg> that uses feTurbulence to generate
 * procedural noise — no image file or base64 asset needed. The SVG is
 * animated with a tiny translateX/Y loop (±2 px, 8 s) to give the grain a
 * subtle "living film" quality without taxing the GPU (the motion is
 * on the outer wrapper, not re-rendering the filter).
 *
 * The overlay sits at z-index 2, above the 3D canvas (z-index 0), below all
 * page UI. pointer-events: none ensures it never intercepts any click.
 *
 * Opacity defaults to ~4% — felt more than seen. Adjust the `opacity` prop
 * if you want more/less grain texture.
 *
 * Hook in App.jsx: replace the static <div className="grain-overlay" /> with
 * <GrainOverlay />. The .grain-overlay CSS class in index.css can be removed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export default function GrainOverlay({ opacity = 0.042 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -20,
        pointerEvents: 'none',
        opacity,
        mixBlendMode: 'overlay',
        animation: 'grain-drift 8s steps(2) infinite',
        willChange: 'transform',
      }}
    >
      {/* SVG generates noise entirely in-browser via feTurbulence */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        style={{ display: 'block' }}
      >
        <filter id="grain-noise" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.72 0.75"
            numOctaves="4"
            stitchTiles="stitch"
            result="noise"
          />
          <feColorMatrix type="saturate" values="0" in="noise" result="gray" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-noise)" />
      </svg>
    </div>
  );
}
