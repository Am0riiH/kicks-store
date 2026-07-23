import { useEffect, useState, useCallback } from 'react';
import AdminNav from '../components/AdminNav.jsx';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function VariantsManager({ productId, authHeader }) {
  const [variants, setVariants] = useState([]);
  const [newVar, setNewVar] = useState({ size: '', color: '', quantity: 0, sku: '' });

  const fetchVariants = useCallback(() => {
    fetch(`${API_BASE}/api/products/${productId}/variants`)
      .then(res => res.json())
      .then(data => setVariants(data.variants || []))
      .catch(err => console.error(err));
  }, [productId]);

  useEffect(() => {
    fetchVariants();
  }, [fetchVariants]);

  const handleAdd = (e) => {
    e.preventDefault();
    fetch(`${API_BASE}/api/admin/products/${productId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify({ ...newVar, quantity: Number(newVar.quantity) })
    })
    .then(res => res.json())
    .then(() => {
      setNewVar({ size: '', color: '', quantity: 0, sku: '' });
      fetchVariants();
    })
    .catch(err => alert(err.message));
  };

  const handleUpdateQty = (variantId, currentVar, newQty) => {
    fetch(`${API_BASE}/api/admin/variants/${variantId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify({ ...currentVar, quantity: Number(newQty) })
    })
    .then(() => fetchVariants())
    .catch(err => alert(err.message));
  };

  const handleDelete = (variantId) => {
    if (!window.confirm('Delete variant?')) return;
    fetch(`${API_BASE}/api/admin/variants/${variantId}`, {
      method: 'DELETE',
      headers: { 'Authorization': authHeader }
    })
    .then(() => fetchVariants())
    .catch(err => alert(err.message));
  };

  return (
    <div className="mt-8 border-t border-white/20 pt-6">
      <h4 className="text-lg font-display uppercase text-bone mb-4">Manage Variants</h4>
      
      <div className="bg-white/5 border border-white/10 rounded overflow-hidden mb-6">
        <table className="w-full text-left font-mono text-xs">
          <thead className="bg-white/10 text-smoke uppercase">
            <tr>
              <th className="p-2">Size</th>
              <th className="p-2">Color</th>
              <th className="p-2">SKU</th>
              <th className="p-2">Qty</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-bone">
            {variants.map(v => (
              <tr key={v.id} className="hover:bg-white/5">
                <td className="p-2">{v.size}</td>
                <td className="p-2">{v.color}</td>
                <td className="p-2">{v.sku || '-'}</td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      className="w-16 bg-black border border-white/20 rounded px-1 text-bone"
                      value={v.quantity}
                      onChange={(e) => handleUpdateQty(v.id, v, e.target.value)}
                    />
                    {v.quantity === 0 && (
                      <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Out of stock"></span>
                    )}
                  </div>
                </td>
                <td className="p-2 text-right">
                  <button type="button" onClick={() => handleDelete(v.id)} className="text-red-400 hover:text-red-300">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {variants.length === 0 && (
              <tr><td colSpan="5" className="p-4 text-center text-smoke">No variants</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 font-mono text-xs items-end">
        <div className="flex-1">
          <label className="block text-smoke mb-1">Size</label>
          <input required type="text" value={newVar.size} onChange={e => setNewVar({...newVar, size: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-bone" />
        </div>
        <div className="flex-1">
          <label className="block text-smoke mb-1">Color</label>
          <input required type="text" value={newVar.color} onChange={e => setNewVar({...newVar, color: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-bone" />
        </div>
        <div className="flex-1">
          <label className="block text-smoke mb-1">Qty</label>
          <input required type="number" value={newVar.quantity} onChange={e => setNewVar({...newVar, quantity: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-bone" />
        </div>
        <div className="flex-1">
          <label className="block text-smoke mb-1">SKU (Opt)</label>
          <input type="text" value={newVar.sku} onChange={e => setNewVar({...newVar, sku: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-bone" />
        </div>
        <button type="submit" className="bg-volt text-ink px-3 py-1 rounded hover:bg-volt/90 font-bold">Add</button>
      </form>
    </div>
  );
}

export default function AdminProducts() {
  const [authHeader, setAuthHeader] = useState(() => sessionStorage.getItem('adminAuth'));
  
  // Login form state (if not authenticated in sessionStorage, though usually they come from orders)
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(null);

  // Dashboard state
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    id: '', name: '', colorway: '', category: '', price: '', sku: '', tag: '', image: ''
  });

  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = 'noindex, nofollow';
    return () => { meta.content = 'index, follow'; };
  }, []);

  const fetchProducts = () => {
    if (!authHeader) return;
    setLoading(true);
    fetch(`${API_BASE}/api/admin/products`, { headers: { 'Authorization': authHeader } })
      .then((res) => {
        if (res.status === 401) throw new Error('401');
        if (!res.ok) throw new Error('Server error');
        return res.json();
      })
      .then((data) => {
        setProducts(data.products || []);
        setLoading(false);
      })
      .catch((err) => {
        if (err.message === '401') handleLogout();
        else setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchProducts();
  }, [authHeader]);

  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);
    
    const header = `Basic ${btoa(username + ':' + password)}`;
    
    fetch(`${API_BASE}/api/admin/products`, { headers: { 'Authorization': header } })
      .then((res) => {
        if (res.status === 401) throw new Error('401');
        if (!res.ok) throw new Error('Server error');
        return res.json();
      })
      .then((data) => {
        sessionStorage.setItem('adminAuth', header);
        setAuthHeader(header);
        setProducts(data.products || []);
        setUsername('');
        setPassword('');
        setLoading(false);
      })
      .catch((err) => {
        if (err.message === '401') setLoginError('Invalid credentials');
        else setLoginError('Server error: ' + err.message);
        setLoading(false);
      });
  };

  const handleLogout = () => {
    sessionStorage.removeItem('adminAuth');
    setAuthHeader(null);
    setProducts([]);
    setError(null);
  };

  const handleOpenForm = (product = null) => {
    if (product) {
      setEditingId(product.id);
      setFormData(product);
    } else {
      setEditingId(null);
      setFormData({
        id: '', name: '', colorway: '', category: 'Mid-Top', price: '', sku: '', tag: '', image: ''
      });
    }
    setIsFormOpen(true);
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `${API_BASE}/api/admin/products/${editingId}` : `${API_BASE}/api/admin/products`;

    // Ensure price is a number
    const payload = { ...formData, price: Number(formData.price) };

    fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(payload)
    })
    .then(res => {
      if (!res.ok) throw new Error('Failed to save product');
      return res.json();
    })
    .then(() => {
      setIsFormOpen(false);
      fetchProducts();
    })
    .catch(err => alert('Error saving product: ' + err.message));
  };

  const handleDelete = (id) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    
    fetch(`${API_BASE}/api/admin/products/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': authHeader }
    })
    .then(res => {
      if (!res.ok) throw new Error('Failed to delete product');
      fetchProducts();
    })
    .catch(err => alert('Error deleting product: ' + err.message));
  };

  if (!authHeader) {
    return (
      <div className="min-h-screen pt-32 px-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-sm border border-white/10 rounded-2xl bg-black/50 p-8 backdrop-blur-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-display uppercase tracking-tight text-bone mb-2">Admin Login</h1>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input
              type="text" required placeholder="Username" value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-black/50 border border-white/20 rounded px-4 py-3 text-sm text-bone font-mono"
            />
            <input
              type="password" required placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/50 border border-white/20 rounded px-4 py-3 text-sm text-bone font-mono"
            />
            {loginError && <div className="text-red-400 font-mono text-xs text-center">{loginError}</div>}
            <button type="submit" disabled={loading} className="mt-4 w-full rounded bg-volt px-4 py-3 font-display text-sm uppercase text-ink">
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 px-6 pb-20">
      <div className="max-w-6xl mx-auto">
        <AdminNav onLogout={handleLogout} />
        
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-display uppercase tracking-tight text-bone">Product Catalog</h2>
          <button 
            onClick={() => handleOpenForm()}
            className="px-4 py-2 bg-volt text-ink font-display text-sm uppercase tracking-wide rounded hover:scale-[1.02] transition-transform"
          >
            Add New Product
          </button>
        </div>

        {error && <div className="mb-4 text-red-400 font-mono text-sm">{error}</div>}

        <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 backdrop-blur-md">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 font-mono text-xs uppercase tracking-wider text-smoke">
                <th className="p-4">Product</th>
                <th className="p-4">Category</th>
                <th className="p-4">SKU / Tag</th>
                <th className="p-4 text-right">Price</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-sm text-bone">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-4">
                      <img src={product.image} alt={product.name} className="w-12 h-12 object-cover rounded bg-white/5" />
                      <div>
                        <div className="font-bold text-bone">{product.name}</div>
                        <div className="text-xs text-smoke">{product.colorway || '-'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-smoke">{product.category}</td>
                  <td className="p-4">
                    <div className="text-bone">{product.sku}</div>
                    <div className="text-xs text-smoke">{product.tag || '-'}</div>
                  </td>
                  <td className="p-4 text-right font-bold text-volt whitespace-nowrap">
                    ${Number(product.price).toFixed(2)}
                  </td>
                  <td className="p-4 text-right whitespace-nowrap">
                    <div className="flex gap-2 justify-end">
                      <button 
                        onClick={() => handleOpenForm(product)}
                        className="px-2 py-1 text-[10px] uppercase tracking-widest text-smoke hover:bg-white/5 rounded border border-white/10 transition-colors"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDelete(product.id)}
                        className="px-2 py-1 text-[10px] uppercase tracking-widest text-red-400 hover:bg-red-400/10 rounded border border-red-400/20 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {products.length === 0 && !loading && (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-smoke font-mono text-xs uppercase tracking-widest">
                    No products found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Form */}
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-black border border-white/20 rounded-2xl p-6 overflow-y-auto max-h-[90vh]">
              <h3 className="text-xl font-display uppercase text-bone mb-6">
                {editingId ? 'Edit Product' : 'Add New Product'}
              </h3>
              
              <form onSubmit={handleFormSubmit} className="flex flex-col gap-4 font-mono text-sm">
                <div>
                  <label className="block text-xs text-smoke uppercase mb-1">ID (URL slug)</label>
                  <input required disabled={!!editingId} type="text" value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-bone focus:border-volt focus:outline-none disabled:opacity-50" />
                </div>
                <div>
                  <label className="block text-xs text-smoke uppercase mb-1">Name</label>
                  <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-bone focus:border-volt focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-smoke uppercase mb-1">Colorway</label>
                    <input type="text" value={formData.colorway} onChange={e => setFormData({...formData, colorway: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-bone focus:border-volt focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-smoke uppercase mb-1">Category</label>
                    <select required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-bone focus:border-volt focus:outline-none [&>option]:bg-zinc-900">
                      <option value="High-Top">High-Top</option>
                      <option value="Mid-Top">Mid-Top</option>
                      <option value="Low-Top">Low-Top</option>
                      <option value="Retro Vault">Retro Vault</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-smoke uppercase mb-1">Price ($)</label>
                    <input required type="number" step="0.01" min="0" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-bone focus:border-volt focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-smoke uppercase mb-1">SKU</label>
                    <input required type="text" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-bone focus:border-volt focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-smoke uppercase mb-1">Tag (e.g. New, Limited)</label>
                  <input type="text" value={formData.tag} onChange={e => setFormData({...formData, tag: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-bone focus:border-volt focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-smoke uppercase mb-1">Image URL</label>
                  <input required type="url" value={formData.image} onChange={e => setFormData({...formData, image: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-bone focus:border-volt focus:outline-none" />
                </div>
                
                <div className="flex gap-4 mt-6">
                  <button type="button" onClick={() => setIsFormOpen(false)} className="flex-1 py-2 border border-white/20 text-smoke rounded hover:bg-white/5 uppercase tracking-wide">
                    Close
                  </button>
                  <button type="submit" className="flex-1 py-2 bg-volt text-ink rounded hover:bg-volt/90 uppercase tracking-wide">
                    Save Product
                  </button>
                </div>
              </form>

              {editingId && (
                <VariantsManager productId={editingId} authHeader={authHeader} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
