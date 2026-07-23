import { useEffect } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function useSmoothScroll() {
  useEffect(() => {
    // 1. Initialize Lenis with premium feel settings
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // smooth exponential easing
      direction: 'vertical',
      gestureDirection: 'vertical',
      smooth: true,
      mouseMultiplier: 1,
      smoothTouch: false, // leave native scroll on touch devices usually feels better
      touchMultiplier: 2,
    });

    // Make lenis globally accessible for programmatic scroll (e.g. from Home.jsx)
    window.lenis = lenis;

    // 2. Sync Lenis scroll with GSAP ScrollTrigger
    lenis.on('scroll', ScrollTrigger.update);

    // 3. Sync GSAP ticker with Lenis raf
    const updateLenis = (time) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(updateLenis);

    // 4. Disable lag smoothing in GSAP to prevent desync
    gsap.ticker.lagSmoothing(0);

    return () => {
      // Cleanup
      gsap.ticker.remove(updateLenis);
      lenis.destroy();
      delete window.lenis;
    };
  }, []);
}
