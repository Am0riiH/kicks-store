import { Canvas } from '@react-three/fiber';
import { Suspense, useState, useEffect } from 'react';
import ShoeModel from './ShoeModel.jsx';
import { useScene } from '../context/SceneContext.jsx';

/**
 * The ONE 3D canvas for the whole app. Mounted once in App.jsx, outside
 * <Routes>, so it never unmounts on navigation. Fixed + pointer-events:none
 * so it sits behind every page as ambient scenery, while GSAP (driven from
 * Home.jsx) reaches into shoeGroupRef to choreograph the shoe.
 *
 * Camera FOV is responsive: wider on mobile so the shoe never appears cropped.
 *   mobile  (<640px)   → fov 55
 *   tablet  (640-1023) → fov 45
 *   desktop (1024px+)  → fov 40
 */

function getResponsiveFov(width) {
  if (width < 640)  return 55;
  if (width < 1024) return 45;
  return 40;
}

export default function SceneCanvas() {
  const { shoeGroupRef, setModelLoaded } = useScene();
  const [fov, setFov] = useState(() => getResponsiveFov(window.innerWidth));

  useEffect(() => {
    const onResize = () => setFov(getResponsiveFov(window.innerWidth));
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0, 6], fov }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 6, 4]} intensity={1.4} castShadow />
        <spotLight position={[-4, 3, -2]} angle={0.4} penumbra={1} intensity={0.8} color="#D7FF3E" />

        <Suspense fallback={null}>
          {/* start off-screen top; Phase 0 GSAP timeline drops it in */}
          <ShoeModel ref={shoeGroupRef} onLoad={() => setModelLoaded(true)} position={[0, 6, -1]} rotation={[0, 1, 0]} scale={1.26} />
        </Suspense>
      </Canvas>
    </div>
  );
}
