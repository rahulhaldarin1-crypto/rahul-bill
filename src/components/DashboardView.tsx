import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CreditCard,
  FilePlus2,
  Package,
  Search,
  Settings,
  TrendingUp,
  Truck,
  UserPlus,
  Users,
} from 'lucide-react';
import { AppRoute, WorkspaceData } from '../types/business';
import { formatCurrency, todayIsoDate } from '../utils/calculations';
import { BrandLogo } from './BrandLogo';

interface DashboardViewProps {
  workspace: WorkspaceData;
  onNavigate: (route: AppRoute) => void;
  onOpenViewPanel?: () => void;
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
  onOpenViewPanel,
}) => {
  const { settings, clients, products, invoices, expenses } = workspace;
  const sym = settings.currencySymbol || '₹';

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
      title: 'Client List',
      subtitle: 'Search customers, view profiles & order history',
      metric: `${clients.length} Saved`,
      icon: Users,
      accentBg: 'from-[#9333EA] to-[#7E22CE]',
      accentText: 'text-[#7E22CE]',
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
      route: 'products',
      title: 'Products',
      subtitle: 'Catalog, purchase/selling price & stock alerts',
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
      subtitle: 'Logo, business details, GSTIN & backup/restore',
      metric: settings.currencyCode,
      icon: Settings,
      accentBg: 'from-[#6B5B7B] to-[#4A3B59]',
      accentText: 'text-[#4A3B59]',
      borderHover: 'hover:border-[#A78BFA]',
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
            onClick={() => onNavigate('client-bill')}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FilePlus2 className="w-4 h-4" />
            <span>Create Client Bill</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('new-client')}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E6D9EE] bg-white px-4 py-3 text-sm font-semibold text-[#1F122B] hover:border-[#DB2777] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-[#DB2777]" />
            <span>New Client</span>
          </button>
          {onOpenViewPanel && (
            <button
              type="button"
              onClick={onOpenViewPanel}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E6D9EE] bg-white px-4 py-3 text-sm font-semibold text-[#7E22CE] hover:border-[#9333EA] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span>View Panel</span>
            </button>
          )}
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
            View Products
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
