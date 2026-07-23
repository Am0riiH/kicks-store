import { forwardRef, useRef, useEffect } from 'react';
import { useGLTF, Environment, ContactShadows } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

/**
 * ShoeModel
 * Loads /models/air-jordan.glb and exposes a forwarded ref pointing at the
 * outer <group>. GSAP timelines in Home.jsx animate this group's
 * position / rotation / scale directly (GSAP can tween Object3D props
 * since they're plain numbers, not just DOM styles).
 */
const ShoeModel = forwardRef(function ShoeModel({ onLoad, ...props }, ref) {
  const { scene } = useGLTF('/models/air-jordan-draco.glb');
  const innerSpin = useRef();

  // gentle idle rotation on the inner mesh so the shoe never looks static,
  // independent of whatever GSAP is doing to the outer group
  useFrame((_, delta) => {
    if (innerSpin.current && !props.suspendIdleSpin) {
      innerSpin.current.rotation.y += delta * 0.25;
    }
  });

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Enable transparency so GSAP can fade it out later
        if (child.material) {
          child.material.transparent = true;
          child.material.needsUpdate = true;
        }
      }
    });
    if (onLoad) onLoad();
  }, [scene, onLoad]);

  return (
    <group ref={ref} {...props} dispose={null}>
      <group ref={innerSpin}>
        <primitive object={scene} scale={0.85} />
      </group>
      <ContactShadows position={[0, -0.9, 0]} opacity={0.5} scale={6} blur={2.4} far={2} />
      <Environment preset="city" />
    </group>
  );
});

useGLTF.preload('/models/air-jordan-draco.glb');

export default ShoeModel;
