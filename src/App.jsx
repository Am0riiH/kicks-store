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

import Home from './pages/Home.jsx';
import Store from './pages/Store.jsx';
import ProductDetail from './pages/ProductDetail.jsx';

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
    if (load3D) return;

    if (location.pathname !== '/') return;

    const isDataSaver = navigator.connection?.saveData === true;
    if (isDataSaver) return;

    const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
    const handle = idleCallback(() => setLoad3D(true), { timeout: 1000 });
    return () =>
      window.cancelIdleCallback
        ? window.cancelIdleCallback(handle)
        : clearTimeout(handle);
  }, [location.pathname, load3D]);

  return (
    <SceneProvider>
      <SceneErrorBoundary>
        <Suspense fallback={null}>{load3D && <SceneCanvas />}</Suspense>
      </SceneErrorBoundary>

      <GrainOverlay />

      <div className="relative min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
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
              <Route path="/checkout/cancel" element={<CheckoutCancel />} />
              <Route path="/admin/orders" element={<AdminOrders />} />
              <Route path="/admin/products" element={<AdminProducts />} />
            </Routes>
          </Suspense>
        </main>

        <Footer />
      </div>

      <InstallPrompt />
    </SceneProvider>
  );
}
