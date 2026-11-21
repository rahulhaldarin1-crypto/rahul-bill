import React, { useMemo, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { ExpenseCategory, ExpenseRecord, Invoice } from '../types/business';
import { formatCurrency, todayIsoDate } from '../utils/calculations';
import { ConfirmModal } from './ConfirmModal';

interface ProfitLossViewProps {
  invoices: Invoice[];
  expenses: ExpenseRecord[];
  currencySymbol: string;
  onBack: () => void;
  onAddExpense: (payload: Omit<ExpenseRecord, 'id' | 'createdAt'>) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Delivery',
  'Packaging',
  'Marketing',
  'Rent & Utilities',
  'Staff',
  'Other',
];

export const ProfitLossView: React.FC<ProfitLossViewProps> = ({
  invoices,
  expenses,
  currencySymbol,
  onBack,
  onAddExpense,
  onDeleteExpense,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Delivery');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayIsoDate);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRecord | null>(null);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const inv of invoices) {
      if (inv.invoiceDate.length >= 7) set.add(inv.invoiceDate.slice(0, 7));
    }
    for (const exp of expenses) {
      if (exp.expenseDate.length >= 7) set.add(exp.expenseDate.slice(0, 7));
    }
    return Array.from(set).sort().reverse();
  }, [invoices, expenses]);

  const {
    totalSellingAmount,
    totalPurchaseCost,
    deliveryChargedToCustomers,
    deliveryExpenses,
    otherExpenses,
    netProfitLoss,
    productBreakdown,
    monthlyReport,
    filteredExpenses,
  } = useMemo(() => {
    const fInvs =
      selectedMonth === 'ALL'
        ? invoices
        : invoices.filter((i) => i.invoiceDate.startsWith(selectedMonth));
    const fExps =
      selectedMonth === 'ALL'
        ? expenses
        : expenses.filter((e) => e.expenseDate.startsWith(selectedMonth));

    const selling = fInvs.reduce(
      (s, i) => s + Math.max(0, i.subtotal - i.discount),
      0
    );
    const purchase = fInvs.reduce((s, i) => s + i.totalPurchaseCost, 0);
    const delBilled = fInvs.reduce((s, i) => s + i.deliveryCharge, 0);
    const delExp = fExps
      .filter((e) => e.category === 'Delivery')
      .reduce((s, e) => s + e.amount, 0);
    const otherExp = fExps
      .filter((e) => e.category !== 'Delivery')
      .reduce((s, e) => s + e.amount, 0);

    const net = selling + delBilled - purchase - delExp - otherExp;

    // Product-wise profit map
    const prodMap: Record<
      string,
      { name: string; qty: number; purchaseCost: number; sellingAmount: number; profit: number }
    > = {};
    for (const inv of fInvs) {
      for (const item of inv.items) {
        const key = item.productName.trim() || 'Unnamed Product';
        if (!prodMap[key]) {
          prodMap[key] = {
            name: key,
            qty: 0,
            purchaseCost: 0,
            sellingAmount: 0,
            profit: 0,
          };
        }
        prodMap[key].qty += item.quantity;
        prodMap[key].purchaseCost += item.lineCost;
        prodMap[key].sellingAmount += item.lineTotal;
        prodMap[key].profit += item.lineProfit;
      }
    }

    // Monthly breakdown (always across all months)
    const monthSet = new Set<string>();
    for (const i of invoices) monthSet.add(i.invoiceDate.slice(0, 7));
    for (const e of expenses) monthSet.add(e.expenseDate.slice(0, 7));
    const monthly = Array.from(monthSet)
      .filter((m) => m.length === 7)
      .sort()
      .reverse()
      .map((month) => {
        const mInvs = invoices.filter((i) => i.invoiceDate.startsWith(month));
        const mExps = expenses.filter((e) => e.expenseDate.startsWith(month));
        const mRevenue = mInvs.reduce((s, i) => s + i.totalAmount, 0);
        const mPurchase = mInvs.reduce((s, i) => s + i.totalPurchaseCost, 0);
        const mExpense = mExps.reduce((s, e) => s + e.amount, 0);
        return {
          month,
          orders: mInvs.length,
          revenue: mRevenue,
          purchaseCost: mPurchase,
          expenses: mExpense,
          netProfit: mRevenue - mPurchase - mExpense,
        };
      });

    return {
      totalSellingAmount: selling,
      totalPurchaseCost: purchase,
      deliveryChargedToCustomers: delBilled,
      deliveryExpenses: delExp,
      otherExpenses: otherExp,
      netProfitLoss: net,
      productBreakdown: Object.values(prodMap).sort((a, b) => b.profit - a.profit),
      monthlyReport: monthly,
      filteredExpenses: fExps,
    };
  }, [invoices, expenses, selectedMonth]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const amt = Number(amount) || 0;
    if (!title.trim() || amt <= 0) {
      setError('Please enter an expense title and positive amount.');
      return;
    }
    setSaving(true);
    try {
      await onAddExpense({
        title: title.trim(),
        category,
        amount: amt,
        expenseDate,
        note: note.trim(),
      });
      setTitle('');
      setAmount('');
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
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
              Profit &amp; Loss Statement
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              Product-wise profit, purchase costs, delivery &amp; business expenses, and monthly net earnings.
            </p>
          </div>
        </div>

        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-sm font-medium text-[#1F122B] cursor-pointer"
        >
          <option value="ALL">All Time</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* P&L Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4">
          <div className="text-xs text-[#6B5B7B]">Selling Amount</div>
          <div className="font-mono-num text-lg font-bold text-[#7E22CE] mt-1">
            {formatCurrency(totalSellingAmount + deliveryChargedToCustomers, currencySymbol)}
          </div>
        </div>
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4">
          <div className="text-xs text-[#6B5B7B]">Purchase Cost</div>
          <div className="font-mono-num text-lg font-bold text-[#1F122B] mt-1">
            {formatCurrency(totalPurchaseCost, currencySymbol)}
          </div>
        </div>
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4">
          <div className="text-xs text-[#6B5B7B]">Delivery Expenses</div>
          <div className="font-mono-num text-lg font-bold text-[#BE185D] mt-1">
            {formatCurrency(deliveryExpenses, currencySymbol)}
          </div>
        </div>
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4">
          <div className="text-xs text-[#6B5B7B]">Other Expenses</div>
          <div className="font-mono-num text-lg font-bold text-[#BE185D] mt-1">
            {formatCurrency(otherExpenses, currencySymbol)}
          </div>
        </div>
        <div className="col-span-2 lg:col-span-1 rounded-2xl border border-[#DDD6FE] bg-gradient-to-br from-[#FDF2F8] to-[#F5F3FF] p-4">
          <div className="text-xs font-semibold text-[#6D28D9]">Net Profit / Loss</div>
          <div
            className={`font-mono-num text-xl font-bold mt-1 ${
              netProfitLoss >= 0 ? 'text-[#15803D]' : 'text-[#BE123C]'
            }`}
          >
            {formatCurrency(netProfitLoss, currencySymbol)}
          </div>
        </div>
      </div>

      {/* Add Business Expense + Expense Log */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5 items-start">
        <form
          onSubmit={handleAddExpense}
          className="rounded-2xl border border-[#EFE2F5] bg-white p-5 space-y-3.5"
        >
          <h2 className="text-sm font-bold text-[#1F122B]">
            Log Delivery or Business Expense
          </h2>
          {error && (
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs text-[#BE123C]">
              {error}
            </div>
          )}
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Expense title (e.g. Courier bill, Boxes)"
            className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0.01}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Amount (${currencySymbol})`}
              className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
            />
          </div>
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
          />
          <button
            type="submit"
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-2.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
          >
            <Plus className="w-4 h-4" />
            <span>{saving ? 'Adding...' : 'Add Expense'}</span>
          </button>
        </form>

        <div className="rounded-2xl border border-[#EFE2F5] bg-white overflow-x-auto">
          <div className="px-5 py-3.5 border-b border-[#EFE2F5] font-bold text-sm text-[#1F122B]">
            Recorded Expenses ({filteredExpenses.length})
          </div>
          {filteredExpenses.length === 0 ? (
            <div className="py-10 px-6 text-center text-xs text-[#6B5B7B]">
              No expenses logged for this period.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#EFE2F5] bg-[#FDF8FC] font-semibold text-[#5B4B6B]">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Title</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                  <th className="py-2.5 px-4 text-right">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4ECF8]">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id}>
                    <td className="py-2.5 px-4 font-mono-num text-[#5B4B6B]">
                      {exp.expenseDate}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-[#1F122B]">
                      {exp.title}
                    </td>
                    <td className="py-2.5 px-4 text-[#6D28D9]">{exp.category}</td>
                    <td className="py-2.5 px-4 text-right font-mono-num font-bold text-[#BE123C]">
                      {formatCurrency(exp.amount, currencySymbol)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(exp)}
                        className="p-1.5 rounded-lg border border-[#E6D9EE] text-[#6B5B7B] hover:text-[#BE123C] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Product-wise Profit Table */}
      <div className="rounded-2xl border border-[#EFE2F5] bg-white overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-[#EFE2F5] font-bold text-sm text-[#1F122B]">
          Product-Wise Profit Breakdown
        </div>
        {productBreakdown.length === 0 ? (
          <div className="py-10 px-6 text-center text-xs text-[#6B5B7B]">
            Create invoices to see product-level profit margins.
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#EFE2F5] bg-[#FDF8FC] font-semibold text-[#5B4B6B]">
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4 text-right">Units Sold</th>
                <th className="py-3 px-4 text-right">Purchase Cost</th>
                <th className="py-3 px-4 text-right">Selling Amount</th>
                <th className="py-3 px-4 text-right">Product Profit</th>
                <th className="py-3 px-4 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4ECF8]">
              {productBreakdown.map((p) => {
                const margin =
                  p.sellingAmount > 0
                    ? ((p.profit / p.sellingAmount) * 100).toFixed(1)
                    : '0.0';
                return (
                  <tr key={p.name}>
                    <td className="py-3 px-4 font-semibold text-[#1F122B]">{p.name}</td>
                    <td className="py-3 px-4 text-right font-mono-num">{p.qty}</td>
                    <td className="py-3 px-4 text-right font-mono-num">
                      {formatCurrency(p.purchaseCost, currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-[#7E22CE]">
                      {formatCurrency(p.sellingAmount, currencySymbol)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono-num font-bold ${
                        p.profit >= 0 ? 'text-[#15803D]' : 'text-[#BE123C]'
                      }`}
                    >
                      {formatCurrency(p.profit, currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-[#4A3B59]">
                      {margin}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Monthly Profit Report */}
      <div className="rounded-2xl border border-[#EFE2F5] bg-white overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-[#EFE2F5] font-bold text-sm text-[#1F122B]">
          Monthly Profit Report
        </div>
        {monthlyReport.length === 0 ? (
          <div className="py-10 px-6 text-center text-xs text-[#6B5B7B]">
            Monthly report rows will appear once orders or expenses are added.
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#EFE2F5] bg-[#FDF8FC] font-semibold text-[#5B4B6B]">
                <th className="py-3 px-4">Month</th>
                <th className="py-3 px-4 text-right">Orders</th>
                <th className="py-3 px-4 text-right">Revenue</th>
                <th className="py-3 px-4 text-right">Purchase Cost</th>
                <th className="py-3 px-4 text-right">Expenses</th>
                <th className="py-3 px-4 text-right">Net Profit / Loss</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4ECF8]">
              {monthlyReport.map((row) => (
                <tr key={row.month}>
                  <td className="py-3 px-4 font-mono-num font-bold text-[#6D28D9]">
                    {row.month}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-num">{row.orders}</td>
                  <td className="py-3 px-4 text-right font-mono-num font-semibold">
                    {formatCurrency(row.revenue, currencySymbol)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-num">
                    {formatCurrency(row.purchaseCost, currencySymbol)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-num text-[#BE185D]">
                    {formatCurrency(row.expenses, currencySymbol)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono-num font-bold ${
                      row.netProfit >= 0 ? 'text-[#15803D]' : 'text-[#BE123C]'
                    }`}
                  >
                    {formatCurrency(row.netProfit, currencySymbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Expense"
        message={`Are you sure you want to delete "${deleteTarget?.title}"?`}
        confirmLabel="Delete Expense"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await onDeleteExpense(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
