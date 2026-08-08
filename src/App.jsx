import React, { Suspense, useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { SceneProvider } from './context/SceneContext.jsx';
import SceneErrorBoundary from './components/SceneErrorBoundary.jsx';

const SceneCanvas = React.lazy(() => import('./components/SceneCanvas.jsx'));
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import GrainOverlay from './components/GrainOverlay.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';
import { useSmoothScroll } from './hooks/useSmoothScroll.js';

/* Eager: the three routes a visitor is most likely to LAND on directly.
   Splitting these trades a smaller bundle for a round trip on the critical
   path, which measured worse — lazy-loading ProductDetail cost 20 Lighthouse
   points (71 -> 51) and pushed CLS from 0 to 0.473, because the Suspense
   fallback resizes when the real page swaps in. Product pages are shared and
   linked directly, so they are a landing page, not a second hop. */
import Home from './pages/Home.jsx';
import Store from './pages/Store.jsx';
import ProductDetail from './pages/ProductDetail.jsx';

/* Lazy: everything else. The admin pages matter most here — they carry their
   own forms, the variants manager and the Cloudinary upload hook, and were
   shipping to every shopper despite being reachable by almost nobody. The
   legal/marketing pages are static markup that most visitors never open, and
   the checkout result pages are only reached after a Stripe redirect, by which
   point a round trip has already happened. */
const Categories = React.lazy(() => import('./pages/Categories.jsx'));
const About = React.lazy(() => import('./pages/About.jsx'));
const Contact = React.lazy(() => import('./pages/Contact.jsx'));
const FAQ = React.lazy(() => import('./pages/FAQ.jsx'));
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy.jsx'));
const TermsOfService = React.lazy(() => import('./pages/TermsOfService.jsx'));
const ShippingReturns = React.lazy(() => import('./pages/ShippingReturns.jsx'));
const CheckoutSuccess = React.lazy(() => import('./pages/CheckoutSuccess.jsx'));
const CheckoutCancel = React.lazy(() => import('./pages/CheckoutCancel.jsx'));
const AdminOrders = React.lazy(() => import('./pages/AdminOrders.jsx'));
const AdminProducts = React.lazy(() => import('./pages/AdminProducts.jsx'));

export default function App() {
  const location = useLocation();
  useSmoothScroll();

  // Defer 3D scene load until after first paint
  const [load3D, setLoad3D] = useState(false);

  useEffect(() => {
    // Once loaded the canvas stays mounted for the rest of the session, so
    // navigating home -> store keeps the shoe as ambient scenery exactly as
    // before. Nothing here ever sets it back to false.
    if (load3D) return;

    /* Only the home route pays for the 3D scene.
       SceneCanvas renders at opacity 0 and is faded in by Home.jsx, so on a
       direct load of /store or /admin the canvas was downloading ~1.5MB of GLB,
       KTX2 transcoder and HDR to render something permanently invisible. Home
       is the only page that ever reveals it. */
    if (location.pathname !== '/') return;

    // Graceful degradation: if user has data-saver enabled, skip the 1.8MB+ 3D load entirely.
    // The poster will remain permanently.
    const isDataSaver = navigator.connection?.saveData === true;
    if (isDataSaver) return;

    // Use requestIdleCallback to wait for the browser to finish rendering the first paint
    // (the poster and text) before kicking off the heavy Three.js chunk download + parse.
    const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
    const handle = idleCallback(() => setLoad3D(true), { timeout: 1000 });
    return () => window.cancelIdleCallback ? window.cancelIdleCallback(handle) : clearTimeout(handle);
  }, [location.pathname, load3D]);

  return (

    <SceneProvider>
      {/* z-0: the persistent 3D layer, fixed, behind everything, non-interactive */}
      <SceneErrorBoundary>
        <Suspense fallback={null}>
          {load3D && <SceneCanvas />}
        </Suspense>
      </SceneErrorBoundary>

      {/* Feature 2: film-grain overlay — SVG feTurbulence, pointer-events:none */}
      <GrainOverlay />

      {/* real page content, scrolls normally over the fixed canvas */}
      <div className="relative min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          {/* Lazily-loaded routes need a boundary. The fallback is a plain
              spacer rather than a spinner: these chunks are a few KB and
              resolve in a frame or two on a warm connection, so a spinner
              would flash more distractingly than empty space. min-h keeps the
              footer from jumping up during the swap. */}
          <Suspense fallback={<div className="min-h-screen" aria-busy="true" />}>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Home />} />
            <Route path="/store" element={<Store />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/shipping-returns" element={<ShippingReturns />} />
            <Route path="/checkout/success" element={<CheckoutSuccess />} />
            <Route path="/checkout/cancel"  element={<CheckoutCancel />} />
            <Route path="/admin/orders"     element={<AdminOrders />} />
            <Route path="/admin/products"   element={<AdminProducts />} />
          </Routes>
          </Suspense>
        </main>
        {/* main is flex-1, so the footer is pushed to the bottom on short pages
            without needing any sticky-footer workaround. */}
        <Footer />
      </div>

      <InstallPrompt />
    </SceneProvider>
  );
}
