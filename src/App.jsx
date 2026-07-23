import { Routes, Route, useLocation } from 'react-router-dom';
import SceneCanvas from './components/SceneCanvas.jsx';
import { SceneProvider } from './context/SceneContext.jsx';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import Store from './pages/Store.jsx';
import Categories from './pages/Categories.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import About from './pages/About.jsx';
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

  return (

    <SceneProvider>
      {/* z-0: the persistent 3D layer, fixed, behind everything, non-interactive */}
      <SceneCanvas />

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
            <Route path="/checkout/success" element={<CheckoutSuccess />} />
            <Route path="/checkout/cancel"  element={<CheckoutCancel />} />
            <Route path="/admin/orders"     element={<AdminOrders />} />
            <Route path="/admin/products"   element={<AdminProducts />} />
          </Routes>
        </main>
      </div>

      <InstallPrompt />
    </SceneProvider>
  );
}
