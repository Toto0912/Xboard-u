import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { UserLayout } from '@/components/layout/UserLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { getStoredToken } from '@/lib/storage';
import { useThemeStore } from '@/stores/useThemeStore';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const ForgetPasswordPage = lazy(() => import('@/pages/auth/ForgetPasswordPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const KnowledgePage = lazy(() => import('@/pages/KnowledgePage'));
const PlanPage = lazy(() => import('@/pages/PlanPage'));
const PlanOrderPage = lazy(() => import('@/pages/PlanOrderPage'));
const OrderListPage = lazy(() => import('@/pages/OrderListPage'));
const OrderDetailPage = lazy(() => import('@/pages/OrderDetailPage'));
const NodeListPage = lazy(() => import('@/pages/NodeListPage'));
const InvitePage = lazy(() => import('@/pages/InvitePage'));
const TicketPage = lazy(() => import('@/pages/TicketPage'));
const TicketDetailPage = lazy(() => import('@/pages/TicketDetailPage'));
const TrafficLogPage = lazy(() => import('@/pages/TrafficLogPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-44 w-full" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const token = getStoredToken();
  if (!token) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const mode = useThemeStore((s) => s.mode);
  const resolvedTheme =
    mode === 'system'
      ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode;

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgetpassword" element={<ForgetPasswordPage />} />
            <Route path="/forget" element={<ForgetPasswordPage />} />

            <Route
              element={
                <RequireAuth>
                  <UserLayout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/knowledge" element={<KnowledgePage />} />
              <Route path="/plan" element={<PlanPage />} />
              <Route path="/plan/:plan_id" element={<PlanOrderPage />} />
              <Route path="/order" element={<OrderListPage />} />
              <Route path="/order/:trade_no" element={<OrderDetailPage />} />
              <Route path="/node" element={<NodeListPage />} />
              <Route path="/invite" element={<InvitePage />} />
              <Route path="/ticket" element={<TicketPage />} />
              <Route path="/ticket/:ticket_id" element={<TicketDetailPage />} />
              <Route path="/traffic" element={<TrafficLogPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/404" element={<NotFoundPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </Suspense>
      </HashRouter>
      <Toaster position="top-right" richColors theme={resolvedTheme} />
    </QueryClientProvider>
  );
}
