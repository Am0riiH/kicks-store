import { Canvas } from '@react-three/fiber';
import { Suspense, useState, useEffect } from 'react';
import ShoeModel from './ShoeModel.jsx';
import ProgressBridge from './ProgressBridge.jsx';
import { useScene } from '../context/SceneContext.jsx';

function getResponsiveFov(width) {
  if (width < 640) return 55;
  if (width < 1024) return 45;
  return 40;
}

const isMobile = window.innerWidth <= 768;

export default function SceneCanvas() {
  const { shoeGroupRef, setModelLoaded, isSceneReady } = useScene();
  const [fov, setFov] = useState(() => getResponsiveFov(window.innerWidth));

  useEffect(() => {
    window.__isSceneReady = isSceneReady;
  }, [isSceneReady]);

  useEffect(() => {
    const onResize = () => setFov(getResponsiveFov(window.innerWidth));
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div
      id="scene-canvas-wrapper"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0,
      }}
    >
      <Canvas
        frameloop="demand"
        shadows={!isMobile}
        dpr={isMobile ? [1, 1.5] : [1, 2]}
        camera={{ position: [0, 0, 6], fov }}
        gl={{ antialias: !isMobile, alpha: true }}
      >
        <ambientLight intensity={0.8} />

        <directionalLight position={[4, 6, 4]} intensity={1.4} castShadow={!isMobile} />
        <spotLight
          position={[-4, 3, -2]}
          angle={0.4}
          penumbra={1}
          intensity={0.8}
          color="#D7FF3E"
        />

        <ProgressBridge />

        <Suspense fallback={null}>
          <ShoeModel
            ref={shoeGroupRef}
            onLoad={() => setModelLoaded(true)}
            position={[0, 6, -1]}
            rotation={[0, 1, 0]}
            scale={1.26}
            enableShadows={!isMobile}
            enableContactShadows={!isMobile}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
