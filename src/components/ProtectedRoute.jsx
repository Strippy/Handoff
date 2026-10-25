import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback /> }) {
  const { isAuthenticated, isLoadingAuth, authChecked } = useAuth();
  const location = useLocation();

  if (isLoadingAuth || !authChecked) return fallback;

  if (!isAuthenticated) {
    const here = location.pathname + location.search;
    const target = here && here !== '/' ? `/login?returnTo=${encodeURIComponent(here)}` : '/login';
    return <Navigate to={target} replace />;
  }

  return <Outlet />;
}
