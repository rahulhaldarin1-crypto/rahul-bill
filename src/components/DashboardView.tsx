import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CreditCard,
  FilePlus2,
  Globe,
  LifeBuoy,
  Mail,
  Megaphone,
  Package,
  Rocket,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  Truck,
  UserPlus,
  Users,
} from 'lucide-react';
import { AppRoute, WorkspaceData } from '../types/business';
import {
  formatCurrency,
  resolveSubscriptionEffectiveStatus,
  todayIsoDate,
} from '../utils/calculations';
import { isProductBoostActive } from '../utils/smartDiscovery';
import { BrandLogo } from './BrandLogo';

interface DashboardViewProps {
  workspace: WorkspaceData;
  onNavigate: (route: AppRoute) => void;
}

interface MenuCard {
  route: AppRoute;
  title: string;
  subtitle: string;
  metric: string;
  icon: React.ComponentType<{ className?: string }>;
  accentBg: string;
  accentText: string;
  borderHover: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  workspace,
  onNavigate,
}) => {
  const {
    settings,
    clients,
    products,
    invoices,
    expenses,
    orders = [],
    sellerApplications = [],
    supportChats = [],
    subscriptions = [],
    boostRequests = [],
  } = workspace;
  const sym = settings.currencySymbol || '₹';
  const pendingOrdersCount = orders.filter((o) => o.status === 'Pending').length;
  const pendingSubscriptionsCount = subscriptions.filter(
    (s) => resolveSubscriptionEffectiveStatus(s) === 'pending'
  ).length;
  const activeSubscriptionsCount = subscriptions.filter(
    (s) => resolveSubscriptionEffectiveStatus(s) === 'active'
  ).length;
  const pendingSellerAppsCount = sellerApplications.filter(
    (a) => a.status === 'pending'
  ).length;
  const pendingSellerProductsCount = products.filter(
    (p) =>
      Boolean(p.sellerId) &&
      p.sellerApprovalStatus !== 'approved' &&
      p.sellerApprovalStatus !== 'rejected'
  ).length;
  const pendingSellerTotal = pendingSellerAppsCount + pendingSellerProductsCount;
  const unreadSupportCount = supportChats.reduce(
    (sum, t) => sum + Math.max(0, Number(t.unreadForAdmin) || 0),
    0
  );
  const activeBoostedCount = products.filter((p) =>
    isProductBoostActive(p)
  ).length;
  const pendingBoostRequestsCount = boostRequests.filter(
    (r) => r.status === 'pending_approval'
  ).length;

  const summary = useMemo(() => {
    const today = todayIsoDate();
    const todaySales = invoices
      .filter((i) => i.invoiceDate === today)
      .reduce((s, i) => s + i.totalAmount, 0);
    const totalRevenue = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const pendingDues = invoices.reduce((s, i) => s + i.dueAmount, 0);
    const grossProductProfit = invoices.reduce((s, i) => s + i.profitAmount, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const deliveryChargesBilled = invoices.reduce((s, i) => s + i.deliveryCharge, 0);
    const netProfit = grossProductProfit + deliveryChargesBilled - totalExpenses;
    const lowStockProducts = products.filter(
      (p) => p.stockQty <= (p.lowStockAlert || settings.lowStockThreshold || 5)
    );
    const pendingDeliveries = invoices.filter(
      (i) => i.deliveryStatus === 'Pending' || i.deliveryStatus === 'Processing'
    ).length;

    return {
      todaySales,
      totalRevenue,
      pendingDues,
      netProfit,
      lowStockCount: lowStockProducts.length,
      pendingDeliveries,
    };
  }, [invoices, products, expenses, settings.lowStockThreshold]);

  const menuCards: MenuCard[] = [
    {
      route: 'new-client',
      title: 'New Client',
      subtitle: 'Add customer profile, WhatsApp & delivery address',
      metric: 'Quick Entry',
      icon: UserPlus,
      accentBg: 'from-[#EC4899] to-[#DB2777]',
      accentText: 'text-[#BE185D]',
      borderHover: 'hover:border-[#F472B6]',
    },
    {
      route: 'client-list',
      title: 'Client List & Support',
      subtitle: 'Search customers, order history & live Help Center Support Chat Reply',
      metric:
        unreadSupportCount > 0
          ? `${unreadSupportCount} Chat Unread`
          : `${clients.length} Saved`,
      icon: Users,
      accentBg: 'from-[#9333EA] to-[#7E22CE]',
      accentText: unreadSupportCount > 0 ? 'text-[#DB2777]' : 'text-[#7E22CE]',
      borderHover: 'hover:border-[#C084FC]',
    },
    {
      route: 'seller-hub-manage',
      title: 'Seller Hub Manage',
      subtitle: 'Approve/reject/suspend sellers, manage credentials, KYC/bank docs & seller products',
      metric:
        pendingSellerTotal > 0
          ? `${pendingSellerTotal} Pending`
          : `${sellerApplications.length} Sellers`,
      icon: Store,
      accentBg: 'from-[#DB2777] to-[#9333EA]',
      accentText: pendingSellerTotal > 0 ? 'text-[#BE123C]' : 'text-[#7E22CE]',
      borderHover: 'hover:border-[#F472B6]',
    },
    {
      route: 'help-chat',
      title: 'Help Chat',
      subtitle: 'Live customer support chat inbox synced with Help Center',
      metric:
        unreadSupportCount > 0
          ? `${unreadSupportCount} Unread`
          : `${supportChats.length} Chats`,
      icon: LifeBuoy,
      accentBg: 'from-[#7E22CE] to-[#DB2777]',
      accentText: unreadSupportCount > 0 ? 'text-[#DB2777]' : 'text-[#7E22CE]',
      borderHover: 'hover:border-[#C084FC]',
    },
    {
      route: 'client-bill',
      title: 'Client Bill',
      subtitle: 'Auto invoices, PDF download & WhatsApp share',
      metric: `${invoices.length} Bills`,
      icon: FilePlus2,
      accentBg: 'from-[#D946EF] to-[#A21CAF]',
      accentText: 'text-[#A21CAF]',
      borderHover: 'hover:border-[#E879F9]',
    },
    {
      route: 'sales-report',
      title: 'Sales Report',
      subtitle: 'Daily, weekly, monthly & yearly analytics charts',
      metric: formatCurrency(summary.totalRevenue, sym),
      icon: BarChart3,
      accentBg: 'from-[#8B5CF6] to-[#6D28D9]',
      accentText: 'text-[#6D28D9]',
      borderHover: 'hover:border-[#A78BFA]',
    },
    {
      route: 'orders',
      title: 'Orders',
      subtitle: 'Review COD & UPI orders, payment screenshots & confirm to generate bills',
      metric:
        pendingOrdersCount > 0
          ? `${pendingOrdersCount} Pending`
          : `${orders.length} Orders`,
      icon: ShoppingBag,
      accentBg: 'from-[#DB2777] to-[#E11D48]',
      accentText: pendingOrdersCount > 0 ? 'text-[#BE123C]' : 'text-[#7E22CE]',
      borderHover: 'hover:border-[#FB7185]',
    },
    {
      route: 'products',
      title: 'Product Listing',
      subtitle: 'Add & edit listed products with multiple compressed photos & categories',
      metric: `${products.length} Items`,
      icon: Package,
      accentBg: 'from-[#F43F5E] to-[#E11D48]',
      accentText: 'text-[#BE123C]',
      borderHover: 'hover:border-[#FB7185]',
    },
    {
      route: 'payment-history',
      title: 'Payment History',
      subtitle: 'Track paid bills, pending dues & UPI/Cash logs',
      metric:
        summary.pendingDues > 0
          ? `${formatCurrency(summary.pendingDues, sym)} Due`
          : 'All Settled',
      icon: CreditCard,
      accentBg: 'from-[#A855F7] to-[#7E22CE]',
      accentText: 'text-[#7E22CE]',
      borderHover: 'hover:border-[#C084FC]',
    },
    {
      route: 'delivery-tracking',
      title: 'Delivery Tracking',
      subtitle: 'Manage courier AWB & update order statuses',
      metric: `${summary.pendingDeliveries} In Progress`,
      icon: Truck,
      accentBg: 'from-[#EC4899] to-[#9333EA]',
      accentText: 'text-[#9D174D]',
      borderHover: 'hover:border-[#F472B6]',
    },
    {
      route: 'profit-loss',
      title: 'Profit & Loss',
      subtitle: 'Product margins, expenses & monthly net profit',
      metric: formatCurrency(summary.netProfit, sym),
      icon: TrendingUp,
      accentBg: 'from-[#7E22CE] to-[#581C87]',
      accentText: 'text-[#6B21A8]',
      borderHover: 'hover:border-[#A855F7]',
    },
    {
      route: 'settings',
      title: 'Settings',
      subtitle: 'Logo, background photo, business details & backup',
      metric: settings.currencyCode,
      icon: Settings,
      accentBg: 'from-[#6B5B7B] to-[#4A3B59]',
      accentText: 'text-[#4A3B59]',
      borderHover: 'hover:border-[#A78BFA]',
    },
    {
      route: 'view-panel-control',
      title: 'View Panel Control',
      subtitle: 'Manage top advertisement banner, discount offers & shopping showcase',
      metric: `${
        [
          settings.viewPanel?.advertisement?.enabled &&
            Boolean(
              settings.viewPanel?.advertisement?.imageDataUrl ||
                settings.viewPanel?.advertisement?.videoUrl ||
                settings.viewPanel?.advertisement?.title ||
                settings.viewPanel?.advertisement?.subscriptionAdMode ||
                settings.viewPanel?.advertisement?.autoCycleSubscriptionAd
            ),
          settings.viewPanel?.discount?.enabled,
          settings.viewPanel?.shopping?.enabled,
        ].filter(Boolean).length
      } Active`,
      icon: Megaphone,
      accentBg: 'from-[#DB2777] to-[#7E22CE]',
      accentText: 'text-[#9D174D]',
      borderHover: 'hover:border-[#F472B6]',
    },
    {
      route: 'subscriptions',
      title: 'Subscriptions (₹99 Pass)',
      subtitle: 'Verify online ₹99 payment proofs & manage 28-day Free Delivery subscribers',
      metric:
        pendingSubscriptionsCount > 0
          ? `${pendingSubscriptionsCount} Pending`
          : `${activeSubscriptionsCount} Active`,
      icon: Sparkles,
      accentBg: 'from-[#9333EA] to-[#DB2777]',
      accentText:
        pendingSubscriptionsCount > 0 ? 'text-[#BE123C]' : 'text-[#7E22CE]',
      borderHover: 'hover:border-[#C084FC]',
    },
    {
      route: 'smart-offers-mail',
      title: 'Smart Offers Mail',
      subtitle: 'Target top-ordering & interested category shoppers with custom offer emails',
      metric: 'Top 20 Mail',
      icon: Mail,
      accentBg: 'from-[#EC4899] to-[#7E22CE]',
      accentText: 'text-[#7E22CE]',
      borderHover: 'hover:border-[#F472B6]',
    },
    {
      route: 'boost-controller',
      title: 'Boost Controller',
      subtitle: 'Control 1%–100% product boost power, review seller boost payments & durations',
      metric:
        pendingBoostRequestsCount > 0
          ? `${pendingBoostRequestsCount} Pending · ${activeBoostedCount} Active`
          : activeBoostedCount > 0
            ? `${activeBoostedCount} Boosted`
            : 'Standard Feed',
      icon: Rocket,
      accentBg: 'from-[#DB2777] to-[#7E22CE]',
      accentText:
        pendingBoostRequestsCount > 0
          ? 'text-[#BE123C]'
          : activeBoostedCount > 0
            ? 'text-[#DB2777]'
            : 'text-[#7E22CE]',
      borderHover: 'hover:border-[#F472B6]',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-7 pb-24 md:pb-10">
      {/* Brand Hero Banner */}
      <section className="rounded-3xl border border-[#EFE2F5] bg-gradient-to-br from-[#FFF5FA] via-[#FFFFFF] to-[#F6F0FF] p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-center gap-5 text-center sm:text-left">
          <BrandLogo
            logoDataUrl={settings.logoDataUrl}
            businessName={settings.businessName}
            size={84}
          />
          <div>
            <h1 className="font-display-serif text-3xl sm:text-4xl font-bold tracking-tight text-[#1F122B]">
              {settings.businessName || 'Glamour Galleria'}
            </h1>
            <p className="text-sm sm:text-base font-medium text-[#9D174D] mt-1">
              {settings.tagline || 'Your Style, Our Priority'}
            </p>
            {(settings.address || settings.mobile) && (
              <p className="text-xs text-[#6B5B7B] mt-2">
                {[settings.address, settings.mobile].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('seller-products')}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Package className="w-4 h-4" />
            <span>
              Seller Products
              {pendingSellerProductsCount > 0
                ? ` (${pendingSellerProductsCount})`
                : ''}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('view-panel-control')}
            className="inline-flex items-center gap-2 rounded-xl border border-[#F3D5E8] bg-[#FFF5FA] px-4 py-3 text-sm font-semibold text-[#9D174D] hover:border-[#DB2777] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Megaphone className="w-4 h-4 text-[#DB2777]" />
            <span>ADD Panel Control</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('customer-seller-contacts')}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E6D9EE] bg-white px-4 py-3 text-sm font-semibold text-[#1F122B] hover:border-[#7E22CE] hover:text-[#7E22CE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Users className="w-4 h-4 text-[#7E22CE]" />
            <span>Customer Seller Contact</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('bangladesh-control')}
            className="inline-flex items-center gap-2 rounded-xl border border-[#99F6E4] bg-[#F0FDFA] px-4 py-3 text-sm font-semibold text-[#0F766E] hover:border-[#0F766E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Globe className="w-4 h-4 text-[#0F766E]" />
            <span>Bangladesh</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('subscriptions')}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E9D5FF] bg-[#FAF5FF] px-4 py-3 text-sm font-semibold text-[#6D28D9] hover:border-[#7E22CE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-[#7E22CE]" />
            <span>
              Subscriptions
              {pendingSubscriptionsCount > 0
                ? ` (${pendingSubscriptionsCount})`
                : ''}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('boost-controller')}
            className="inline-flex items-center gap-2 rounded-xl border border-[#F3D5E8] bg-gradient-to-r from-[#FFF5FA] to-[#FAF5FF] px-4 py-3 text-sm font-semibold text-[#9D174D] hover:border-[#DB2777] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Rocket className="w-4 h-4 text-[#DB2777]" />
            <span>
              Boost Controller
              {pendingBoostRequestsCount > 0
                ? ` (${pendingBoostRequestsCount} Pending)`
                : activeBoostedCount > 0
                  ? ` (${activeBoostedCount})`
                  : ''}
            </span>
          </button>
        </div>
      </section>

      {/* Low Stock Alert Strip (only if real products are low) */}
      {summary.lowStockCount > 0 && (
        <div className="rounded-2xl border border-[#FBCFE8] bg-[#FFF1F6] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm text-[#9D174D] font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Low stock alert: <strong className="font-mono-num">{summary.lowStockCount}</strong>{' '}
              {summary.lowStockCount === 1 ? 'product needs' : 'products need'} restocking.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('products')}
            className="text-xs font-semibold text-[#7E22CE] hover:underline underline-offset-4 whitespace-nowrap cursor-pointer"
          >
            View Product Listing
          </button>
        </div>
      )}

      {/* 4 Live KPI Metrics */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4 sm:p-5">
          <div className="text-xs font-medium text-[#6B5B7B]">Today&apos;s Sales</div>
          <div className="font-mono-num text-xl sm:text-2xl font-bold text-[#1F122B] mt-1">
            {formatCurrency(summary.todaySales, sym)}
          </div>
        </div>
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4 sm:p-5">
          <div className="text-xs font-medium text-[#6B5B7B]">Total Revenue</div>
          <div className="font-mono-num text-xl sm:text-2xl font-bold text-[#7E22CE] mt-1">
            {formatCurrency(summary.totalRevenue, sym)}
          </div>
        </div>
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4 sm:p-5">
          <div className="text-xs font-medium text-[#6B5B7B]">Pending Payments</div>
          <div className="font-mono-num text-xl sm:text-2xl font-bold text-[#DB2777] mt-1">
            {formatCurrency(summary.pendingDues, sym)}
          </div>
        </div>
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4 sm:p-5">
          <div className="text-xs font-medium text-[#6B5B7B]">Net Profit</div>
          <div
            className={`font-mono-num text-xl sm:text-2xl font-bold mt-1 ${
              summary.netProfit >= 0 ? 'text-[#15803D]' : 'text-[#BE123C]'
            }`}
          >
            {formatCurrency(summary.netProfit, sym)}
          </div>
        </div>
      </section>

      {/* 9 Colorful Feature Cards */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#1F122B]">Business Menu</h2>
          <span className="text-xs text-[#6B5B7B] font-mono-num">
            {clients.length} Clients · {products.length} Products · {invoices.length} Orders
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {menuCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.route}
                type="button"
                onClick={() => onNavigate(card.route)}
                className={`group text-left rounded-2xl border border-[#EFE2F5] bg-white p-5 transition-all hover:shadow-md ${card.borderHover} cursor-pointer flex flex-col justify-between gap-4 min-h-[144px]`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.accentBg} flex items-center justify-center text-white shrink-0`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={`font-mono-num text-xs font-semibold ${card.accentText}`}>
                    {card.metric}
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-[#1F122B] group-hover:text-[#7E22CE] transition-colors">
                      {card.title}
                    </h3>
                    <ArrowRight className="w-4 h-4 text-[#9D8BAE] group-hover:text-[#DB2777] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                  <p className="text-xs text-[#6B5B7B] mt-1 leading-relaxed">
                    {card.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
