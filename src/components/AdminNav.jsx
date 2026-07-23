import { Link, useLocation } from 'react-router-dom';

export default function AdminNav({ onLogout }) {
  const location = useLocation();

  const links = [
    { name: 'Orders', path: '/admin/orders' },
    { name: 'Products', path: '/admin/products' },
  ];

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 mb-8 border-b border-white/10 pb-6">
      <div>
        <h1 className="text-3xl font-display uppercase tracking-tight text-bone mb-2">
          Admin Dashboard
        </h1>
        <div className="flex items-center gap-6 mt-2">
          {links.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.name}
                to={link.path}
                className={`font-mono text-sm uppercase tracking-widest transition-colors ${
                  isActive ? 'text-volt border-b border-volt pb-1' : 'text-smoke hover:text-bone pb-1'
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
        {onLogout && (
          <button
            onClick={onLogout}
            className="px-4 py-2 border border-white/20 rounded text-smoke hover:text-bone hover:bg-white/5 transition-colors font-mono text-xs uppercase tracking-widest whitespace-nowrap"
          >
            Log out
          </button>
        )}
      </div>
    </div>
  );
}
