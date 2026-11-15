import { forwardRef, useRef, useEffect } from 'react';
import { useGLTF, Environment, ContactShadows } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useScene } from '../context/SceneContext.jsx';

import { KTX2Loader } from 'three-stdlib';

const ShoeModel = forwardRef(function ShoeModel(
  { onLoad, enableShadows = true, enableContactShadows = true, ...props },
  ref
) {
  const gl = useThree((state) => state.gl);
  const modelUrl =
    new URLSearchParams(window.location.search).get('model') === 'simplified'
      ? '/models/air-jordan-simplified.glb'
      : '/models/air-jordan-draco.glb';
  const { scene } = useGLTF(modelUrl, true, true, (loader) => {
    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath('/basis/');
    ktx2Loader.detectSupport(gl);
    loader.setKTX2Loader(ktx2Loader);
  });
  const innerSpin = useRef();
  const { invalidate } = useThree();
  const { markSceneReady } = useScene();
  const hasSignalledReady = useRef(false);

  // Dev-only: expose R3F invalidate on window for external capture scripts
  useEffect(() => {
    if (import.meta.env.DEV) window.__invalidate = invalidate;
  }, [invalidate]);

  useFrame(() => {
    if (!hasSignalledReady.current) {
      hasSignalledReady.current = true;
      markSceneReady?.();
    }
  });

  useFrame((state, delta) => {
    if (innerSpin.current && !props.suspendIdleSpin) {
      innerSpin.current.rotation.y += delta * 0.25;

      state.invalidate();
    }
  });

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = enableShadows;
        child.receiveShadow = enableShadows;

        if (child.material) {
          child.material.transparent = true;
          child.material.needsUpdate = true;
        }
      }
    });
    if (onLoad) onLoad();
  }, [scene, onLoad, enableShadows]);

  return (
    <group ref={ref} {...props} dispose={null}>
      <group ref={innerSpin} name="innerSpin">
        <primitive object={scene} scale={0.85} />
      </group>

      {enableContactShadows && (
        <ContactShadows
          position={[0, -0.9, 0]}
          opacity={0.5}
          scale={6}
          blur={2.4}
          far={2}
        />
      )}
      <Environment files="/ui/potsdamer_platz_256.exr" />
    </group>
  );
});

export default ShoeModel;
