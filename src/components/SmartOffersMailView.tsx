import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Mail,
  Plus,
  Send,
  Shuffle,
  Sparkles,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Client,
  CustomerOrder,
  Invoice,
  Product,
  SmartOfferRecipient,
  SmartOffersSendResult,
} from '../types/business';
import { formatApiError, api } from '../utils/api';
import {
  PRODUCT_CATEGORIES,
  computeCategoryScore,
  phoneNumbersMatch,
} from '../utils/calculations';

interface SmartOffersMailViewProps {
  clients: Client[];
  orders: CustomerOrder[];
  invoices: Invoice[];
  products: Product[];
  businessName: string;
  onBack: () => void;
}

interface RankedCategoryCustomer {
  clientId: string;
  name: string;
  email: string;
  orderCount: number;
  searches: number;
  views: number;
  score: number;
  lastActivityAt: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

function pickRandomTopRecipients(
  rankedPool: RankedCategoryCustomer[],
  maxCount = 20
): SmartOfferRecipient[] {
  if (rankedPool.length === 0) return [];
  // Prioritize highest-ordering / highest-scoring pool (top 40 candidates) then shuffle randomly for up to 20 recipients
  const topCandidates = rankedPool.slice(0, Math.max(maxCount, Math.min(40, rankedPool.length)));
  const shuffled = [...topCandidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, maxCount).map((c) => ({
    email: c.email,
    name: c.name,
    clientId: c.clientId,
    orderCount: c.orderCount,
    interestScore: c.score,
  }));
}

export const SmartOffersMailView: React.FC<SmartOffersMailViewProps> = ({
  clients,
  orders,
  invoices,
  products,
  businessName,
  onBack,
}) => {
  const availableCategories = useMemo(() => {
    const set = new Set<string>(PRODUCT_CATEGORIES);
    for (const p of products) {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    }
    for (const c of clients) {
      for (const key of Object.keys(c.categoryInterests || {})) {
        if (key.trim()) set.add(key.trim());
      }
    }
    return Array.from(set);
  }, [products, clients]);

  const [selectedCategory, setSelectedCategory] = useState<string>(
    availableCategories[0] || PRODUCT_CATEGORIES[0]
  );
  const [recipients, setRecipients] = useState<SmartOfferRecipient[]>([]);
  const [extraEmail, setExtraEmail] = useState('');
  const [extraName, setExtraName] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [deliveryResult, setDeliveryResult] = useState<SmartOffersSendResult | null>(
    null
  );

  const productCategoryLookup = useMemo(() => {
    const byId = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const p of products) {
      if (p.id && p.category) byId.set(p.id, p.category.trim());
      if (p.name && p.category) {
        byName.set(p.name.trim().toLowerCase(), p.category.trim());
      }
    }
    return { byId, byName };
  }, [products]);

  // Combine tracked categoryInterests + legacy orders/invoices per customer
  const rankedCustomersForCategory = useMemo(() => {
    const historicalStats = new Map<
      string,
      Map<string, number>
    >();

    const findClientId = (
      clientId?: string,
      phone?: string
    ): string | undefined => {
      if (clientId && clients.some((c) => c.id === clientId)) return clientId;
      if (phone) {
        const match = clients.find(
          (c) =>
            phoneNumbersMatch(c.mobile, phone) ||
            phoneNumbersMatch(c.whatsapp, phone)
        );
        if (match) return match.id;
      }
      return undefined;
    };

    const addHistoricalOrderCat = (cid: string, cat: string) => {
      const cleanCat = cat.trim();
      if (!cleanCat) return;
      let catMap = historicalStats.get(cid);
      if (!catMap) {
        catMap = new Map<string, number>();
        historicalStats.set(cid, catMap);
      }
      catMap.set(cleanCat, (catMap.get(cleanCat) || 0) + 1);
    };

    for (const ord of orders) {
      if (ord.status === 'Cancelled') continue;
      const cid = findClientId(ord.clientId, ord.customerPhone);
      if (!cid) continue;
      const ordItems = Array.isArray(ord.items) && ord.items.length > 0 ? ord.items : [];
      if (ordItems.length > 0) {
        for (const it of ordItems) {
          const cat =
            String(it.productCategory || '').trim() ||
            (it.productId ? productCategoryLookup.byId.get(it.productId) || '' : '') ||
            productCategoryLookup.byName.get(
              String(it.productName || '').trim().toLowerCase()
            ) ||
            String(ord.productCategory || '').trim();
          if (cat) addHistoricalOrderCat(cid, cat);
        }
      } else if (ord.productCategory) {
        addHistoricalOrderCat(cid, ord.productCategory);
      }
    }

    for (const inv of invoices) {
      const cid = findClientId(inv.clientId, inv.customerMobile);
      if (!cid) continue;
      for (const it of inv.items || []) {
        const cat =
          (it.productId ? productCategoryLookup.byId.get(it.productId) || '' : '') ||
          productCategoryLookup.byName.get(
            String(it.productName || '').trim().toLowerCase()
          ) ||
          '';
        if (cat) addHistoricalOrderCat(cid, cat);
      }
    }

    const candidates: RankedCategoryCustomer[] = [];
    const seenEmails = new Set<string>();

    for (const c of clients) {
      const email = String(c.email || '').trim().toLowerCase();
      if (!email || !isValidEmail(email) || seenEmails.has(email)) continue;

      const histMap = historicalStats.get(c.id);
      if (selectedCategory === 'ALL') {
        const trackedEntries = Object.values(c.categoryInterests || {});
        const trackedOrders = trackedEntries.reduce(
          (sum, e) => sum + Math.max(0, Number(e?.orders) || 0),
          0
        );
        const histOrders = histMap
          ? Array.from(histMap.values()).reduce((sum, n) => sum + n, 0)
          : 0;
        const orderCount = Math.max(trackedOrders, histOrders);
        const searches = trackedEntries.reduce(
          (sum, e) => sum + Math.max(0, Number(e?.searches) || 0),
          0
        );
        const views = trackedEntries.reduce(
          (sum, e) => sum + Math.max(0, Number(e?.views) || 0),
          0
        );
        const score = Math.max(
          trackedEntries.reduce((sum, e) => sum + Math.max(0, Number(e?.score) || 0), 0),
          computeCategoryScore(searches, views, orderCount)
        );
        if (orderCount === 0 && score === 0) continue;
        seenEmails.add(email);
        candidates.push({
          clientId: c.id,
          name: c.name,
          email,
          orderCount,
          searches,
          views,
          score,
          lastActivityAt: c.updatedAt || c.createdAt || '',
        });
      } else {
        const entry = c.categoryInterests?.[selectedCategory];
        const histOrders = histMap?.get(selectedCategory) || 0;
        const orderCount = Math.max(Number(entry?.orders) || 0, histOrders);
        const searches = Math.max(0, Number(entry?.searches) || 0);
        const views = Math.max(0, Number(entry?.views) || 0);
        const score = Math.max(
          Number(entry?.score) || 0,
          computeCategoryScore(searches, views, orderCount)
        );
        if (orderCount === 0 && searches === 0 && views === 0) continue;
        seenEmails.add(email);
        candidates.push({
          clientId: c.id,
          name: c.name,
          email,
          orderCount,
          searches,
          views,
          score,
          lastActivityAt: entry?.lastActivityAt || c.updatedAt || '',
        });
      }
    }

    // Sort highest ordering first, then engagement score, then recency
    candidates.sort((a, b) => {
      if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
      if (b.score !== a.score) return b.score - a.score;
      return String(b.lastActivityAt).localeCompare(String(a.lastActivityAt));
    });

    return candidates;
  }, [clients, orders, invoices, selectedCategory, productCategoryLookup]);

  // Auto-select random up to 20 highest-ordering customers whenever category changes
  useEffect(() => {
    setRecipients(pickRandomTopRecipients(rankedCustomersForCategory, 20));
    setDeliveryResult(null);
    setError('');
  }, [selectedCategory, rankedCustomersForCategory]);

  const selectedEmailSet = useMemo(
    () => new Set(recipients.map((r) => r.email.toLowerCase())),
    [recipients]
  );

  const handleReshuffleTop20 = () => {
    setRecipients(pickRandomTopRecipients(rankedCustomersForCategory, 20));
    setDeliveryResult(null);
    setError('');
  };

  const handleRemoveRecipient = (emailToRemove: string) => {
    setRecipients((prev) =>
      prev.filter((r) => r.email.toLowerCase() !== emailToRemove.toLowerCase())
    );
  };

  const handleToggleCandidate = (candidate: RankedCategoryCustomer) => {
    const lower = candidate.email.toLowerCase();
    if (selectedEmailSet.has(lower)) {
      handleRemoveRecipient(lower);
    } else {
      if (recipients.length >= 50) {
        setError('Maximum 50 recipients can be included in a single send batch.');
        return;
      }
      setRecipients((prev) => [
        ...prev,
        {
          email: candidate.email,
          name: candidate.name,
          clientId: candidate.clientId,
          orderCount: candidate.orderCount,
          interestScore: candidate.score,
        },
      ]);
    }
  };

  const handleAddExtraEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanEmail = extraEmail.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      setError('Please enter a valid extra email address.');
      return;
    }
    if (selectedEmailSet.has(cleanEmail)) {
      setError('This email address is already in the selected recipient list.');
      return;
    }
    if (recipients.length >= 50) {
      setError('Maximum 50 recipients can be included in a single send batch.');
      return;
    }
    setRecipients((prev) => [
      ...prev,
      {
        email: cleanEmail,
        name: extraName.trim() || 'Valued Customer',
      },
    ]);
    setExtraEmail('');
    setExtraName('');
  };

  const handleUseOfferTemplate = () => {
    const label = selectedCategory === 'ALL' ? 'Featured Collections' : selectedCategory;
    if (!subject.trim()) {
      setSubject(`Exclusive Offer on ${label} — Glamour Galleria`);
    }
    if (!message.trim()) {
      setMessage(
        `We have exciting new arrivals and special customer-only offers in ${label}!\n\nVisit Glamour Galleria today to explore handpicked styles curated just for you. Limited-time festive savings available while stocks last.`
      );
    }
  };

  const handleSendMail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDeliveryResult(null);

    if (recipients.length === 0) {
      setError('Please select or add at least one customer email address.');
      return;
    }
    if (!subject.trim()) {
      setError('Please enter an Email Subject.');
      return;
    }
    if (!message.trim()) {
      setError('Please enter the Offer / Notice Message body.');
      return;
    }

    setSending(true);
    try {
      const result = await api.sendSmartOffersMail({
        category: selectedCategory === 'ALL' ? 'All Categories' : selectedCategory,
        subject: subject.trim(),
        message: message.trim(),
        recipients,
      });
      setDeliveryResult(result);
    } catch (err) {
      setError(
        formatApiError(err, 'Could not send Smart Offers Mail. Please try again.')
      );
    } finally {
      setSending(false);
    }
  };

  const displayCategoryName =
    selectedCategory === 'ALL' ? 'All Categories' : selectedCategory;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div>
            <h1 className="font-display-serif text-2xl sm:text-3xl font-bold text-[#1F122B] flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-[#DB2777]" />
              <span>Smart Offers Mail</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#6B5B7B]">
              Target top-ordering and category-interested customers automatically via &ldquo;Glamour Galleria&rdquo; SMTP email.
            </p>
          </div>
        </div>
      </div>

      {/* Category Filter Chips */}
      <section className="rounded-3xl border border-[#EFE2F5] bg-white p-5 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[#1F122B]">
              1. Choose Target Category
            </h2>
            <p className="text-xs text-[#6B5B7B]">
              Click any category to detect interested customers, rank top orders, and randomly sample up to 20 recipients.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReshuffleTop20}
            disabled={rankedCustomersForCategory.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-[#FAF5FF] px-3.5 py-2 text-xs font-bold text-[#6D28D9] hover:border-[#9333EA] disabled:opacity-50 cursor-pointer"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Re-Shuffle Top 20</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold border transition-colors cursor-pointer ${
              selectedCategory === 'ALL'
                ? 'border-[#7E22CE] bg-[#7E22CE] text-white'
                : 'border-[#E6D9EE] bg-[#FDFBFE] text-[#4A3B59] hover:border-[#9333EA]'
            }`}
          >
            All Categories
          </button>
          {availableCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold border transition-colors cursor-pointer ${
                selectedCategory === cat
                  ? 'border-[#DB2777] bg-[#DB2777] text-white'
                  : 'border-[#E6D9EE] bg-[#FDFBFE] text-[#4A3B59] hover:border-[#DB2777]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-6 items-start">
        {/* Left Column: Recipients & Detected Customer Pool */}
        <section className="rounded-3xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F4ECF8] pb-3">
            <div>
              <h2 className="text-sm font-bold text-[#1F122B] flex items-center gap-2">
                <Users className="w-4 h-4 text-[#DB2777]" />
                <span>2. Selected Recipients ({recipients.length})</span>
              </h2>
              <p className="text-xs text-[#6B5B7B]">
                Category: <strong>{displayCategoryName}</strong> · Eligible customers detected:{' '}
                <strong className="font-mono-num">
                  {rankedCustomersForCategory.length}
                </strong>
              </p>
            </div>
          </div>

          {/* Selected Recipients Chips */}
          {recipients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E6D9EE] bg-[#FDF9FC] p-5 text-center text-xs text-[#6B5B7B]">
              No customers with verified emails detected yet for <strong>{displayCategoryName}</strong>. Select another category or add email addresses manually below.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto pr-1">
              {recipients.map((rec) => (
                <div
                  key={rec.email}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E9D5FF] bg-[#FAF5FF] px-2.5 py-1.5 text-xs text-[#4A3B59]"
                >
                  <span className="font-semibold text-[#1F122B] max-w-[120px] truncate">
                    {rec.name || 'Customer'}
                  </span>
                  <span className="text-[#6B5B7B] font-mono-num text-[11px]">
                    ({rec.email})
                  </span>
                  {typeof rec.orderCount === 'number' && rec.orderCount > 0 && (
                    <span className="rounded bg-[#DB2777]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#BE185D] font-mono-num">
                      {rec.orderCount} ord
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveRecipient(rec.email)}
                    aria-label={`Remove ${rec.email}`}
                    className="p-0.5 text-[#BE123C] hover:bg-[#FFE4E6] rounded cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Extra Email Address */}
          <form
            onSubmit={handleAddExtraEmail}
            className="rounded-2xl border border-[#F4ECF8] bg-[#FDF9FC] p-3.5 space-y-2.5"
          >
            <div className="text-xs font-bold text-[#4A3B59]">
              Add Extra Email Address Manually
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_0.8fr_auto] gap-2">
              <input
                type="email"
                value={extraEmail}
                onChange={(e) => setExtraEmail(e.target.value)}
                placeholder="customer@gmail.com"
                className="rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
              />
              <input
                type="text"
                value={extraName}
                onChange={(e) => setExtraName(e.target.value)}
                placeholder="Name (optional)"
                className="rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1 rounded-xl border border-[#D8B4FE] bg-white px-3.5 py-2 text-xs font-bold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </form>

          {/* Top Ranked Pool Preview */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-[#4A3B59]">
              Highest-Ordering Interested Customers ({rankedCustomersForCategory.length})
            </div>
            {rankedCustomersForCategory.length === 0 ? (
              <div className="text-xs text-[#6B5B7B]">
                Customer engagement will appear automatically as signed-in shoppers search, view, or order items in this category.
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-2xl border border-[#F4ECF8] divide-y divide-[#F4ECF8]">
                {rankedCustomersForCategory.map((cust, index) => {
                  const isSelected = selectedEmailSet.has(cust.email.toLowerCase());
                  return (
                    <div
                      key={cust.clientId}
                      className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs hover:bg-[#FDF9FC]"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[#1F122B] truncate">
                          #{index + 1} · {cust.name}
                        </div>
                        <div className="text-[11px] text-[#6B5B7B] truncate">
                          {cust.email}
                        </div>
                        <div className="text-[10px] font-mono-num text-[#7E22CE] mt-0.5">
                          Orders: {cust.orderCount} · Searches: {cust.searches} · Views: {cust.views} · Score: {cust.score}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleCandidate(cust)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold shrink-0 cursor-pointer ${
                          isSelected
                            ? 'bg-[#FCE7F3] text-[#BE185D] border border-[#F9A8D4]'
                            : 'bg-[#F3E8FF] text-[#6D28D9] border border-[#D8B4FE]'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Include'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Email Composer, Live Preview & Delivery Summary */}
        <section className="rounded-3xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F4ECF8] pb-3">
            <h2 className="text-sm font-bold text-[#1F122B] flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#7E22CE]" />
              <span>3. Compose &amp; Preview Email</span>
            </h2>
            <button
              type="button"
              onClick={handleUseOfferTemplate}
              className="text-xs font-semibold text-[#7E22CE] hover:underline cursor-pointer"
            >
              Fill Sample Offer Text
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
              {error}
            </div>
          )}

          <form onSubmit={handleSendMail} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Email Subject <span className="text-[#DB2777]">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={200}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={`e.g. Special VIP Offer on ${displayCategoryName}!`}
                className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Offer / Notice Message <span className="text-[#DB2777]">*</span>
              </label>
              <textarea
                rows={6}
                required
                maxLength={6000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your personalized offer announcement, promo details, or store update..."
                className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
              />
            </div>

            {/* Live Email Preview */}
            <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FC] p-4 space-y-3">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#6D28D9] uppercase tracking-wider">
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  Live Email Preview
                </span>
                <span>Sender: &ldquo;{businessName || 'Glamour Galleria'}&rdquo;</span>
              </div>

              <div className="rounded-xl border border-[#EFE2F5] bg-white p-4 space-y-2.5 text-xs text-[#1F122B]">
                <div className="border-b border-[#F4ECF8] pb-2">
                  <div className="font-bold text-[#6D28D9] text-sm">
                    {businessName || 'Glamour Galleria'}
                  </div>
                  <div className="text-[11px] text-[#6B5B7B] mt-0.5">
                    Subject:{' '}
                    <strong className="text-[#1F122B]">
                      {subject.trim() || '(Your email subject)'}
                    </strong>
                  </div>
                </div>
                <p className="text-[#4A3B59]">
                  Hello <strong>{recipients[0]?.name || 'Valued Customer'}</strong>,
                </p>
                <div className="whitespace-pre-wrap text-[#2E1F3D] leading-relaxed">
                  {message.trim() || 'Your offer or notice message preview will appear here...'}
                </div>
                <p className="text-[11px] text-[#6B5B7B] pt-1">
                  Warm regards, <br />
                  <strong>{businessName || 'Glamour Galleria'}</strong>
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={sending || recipients.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-3 px-5 text-sm font-bold text-white hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
              <span>
                {sending
                  ? `Sending to ${recipients.length} Customers...`
                  : `Send Smart Offers Mail (${recipients.length} Recipients)`}
              </span>
            </button>
          </form>

          {/* Delivery Summary */}
          {deliveryResult && (
            <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-[#15803D] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Delivery Summary</span>
                </div>
                <span className="text-[11px] font-mono-num text-[#166534]">
                  From: {deliveryResult.senderDisplay}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white border border-[#DCFCE7] p-2">
                  <div className="text-[10px] text-[#6B5B7B]">Requested</div>
                  <div className="font-mono-num text-sm font-bold text-[#1F122B]">
                    {deliveryResult.totalRequested}
                  </div>
                </div>
                <div className="rounded-xl bg-white border border-[#DCFCE7] p-2">
                  <div className="text-[10px] text-[#15803D]">Sent</div>
                  <div className="font-mono-num text-sm font-bold text-[#15803D]">
                    {deliveryResult.sentCount}
                  </div>
                </div>
                <div className="rounded-xl bg-white border border-[#FECDD3] p-2">
                  <div className="text-[10px] text-[#BE123C]">Failed</div>
                  <div className="font-mono-num text-sm font-bold text-[#BE123C]">
                    {deliveryResult.failedCount}
                  </div>
                </div>
              </div>

              <div className="max-h-44 overflow-y-auto rounded-xl border border-[#DCFCE7] bg-white divide-y divide-[#F4ECF8]">
                {deliveryResult.logs.map((item) => (
                  <div
                    key={item.email}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]"
                  >
                    <span className="truncate text-[#1F122B]">
                      {item.email}
                    </span>
                    {item.status === 'sent' ? (
                      <span className="inline-flex items-center gap-1 font-bold text-[#15803D] shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        Sent
                      </span>
                    ) : (
                      <span
                        title={item.error || 'Delivery failed'}
                        className="inline-flex items-center gap-1 font-bold text-[#BE123C] shrink-0"
                      >
                        <XCircle className="w-3 h-3" />
                        Failed
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
