import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Inbox,
  Mail,
  Plus,
  Search,
  Send,
  Shuffle,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Client,
  CustomerOrder,
  Invoice,
  Product,
  SentMailRecipientType,
  SentMailRecord,
  SmartOfferRecipient,
  SmartOffersSendResult,
} from '../types/business';
import { api, formatApiError } from '../utils/api';
import {
  PRODUCT_CATEGORIES,
  computeCategoryScore,
  phoneNumbersMatch,
} from '../utils/calculations';

export interface DirectMailTarget {
  email: string;
  name: string;
  clientId?: string;
  nonce: number;
}

interface SmartOffersMailViewProps {
  clients: Client[];
  orders: CustomerOrder[];
  invoices: Invoice[];
  products: Product[];
  businessName: string;
  directTarget?: DirectMailTarget | null;
  onClearDirectTarget?: () => void;
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

const CUSTOMER_PANEL_URL = 'https://glamour-galleria.vercel.app';
const MAX_RECIPIENTS_PER_BATCH = 100;

const DEFAULT_WELCOME_SUBJECT =
  "Welcome to Glamour Galleria — You're Invited to Shop!";
const DEFAULT_WELCOME_MESSAGE =
  'You are warmly invited to shop our latest collections at Glamour Galleria! Explore exclusive fashion, cosmetics, and winter wear.';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

function parseEmailTokens(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function formatSentTimestamp(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
    recipientType: 'Customer',
  }));
}

function pickRandomTopRecipients(
  rankedPool: RankedCategoryCustomer[],
  maxCount = 20
): SmartOfferRecipient[] {
  if (rankedPool.length === 0) return [];
  const topCandidates = rankedPool.slice(
    0,
    Math.max(maxCount, Math.min(40, rankedPool.length))
  );
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
    recipientType: 'Customer',
  }));
}

export const SmartOffersMailView: React.FC<SmartOffersMailViewProps> = ({
  clients,
  orders,
  invoices,
  products,
  businessName,
  directTarget = null,
  onClearDirectTarget,
  onBack,
}) => {
  const [activeSection, setActiveSection] = useState<'compose' | 'sent-box'>('compose');
  const [sentMails, setSentMails] = useState<SentMailRecord[]>([]);
  const [loadingSentBox, setLoadingSentBox] = useState(true);
  const [sentSearchQuery, setSentSearchQuery] = useState('');
  const [sentStatusFilter, setSentStatusFilter] = useState<'ALL' | 'sent' | 'failed'>('ALL');

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
  const lastAppliedDirectNonceRef = useRef<number | null>(null);
  const [extraEmail, setExtraEmail] = useState('');
  const [extraName, setExtraName] = useState('');
  const [bulkManualEmails, setBulkManualEmails] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [deliveryResult, setDeliveryResult] = useState<SmartOffersSendResult | null>(
    null
  );

  const bulkEmailPreview = useMemo(() => {
    const tokens = parseEmailTokens(bulkManualEmails);
    const validSet = new Set<string>();
    const invalidTokens: string[] = [];
    for (const token of tokens) {
      if (isValidEmail(token)) {
        validSet.add(token);
      } else {
        invalidTokens.push(token);
      }
    }
    return {
      totalTokens: tokens.length,
      validEmails: Array.from(validSet),
      invalidTokens,
    };
  }, [bulkManualEmails]);

  // Load persisted Sent Box history from Firestore / localStorage fallback
  useEffect(() => {
    let active = true;
    setLoadingSentBox(true);
    api
      .fetchSentMailHistory()
      .then((records) => {
        if (active) setSentMails(records);
      })
      .finally(() => {
        if (active) setLoadingSentBox(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const clientByEmailMap = useMemo(() => {
    const map = new Map<string, Client>();
    for (const c of clients) {
      const email = String(c.email || '').trim().toLowerCase();
      if (email && isValidEmail(email) && !map.has(email)) {
        map.set(email, c);
      }
    }
    return map;
  }, [clients]);

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

  const { rankedCustomersForCategory, allEligibleCustomers } = useMemo(() => {
    const historicalStats = new Map<string, Map<string, number>>();

    const findClientId = (clientId?: string, phone?: string): string | undefined => {
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

  // Apply direct client target when navigating from Clients -> Mail button
  useEffect(() => {
    if (!directTarget) return;
    if (lastAppliedDirectNonceRef.current === directTarget.nonce) return;

    lastAppliedDirectNonceRef.current = directTarget.nonce;
    autoSelectedCategoryRef.current = selectedCategory;
    setActiveSection('compose');
    setDeliveryResult(null);
    setError('');

    const targetEmail = String(directTarget.email || '').trim().toLowerCase();
    if (targetEmail && isValidEmail(targetEmail)) {
      setRecipients([
        {
          email: targetEmail,
          name: directTarget.name || 'Valued Customer',
          clientId: directTarget.clientId,
          recipientType: 'Direct Client',
        },
      ]);
      setExtraEmail('');
      setExtraName('');
    } else {
      setRecipients([]);
      setExtraEmail('');
      setExtraName(directTarget.name || '');
    }
  }, [directTarget, selectedCategory]);

  const handleSelectCategory = (cat: string) => {
    if (directTarget) {
      onClearDirectTarget?.();
    }
    autoSelectedCategoryRef.current = null;
    setSelectedCategory(cat);
    setDeliveryResult(null);
    setError('');
  };

  // Auto-select top highest-ordering customers once per category in group mode
  useEffect(() => {
    if (directTarget) return;
    if (autoSelectedCategoryRef.current === selectedCategory) return;
    if (rankedCustomersForCategory.length > 0) {
      setRecipients(pickTopRecipients(rankedCustomersForCategory, 20));
      autoSelectedCategoryRef.current = selectedCategory;
    } else if (clients.length > 0) {
      setRecipients([]);
      autoSelectedCategoryRef.current = selectedCategory;
    }
  }, [directTarget, selectedCategory, rankedCustomersForCategory, clients.length]);

  const fallbackTopCustomer =
    rankedCustomersForCategory[0] || allEligibleCustomers[0] || null;

  const selectedEmailSet = useMemo(
    () => new Set(recipients.map((r) => r.email.toLowerCase())),
    [recipients]
  );

  const handleReshuffleTop20 = () => {
    if (directTarget) {
      onClearDirectTarget?.();
    }
    setRecipients(pickRandomTopRecipients(rankedCustomersForCategory, 20));
    setDeliveryResult(null);
    setError('');
  };

  const handleClearAllRecipients = () => {
    setRecipients([]);
    setError('');
  };

  const handleSwitchToGroupMode = () => {
    onClearDirectTarget?.();
    autoSelectedCategoryRef.current = null;
    setDeliveryResult(null);
    setError('');
    setRecipients(pickTopRecipients(rankedCustomersForCategory, 20));
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
      if (recipients.length >= MAX_RECIPIENTS_PER_BATCH) {
        setError(
          `Maximum ${MAX_RECIPIENTS_PER_BATCH} recipients can be included in a single send batch.`
        );
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
          recipientType: 'Customer',
        },
      ]);
    }
  };

  const handleAddExtraEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const tokens = parseEmailTokens(extraEmail);
    if (tokens.length === 0) {
      return;
    }

    const invalidToken = tokens.find((t) => !isValidEmail(t));
    if (invalidToken) {
      setError(`Invalid email address: "${invalidToken}". Please check and try again.`);
      return;
    }

    const additions: SmartOfferRecipient[] = [];
    const seenBatch = new Set<string>(selectedEmailSet);

    for (const email of tokens) {
      if (seenBatch.has(email)) continue;
      if (recipients.length + additions.length >= MAX_RECIPIENTS_PER_BATCH) {
        setError(
          `Maximum ${MAX_RECIPIENTS_PER_BATCH} recipients can be included in a single send batch.`
        );
        return;
      }
      seenBatch.add(email);
      const matchedClient = clientByEmailMap.get(email);
      additions.push({
        email,
        name:
          extraName.trim() ||
          matchedClient?.name ||
          (tokens.length === 1 ? 'External Recipient' : email.split('@')[0]),
        clientId: matchedClient?.id,
        recipientType: matchedClient ? 'Customer' : 'Random / External',
      });
    }

    if (additions.length === 0) {
      setError('Entered email address is already in the selected recipient list.');
      return;
    }

    setRecipients((prev) => [...prev, ...additions]);
    setExtraEmail('');
    setExtraName('');
  };

  const handleAddBulkManualEmails = () => {
    setError('');
    const tokens = parseEmailTokens(bulkManualEmails);
    if (tokens.length === 0) {
      return;
    }

    const invalidTokens = tokens.filter((t) => !isValidEmail(t));
    if (invalidTokens.length > 0) {
      setError(
        `Invalid email address in Bulk Manual Emails: "${invalidTokens[0]}". Please fix or remove invalid addresses.`
      );
      return;
    }

    const additions: SmartOfferRecipient[] = [];
    const seenBatch = new Set<string>(selectedEmailSet);

    for (const email of tokens) {
      if (seenBatch.has(email)) continue;
      if (recipients.length + additions.length >= MAX_RECIPIENTS_PER_BATCH) {
        setError(
          `Maximum ${MAX_RECIPIENTS_PER_BATCH} recipients can be included in a single send batch.`
        );
        return;
      }
      seenBatch.add(email);
      const matchedClient = clientByEmailMap.get(email);
      additions.push({
        email,
        name: matchedClient?.name || email.split('@')[0] || 'External Recipient',
        clientId: matchedClient?.id,
        recipientType: matchedClient ? 'Customer' : 'Random / External',
      });
    }

    if (additions.length === 0) {
      setError(
        'All entered bulk email addresses are already in the selected recipient list.'
      );
      return;
    }

    setRecipients((prev) => [...prev, ...additions]);
    setBulkManualEmails('');
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
    const extraTokens = parseEmailTokens(extraEmail);
    const bulkTokens = parseEmailTokens(bulkManualEmails);

    if (extraTokens.length > 0) {
      const invalidToken = extraTokens.find((t) => !isValidEmail(t));
      if (invalidToken) {
        setError(
          `Invalid email address "${invalidToken}". Enter valid email(s) or leave the box empty.`
        );
        return;
      }
    }

    if (bulkTokens.length > 0) {
      const invalidBulkToken = bulkTokens.find((t) => !isValidEmail(t));
      if (invalidBulkToken) {
        setError(
          `Invalid email address "${invalidBulkToken}" in Bulk Manual Emails. Fix it or clear the box.`
        );
        return;
      }
    }

    const seenEmails = new Set(recipientsToSend.map((r) => r.email.toLowerCase()));

    for (const email of extraTokens) {
      if (seenEmails.has(email)) continue;
      if (recipientsToSend.length >= MAX_RECIPIENTS_PER_BATCH) {
        setError(
          `Maximum ${MAX_RECIPIENTS_PER_BATCH} recipients can be included in a single send batch.`
        );
        return;
      }
      seenEmails.add(email);
      const matchedClient = clientByEmailMap.get(email);
      const isDirectMatch =
        Boolean(directTarget) &&
        (!directTarget?.email || directTarget.email.toLowerCase() === email);
      recipientsToSend.push({
        email,
        name:
          extraName.trim() ||
          matchedClient?.name ||
          (isDirectMatch ? directTarget?.name : undefined) ||
          'External Recipient',
        clientId: matchedClient?.id || (isDirectMatch ? directTarget?.clientId : undefined),
        recipientType: isDirectMatch
          ? 'Direct Client'
          : matchedClient
          ? 'Customer'
          : 'Random / External',
      });
    }

    for (const email of bulkTokens) {
      if (seenEmails.has(email)) continue;
      if (recipientsToSend.length >= MAX_RECIPIENTS_PER_BATCH) {
        setError(
          `Maximum ${MAX_RECIPIENTS_PER_BATCH} recipients can be included in a single send batch.`
        );
        return;
      }
      seenEmails.add(email);
      const matchedClient = clientByEmailMap.get(email);
      const isDirectMatch =
        Boolean(directTarget) &&
        (!directTarget?.email || directTarget.email.toLowerCase() === email);
      recipientsToSend.push({
        email,
        name:
          matchedClient?.name ||
          (isDirectMatch ? directTarget?.name : undefined) ||
          email.split('@')[0] ||
          'External Recipient',
        clientId: matchedClient?.id || (isDirectMatch ? directTarget?.clientId : undefined),
        recipientType: isDirectMatch
          ? 'Direct Client'
          : matchedClient
          ? 'Customer'
          : 'Random / External',
      });
    }

    if (recipientsToSend.length === 0) {
      if (directTarget && !directTarget.email) {
        setError(
          `No email address is saved on ${directTarget.name}'s profile. Please enter their email address in the recipient box above.`
        );
        return;
      }
      if (fallbackTopCustomer) {
        recipientsToSend = [
          {
            email: fallbackTopCustomer.email,
            name: fallbackTopCustomer.name,
            clientId: fallbackTopCustomer.clientId,
            orderCount: fallbackTopCustomer.orderCount,
            interestScore: fallbackTopCustomer.score,
            recipientType: 'Customer',
          },
        ];
      }
    }

    if (recipientsToSend.length === 0) {
      setError(
        'No recipient email address available yet. Enter any email address in the recipient box to send.'
      );
      return;
    }

    const resolvedSubject = subject.trim() || DEFAULT_WELCOME_SUBJECT;
    const resolvedMessage = message.trim() || DEFAULT_WELCOME_MESSAGE;
    const resolvedCategory = directTarget
      ? 'Direct Client Mail'
      : selectedCategory === 'ALL'
      ? 'All Categories'
      : selectedCategory;

    setSending(true);
    try {
      const result = await api.sendSmartOffersMail({
        category: resolvedCategory,
        to: recipientsToSend.map((r) => r.email),
        subject: resolvedSubject,
        message: resolvedMessage,
        recipients: recipientsToSend,
      });

      if (extraTokens.length > 0 || bulkTokens.length > 0 || recipients.length === 0) {
        setRecipients(recipientsToSend);
      }
      if (extraTokens.length > 0) {
        setExtraEmail('');
        setExtraName('');
      }
      if (bulkTokens.length > 0) {
        setBulkManualEmails('');
      }
      setDeliveryResult(result);

      const typeLookup = new Map<string, SentMailRecipientType>();
      for (const r of recipientsToSend) {
        const lower = r.email.toLowerCase();
        const inferredType: SentMailRecipientType =
          r.recipientType ||
          (directTarget && directTarget.email.toLowerCase() === lower
            ? 'Direct Client'
            : clientByEmailMap.has(lower) || r.clientId
            ? 'Customer'
            : 'Random / External');
        typeLookup.set(lower, inferredType);
      }

      const nowIso = new Date().toISOString();
      const preview = resolvedMessage.replace(/\s+/g, ' ').trim().slice(0, 260);
      const newRecords: SentMailRecord[] = (result.logs || []).map((log, idx) => {
        const lower = String(log.email || '').trim().toLowerCase();
        const matchedClient = clientByEmailMap.get(lower);
        const recType: SentMailRecipientType =
          typeLookup.get(lower) || (matchedClient ? 'Customer' : 'Random / External');
        return {
          id: `mail-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          recipientEmail: lower || log.email,
          recipientName:
            log.name ||
            matchedClient?.name ||
            (recType === 'Random / External' ? 'External Recipient' : 'Valued Customer'),
          recipientType: recType,
          subject: resolvedSubject,
          messagePreview: preview,
          category: resolvedCategory,
          status: log.status === 'sent' ? 'sent' : 'failed',
          error: log.error,
          sentAt: nowIso,
        };
      });

      if (newRecords.length > 0) {
        const updatedHistory = await api.appendSentMailHistory(newRecords);
        setSentMails(updatedHistory);
      }
    } catch (err) {
      setError(
        formatApiError(
          err,
          'Could not send Smart Offers Mail. Please verify your SMTP configuration and try again.'
        )
      );
    } finally {
      setSending(false);
    }
  };

  const filteredSentMails = useMemo(() => {
    const q = sentSearchQuery.trim().toLowerCase();
    return sentMails.filter((item) => {
      if (sentStatusFilter !== 'ALL' && item.status !== sentStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.recipientEmail.toLowerCase().includes(q) ||
        item.recipientName.toLowerCase().includes(q) ||
        item.subject.toLowerCase().includes(q) ||
        item.messagePreview.toLowerCase().includes(q) ||
        item.recipientType.toLowerCase().includes(q)
      );
    });
  }, [sentMails, sentSearchQuery, sentStatusFilter]);

  const displayCategoryName =
    selectedCategory === 'ALL' ? 'All Categories' : selectedCategory;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
      {/* Header + Compose / Sent Box Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div>
            <h1 className="font-display-serif text-2xl sm:text-3xl font-bold text-[#1F122B] flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-[#DB2777]" />
              <span>Offers Mail &amp; Direct Mail</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#6B5B7B]">
              Send targeted offers, individual client emails, or messages to any email address via &ldquo;Glamour Galleria&rdquo; SMTP.
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white border border-[#EFE2F5] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveSection('compose')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeSection === 'compose'
                ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                : 'text-[#5B4B6B] hover:text-[#1F122B]'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Compose Mail</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('sent-box')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeSection === 'sent-box'
                ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                : 'text-[#5B4B6B] hover:text-[#1F122B]'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Sent Box ({sentMails.length})</span>
          </button>
        </div>
      </div>

      {activeSection === 'sent-box' ? (
        <section className="rounded-3xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#F4ECF8] pb-4">
            <div>
              <h2 className="text-base font-bold text-[#1F122B] flex items-center gap-2">
                <Inbox className="w-4 h-4 text-[#DB2777]" />
                <span>Sent Box ({sentMails.length})</span>
              </h2>
              <p className="text-xs text-[#6B5B7B]">
                Complete history of customer offers, direct client emails, and external recipient deliveries.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#8E7C9E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={sentSearchQuery}
                  onChange={(e) => setSentSearchQuery(e.target.value)}
                  placeholder="Search email, name, or subject..."
                  className="w-56 sm:w-64 rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-8 pr-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="inline-flex items-center gap-1 rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] p-1">
                {(['ALL', 'sent', 'failed'] as const).map((statusOption) => (
                  <button
                    key={statusOption}
                    type="button"
                    onClick={() => setSentStatusFilter(statusOption)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold capitalize cursor-pointer ${
                      sentStatusFilter === statusOption
                        ? 'bg-[#7E22CE] text-white'
                        : 'text-[#5B4B6B] hover:text-[#1F122B]'
                    }`}
                  >
                    {statusOption === 'ALL' ? 'All' : statusOption}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loadingSentBox ? (
            <div className="py-12 text-center text-xs text-[#6B5B7B]">
              Loading Sent Box history...
            </div>
          ) : filteredSentMails.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E6D9EE] bg-[#FDF9FC] py-14 px-6 text-center space-y-2">
              <Inbox className="w-8 h-8 text-[#C084FC] mx-auto" />
              <div className="text-sm font-bold text-[#1F122B]">
                {sentMails.length === 0
                  ? 'No sent emails recorded yet'
                  : 'No sent emails match your filter'}
              </div>
              <p className="text-xs text-[#6B5B7B]">
                {sentMails.length === 0
                  ? 'Emails you send from Compose Mail or Clients will appear here with recipient, subject, status, and timestamp.'
                  : 'Try clearing your search or status filter.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#F4ECF8] rounded-2xl border border-[#EFE2F5] overflow-hidden">
              {filteredSentMails.map((item) => (
                <div
                  key={item.id}
                  className="p-4 bg-white hover:bg-[#FDF9FC] transition-colors space-y-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-[#1F122B]">
                          {item.recipientName || 'Recipient'}
                        </span>
                        <span className="font-mono-num text-xs text-[#6D28D9] break-all">
                          {item.recipientEmail}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                            item.recipientType === 'Direct Client'
                              ? 'border-[#F9A8D4] bg-[#FDF2F8] text-[#BE185D]'
                              : item.recipientType === 'Random / External'
                              ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]'
                              : 'border-[#D8B4FE] bg-[#FAF5FF] text-[#6D28D9]'
                          }`}
                        >
                          {item.recipientType}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-[#2E1F3D] break-words">
                        Subject: {item.subject}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {item.status === 'sent' ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-[#DCFCE7] px-2.5 py-1 text-[11px] font-bold text-[#15803D]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Sent</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-[#FFE4E6] px-2.5 py-1 text-[11px] font-bold text-[#BE123C]">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Failed</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#6B5B7B] font-mono-num">
                        <Clock className="w-3 h-3" />
                        <span>{formatSentTimestamp(item.sentAt)}</span>
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-[#5B4B6B] leading-relaxed break-words bg-[#FDFBFE] rounded-xl border border-[#F4ECF8] px-3 py-2">
                    {item.messagePreview}
                  </p>

                  {item.status === 'failed' && item.error && (
                    <div className="text-[11px] font-medium text-[#BE123C] break-words">
                      Error: {item.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {directTarget && (
            <div className="rounded-2xl border border-[#F9A8D4] bg-[#FDF2F8] p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <UserCheck className="w-5 h-5 text-[#DB2777] shrink-0" />
                <div className="text-xs text-[#831843] min-w-0">
                  <div className="font-bold">
                    Direct Client Email: {directTarget.name}
                  </div>
                  <div className="truncate">
                    {directTarget.email
                      ? `Pre-filled recipient: ${directTarget.email}`
                      : 'This client does not have an email saved yet — enter their email address below to send.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSwitchToGroupMode}
                className="rounded-xl border border-[#F472B6] bg-white px-3 py-1.5 text-xs font-bold text-[#9D174D] hover:bg-[#FCE7F3] cursor-pointer shrink-0"
              >
                Switch to Group Offers
              </button>
            </div>
          )}

          {/* Category Filter Chips */}
          <section className="rounded-3xl border border-[#EFE2F5] bg-white p-5 space-y-3 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#1F122B]">
                  1. Choose Target Category
                </h2>
                <p className="text-xs text-[#6B5B7B]">
                  Click any category to detect interested customers, rank top orders, and target up to 20 recipients.
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
                  selectedCategory === 'ALL' && !directTarget
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
                    selectedCategory === cat && !directTarget
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
                    {directTarget ? (
                      <>
                        Mode: <strong>Direct Client Mail</strong>
                      </>
                    ) : (
                      <>
                        Category: <strong>{displayCategoryName}</strong> · Eligible customers detected:{' '}
                        <strong className="font-mono-num">
                          {rankedCustomersForCategory.length}
                        </strong>
                      </>
                    )}
                  </p>
                </div>

                {recipients.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllRecipients}
                    className="rounded-lg border border-[#FECDD3] bg-[#FFF1F2] px-2.5 py-1 text-[11px] font-bold text-[#BE123C] hover:bg-[#FFE4E6] cursor-pointer"
                  >
                    Clear List
                  </button>
                )}
              </div>

              {/* Selected Recipients Chips */}
              {recipients.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#E6D9EE] bg-[#FDF9FC] p-5 text-center text-xs text-[#6B5B7B]">
                  {directTarget && !directTarget.email ? (
                    <>
                      Enter <strong>{directTarget.name}</strong>&apos;s email address below to send directly.
                    </>
                  ) : fallbackTopCustomer ? (
                    <>
                      No recipients currently listed. Enter any email address below (even non-customers) or click Send to automatically fall back to your top customer{' '}
                      <strong>{fallbackTopCustomer.name}</strong> ({fallbackTopCustomer.email}).
                    </>
                  ) : (
                    <>
                      No customers with verified emails detected yet. Add any recipient email address below to send.
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
                      {rec.recipientType === 'Random / External' && (
                        <span className="rounded bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-bold text-[#B45309]">
                          External
                        </span>
                      )}
                      {rec.recipientType === 'Direct Client' && (
                        <span className="rounded bg-[#FCE7F3] px-1.5 py-0.5 text-[10px] font-bold text-[#BE185D]">
                          Direct
                        </span>
                      )}
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

              {/* Add Extra / Random Non-Customer Email Address */}
              <form
                noValidate
                onSubmit={handleAddExtraEmail}
                className="rounded-2xl border border-[#F4ECF8] bg-[#FDF9FC] p-3.5 space-y-2.5"
              >
                <div className="text-xs font-bold text-[#4A3B59]">
                  Add Any Email Address (Customer or Non-Customer / Random)
                </div>
                <p className="text-[11px] text-[#6B5B7B]">
                  Send to anyone—even people who are not existing customers. Separate multiple emails with commas if needed.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_0.8fr_auto] gap-2">
                  <input
                    type="text"
                    value={extraEmail}
                    onChange={(e) => setExtraEmail(e.target.value)}
                    placeholder="anyone@example.com"
                    className="min-w-0 rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                  />
                  <input
                    type="text"
                    value={extraName}
                    onChange={(e) => setExtraName(e.target.value)}
                    placeholder="Recipient name (optional)"
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

              {/* Bulk Manual Emails Input */}
              <div className="rounded-2xl border border-[#EFE2F5] bg-[#FAF5FF]/60 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-[#4A3B59]">
                    Bulk Manual Emails (Multiple Customers or External Recipients)
                  </div>
                  <span className="rounded-md bg-white border border-[#E9D5FF] px-2 py-0.5 text-[10px] font-bold text-[#6D28D9] font-mono-num">
                    Up to {MAX_RECIPIENTS_PER_BATCH} per batch
                  </span>
                </div>
                <p className="text-[11px] text-[#6B5B7B]">
                  Paste or type multiple email addresses separated by commas, spaces, semicolons, or new lines. You can click &ldquo;Add Bulk Emails&rdquo; or click Send directly.
                </p>
                <textarea
                  rows={4}
                  value={bulkManualEmails}
                  onChange={(e) => setBulkManualEmails(e.target.value)}
                  placeholder={`customer1@example.com, customer2@example.com\nfriend@example.com\nanother.buyer@example.com`}
                  className="w-full rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs text-[#1F122B] font-mono-num focus:border-[#9333EA] focus:outline-none"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] text-[#5B4B6B]">
                    {bulkEmailPreview.totalTokens === 0 ? (
                      <span>No bulk emails pasted yet.</span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <strong className="text-[#15803D] font-mono-num">
                          {bulkEmailPreview.validEmails.length} valid email
                          {bulkEmailPreview.validEmails.length === 1 ? '' : 's'}
                        </strong>
                        {bulkEmailPreview.invalidTokens.length > 0 && (
                          <span className="text-[#BE123C] font-semibold">
                            · {bulkEmailPreview.invalidTokens.length} invalid (e.g.{' '}
                            {bulkEmailPreview.invalidTokens[0]})
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {bulkManualEmails.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setBulkManualEmails('');
                          setError('');
                        }}
                        className="rounded-xl border border-[#E6D9EE] bg-white px-3 py-1.5 text-xs font-semibold text-[#5B4B6B] hover:text-[#1F122B] cursor-pointer"
                      >
                        Clear Box
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleAddBulkManualEmails}
                      disabled={!bulkManualEmails.trim()}
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-[#D8B4FE] bg-white px-3.5 py-1.5 text-xs font-bold text-[#6D28D9] hover:border-[#9333EA] disabled:opacity-50 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Bulk Emails</span>
                    </button>
                  </div>
                </div>
              </div>

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
                    placeholder="Write your personalized offer announcement, direct message, or store update..."
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
                          directTarget?.name ||
                          fallbackTopCustomer?.name ||
                          'Valued Customer'}
                      </strong>
                      ,
                    </p>
                    <div className="whitespace-pre-wrap text-[#2E1F3D] leading-relaxed break-words">
                      {message.trim() || DEFAULT_WELCOME_MESSAGE}
                    </div>
                    <div className="pt-2 space-y-1.5">
                      <a
                        href={CUSTOMER_PANEL_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-bold text-white hover:opacity-95"
                      >
                        <span>Visit Glamour Galleria</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <div className="text-[11px] text-[#6B5B7B] break-all">
                        Shop now:{' '}
                        <a
                          href={CUSTOMER_PANEL_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-[#6D28D9] underline"
                        >
                          {CUSTOMER_PANEL_URL}
                        </a>
                      </div>
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
                      !bulkManualEmails.trim() &&
                      (Boolean(directTarget && !directTarget.email) ||
                        !fallbackTopCustomer))
                  }
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-3 px-5 text-sm font-bold text-white hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-60"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {sending
                      ? `Sending to ${
                          recipients.length +
                            bulkEmailPreview.validEmails.length || 1
                        } Recipient(s)...`
                      : recipients.length > 0 && bulkEmailPreview.validEmails.length > 0
                      ? `Send Mail (${recipients.length} Selected + ${bulkEmailPreview.validEmails.length} Bulk)`
                      : recipients.length > 0
                      ? `Send Mail (${recipients.length} ${
                          recipients.length === 1 ? 'Recipient' : 'Recipients'
                        })`
                      : bulkEmailPreview.validEmails.length > 0
                      ? `Send Mail (${bulkEmailPreview.validEmails.length} Bulk ${
                          bulkEmailPreview.validEmails.length === 1
                            ? 'Recipient'
                            : 'Recipients'
                        })`
                      : extraEmail.trim() || bulkManualEmails.trim()
                      ? 'Send Mail (Entered Recipient)'
                      : fallbackTopCustomer && !directTarget
                      ? `Send Mail (Auto: ${fallbackTopCustomer.name})`
                      : 'Send Mail'}
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
                        deliveryResult.sentCount > 0
                          ? 'text-[#15803D]'
                          : 'text-[#BE123C]'
                      }`}
                    >
                      {deliveryResult.sentCount > 0 ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 shrink-0" />
                      )}
                      <span>
                        {deliveryResult.sentCount > 0
                          ? 'Delivery Summary (Saved to Sent Box)'
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
                      <div
                        key={item.email}
                        className="px-3 py-2 text-[11px] space-y-0.5"
                      >
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
        </>
      )}
    </div>
  );
};
