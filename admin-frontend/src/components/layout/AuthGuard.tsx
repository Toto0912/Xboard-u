import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

const PUBLIC_PATHS = new Set(['/sign-in', '/404', '/500', '/503']);

export function AuthGuard({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  const navigate = useNavigate();
  const isPublic = PUBLIC_PATHS.has(location.pathname);

  useEffect(() => {
    if (!token && !isPublic) {
      const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
      void navigate(`/sign-in?redirect=${redirect}`, { replace: true });
    }
  }, [token, isPublic, location.pathname, location.search, navigate]);

  if (!token && !isPublic) {
    return null;
  }

  return <>{children}</>;
}
