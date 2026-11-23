import {
  Activity,
  Bell,
  BookOpen,
  CreditCard,
  FileText,
  Gift,
  LayoutDashboard,
  MessageSquare,
  Network,
  Package,
  Palette,
  Plug,
  Route as RouteIcon,
  Server,
  Settings,
  Shield,
  Sliders,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavLeafItem {
  id: string;
  titleKey: string;
  href: string;
  icon: LucideIcon;
  phaseKey: 'phase2' | 'phase3' | 'phase4' | 'phase5';
  sampleEndpoint: string;
}

export interface NavGroupItem {
  id: string;
  titleKey: string;
  icon: LucideIcon;
  children: NavLeafItem[];
}

export type NavItem = NavLeafItem | NavGroupItem;

export function isNavGroup(item: NavItem): item is NavGroupItem {
  return 'children' in item;
}

export const ADMIN_NAVIGATION: NavItem[] = [
  {
    id: 'dashboard',
    titleKey: 'nav.dashboard',
    href: '/',
    icon: LayoutDashboard,
    phaseKey: 'phase2',
    sampleEndpoint: '/stat/getOverride',
  },
  {
    id: 'system-management',
    titleKey: 'nav.systemManagement',
    icon: Settings,
    children: [
      {
        id: 'system-config',
        titleKey: 'nav.systemConfig',
        href: '/config/system',
        icon: Sliders,
        phaseKey: 'phase2',
        sampleEndpoint: '/config/fetch',
      },
      {
        id: 'plugin-management',
        titleKey: 'nav.pluginManagement',
        href: '/config/plugin',
        icon: Plug,
        phaseKey: 'phase2',
        sampleEndpoint: '/plugin/getPlugins',
      },
      {
        id: 'theme-config',
        titleKey: 'nav.themeConfig',
        href: '/config/theme',
        icon: Palette,
        phaseKey: 'phase2',
        sampleEndpoint: '/theme/getThemes',
      },
      {
        id: 'notice-management',
        titleKey: 'nav.noticeManagement',
        href: '/config/notice',
        icon: Bell,
        phaseKey: 'phase5',
        sampleEndpoint: '/notice/fetch',
      },
      {
        id: 'payment-config',
        titleKey: 'nav.paymentConfig',
        href: '/config/payment',
        icon: CreditCard,
        phaseKey: 'phase2',
        sampleEndpoint: '/payment/fetch',
      },
      {
        id: 'knowledge-management',
        titleKey: 'nav.knowledgeManagement',
        href: '/config/knowledge',
        icon: BookOpen,
        phaseKey: 'phase5',
        sampleEndpoint: '/knowledge/fetch',
      },
    ],
  },
  {
    id: 'node-management',
    titleKey: 'nav.nodeManagement',
    icon: Network,
    children: [
      {
        id: 'machine-management',
        titleKey: 'nav.machineManagement',
        href: '/server/machine',
        icon: Server,
        phaseKey: 'phase3',
        sampleEndpoint: '/server/machine/fetch',
      },
      {
        id: 'node-manage',
        titleKey: 'nav.nodeManage',
        href: '/server/manage',
        icon: Network,
        phaseKey: 'phase3',
        sampleEndpoint: '/server/manage/getNodes',
      },
      {
        id: 'permission-group-management',
        titleKey: 'nav.permissionGroupManagement',
        href: '/server/group',
        icon: Shield,
        phaseKey: 'phase3',
        sampleEndpoint: '/server/group/fetch',
      },
      {
        id: 'route-management',
        titleKey: 'nav.routeManagement',
        href: '/server/route',
        icon: RouteIcon,
        phaseKey: 'phase3',
        sampleEndpoint: '/server/route/fetch',
      },
    ],
  },
  {
    id: 'subscription-management',
    titleKey: 'nav.subscriptionManagement',
    icon: Package,
    children: [
      {
        id: 'plan-management',
        titleKey: 'nav.planManagement',
        href: '/finance/plan',
        icon: Package,
        phaseKey: 'phase4',
        sampleEndpoint: '/plan/fetch',
      },
      {
        id: 'order-management',
        titleKey: 'nav.orderManagement',
        href: '/finance/order',
        icon: FileText,
        phaseKey: 'phase4',
        sampleEndpoint: '/order/fetch',
      },
      {
        id: 'coupon-management',
        titleKey: 'nav.couponManagement',
        href: '/finance/coupon',
        icon: Ticket,
        phaseKey: 'phase4',
        sampleEndpoint: '/coupon/fetch',
      },
      {
        id: 'gift-card-management',
        titleKey: 'nav.giftCardManagement',
        href: '/finance/gift-card',
        icon: Gift,
        phaseKey: 'phase4',
        sampleEndpoint: '/gift-card/templates',
      },
    ],
  },
  {
    id: 'user-management',
    titleKey: 'nav.userManagement',
    icon: Users,
    children: [
      {
        id: 'user-manage',
        titleKey: 'nav.userManage',
        href: '/user/manage',
        icon: Users,
        phaseKey: 'phase4',
        sampleEndpoint: '/user/fetch',
      },
      {
        id: 'ticket-management',
        titleKey: 'nav.ticketManagement',
        href: '/user/ticket',
        icon: MessageSquare,
        phaseKey: 'phase5',
        sampleEndpoint: '/ticket/fetch',
      },
      {
        id: 'traffic-reset-logs',
        titleKey: 'nav.trafficResetLogs',
        href: '/user/traffic-reset-logs',
        icon: Activity,
        phaseKey: 'phase4',
        sampleEndpoint: '/traffic-reset/logs',
      },
    ],
  },
];

export const FLAT_NAV_ITEMS: Array<NavLeafItem & { groupTitleKey?: string }> =
  ADMIN_NAVIGATION.flatMap((item) =>
    isNavGroup(item)
      ? item.children.map((child) => ({ ...child, groupTitleKey: item.titleKey }))
      : [item],
  );
