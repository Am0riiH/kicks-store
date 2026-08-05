import React, { Suspense, useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { SceneProvider } from './context/SceneContext.jsx';
import SceneErrorBoundary from './components/SceneErrorBoundary.jsx';

const SceneCanvas = React.lazy(() => import('./components/SceneCanvas.jsx'));
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import Home from './pages/Home.jsx';
import Store from './pages/Store.jsx';
import Categories from './pages/Categories.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import About from './pages/About.jsx';
import Contact from './pages/Contact.jsx';
import FAQ from './pages/FAQ.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import TermsOfService from './pages/TermsOfService.jsx';
import ShippingReturns from './pages/ShippingReturns.jsx';
import CheckoutSuccess from './pages/CheckoutSuccess.jsx';
import CheckoutCancel from './pages/CheckoutCancel.jsx';
import AdminOrders from './pages/AdminOrders.jsx';
import AdminProducts from './pages/AdminProducts.jsx';
import GrainOverlay from './components/GrainOverlay.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';
import { useSmoothScroll } from './hooks/useSmoothScroll.js';

export default function App() {
  const location = useLocation();
  useSmoothScroll();

  // Defer 3D scene load until after first paint
  const [load3D, setLoad3D] = useState(false);

  useEffect(() => {
    // Graceful degradation: if user has data-saver enabled, skip the 1.8MB+ 3D load entirely.
    // The poster will remain permanently.
    const isDataSaver = navigator.connection?.saveData === true;
    if (isDataSaver) return;

    // Use requestIdleCallback to wait for the browser to finish rendering the first paint
    // (the poster and text) before kicking off the heavy Three.js chunk download + parse.
    const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
    const handle = idleCallback(() => setLoad3D(true), { timeout: 1000 });
    return () => window.cancelIdleCallback ? window.cancelIdleCallback(handle) : clearTimeout(handle);
  }, []);

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
        </main>
        {/* main is flex-1, so the footer is pushed to the bottom on short pages
            without needing any sticky-footer workaround. */}
        <Footer />
      </div>

      <InstallPrompt />
    </SceneProvider>
  );
}
