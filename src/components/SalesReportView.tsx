import React, { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Invoice } from '../types/business';
import { formatCurrency, todayIsoDate } from '../utils/calculations';

interface SalesReportViewProps {
  invoices: Invoice[];
  currencySymbol: string;
  onBack: () => void;
}

type Timeframe = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface ChartBucket {
  label: string;
  revenue: number;
  profit: number;
  orders: number;
}

export const SalesReportView: React.FC<SalesReportViewProps> = ({
  invoices,
  currencySymbol,
  onBack,
}) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('monthly');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const today = todayIsoDate();

  const { filteredInvoices, buckets } = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    if (timeframe === 'daily') {
      // Last 7 days daily breakdown + today's focus
      const list = invoices.filter((i) => i.invoiceDate === today);
      const bucketList: ChartBucket[] = [];
      for (let offset = 6; offset >= 0; offset--) {
        const d = new Date(now);
        d.setDate(now.getDate() - offset);
        const iso = d.toISOString().slice(0, 10);
        const dayInvs = invoices.filter((i) => i.invoiceDate === iso);
        bucketList.push({
          label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          revenue: dayInvs.reduce((s, i) => s + i.totalAmount, 0),
          profit: dayInvs.reduce((s, i) => s + i.profitAmount, 0),
          orders: dayInvs.length,
        });
      }
      return { filteredInvoices: list, buckets: bucketList };
    }

    if (timeframe === 'weekly') {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      const startIso = start.toISOString().slice(0, 10);
      const list = invoices.filter((i) => i.invoiceDate >= startIso && i.invoiceDate <= today);
      const bucketList: ChartBucket[] = [];
      for (let offset = 6; offset >= 0; offset--) {
        const d = new Date(now);
        d.setDate(now.getDate() - offset);
        const iso = d.toISOString().slice(0, 10);
        const dayInvs = invoices.filter((i) => i.invoiceDate === iso);
        bucketList.push({
          label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
          revenue: dayInvs.reduce((s, i) => s + i.totalAmount, 0),
          profit: dayInvs.reduce((s, i) => s + i.profitAmount, 0),
          orders: dayInvs.length,
        });
      }
      return { filteredInvoices: list, buckets: bucketList };
    }

    if (timeframe === 'monthly') {
      const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
      const list = invoices.filter((i) => i.invoiceDate.startsWith(monthPrefix));
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      // Group into 4-week buckets for clean chart readability
      const ranges = [
        { label: 'Days 1–7', min: 1, max: 7 },
        { label: 'Days 8–14', min: 8, max: 14 },
        { label: 'Days 15–21', min: 15, max: 21 },
        { label: `Days 22–${daysInMonth}`, min: 22, max: daysInMonth },
      ];
      const bucketList: ChartBucket[] = ranges.map((r) => {
        const chunk = list.filter((i) => {
          const dayNum = parseInt(i.invoiceDate.slice(8, 10), 10);
          return dayNum >= r.min && dayNum <= r.max;
        });
        return {
          label: r.label,
          revenue: chunk.reduce((s, i) => s + i.totalAmount, 0),
          profit: chunk.reduce((s, i) => s + i.profitAmount, 0),
          orders: chunk.length,
        };
      });
      return { filteredInvoices: list, buckets: bucketList };
    }

    // Yearly: 12 months of current year
    const yearPrefix = `${currentYear}-`;
    const list = invoices.filter((i) => i.invoiceDate.startsWith(yearPrefix));
    const bucketList: ChartBucket[] = [];
    for (let m = 0; m < 12; m++) {
      const mPrefix = `${currentYear}-${String(m + 1).padStart(2, '0')}`;
      const mInvs = list.filter((i) => i.invoiceDate.startsWith(mPrefix));
      const d = new Date(currentYear, m, 1);
      bucketList.push({
        label: d.toLocaleDateString('en-IN', { month: 'short' }),
        revenue: mInvs.reduce((s, i) => s + i.totalAmount, 0),
        profit: mInvs.reduce((s, i) => s + i.profitAmount, 0),
        orders: mInvs.length,
      });
    }
    return { filteredInvoices: list, buckets: bucketList };
  }, [invoices, timeframe, today]);

  const metrics = useMemo(() => {
    const totalOrders = filteredInvoices.length;
    const totalRevenue = filteredInvoices.reduce((s, i) => s + i.totalAmount, 0);
    const totalProfit = filteredInvoices.reduce((s, i) => s + i.profitAmount, 0);
    const pendingPayments = filteredInvoices.reduce((s, i) => s + i.dueAmount, 0);
    const paidAmount = filteredInvoices.reduce((s, i) => s + i.paidAmount, 0);

    const byMethod = {
      UPI: 0,
      Cash: 0,
      'Bank Transfer': 0,
    };
    for (const inv of filteredInvoices) {
      byMethod[inv.paymentMethod] += inv.paidAmount;
    }

    // Top products in period
    const prodMap: Record<
      string,
      { name: string; qty: number; revenue: number; profit: number }
    > = {};
    for (const inv of filteredInvoices) {
      for (const item of inv.items) {
        const key = item.productName.trim() || 'Unnamed Product';
        if (!prodMap[key]) {
          prodMap[key] = { name: key, qty: 0, revenue: 0, profit: 0 };
        }
        prodMap[key].qty += item.quantity;
        prodMap[key].revenue += item.lineTotal;
        prodMap[key].profit += item.lineProfit;
      }
    }

    const topProducts = Object.values(prodMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    return {
      totalOrders,
      totalRevenue,
      totalProfit,
      pendingPayments,
      paidAmount,
      byMethod,
      topProducts,
    };
  }, [filteredInvoices]);

  const maxBucketValue = Math.max(
    1,
    ...buckets.map((b) => Math.max(b.revenue, b.profit))
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          <div>
            <h1 className="font-display-serif text-2xl font-bold text-[#1F122B]">
              Sales Report &amp; Analytics
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              Track daily, weekly, monthly, and yearly revenue, profit, and collection trends.
            </p>
          </div>
        </div>

        {/* Timeframe Segmented Control */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F4ECF8] border border-[#E6D9EE] shrink-0">
          {(
            [
              { id: 'daily', label: 'Daily' },
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Monthly' },
              { id: 'yearly', label: 'Yearly' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTimeframe(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                timeframe === tab.id
                  ? 'bg-white text-[#7E22CE] shadow-xs'
                  : 'text-[#5B4B6B] hover:text-[#1F122B]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5">
          <div className="text-xs font-medium text-[#6B5B7B]">Total Orders</div>
          <div className="font-mono-num text-2xl font-bold text-[#1F122B] mt-1">
            {metrics.totalOrders}
          </div>
        </div>
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5">
          <div className="text-xs font-medium text-[#6B5B7B]">Total Revenue</div>
          <div className="font-mono-num text-2xl font-bold text-[#7E22CE] mt-1">
            {formatCurrency(metrics.totalRevenue, currencySymbol)}
          </div>
        </div>
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5">
          <div className="text-xs font-medium text-[#6B5B7B]">Total Profit</div>
          <div className="font-mono-num text-2xl font-bold text-[#15803D] mt-1">
            {formatCurrency(metrics.totalProfit, currencySymbol)}
          </div>
        </div>
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5">
          <div className="text-xs font-medium text-[#6B5B7B]">Pending Payments</div>
          <div className="font-mono-num text-2xl font-bold text-[#DB2777] mt-1">
            {formatCurrency(metrics.pendingPayments, currencySymbol)}
          </div>
        </div>
      </div>

      {/* Interactive Revenue & Profit Chart + Payment Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <div>
              <h2 className="text-base font-bold text-[#1F122B]">
                Revenue &amp; Profit Trend
              </h2>
              <p className="text-xs text-[#6B5B7B]">
                Hover over any bar to inspect exact period figures.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-[#4A3B59]">
                <span className="w-3 h-3 rounded-xs bg-[#9333EA] inline-block" />
                Revenue
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-[#4A3B59]">
                <span className="w-3 h-3 rounded-xs bg-[#EC4899] inline-block" />
                Profit
              </span>
            </div>
          </div>

          <div className="relative">
            {hoveredIdx !== null && buckets[hoveredIdx] && (
              <div className="mb-3 rounded-xl border border-[#EFE2F5] bg-[#FDF9FC] px-3.5 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-[#1F122B]">
                  {buckets[hoveredIdx].label} ({buckets[hoveredIdx].orders} orders)
                </span>
                <div className="flex items-center gap-4 font-mono-num">
                  <span className="text-[#7E22CE] font-semibold">
                    Rev: {formatCurrency(buckets[hoveredIdx].revenue, currencySymbol)}
                  </span>
                  <span className="text-[#DB2777] font-semibold">
                    Profit: {formatCurrency(buckets[hoveredIdx].profit, currencySymbol)}
                  </span>
                </div>
              </div>
            )}

            <div className="h-64 flex items-end gap-2 sm:gap-3 pt-4 pb-2 border-b border-[#EFE2F5]">
              {buckets.map((bucket, idx) => {
                const revPct = Math.round((bucket.revenue / maxBucketValue) * 100);
                const profPct = Math.round(
                  (Math.max(0, bucket.profit) / maxBucketValue) * 100
                );
                return (
                  <div
                    key={bucket.label}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className="flex-1 h-full flex flex-col justify-end items-center gap-1.5 group cursor-pointer"
                  >
                    <div className="w-full flex-1 flex items-end justify-center gap-1 px-0.5">
                      <div
                        style={{ height: `${Math.max(bucket.revenue > 0 ? 6 : 2, revPct)}%` }}
                        className="w-3 sm:w-4 rounded-t-md bg-gradient-to-t from-[#7E22CE] to-[#A855F7] transition-all group-hover:opacity-85"
                        title={`Revenue: ${formatCurrency(bucket.revenue, currencySymbol)}`}
                      />
                      <div
                        style={{ height: `${Math.max(bucket.profit > 0 ? 6 : 2, profPct)}%` }}
                        className="w-3 sm:w-4 rounded-t-md bg-gradient-to-t from-[#DB2777] to-[#F472B6] transition-all group-hover:opacity-85"
                        title={`Profit: ${formatCurrency(bucket.profit, currencySymbol)}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 sm:gap-3 pt-2">
              {buckets.map((b) => (
                <div
                  key={b.label}
                  className="flex-1 text-center text-[10px] sm:text-[11px] font-medium text-[#6B5B7B] truncate"
                >
                  {b.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Collection & Payment Breakdown */}
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#1F122B]">
              Collection &amp; Payment Mix
            </h2>
            <p className="text-xs text-[#6B5B7B]">
              Collected vs pending payments across methods.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-[#4A3B59]">Collected Amount</span>
                <span className="font-mono-num font-bold text-[#15803D]">
                  {formatCurrency(metrics.paidAmount, currencySymbol)}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-[#F4ECF8] overflow-hidden">
                <div
                  style={{
                    width: `${
                      metrics.totalRevenue > 0
                        ? Math.round((metrics.paidAmount / metrics.totalRevenue) * 100)
                        : 0
                    }%`,
                  }}
                  className="h-full bg-gradient-to-r from-[#7E22CE] to-[#DB2777]"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-[#4A3B59]">Pending Due</span>
                <span className="font-mono-num font-bold text-[#BE123C]">
                  {formatCurrency(metrics.pendingPayments, currencySymbol)}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-[#FFF1F2] overflow-hidden">
                <div
                  style={{
                    width: `${
                      metrics.totalRevenue > 0
                        ? Math.round((metrics.pendingPayments / metrics.totalRevenue) * 100)
                        : 0
                    }%`,
                  }}
                  className="h-full bg-[#E11D48]"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#F4ECF8] space-y-2.5 text-xs">
            <div className="font-semibold text-[#4A3B59]">By Payment Method</div>
            {(['UPI', 'Cash', 'Bank Transfer'] as const).map((method) => {
              const val = metrics.byMethod[method];
              const pct =
                metrics.paidAmount > 0 ? Math.round((val / metrics.paidAmount) * 100) : 0;
              return (
                <div key={method} className="flex items-center justify-between">
                  <span className="text-[#5B4B6B]">{method}</span>
                  <span className="font-mono-num font-semibold text-[#1F122B]">
                    {formatCurrency(val, currencySymbol)} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Selling Products in Period */}
      <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-bold text-[#1F122B]">Top Performing Products</h2>
        {metrics.topProducts.length === 0 ? (
          <p className="text-xs text-[#6B5B7B]">
            No sales recorded for this timeframe yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#EFE2F5] text-[#5B4B6B] font-semibold">
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3 text-right">Units Sold</th>
                  <th className="py-2.5 px-3 text-right">Revenue</th>
                  <th className="py-2.5 px-3 text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4ECF8]">
                {metrics.topProducts.map((p) => (
                  <tr key={p.name}>
                    <td className="py-2.5 px-3 font-semibold text-[#1F122B]">{p.name}</td>
                    <td className="py-2.5 px-3 text-right font-mono-num">{p.qty}</td>
                    <td className="py-2.5 px-3 text-right font-mono-num font-semibold text-[#7E22CE]">
                      {formatCurrency(p.revenue, currencySymbol)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num font-semibold text-[#15803D]">
                      {formatCurrency(p.profit, currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
