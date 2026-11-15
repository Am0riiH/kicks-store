import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { useScene } from '../context/SceneContext.jsx';
import ProductCard from '../components/ProductCard.jsx';
import LoadingBar from '../components/LoadingBar.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { API_BASE } from '../lib/api.js';

gsap.registerPlugin(ScrollTrigger);

export default function Home() {
  useDocumentTitle('Sneakers | Limited Drops');
  const { shoeGroupRef, isModelLoaded, isSceneReady, sceneError } = useScene();

  const [featuredProduct, setFeaturedProduct] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/products`)
      .then((res) => res.json())
      .then((data) => {
        if (data.products && data.products.length > 0) {
          setFeaturedProduct(data.products[0]);
        }
      })
      .catch((err) => console.error('Error fetching featured product:', err));
  }, []);

  const containerRef = useRef();
  const heroTextRef = useRef();
  const scroll1Ref = useRef();
  const scroll2Ref = useRef();
  const scroll3Ref = useRef();
  const text1Ref = useRef();
  const text2Ref = useRef();
  const cardWrapRef = useRef();

  const materialsRef = useRef([]);

  const introTl = useRef(null);
  const floatTween = useRef(null);

  const textTl = useRef(null);

  function playTextIntro() {
    if (!heroTextRef.current) return;
    textTl.current?.kill();

    gsap.set(heroTextRef.current, { scale: 3.0, opacity: 0, y: -140 });
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    textTl.current = tl;
    tl.to(heroTextRef.current, {
      scale: 1.92,
      opacity: 0.1,
      duration: 0.9,
      onUpdate: () => window.dispatchEvent(new CustomEvent('watermark-update')),
    });
  }

  useEffect(() => {
    playTextIntro();
  }, []);

  useGSAP(
    () => {
      if (!isModelLoaded) return;
      const shoe = shoeGroupRef.current;
      if (!shoe) return;

      const matList = [];
      shoe.traverse((child) => {
        if (child.isMesh && child.material) matList.push(child.material);
      });
      materialsRef.current = matList;

      const vw = window.innerWidth;
      const isMobile = vw < 640;
      const isTablet = vw >= 640 && vw < 1024;

      const heroEndScale = isMobile ? 0.72 : 1;

      const s1x = isMobile ? 0 : isTablet ? -0.9 : -1.6;
      const s2x = isMobile ? 0 : isTablet ? 0.9 : 1.6;

      function playShoeIntro(isReplay = false) {
        gsap.killTweensOf(shoe.position);
        gsap.killTweensOf(shoe.rotation);
        gsap.killTweensOf(shoe.scale);

        floatTween.current?.kill();
        introTl.current?.kill();

        if (isReplay) {
          gsap.set(shoe.position, { x: 0, y: 6, z: 0 });
          gsap.set(shoe.rotation, { x: 0.2, y: 0, z: 0.1 });
          gsap.set(shoe.scale, { x: 0.01, y: 0.01, z: 0.01 });

          const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
          introTl.current = tl;

          tl.to(shoe.position, { y: -0.8, duration: 1.3, ease: 'bounce.out' }, '<')
            .to(
              shoe.rotation,
              { y: `+=${Math.PI * 2}`, duration: 1.3, ease: 'power2.out' },
              '<'
            )
            .to(
              shoe.scale,
              {
                x: heroEndScale,
                y: heroEndScale,
                z: heroEndScale,
                duration: 1.1,
                ease: 'back.out(1.6)',
              },
              '<'
            )
            .call(() => {
              const prefersReducedMotion = window.matchMedia(
                '(prefers-reduced-motion: reduce)'
              ).matches;
              if (!prefersReducedMotion) {
                floatTween.current = gsap.to(shoe.position, {
                  y: '+=0.18',
                  duration: 1.6,
                  ease: 'sine.inOut',
                  yoyo: true,
                  repeat: -1,
                });
              }
            });
        } else {
          gsap.set(shoe.position, { x: 0, y: -0.8, z: 0 });
          gsap.set(shoe.rotation, { x: 0.2, y: 0, z: 0.1 });
          gsap.set(shoe.scale, { x: heroEndScale, y: heroEndScale, z: heroEndScale });

          const prefersReducedMotion = window.matchMedia(
            '(prefers-reduced-motion: reduce)'
          ).matches;
          if (!prefersReducedMotion) {
            floatTween.current = gsap.to(shoe.position, {
              y: '+=0.18',
              duration: 1.6,
              ease: 'sine.inOut',
              yoyo: true,
              repeat: -1,
            });
          }
        }
      }

      if (isSceneReady && !sceneError) {
        const wrapper = document.getElementById('scene-canvas-wrapper');
        const prefersReducedMotion = window.matchMedia(
          '(prefers-reduced-motion: reduce)'
        ).matches;

        playShoeIntro(false);

        if (wrapper) {
          if (prefersReducedMotion) {
            gsap.set(wrapper, { opacity: 1 });
          } else {
            gsap.to(wrapper, { opacity: 1, duration: 0.4, ease: 'none' });
          }
        }
      }

      ScrollTrigger.create({
        trigger: scroll1Ref.current,
        start: 'top 65%',
        end: 'bottom 35%',
        onEnter: () => {
          floatTween.current?.pause();
          gsap.to(shoe.position, {
            x: s1x,
            y: -0.4,
            duration: 1.2,
            ease: 'power3.inOut',
            overwrite: 'auto',
          });
          gsap.to(shoe.rotation, {
            y: '+=0.6',
            duration: 1.2,
            ease: 'power3.inOut',
            overwrite: 'auto',
          });
          gsap.to(text1Ref.current, {
            opacity: 1,
            x: 0,
            duration: 0.9,
            delay: 0.2,
            ease: 'power2.out',
            overwrite: 'auto',
          });
        },
        onLeaveBack: () => {
          gsap.to(text1Ref.current, {
            opacity: 0,
            x: 40,
            duration: 0.5,
            overwrite: 'auto',
          });
          gsap.to(shoe.position, {
            x: 0,
            y: -0.8,
            duration: 1.2,
            ease: 'power3.inOut',
            overwrite: 'auto',
            onComplete: () => floatTween.current?.resume(),
          });
          gsap.to(shoe.rotation, {
            y: '-=0.6',
            duration: 1.2,
            ease: 'power3.inOut',
            overwrite: 'auto',
          });
        },
      });

      ScrollTrigger.create({
        trigger: scroll2Ref.current,
        start: 'top 65%',
        end: 'bottom 35%',
        onEnter: () => {
          gsap.to(shoe.position, {
            x: s2x,
            y: -0.4,
            duration: 1.2,
            ease: 'power3.inOut',
            overwrite: 'auto',
          });
          gsap.to(shoe.rotation, {
            y: '+=0.6',
            duration: 1.2,
            ease: 'power3.inOut',
            overwrite: 'auto',
          });
          gsap.to(text1Ref.current, {
            opacity: 0,
            x: -40,
            duration: 0.5,
            overwrite: 'auto',
          });
          gsap.to(text2Ref.current, {
            opacity: 1,
            x: 0,
            duration: 0.9,
            delay: 0.2,
            ease: 'power2.out',
            overwrite: 'auto',
          });
        },
        onLeaveBack: () => {
          gsap.to(text2Ref.current, {
            opacity: 0,
            x: -40,
            duration: 0.5,
            overwrite: 'auto',
          });
          gsap.to(text1Ref.current, {
            opacity: 1,
            x: 0,
            duration: 0.5,
            overwrite: 'auto',
          });
          gsap.to(shoe.position, { x: s1x, y: -0.4, duration: 1, overwrite: 'auto' });
          gsap.to(shoe.rotation, { y: '-=0.6', duration: 1, overwrite: 'auto' });
        },
      });

      ScrollTrigger.create({
        trigger: scroll3Ref.current,
        start: 'top 60%',
        end: 'bottom 40%',
        onEnter: () => {
          const materials = materialsRef.current;

          gsap.to(text2Ref.current, {
            opacity: 0,
            x: -40,
            duration: 0.4,
            overwrite: 'auto',
          });

          gsap.to(shoe.position, {
            x: 0,
            y: -0.8,
            duration: 1.0,
            ease: 'back.in(1.2)',
            overwrite: 'auto',
          });
          gsap.to(shoe.rotation, {
            y: '+=1',
            duration: 1.0,
            ease: 'power2.in',
            overwrite: 'auto',
          });
          gsap.to(shoe.scale, {
            x: 0,
            y: 0,
            z: 0,
            duration: 1.0,
            ease: 'back.in(1.2)',
            overwrite: 'auto',
          });
          gsap.to(materials, {
            opacity: 0,
            duration: 1.0,
            ease: 'power2.in',
            overwrite: 'auto',
          });

          gsap.fromTo(
            cardWrapRef.current,
            { opacity: 0, y: 50, scale: 0.8 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.8,
              delay: 0.5,
              ease: 'back.out(1.4)',
              overwrite: 'auto',
            }
          );
        },
        onLeaveBack: () => {
          const materials = materialsRef.current;

          gsap.to(cardWrapRef.current, {
            opacity: 0,
            y: 50,
            scale: 0.8,
            duration: 0.4,
            ease: 'power2.inOut',
            overwrite: 'auto',
          });

          gsap.to(text2Ref.current, {
            opacity: 1,
            x: 0,
            duration: 0.5,
            delay: 0.4,
            overwrite: 'auto',
          });

          gsap.to(materials, {
            opacity: 1,
            duration: 0.9,
            delay: 0.3,
            ease: 'back.out(1.2)',
            overwrite: 'auto',
          });
          gsap.to(shoe.position, {
            x: 1.6,
            y: -0.4,
            duration: 0.9,
            delay: 0.3,
            ease: 'back.out(1.2)',
            overwrite: 'auto',
          });
          gsap.to(shoe.rotation, {
            y: '-=1',
            duration: 0.9,
            delay: 0.3,
            ease: 'power2.out',
            overwrite: 'auto',
          });
          gsap.to(shoe.scale, {
            x: 1,
            y: 1,
            z: 1,
            duration: 0.9,
            delay: 0.3,
            ease: 'back.out(1.2)',
            overwrite: 'auto',
          });
        },
      });

      const onReplay = () => {
        if (window.lenis) {
          window.lenis.scrollTo(0, { duration: 1.5 });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        playTextIntro();
        playShoeIntro(true);
      };
      window.addEventListener('replay-intro', onReplay);

      // Force GSAP to recalculate positions to sync with Lenis
      ScrollTrigger.refresh();

      return () => {
        window.removeEventListener('replay-intro', onReplay);
      };
    },
    { scope: containerRef, dependencies: [isModelLoaded, isSceneReady, sceneError] }
  );

  useEffect(() => {
    return () => {
      const shoe = shoeGroupRef.current;
      floatTween.current?.kill();
      introTl.current?.kill();
      if (shoe) {
        gsap.to(shoe.position, {
          x: 1.3,
          y: -0.6,
          z: 0,
          duration: 0.8,
          ease: 'power2.inOut',
        });
        gsap.to(shoe.scale, { x: 0.55, y: 0.55, z: 0.55, duration: 0.8 });
        gsap.to(shoe.rotation, { y: '+=1.2', duration: 1.4, ease: 'power1.inOut' });
      }
    };
  }, [shoeGroupRef]);

  return (
    <div ref={containerRef} className="relative">
      <section className="relative flex h-screen items-center justify-center overflow-hidden">
        <svg className="absolute w-0 h-0">
          <filter id="stain-filter">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.03"
              numOctaves="2"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="4"
              xChannelSelector="R"
              yChannelSelector="G"
              result="smudged"
            />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 3 -0.5"
              in="noise"
              result="coloredNoise"
            />
            <feComposite operator="in" in="smudged" in2="coloredNoise" />
          </filter>
        </svg>

        <LoadingBar textRef={heroTextRef} />

        <div className="absolute bottom-28 sm:bottom-24 left-0 right-0 text-center z-10 pointer-events-none select-none px-6">
          <span className="block font-mono text-[0.6rem] uppercase tracking-[0.45em] text-volt/70 mb-2">
            Authenticated Pairs · Limited Edition
          </span>
          <h1 className="font-display text-4xl sm:text-5xl uppercase leading-[0.95] text-bone/90">
            New Season
            <br className="sm:hidden" /> Drop
          </h1>
        </div>

        <span
          ref={heroTextRef}
          aria-hidden="true"
          className="font-display select-none whitespace-nowrap text-center uppercase leading-none text-volt absolute -z-10"
          style={{
            fontSize: 'clamp(3rem, 16vw, 14rem)',
            filter: 'url(#stain-filter)',
            opacity: 0,
          }}
        >
          SNEAKERS
        </span>
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 font-mono text-xs uppercase tracking-[0.3em] text-smoke">
          Scroll to explore ↓
        </div>
      </section>

      <section
        ref={scroll1Ref}
        className="relative z-10 flex min-h-screen items-end sm:items-center px-6 sm:px-16 pb-16 sm:pb-0 max-sm:overflow-x-clip"
      >
        <div
          className="scroll-text-mobile sm:mt-0 w-4/5 sm:w-full max-w-md ml-auto -mr-4 sm:mr-0 sm:mx-0 sm:ml-auto max-sm:text-right"
          ref={text1Ref}
          style={{ opacity: 0, transform: 'translateX(40px)' }}
        >
          <span className="font-mono text-xs uppercase tracking-widest text-volt">
            Silhouette 01
          </span>
          <h2 className="mt-3 font-display text-4xl sm:text-5xl uppercase leading-[0.95] text-bone">
            Chicago
            <br />
            Colorway
          </h2>

          <p className="mt-5 text-sm sm:text-base leading-relaxed text-smoke max-sm:text-left">
            The Retro High rewrote what a basketball shoe could mean off the court.
            Full-grain leather upper, an unmistakable silhouette, and the block colorway
            that started the entire sneaker culture movement.
          </p>
        </div>
      </section>

      <section
        ref={scroll2Ref}
        className="relative z-10 flex min-h-screen items-end sm:items-center px-6 sm:px-16 pb-16 sm:pb-0"
      >
        <div
          className="scroll-text-mobile sm:mt-0 w-full max-w-md mx-auto sm:mx-0"
          ref={text2Ref}
          style={{ opacity: 0, transform: 'translateX(-40px)' }}
        >
          <span className="font-mono text-xs uppercase tracking-widest text-volt">
            Under the hood
          </span>
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

      <section
        ref={scroll3Ref}
        className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-24"
      >
        <div className="text-center px-4">
          <span className="font-mono text-xs uppercase tracking-widest text-volt">
            Own it
          </span>
          <h2 className="mt-3 font-display text-3xl sm:text-5xl uppercase text-bone">
            Ready to Drop
          </h2>
        </div>
        <div
          ref={cardWrapRef}
          style={{ opacity: 0 }}
          className="w-full max-w-sm px-4 sm:px-0"
        >
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
