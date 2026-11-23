import { lazy, Suspense, type ReactNode } from 'react';
import { createHashRouter } from 'react-router-dom';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { FLAT_NAV_ITEMS } from '@/config/navigation';

const SignInPage = lazy(() => import('@/pages/SignInPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const SystemConfigPage = lazy(() => import('@/pages/SystemConfigPage'));
const PaymentConfigPage = lazy(() => import('@/pages/PaymentConfigPage'));
const PluginManagementPage = lazy(() => import('@/pages/PluginManagementPage'));
const ThemeConfigPage = lazy(() => import('@/pages/ThemeConfigPage'));
const ServerGroupPage = lazy(() => import('@/pages/ServerGroupPage'));
const ServerRoutePage = lazy(() => import('@/pages/ServerRoutePage'));
const ServerMachinePage = lazy(() => import('@/pages/ServerMachinePage'));
const ServerManagePage = lazy(() => import('@/pages/ServerManagePage'));
const PlanManagePage = lazy(() => import('@/pages/PlanManagePage'));
const OrderManagePage = lazy(() => import('@/pages/OrderManagePage'));
const CouponManagePage = lazy(() => import('@/pages/CouponManagePage'));
const GiftCardManagePage = lazy(() => import('@/pages/GiftCardManagePage'));
const UserManagePage = lazy(() => import('@/pages/UserManagePage'));
const TrafficResetLogsPage = lazy(() => import('@/pages/TrafficResetLogsPage'));
const NoticeManagePage = lazy(() => import('@/pages/NoticeManagePage'));
const KnowledgeManagePage = lazy(() => import('@/pages/KnowledgeManagePage'));
const TicketManagePage = lazy(() => import('@/pages/TicketManagePage'));
const ModulePlaceholderPage = lazy(() => import('@/pages/ModulePlaceholderPage'));
const ErrorPage = lazy(() => import('@/pages/ErrorPage'));

function LazyFallback() {
  return (
    <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
      Loading...
    </div>
  );
}

function withSuspense(node: ReactNode) {
  return <Suspense fallback={<LazyFallback />}>{node}</Suspense>;
}

const implementedElementByHref: Record<string, ReactNode> = {
  '/': <DashboardPage />,
  '/config/system': <SystemConfigPage />,
  '/config/payment': <PaymentConfigPage />,
  '/config/plugin': <PluginManagementPage />,
  '/config/theme': <ThemeConfigPage />,
  '/server/group': <ServerGroupPage />,
  '/server/route': <ServerRoutePage />,
  '/server/machine': <ServerMachinePage />,
  '/server/manage': <ServerManagePage />,
  '/finance/plan': <PlanManagePage />,
  '/finance/order': <OrderManagePage />,
  '/finance/coupon': <CouponManagePage />,
  '/finance/gift-card': <GiftCardManagePage />,
  '/user/manage': <UserManagePage />,
  '/user/traffic-reset-logs': <TrafficResetLogsPage />,
  '/config/notice': <NoticeManagePage />,
  '/config/knowledge': <KnowledgeManagePage />,
  '/user/ticket': <TicketManagePage />,
};

const protectedChildren = FLAT_NAV_ITEMS.map((item) => {
  const page = implementedElementByHref[item.href] ?? <ModulePlaceholderPage item={item} />;
  if (item.href === '/') {
    return {
      index: true,
      element: withSuspense(page),
    };
  }
  return {
    path: item.href.replace(/^\//, ''),
    element: withSuspense(page),
  };
});

export const router = createHashRouter([
  {
    path: '/sign-in',
    element: withSuspense(<SignInPage />),
  },
  {
    path: '/404',
    element: withSuspense(<ErrorPage code="404" />),
  },
  {
    path: '/500',
    element: withSuspense(<ErrorPage code="500" />),
  },
  {
    path: '/503',
    element: withSuspense(<ErrorPage code="503" />),
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <AdminLayout />
      </AuthGuard>
    ),
    children: protectedChildren,
  },
  {
    path: '*',
    element: withSuspense(<ErrorPage code="404" />),
  },
]);
