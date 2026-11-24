import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const DEFAULT_WELCOME_SUBJECT =
  "Welcome to Glamour Galleria — You're Invited to Shop!";
const DEFAULT_WELCOME_MESSAGE =
  'You are warmly invited to shop our latest collections at Glamour Galleria! Explore exclusive fashion, cosmetics, and winter wear.';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

function pickTopRecipients(
  rankedPool: RankedCategoryCustomer[],
  maxCount = 20
): SmartOfferRecipient[] {
  return rankedPool.slice(0, maxCount).map((c) => ({
    email: c.email,
    name: c.name,
    clientId: c.clientId,
    orderCount: c.orderCount,
    interestScore: c.score,
  }));
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

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [recipients, setRecipients] = useState<SmartOfferRecipient[]>([]);
  const autoSelectedCategoryRef = useRef<string | null>(null);
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
  const { rankedCustomersForCategory, allEligibleCustomers } = useMemo(() => {
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

    const overallPool: RankedCategoryCustomer[] = [];
    const seenOverallEmails = new Set<string>();
    const categoryCandidates: RankedCategoryCustomer[] = [];
    const seenCategoryEmails = new Set<string>();

    for (const c of clients) {
      const email = String(c.email || '').trim().toLowerCase();
      if (!email || !isValidEmail(email)) continue;

      const histMap = historicalStats.get(c.id);
      const trackedEntries = Object.values(c.categoryInterests || {});
      const trackedOrders = trackedEntries.reduce(
        (sum, e) => sum + Math.max(0, Number(e?.orders) || 0),
        0
      );
      const histOrders = histMap
        ? Array.from(histMap.values()).reduce((sum, n) => sum + n, 0)
        : 0;
      const overallOrderCount = Math.max(
        trackedOrders,
        histOrders,
        Math.max(0, Number(c.totalCategoryOrders) || 0)
      );
      const overallSearches = trackedEntries.reduce(
        (sum, e) => sum + Math.max(0, Number(e?.searches) || 0),
        0
      );
      const overallViews = trackedEntries.reduce(
        (sum, e) => sum + Math.max(0, Number(e?.views) || 0),
        0
      );
      const overallScore = Math.max(
        trackedEntries.reduce((sum, e) => sum + Math.max(0, Number(e?.score) || 0), 0),
        computeCategoryScore(overallSearches, overallViews, overallOrderCount)
      );

      if (!seenOverallEmails.has(email)) {
        seenOverallEmails.add(email);
        overallPool.push({
          clientId: c.id,
          name: c.name,
          email,
          orderCount: overallOrderCount,
          searches: overallSearches,
          views: overallViews,
          score: overallScore,
          lastActivityAt: c.updatedAt || c.createdAt || '',
        });
      }

      if (selectedCategory !== 'ALL' && !seenCategoryEmails.has(email)) {
        const entry = c.categoryInterests?.[selectedCategory];
        const catHistOrders = histMap?.get(selectedCategory) || 0;
        const catOrderCount = Math.max(Number(entry?.orders) || 0, catHistOrders);
        const catSearches = Math.max(0, Number(entry?.searches) || 0);
        const catViews = Math.max(0, Number(entry?.views) || 0);
        const catScore = Math.max(
          Number(entry?.score) || 0,
          computeCategoryScore(catSearches, catViews, catOrderCount)
        );
        if (catOrderCount > 0 || catSearches > 0 || catViews > 0) {
          seenCategoryEmails.add(email);
          categoryCandidates.push({
            clientId: c.id,
            name: c.name,
            email,
            orderCount: catOrderCount,
            searches: catSearches,
            views: catViews,
            score: catScore,
            lastActivityAt: entry?.lastActivityAt || c.updatedAt || '',
          });
        }
      }
    }

    const sortRanked = (list: RankedCategoryCustomer[]) =>
      list.sort((a, b) => {
        if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
        if (b.score !== a.score) return b.score - a.score;
        return String(b.lastActivityAt).localeCompare(String(a.lastActivityAt));
      });

    sortRanked(overallPool);
    sortRanked(categoryCandidates);

    return {
      allEligibleCustomers: overallPool,
      rankedCustomersForCategory:
        selectedCategory === 'ALL' ? overallPool : categoryCandidates,
    };
  }, [clients, orders, invoices, selectedCategory, productCategoryLookup]);

  const handleSelectCategory = (cat: string) => {
    autoSelectedCategoryRef.current = null;
    setSelectedCategory(cat);
    setDeliveryResult(null);
    setError('');
  };

  // Auto-select top highest-ordering customers once per category without resetting manual toggles
  useEffect(() => {
    if (autoSelectedCategoryRef.current === selectedCategory) return;
    if (rankedCustomersForCategory.length > 0) {
      setRecipients(pickTopRecipients(rankedCustomersForCategory, 20));
      autoSelectedCategoryRef.current = selectedCategory;
    } else if (clients.length > 0) {
      setRecipients([]);
      autoSelectedCategoryRef.current = selectedCategory;
    }
  }, [selectedCategory, rankedCustomersForCategory, clients.length]);

  const fallbackTopCustomer =
    rankedCustomersForCategory[0] || allEligibleCustomers[0] || null;

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
    if (!cleanEmail) {
      return;
    }
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
    setError('');
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

    let recipientsToSend = [...recipients];
    const pendingExtraEmail = extraEmail.trim().toLowerCase();
    if (pendingExtraEmail) {
      if (!isValidEmail(pendingExtraEmail)) {
        setError('Please enter a valid extra email address or leave it empty.');
        return;
      }
      const alreadyIncluded = recipientsToSend.some(
        (r) => r.email.toLowerCase() === pendingExtraEmail
      );
      if (!alreadyIncluded) {
        if (recipientsToSend.length >= 50) {
          setError('Maximum 50 recipients can be included in a single send batch.');
          return;
        }
        recipientsToSend = [
          ...recipientsToSend,
          {
            email: pendingExtraEmail,
            name: extraName.trim() || 'Valued Customer',
          },
        ];
      }
    }

    if (recipientsToSend.length === 0 && fallbackTopCustomer) {
      recipientsToSend = [
        {
          email: fallbackTopCustomer.email,
          name: fallbackTopCustomer.name,
          clientId: fallbackTopCustomer.clientId,
          orderCount: fallbackTopCustomer.orderCount,
          interestScore: fallbackTopCustomer.score,
        },
      ];
    }

    if (recipientsToSend.length === 0) {
      setError('No customer email address is available yet. Enter an email address in the Extra Email field to send.');
      return;
    }

    const resolvedSubject = subject.trim() || DEFAULT_WELCOME_SUBJECT;
    const resolvedMessage = message.trim() || DEFAULT_WELCOME_MESSAGE;

    setSending(true);
    try {
      const result = await api.sendSmartOffersMail({
        category: selectedCategory === 'ALL' ? 'All Categories' : selectedCategory,
        to: recipientsToSend.map((r) => r.email),
        subject: resolvedSubject,
        message: resolvedMessage,
        recipients: recipientsToSend,
      });
      if (pendingExtraEmail || recipients.length === 0) {
        setRecipients(recipientsToSend);
      }
      if (pendingExtraEmail) {
        setExtraEmail('');
        setExtraName('');
      }
      setDeliveryResult(result);
    } catch (err) {
      setError(
        formatApiError(err, 'Could not send Smart Offers Mail. Please verify your SMTP configuration and try again.')
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
            onClick={() => handleSelectCategory('ALL')}
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
              onClick={() => handleSelectCategory(cat)}
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
              {fallbackTopCustomer ? (
                <>
                  No customers manually selected for <strong>{displayCategoryName}</strong>. Clicking Send will automatically fall back to your top customer{' '}
                  <strong>{fallbackTopCustomer.name}</strong> ({fallbackTopCustomer.email}), or you can toggle customers below.
                </>
              ) : (
                <>
                  No customers with verified emails detected yet for <strong>{displayCategoryName}</strong>. Select another category or add an email address manually below.
                </>
              )}
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
                  <span className="text-[#6B5B7B] font-mono-num text-[11px] truncate max-w-[160px] sm:max-w-none">
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
            noValidate
            onSubmit={handleAddExtraEmail}
            className="rounded-2xl border border-[#F4ECF8] bg-[#FDF9FC] p-3.5 space-y-2.5"
          >
            <div className="text-xs font-bold text-[#4A3B59]">
              Add Extra Email Address Manually (Optional)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_0.8fr_auto] gap-2">
              <input
                type="email"
                value={extraEmail}
                onChange={(e) => setExtraEmail(e.target.value)}
                placeholder="customer@gmail.com"
                className="min-w-0 rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
              />
              <input
                type="text"
                value={extraName}
                onChange={(e) => setExtraName(e.target.value)}
                placeholder="Name (optional)"
                className="min-w-0 rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
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

          <form noValidate onSubmit={handleSendMail} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Email Subject{' '}
                <span className="font-normal text-[#6B5B7B]">
                  (leave blank for default welcome invitation)
                </span>
              </label>
              <input
                type="text"
                maxLength={200}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={`e.g. Special VIP Offer on ${displayCategoryName}!`}
                className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Offer / Notice Message{' '}
                <span className="font-normal text-[#6B5B7B]">
                  (leave blank for default welcome invitation)
                </span>
              </label>
              <textarea
                rows={6}
                maxLength={6000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your personalized offer announcement, promo details, or store update..."
                className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
              />
            </div>

            {/* Live Email Preview */}
            <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FC] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[#6D28D9] uppercase tracking-wider">
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
                  <div className="text-[11px] text-[#6B5B7B] mt-0.5 break-words">
                    Subject:{' '}
                    <strong className="text-[#1F122B]">
                      {subject.trim() || DEFAULT_WELCOME_SUBJECT}
                    </strong>
                  </div>
                </div>
                <p className="text-[#4A3B59]">
                  Hello{' '}
                  <strong>
                    {recipients[0]?.name ||
                      extraName.trim() ||
                      fallbackTopCustomer?.name ||
                      'Valued Customer'}
                  </strong>
                  ,
                </p>
                <div className="whitespace-pre-wrap text-[#2E1F3D] leading-relaxed break-words">
                  {message.trim() || DEFAULT_WELCOME_MESSAGE}
                </div>
                <p className="text-[11px] text-[#6B5B7B] pt-1">
                  Warm regards, <br />
                  <strong>{businessName || 'Glamour Galleria'}</strong>
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={
                sending ||
                (recipients.length === 0 &&
                  !extraEmail.trim() &&
                  !fallbackTopCustomer)
              }
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-3 px-5 text-sm font-bold text-white hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
              <span>
                {sending
                  ? `Sending to ${recipients.length || 1} Customer(s)...`
                  : recipients.length > 0
                  ? `Send Smart Offers Mail (${recipients.length} Recipients)`
                  : extraEmail.trim()
                  ? 'Send Smart Offers Mail (1 Extra Recipient)'
                  : fallbackTopCustomer
                  ? `Send Smart Offers Mail (Auto: ${fallbackTopCustomer.name})`
                  : 'Send Smart Offers Mail'}
              </span>
            </button>
          </form>

          {/* Delivery Summary */}
          {deliveryResult && (
            <div
              className={`rounded-2xl border p-4 space-y-3 ${
                deliveryResult.sentCount > 0 && deliveryResult.failedCount === 0
                  ? 'border-[#BBF7D0] bg-[#F0FDF4]'
                  : deliveryResult.sentCount > 0
                  ? 'border-[#FDE68A] bg-[#FFFBEB]'
                  : 'border-[#FECDD3] bg-[#FFF1F2]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  className={`text-xs font-bold flex items-center gap-1.5 ${
                    deliveryResult.sentCount > 0 ? 'text-[#15803D]' : 'text-[#BE123C]'
                  }`}
                >
                  {deliveryResult.sentCount > 0 ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {deliveryResult.sentCount > 0
                      ? 'Delivery Summary'
                      : 'Delivery Failed'}
                  </span>
                </div>
                <span className="text-[11px] font-mono-num text-[#4A3B59]">
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

              <div className="max-h-48 overflow-y-auto rounded-xl border border-[#EFE2F5] bg-white divide-y divide-[#F4ECF8]">
                {deliveryResult.logs.map((item) => (
                  <div key={item.email} className="px-3 py-2 text-[11px] space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[#1F122B]">{item.email}</span>
                      {item.status === 'sent' ? (
                        <span className="inline-flex items-center gap-1 font-bold text-[#15803D] shrink-0">
                          <CheckCircle2 className="w-3 h-3" />
                          Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-bold text-[#BE123C] shrink-0">
                          <XCircle className="w-3 h-3" />
                          Failed
                        </span>
                      )}
                    </div>
                    {item.status === 'failed' && item.error && (
                      <div className="text-[10px] text-[#BE123C] break-words">
                        {item.error}
                      </div>
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
