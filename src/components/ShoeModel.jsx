import { forwardRef, useRef, useEffect } from 'react';
import { useGLTF, Environment, ContactShadows } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useScene } from '../context/SceneContext.jsx';

/**
 * ShoeModel
 * Loads /models/air-jordan-draco.glb and exposes a forwarded ref pointing at the
 * outer <group>. GSAP timelines in Home.jsx animate this group's
 * position / rotation / scale directly (GSAP can tween Object3D props
 * since they're plain numbers, not just DOM styles).
 *
 * Props:
 *   enableShadows        (bool, default true)  — when false, skips setting
 *                        castShadow/receiveShadow on mesh materials. Pass false
 *                        on mobile where the Canvas shadow map is disabled anyway,
 *                        to avoid any traversal overhead for a no-op flag.
 *
 *   enableContactShadows (bool, default true)  — when false, skips rendering
 *                        the ContactShadows component entirely. ContactShadows is
 *                        a multi-pass screen-space blur that runs every frame;
 *                        omitting it on mobile removes a full extra render pass.
 */
const ShoeModel = forwardRef(function ShoeModel(
  { onLoad, enableShadows = true, enableContactShadows = true, ...props },
  ref,
) {
  const { scene } = useGLTF('/models/air-jordan-draco.glb');
  const innerSpin = useRef();
  const { invalidate } = useThree();
  const { markSceneReady } = useScene();
  const hasSignalledReady = useRef(false);

  // Dev-only: expose R3F invalidate on window for external capture scripts
  useEffect(() => {
    if (import.meta.env.DEV) window.__invalidate = invalidate;
  }, [invalidate]);

  // Wait one frame after load so the GPU has actually rendered the model
  // before signalling that the scene is ready for crossfade
  useFrame(() => {
    if (!hasSignalledReady.current) {
      hasSignalledReady.current = true;
      markSceneReady?.();
    }
  });

  // Gentle idle rotation — independent of GSAP's outer-group animations.
  //
  // frameloop="demand" note: in demand mode, useFrame only fires when a frame
  // is actually rendered; it does NOT self-schedule the next frame. Calling
  // state.invalidate() here schedules the next RAF, creating a self-perpetuating
  // loop that is functionally equivalent to frameloop="always" while the spin is
  // active. The real benefit of demand mode materialises when suspendIdleSpin is
  // set to true (e.g. during GSAP scroll animations) — at that point, no
  // invalidate() fires from here, and only GSAP's onUpdate callbacks need to
  // trigger frames, reducing GPU work to exactly one render per tween step.
  useFrame((state, delta) => {
    if (innerSpin.current && !props.suspendIdleSpin) {
      innerSpin.current.rotation.y += delta * 0.25;
      // Schedule the next frame so the spin keeps running in demand mode.
      state.invalidate();
    }
  });

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        // Only enable shadow casting/receiving when the Canvas shadow map is
        // active (desktop). On mobile these flags are no-ops anyway since
        // shadows={false} is set on <Canvas>, but skipping them avoids any
        // traversal-time overhead for a flag that has no effect.
        child.castShadow = enableShadows;
        child.receiveShadow = enableShadows;
        // Enable transparency so GSAP can fade it out later
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
      {/*
        ContactShadows is a multi-pass screen-space effect (renders a
        downward-facing camera, blurs the result) — it runs every frame
        regardless of the Canvas `shadows` prop. Skip it entirely on mobile
        to eliminate a full extra render pass per frame.
      */}
      {enableContactShadows && (
        <ContactShadows position={[0, -0.9, 0]} opacity={0.5} scale={6} blur={2.4} far={2} />
      )}
      <Environment preset="city" />
    </group>
  );
});

useGLTF.preload('/models/air-jordan-draco.glb');

export default ShoeModel;
