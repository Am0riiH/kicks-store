import { useEffect, useState } from 'react';
import AdminNav from '../components/AdminNav.jsx';

const API_BASE = 'http://localhost:3001';

export default function AdminOrders() {
  const [authHeader, setAuthHeader] = useState(() => sessionStorage.getItem('adminAuth'));
  
  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(null);

  // Dashboard state
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // 1. Enforce noindex dynamically so this page is hidden from search engines
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

  // 2. On mount, if we have a stored session, verify it and load orders
  useEffect(() => {
    const stored = sessionStorage.getItem('adminAuth');
    if (stored) {
      setLoading(true);
      fetch(`${API_BASE}/api/admin/orders`, { headers: { 'Authorization': stored } })
        .then((res) => {
          if (res.status === 401) throw new Error('401');
          if (!res.ok) throw new Error('Server error');
          return res.json();
        })
        .then((data) => {
          setOrders(data.orders || []);
          setLoading(false);
        })
        .catch((err) => {
          if (err.message === '401') {
            // Silently log out if stored credentials became invalid
            handleLogout();
          } else {
            setError(err.message);
          }
          setLoading(false);
        });
    }
  }, []);

  // 3. Handle manual login
  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);
    
    // Construct the Basic Auth header manually
    const header = `Basic ${btoa(username + ':' + password)}`;
    
    fetch(`${API_BASE}/api/admin/orders`, { headers: { 'Authorization': header } })
      .then((res) => {
        if (res.status === 401) throw new Error('401');
        if (!res.ok) throw new Error('Server error');
        return res.json();
      })
      .then((data) => {
        // Success: store credentials and show dashboard
        sessionStorage.setItem('adminAuth', header);
        setAuthHeader(header);
        setOrders(data.orders || []);
        setUsername('');
        setPassword('');
        setLoading(false);
      })
      .catch((err) => {
        if (err.message === '401') {
          setLoginError('Invalid credentials');
        } else {
          setLoginError('Server error: ' + err.message);
        }
        setLoading(false);
      });
  };

  const handleLogout = () => {
    sessionStorage.removeItem('adminAuth');
    setAuthHeader(null);
    setOrders([]);
    setError(null);
  };

  const handleStatusChange = (id, newStatus) => {
    // Optimistic update
    const previousOrders = [...orders];
    setOrders(orders.map(o => o.id === id ? { ...o, fulfillment_status: newStatus } : o));

    fetch(`${API_BASE}/api/admin/orders/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({ status: newStatus })
    })
    .then(res => {
      if (!res.ok) throw new Error('Failed to update status');
    })
    .catch(err => {
      // Revert on error
      setOrders(previousOrders);
      alert('Error updating status: ' + err.message);
    });
  };

  // ─── Render: Login Form (if not authenticated) ─────────────────────────────
  if (!authHeader) {
    return (
      <div className="min-h-screen pt-32 px-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-sm border border-white/10 rounded-2xl bg-black/50 p-8 backdrop-blur-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-display uppercase tracking-tight text-bone mb-2">
              Admin Login
            </h1>
            <p className="font-mono text-xs text-smoke uppercase tracking-widest">
              Restricted Access
            </p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block font-mono text-xs text-smoke uppercase tracking-widest mb-2">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-black/50 border border-white/20 rounded px-4 py-3 text-sm text-bone font-mono focus:outline-none focus:border-volt transition-colors"
              />
            </div>
            <div>
              <label className="block font-mono text-xs text-smoke uppercase tracking-widest mb-2">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/50 border border-white/20 rounded px-4 py-3 text-sm text-bone font-mono focus:outline-none focus:border-volt transition-colors"
              />
            </div>

            {loginError && (
              <div className="mt-2 text-red-400 font-mono text-xs uppercase tracking-widest text-center">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded bg-volt px-4 py-3 font-display text-sm uppercase tracking-wide text-ink transition-transform duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Render: Dashboard (authenticated) ─────────────────────────────────────
  if (loading && orders.length === 0) {
    return (
      <div className="min-h-screen pt-32 px-6 flex items-center justify-center text-smoke font-mono text-sm uppercase tracking-widest">
        Loading Orders...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen pt-32 px-6 flex flex-col items-center justify-center text-center">
        <p className="text-red-400 font-mono text-sm uppercase tracking-widest mb-4">
          Dashboard Error
        </p>
        <p className="text-smoke max-w-sm">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-6 py-2 border border-white/20 rounded text-bone hover:bg-white/5 transition-colors text-sm uppercase font-display tracking-wide"
        >
          Try Again
        </button>
      </div>
    );
  }

  const filteredOrders = orders.filter((o) => {
    const term = search.toLowerCase();
    const nameMatch = o.customer_name?.toLowerCase().includes(term);
    const emailMatch = o.customer_email?.toLowerCase().includes(term);
    const idMatch = o.id?.toLowerCase().includes(term);
    const matchesSearch = nameMatch || emailMatch || idMatch;
    
    const status = o.fulfillment_status || 'pending';
    const matchesStatus = statusFilter === 'all' || status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen pt-32 px-6 pb-20">
      <div className="max-w-6xl mx-auto">
        
        {/* Header Bar */}
        <AdminNav onLogout={handleLogout} />
        
        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8">
          <div className="flex gap-2">
            {['all', 'pending', 'completed', 'rejected'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 text-xs font-mono uppercase tracking-wider rounded border transition-colors ${
                  statusFilter === s 
                    ? 'border-volt text-volt bg-volt/10' 
                    : 'border-white/20 text-smoke hover:border-white/40 hover:text-bone'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search name, email, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-72 bg-black/50 border border-white/20 rounded px-4 py-2 text-sm text-bone font-mono focus:outline-none focus:border-volt transition-colors"
            />
          </div>
        </div>

        {/* Orders Table */}
        {filteredOrders.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-white/20 rounded-xl bg-white/5">
            <p className="text-smoke font-mono text-sm uppercase tracking-widest">
              No orders found
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 backdrop-blur-md">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 font-mono text-xs uppercase tracking-wider text-smoke">
                  <th className="p-4 whitespace-nowrap">Date</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Items</th>
                  <th className="p-4 text-right">Total</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Order ID</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-sm text-bone">
                {filteredOrders.map((order) => {
                  const status = order.fulfillment_status || 'pending';
                  const badgeColor = status === 'completed' 
                    ? 'text-volt bg-volt/10 border-volt/20' 
                    : status === 'rejected' 
                      ? 'text-red-400 bg-red-400/10 border-red-400/20' 
                      : 'text-smoke bg-white/5 border-white/10';

                  return (
                  <tr key={order.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 whitespace-nowrap text-smoke">
                      {new Date(order.created_at).toLocaleDateString(undefined, { 
                        month: 'short', day: 'numeric', year: 'numeric' 
                      })}
                      <br/>
                      <span className="text-[10px] text-white/30">
                        {new Date(order.created_at).toLocaleTimeString(undefined, { 
                          hour: '2-digit', minute: '2-digit' 
                        })}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-bone">
                        {order.customer_name || '(Guest)'}
                      </div>
                      <div className="text-xs text-smoke">
                        {order.customer_email || 'No email provided'}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1 text-xs">
                        {order.items?.map((item, i) => (
                          <div key={i} className="flex justify-between gap-4">
                            <span className="truncate max-w-[200px]" title={item.description}>
                              {item.description}
                            </span>
                            <span className="text-smoke whitespace-nowrap">× {item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="p-4 text-right font-bold text-volt whitespace-nowrap">
                      ${(order.amount_total / 100).toFixed(2)} {order.currency?.toUpperCase()}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-[10px] uppercase tracking-widest rounded border ${badgeColor}`}>
                        {status}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="text-xs text-white/40 truncate w-24" title={order.id}>
                        {order.id}
                      </div>
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <div className="flex gap-2 justify-end">
                        {status !== 'completed' && (
                          <button 
                            onClick={() => handleStatusChange(order.id, 'completed')}
                            className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-volt hover:bg-volt/10 rounded border border-volt/20 transition-colors"
                          >
                            Complete
                          </button>
                        )}
                        {status !== 'rejected' && (
                          <button 
                            onClick={() => handleStatusChange(order.id, 'rejected')}
                            className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-red-400 hover:bg-red-400/10 rounded border border-red-400/20 transition-colors"
                          >
                            Reject
                          </button>
                        )}
                        {status !== 'pending' && (
                          <button 
                            onClick={() => handleStatusChange(order.id, 'pending')}
                            className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-smoke hover:bg-white/5 rounded border border-white/10 transition-colors"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
