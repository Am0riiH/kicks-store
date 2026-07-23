import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { useScene } from '../context/SceneContext.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

gsap.registerPlugin(ScrollTrigger);

const API_BASE = 'http://localhost:3001';

export default function Home() {
  useDocumentTitle('Sneakers | Limited Drops');
  const { shoeGroupRef, isModelLoaded } = useScene();
  
  const [featuredProduct, setFeaturedProduct] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/products`)
      .then(res => res.json())
      .then(data => {
        if (data.products && data.products.length > 0) {
          setFeaturedProduct(data.products[0]);
        }
      })
      .catch(err => console.error('Error fetching featured product:', err));
  }, []);

  const containerRef = useRef();
  const heroTextRef = useRef();
  const scroll1Ref = useRef();
  const scroll2Ref = useRef();
  const scroll3Ref = useRef();
  const text1Ref = useRef();
  const text2Ref = useRef();
  const cardWrapRef = useRef();

  const introTl = useRef(null);
  const floatTween = useRef(null);

  useGSAP(
    () => {
      if (!isModelLoaded) return;
      const shoe = shoeGroupRef.current;
      if (!shoe) return;

      // ── Responsive breakpoint values captured once on mount ──
      const vw = window.innerWidth;
      const isMobile = vw < 640;
      const isTablet = vw >= 640 && vw < 1024;

      // Shoe scale targets: shrink on mobile so it never overflows
      const heroEndScale = isMobile ? 0.72 : 1;
      // Horizontal offsets for scroll sections (Option A: mobile stays centered)
      const s1x = isMobile ? 0 : isTablet ? -0.9 : -1.6;
      const s2x = isMobile ? 0 : isTablet ?  0.9 :  1.6;
      /* -----------------------------------------------------------
         PHASE 0 — Initial load / reload / logo click
         Giant backlit "AIR JORDAN" fills the screen then shrinks to
         a watermark, while the shoe drops from above, does a full
         360, lands center, then starts a continuous float loop.
      ----------------------------------------------------------- */
      function playIntro() {
        // Kill any rogue tweens (especially the "dock to corner" unmount tween triggered by React Strict Mode)
        gsap.killTweensOf(shoe.position);
        gsap.killTweensOf(shoe.rotation);
        gsap.killTweensOf(shoe.scale);

        floatTween.current?.kill();
        introTl.current?.kill();

        // reset starting state every time this replays (logo click)
        gsap.set(shoe.position, { x: 0, y: 6, z: 0 });
        gsap.set(shoe.rotation, { x: 0.2, y: 0, z: 0.1 });
        gsap.set(shoe.scale, { x: 0.01, y: 0.01, z: 0.01 });
        // The user wants it to start HUGE and shrink down to its watermark size
        gsap.set(heroTextRef.current, { scale: 3.0, opacity: 0, y: -140 });

        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        introTl.current = tl;

        // Shrink + fade-in the background text to its final watermark size
        tl.to(heroTextRef.current, {
          scale: 1.92,
          opacity: 0.10,
          duration: 1.3, // Matches the duration of the shoe drop
          ease: 'power3.out', // Smooth deceleration
        }, '<')
          // shoe: drop in + 360 spin + scale up, all simultaneous with the title shrink
          .to(
            shoe.position,
            { y: -0.8, duration: 1.3, ease: 'bounce.out' },
            '<'
          )
          .to(
            shoe.rotation,
            { y: `+=${Math.PI * 2}`, duration: 1.3, ease: 'power2.out' },
            '<'
          )
          .to(
            shoe.scale,
            { x: heroEndScale, y: heroEndScale, z: heroEndScale, duration: 1.1, ease: 'back.out(1.6)' },
            '<'
          )
          // settle, then kick off the perpetual float loop
          .call(() => {
            floatTween.current = gsap.to(shoe.position, {
              y: '+=0.18',
              duration: 1.6,
              ease: 'sine.inOut',
              yoyo: true,
              repeat: -1,
            });
          });
      }

      playIntro();

      /* -----------------------------------------------------------
         SCROLL 1 — shoe glides left, copy fades in on the right
      ----------------------------------------------------------- */
      ScrollTrigger.create({
        trigger: scroll1Ref.current,
        start: 'top 65%',
        end: 'bottom 35%',
        onEnter: () => {
          floatTween.current?.pause();
          gsap.to(shoe.position, { x: s1x, y: -0.4, duration: 1.2, ease: 'power3.inOut', overwrite: 'auto' });
          gsap.to(shoe.rotation, { y: '+=0.6', duration: 1.2, ease: 'power3.inOut', overwrite: 'auto' });
          gsap.to(text1Ref.current, { opacity: 1, x: 0, duration: 0.9, delay: 0.2, ease: 'power2.out', overwrite: 'auto' });
        },
        onLeaveBack: () => {
          gsap.to(text1Ref.current, { opacity: 0, x: 40, duration: 0.5, overwrite: 'auto' });
          gsap.to(shoe.position, { x: 0, y: -0.8, duration: 1.2, ease: 'power3.inOut', overwrite: 'auto', onComplete: () => floatTween.current?.resume() });
          gsap.to(shoe.rotation, { y: '-=0.6', duration: 1.2, ease: 'power3.inOut', overwrite: 'auto' });
        },
      });

      /* -----------------------------------------------------------
         SCROLL 2 — shoe glides right, copy fades in on the left
      ----------------------------------------------------------- */
      ScrollTrigger.create({
        trigger: scroll2Ref.current,
        start: 'top 65%',
        end: 'bottom 35%',
        onEnter: () => {
          gsap.to(shoe.position, { x: s2x, y: -0.4, duration: 1.2, ease: 'power3.inOut', overwrite: 'auto' });
          gsap.to(shoe.rotation, { y: '+=0.6', duration: 1.2, ease: 'power3.inOut', overwrite: 'auto' });
          gsap.to(text1Ref.current, { opacity: 0, x: -40, duration: 0.5, overwrite: 'auto' });
          gsap.to(text2Ref.current, { opacity: 1, x: 0, duration: 0.9, delay: 0.2, ease: 'power2.out', overwrite: 'auto' });
        },
        onLeaveBack: () => {
          gsap.to(text2Ref.current, { opacity: 0, x: -40, duration: 0.5, overwrite: 'auto' });
          gsap.to(text1Ref.current, { opacity: 1, x: 0, duration: 0.5, overwrite: 'auto' });
          gsap.to(shoe.position, { x: s1x, y: -0.4, duration: 1, overwrite: 'auto' });
          gsap.to(shoe.rotation, { y: '-=0.6', duration: 1, overwrite: 'auto' });
        },
      });

      /* -----------------------------------------------------------
         SCROLL 3 — product card appears, shoe docks beside/inside it
      ----------------------------------------------------------- */
      ScrollTrigger.create({
        trigger: scroll3Ref.current,
        start: 'top 60%',
        end: 'bottom 40%',
        onEnter: () => {
          // Extract materials to fade the shoe out
          const materials = [];
          shoe.traverse((child) => {
            if (child.isMesh && child.material) materials.push(child.material);
          });

          gsap.to(text2Ref.current, { opacity: 0, x: -40, duration: 0.4, overwrite: 'auto' });

          // Shoe gets pulled into the product card: move to card center (x: 0, y: -0.8), shrink to 0, fade out
          gsap.to(shoe.position, { x: 0, y: -0.8, duration: 1.0, ease: 'back.in(1.2)', overwrite: 'auto' });
          gsap.to(shoe.rotation, { y: '+=1', duration: 1.0, ease: 'power2.in', overwrite: 'auto' });
          gsap.to(shoe.scale, { x: 0, y: 0, z: 0, duration: 1.0, ease: 'back.in(1.2)', overwrite: 'auto' });
          gsap.to(materials, { opacity: 0, duration: 1.0, ease: 'power2.in', overwrite: 'auto' });

          // Card fades in a beat AFTER the shoe is 50% shrunk (delay 0.5s)
          gsap.fromTo(
            cardWrapRef.current,
            { opacity: 0, y: 50, scale: 0.8 },
            { opacity: 1, y: 0, scale: 1, duration: 0.8, delay: 0.5, ease: 'back.out(1.4)', overwrite: 'auto' }
          );
        },
        onLeaveBack: () => {
          const materials = [];
          shoe.traverse((child) => {
            if (child.isMesh && child.material) materials.push(child.material);
          });

          // Card shrinks and fades away
          gsap.to(cardWrapRef.current, { opacity: 0, y: 50, scale: 0.8, duration: 0.4, ease: 'power2.inOut', overwrite: 'auto' });

          // Previous text fades back in
          gsap.to(text2Ref.current, { opacity: 1, x: 0, duration: 0.5, delay: 0.4, overwrite: 'auto' });

          // Shoe grows back out from the card's position back to Scroll 2 state
          gsap.to(materials, { opacity: 1, duration: 0.9, delay: 0.3, ease: 'back.out(1.2)', overwrite: 'auto' });
          gsap.to(shoe.position, { x: 1.6, y: -0.4, duration: 0.9, delay: 0.3, ease: 'back.out(1.2)', overwrite: 'auto' });
          gsap.to(shoe.rotation, { y: '-=1', duration: 0.9, delay: 0.3, ease: 'power2.out', overwrite: 'auto' });
          gsap.to(shoe.scale, { x: 1, y: 1, z: 1, duration: 0.9, delay: 0.3, ease: 'back.out(1.2)', overwrite: 'auto' });
        },
      });

      // replay Phase 0 whenever the Nike logo is clicked
      const onReplay = () => {
        if (window.lenis) {
          window.lenis.scrollTo(0, { duration: 1.5 });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        playIntro();
      };
      window.addEventListener('replay-intro', onReplay);

      // Force GSAP to recalculate positions to sync with Lenis
      ScrollTrigger.refresh();

      return () => {
        window.removeEventListener('replay-intro', onReplay);
      };
    },
    { scope: containerRef, dependencies: [isModelLoaded] }
  );

  // when navigating away from Home, dock the shoe into a small corner
  // idle state so it keeps "persisting" sensibly on other routes
  useEffect(() => {
    return () => {
      const shoe = shoeGroupRef.current;
      floatTween.current?.kill();
      introTl.current?.kill();
      if (shoe) {
        gsap.to(shoe.position, { x: 1.3, y: -0.6, z: 0, duration: 0.8, ease: 'power2.inOut' });
        gsap.to(shoe.scale, { x: 0.55, y: 0.55, z: 0.55, duration: 0.8 });
        gsap.to(shoe.rotation, { y: '+=1.2', duration: 1.4, ease: 'power1.inOut' });
      }
    };
  }, [shoeGroupRef]);

  return (
    <div ref={containerRef} className="relative">
      {/* ---------------- HERO / PHASE 0 ---------------- */}
      <section className="relative flex h-screen items-center justify-center overflow-hidden">
        {/* SVG Filter for the "stained / smudged" text effect */}
        <svg className="absolute w-0 h-0">
          <filter id="stain-filter">
            <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" result="smudged" />
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 3 -0.5" in="noise" result="coloredNoise" />
            <feComposite operator="in" in="smudged" in2="coloredNoise" />
          </filter>
        </svg>

        {/* Real h1 for screen readers and crawlers — visually hidden.
            The decorative "AIR JORDAN" watermark below is aria-hidden. */}
        <h1 className="sr-only">Sneakers — Latest Drops</h1>

        {/* Decorative watermark — purely visual, excluded from a11y tree */}
        <span
          ref={heroTextRef}
          aria-hidden="true"
          className="font-display select-none whitespace-nowrap text-center uppercase leading-none text-volt absolute -z-10"
          style={{ fontSize: 'clamp(3rem, 16vw, 14rem)', filter: 'url(#stain-filter)' }}
        >
          AIR JORDAN
        </span>
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 font-mono text-xs uppercase tracking-[0.3em] text-smoke">
          Scroll to explore ↓
        </div>
      </section>

      {/* ---------------- SCROLL 1 : shoe left / copy right ---------------- */}
      {/* On mobile (Option A): shoe stays centered, text sinks to bottom half */}
      <section ref={scroll1Ref} className="relative z-10 flex min-h-screen items-end sm:items-center px-6 sm:px-16 pb-16 sm:pb-0">
        <div
          className="scroll-text-mobile sm:mt-0 w-full max-w-md mx-auto sm:mx-0 sm:ml-auto"
          ref={text1Ref}
          style={{ opacity: 0, transform: 'translateX(40px)' }}
        >
          <span className="font-mono text-xs uppercase tracking-widest text-volt">Silhouette 01</span>
          <h2 className="mt-3 font-display text-4xl sm:text-5xl uppercase leading-[0.95] text-bone">
            Chicago
            <br />
            Colorway
          </h2>
          <p className="mt-5 text-sm sm:text-base leading-relaxed text-smoke">
            The Air Jordan 1 Retro High rewrote what a basketball shoe could mean off the court.
            Full-grain leather upper, that unmistakable wings logo, and the block colorway
            that started the entire sneaker culture movement.
          </p>
        </div>
      </section>

      {/* ---------------- SCROLL 2 : shoe right / copy left ---------------- */}
      {/* On mobile (Option A): shoe stays centered, text sinks to bottom half */}
      <section ref={scroll2Ref} className="relative z-10 flex min-h-screen items-end sm:items-center px-6 sm:px-16 pb-16 sm:pb-0">
        <div
          className="scroll-text-mobile sm:mt-0 w-full max-w-md mx-auto sm:mx-0"
          ref={text2Ref}
          style={{ opacity: 0, transform: 'translateX(-40px)' }}
        >
          <span className="font-mono text-xs uppercase tracking-widest text-volt">Under the hood</span>
          <h2 className="mt-3 font-display text-4xl sm:text-5xl uppercase leading-[0.95] text-bone">
            Built to
            <br />
            Last
          </h2>
          <ul className="mt-5 flex flex-col gap-3 text-sm sm:text-base text-smoke">
            <li>— Full-grain leather + perforated toe box for breathability</li>
            <li>— Encapsulated Air-Sole unit for lightweight impact protection</li>
            <li>— Solid rubber outsole with classic herringbone traction</li>
            <li>— Padded collar for that signature ankle lockdown</li>
          </ul>
        </div>
      </section>

      {/* ---------------- SCROLL 3 : product card reveal ---------------- */}
      <section
        ref={scroll3Ref}
        className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-24"
      >
        <div className="text-center px-4">
          <span className="font-mono text-xs uppercase tracking-widest text-volt">Own it</span>
          <h2 className="mt-3 font-display text-3xl sm:text-5xl uppercase text-bone">Ready to Drop</h2>
        </div>
        <div ref={cardWrapRef} style={{ opacity: 0 }} className="w-full max-w-sm px-4 sm:px-0">
          {featuredProduct ? (
            <ProductCard product={featuredProduct} featured />
          ) : (
            <div className="animate-pulse flex flex-col gap-4 border border-white/10 bg-white/5 p-6 rounded-xl h-[400px]">
              <div className="bg-white/10 h-48 w-full rounded-xl"></div>
              <div className="bg-white/10 h-6 w-3/4 rounded mt-4"></div>
              <div className="bg-white/10 h-4 w-1/2 rounded"></div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
