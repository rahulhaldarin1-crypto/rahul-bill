import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Calendar,
  CreditCard,
  Eye,
  FileText,
  Mail,
  MapPin,
  Package,
  Phone,
  Search,
  Store,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  Client,
  CustomerOrder,
  Invoice,
  Product,
  SellerAccountStatus,
  SellerApplication,
} from '../types/business';
import { formatCurrency } from '../utils/calculations';
import { getOptimizedMediaUrl } from '../utils/cloudinary';
import { CustomerAvatar } from './CustomerAvatar';

interface CustomerSellerContactsViewProps {
  clients: Client[];
  sellerApplications: SellerApplication[];
  invoices: Invoice[];
  orders: CustomerOrder[];
  products: Product[];
  currencySymbol: string;
  onBack: () => void;
  onMailContact: (target: {
    email: string;
    name: string;
    clientId?: string;
  }) => void;
}

type ContactEntry =
  | {
      key: string;
      role: 'Customer';
      name: string;
      stateName: string;
      phone: string;
      email: string;
      photoUrl?: string;
      createdAt: string;
      client: Client;
    }
  | {
      key: string;
      role: 'Seller';
      name: string;
      stateName: string;
      phone: string;
      email: string;
      photoUrl?: string;
      createdAt: string;
      seller: SellerApplication;
    };

const INDIAN_STATES_AND_UTS = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

function extractStateFromAddress(fullAddress: string): string {
  const clean = String(fullAddress || '').trim();
  if (!clean) return '—';

  const lower = clean.toLowerCase();
  for (const state of INDIAN_STATES_AND_UTS) {
    if (lower.includes(state.toLowerCase())) {
      return state;
    }
  }

  // Fallback: look for comma-separated segment that isn't a pure PIN code
  const parts = clean
    .split(',')
    .map((p) => p.replace(/\b\d{5,6}\b/g, '').trim())
    .filter((p) => p.length > 1);
  if (parts.length >= 2) {
    return parts[parts.length - 1];
  }
  return parts[0] || '—';
}

function getSellerStatusBadge(status: SellerAccountStatus) {
  switch (status) {
    case 'approved':
      return {
        label: 'Approved',
        cls: 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        cls: 'border-[#FECDD3] bg-[#FFF1F2] text-[#BE123C]',
      };
    case 'suspended':
      return {
        label: 'Suspended',
        cls: 'border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]',
      };
    default:
      return {
        label: 'Pending',
        cls: 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]',
      };
  }
}

export const CustomerSellerContactsView: React.FC<
  CustomerSellerContactsViewProps
> = ({
  clients,
  sellerApplications,
  invoices,
  orders,
  products,
  currencySymbol,
  onBack,
  onMailContact,
}) => {
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'Customer' | 'Seller'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContactKey, setSelectedContactKey] = useState<string | null>(null);
  const [docPreview, setDocPreview] = useState<{
    title: string;
    src: string;
  } | null>(null);

  const detailDepthRef = useRef(0);
  const listScrollYRef = useRef(0);

  const restoreScroll = useCallback(() => {
    const y = listScrollYRef.current;
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, behavior: 'auto' });
    });
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (detailDepthRef.current <= 0) return;
      detailDepthRef.current = Math.max(0, detailDepthRef.current - 1);
      setDocPreview(null);
      setSelectedContactKey(null);
      restoreScroll();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [restoreScroll]);

  const openContactDetail = (key: string) => {
    listScrollYRef.current = window.scrollY;
    setSelectedContactKey(key);
    try {
      window.history.pushState({ ggType: 'contacts-sub', contactKey: key }, '');
      detailDepthRef.current += 1;
    } catch {
      // ignore history errors
    }
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
  };

  const closeContactDetail = () => {
    if (detailDepthRef.current > 0) {
      window.history.back();
      return;
    }
    setDocPreview(null);
    setSelectedContactKey(null);
    restoreScroll();
  };

  const clientById = useMemo(() => {
    const map = new Map<string, Client>();
    for (const c of clients) {
      map.set(c.id, c);
    }
    return map;
  }, [clients]);

  const combinedContacts: ContactEntry[] = useMemo(() => {
    const customerEntries: ContactEntry[] = clients.map((c) => ({
      key: `customer-${c.id}`,
      role: 'Customer',
      name: c.name || 'Unnamed Customer',
      stateName:
        (c.state || '').trim() ||
        extractStateFromAddress([c.address, c.city].filter(Boolean).join(', ')),
      phone: c.mobile || c.whatsapp || '—',
      email: (c.email || '').trim(),
      photoUrl: c.profilePhotoDataUrl,
      createdAt: c.createdAt || '',
      client: c,
    }));

    const sellerEntries: ContactEntry[] = sellerApplications.map((s) => {
      const linkedClient = s.clientId ? clientById.get(s.clientId) : undefined;
      const stateFromClient = (linkedClient?.state || '').trim();
      return {
        key: `seller-${s.id}`,
        role: 'Seller',
        name: s.name || 'Unnamed Seller',
        stateName:
          stateFromClient || extractStateFromAddress(s.fullAddress || ''),
        phone: s.phone || '—',
        email: (s.email || linkedClient?.email || '').trim(),
        photoUrl: s.sellerPhotoDataUrl,
        createdAt: s.createdAt || '',
        seller: s,
      };
    });

    return [...customerEntries, ...sellerEntries].sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    );
  }, [clients, sellerApplications, clientById]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return combinedContacts.filter((entry) => {
      if (roleFilter !== 'ALL' && entry.role !== roleFilter) return false;
      if (!q) return true;
      return (
        entry.name.toLowerCase().includes(q) ||
        entry.role.toLowerCase().includes(q) ||
        entry.stateName.toLowerCase().includes(q) ||
        entry.phone.toLowerCase().includes(q) ||
        entry.email.toLowerCase().includes(q)
      );
    });
  }, [combinedContacts, roleFilter, searchQuery]);

  const selectedContact = useMemo(
    () =>
      selectedContactKey
        ? combinedContacts.find((c) => c.key === selectedContactKey) || null
        : null,
    [combinedContacts, selectedContactKey]
  );

  // FULL DETAIL VIEW FOR SELECTED CUSTOMER OR SELLER
  if (selectedContact) {
    if (selectedContact.role === 'Customer') {
      const c = selectedContact.client;
      const custInvoices = invoices.filter(
        (inv) =>
          inv.clientId === c.id ||
          (inv.customerMobile && c.mobile && inv.customerMobile === c.mobile)
      );
      const custOrders = orders.filter(
        (ord) =>
          ord.clientId === c.id ||
          (ord.customerPhone && c.mobile && ord.customerPhone === c.mobile)
      );
      const totalSpent = custInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
      const totalDue = custInvoices.reduce((sum, i) => sum + i.dueAmount, 0);
      const interestCats = Object.entries(c.categoryInterests || {})
        .sort((a, b) => (b[1]?.score || 0) - (a[1]?.score || 0))
        .slice(0, 6);

      return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={closeContactDetail}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>All Contacts</span>
              </button>
              <CustomerAvatar
                photoDataUrl={c.profilePhotoDataUrl}
                name={c.name}
                size={44}
              />
              <div className="min-w-0">
                <h1 className="font-display-serif text-xl sm:text-2xl font-bold text-[#1F122B] truncate">
                  {c.name}
                </h1>
                <span className="inline-block text-[11px] font-bold text-[#7E22CE] bg-[#FAF5FF] border border-[#E9D5FF] rounded-md px-2 py-0.5 mt-0.5">
                  Customer
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                onMailContact({
                  email: selectedContact.email,
                  name: c.name,
                  clientId: c.id,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer shrink-0"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Send Mail</span>
            </button>
          </div>

          {/* Complete Customer Details Card */}
          <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-6 shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="sm:col-span-2">
                <div className="text-[#6B5B7B] mb-0.5">Account Email</div>
                <div className="font-semibold text-sm text-[#6D28D9] break-all">
                  {selectedContact.email || 'Not provided'}
                </div>
              </div>
              <div>
                <div className="text-[#6B5B7B] mb-0.5">Mobile Number</div>
                <div className="font-mono-num font-semibold text-sm text-[#1F122B]">
                  {c.mobile || '—'}
                </div>
              </div>
              <div>
                <div className="text-[#6B5B7B] mb-0.5">WhatsApp Number</div>
                <div className="font-mono-num font-semibold text-sm text-[#1F122B]">
                  {c.whatsapp || c.mobile || '—'}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-[#6B5B7B] mb-0.5">Full Address</div>
                <div className="text-sm text-[#1F122B]">
                  {c.address || 'Not provided'}
                </div>
              </div>
              <div>
                <div className="text-[#6B5B7B] mb-0.5">State</div>
                <div className="text-sm font-semibold text-[#1F122B]">
                  {selectedContact.stateName}
                </div>
              </div>
              <div>
                <div className="text-[#6B5B7B] mb-0.5">City &amp; PIN Code</div>
                <div className="text-sm font-medium text-[#1F122B] font-mono-num">
                  {[c.city, c.pinCode].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <div>
                <div className="text-[#6B5B7B] mb-0.5">Referral Code</div>
                <div className="font-mono-num font-semibold text-sm text-[#1F122B]">
                  {c.referralCode || '—'}
                </div>
              </div>
              <div>
                <div className="text-[#6B5B7B] mb-0.5">Joined Date</div>
                <div className="font-mono-num font-medium text-sm text-[#1F122B]">
                  {c.createdAt ? c.createdAt.slice(0, 10) : '—'}
                </div>
              </div>
              {interestCats.length > 0 && (
                <div className="sm:col-span-2 pt-2 border-t border-[#F4ECF8]">
                  <div className="text-[#6B5B7B] mb-1.5">
                    Top Interested Categories
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {interestCats.map(([cat, stat]) => (
                      <span
                        key={cat}
                        className="rounded-lg border border-[#E9D5FF] bg-[#FAF5FF] px-2.5 py-1 text-[11px] font-semibold text-[#6D28D9]"
                      >
                        {cat} (Score {stat.score})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Customer Metrics Summary */}
            <div className="rounded-2xl border border-[#F4ECF8] bg-[#FDF9FE] p-4 sm:p-5 space-y-3 self-start">
              <div className="text-xs font-bold text-[#7E22CE] uppercase tracking-wide">
                Customer Activity Summary
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-white border border-[#EFE2F5] p-3">
                  <div className="text-[#6B5B7B]">Portal Orders</div>
                  <div className="font-mono-num text-lg font-bold text-[#1F122B] mt-0.5">
                    {custOrders.length}
                  </div>
                </div>
                <div className="rounded-xl bg-white border border-[#EFE2F5] p-3">
                  <div className="text-[#6B5B7B]">Billed Invoices</div>
                  <div className="font-mono-num text-lg font-bold text-[#1F122B] mt-0.5">
                    {custInvoices.length}
                  </div>
                </div>
                <div className="rounded-xl bg-white border border-[#EFE2F5] p-3">
                  <div className="text-[#6B5B7B]">Total Spent</div>
                  <div className="font-mono-num text-base font-bold text-[#15803D] mt-0.5">
                    {formatCurrency(totalSpent, currencySymbol)}
                  </div>
                </div>
                <div className="rounded-xl bg-white border border-[#EFE2F5] p-3">
                  <div className="text-[#6B5B7B]">Pending Due</div>
                  <div className="font-mono-num text-base font-bold text-[#DB2777] mt-0.5">
                    {formatCurrency(totalDue, currencySymbol)}
                  </div>
                </div>
              </div>
              {c.referredBy && (
                <div className="text-[11px] text-[#5B4B6B] pt-1">
                  Referred by code:{' '}
                  <strong className="font-mono-num">{c.referredBy}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Customer Recent Orders */}
          {custOrders.length > 0 && (
            <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5 space-y-3 shadow-xs">
              <h2 className="text-sm font-bold text-[#1F122B]">
                Recent Storefront Orders ({custOrders.length})
              </h2>
              <div className="divide-y divide-[#F4ECF8]">
                {custOrders.slice(0, 10).map((ord) => (
                  <div
                    key={ord.id}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-[#1F122B]">
                        {ord.orderNumber} · {ord.productName}
                      </div>
                      <div className="text-[#6B5B7B] font-mono-num">
                        {ord.orderDate || ord.createdAt.slice(0, 10)} ·{' '}
                        {ord.paymentMethod} · {ord.status}
                      </div>
                    </div>
                    <div className="font-mono-num font-bold text-[#7E22CE]">
                      {formatCurrency(ord.totalAmount, currencySymbol)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // FULL SELLER DETAILS VIEW
    const s = selectedContact.seller;
    const badge = getSellerStatusBadge(s.status);
    const sellerProds = products.filter((p) => p.sellerId === s.id);
    const docCards = [
      { label: 'Seller Photo', src: s.sellerPhotoDataUrl },
      { label: 'Cover Banner', src: s.sellerCoverPhotoDataUrl || '' },
      { label: 'PAN Card Document', src: s.panDocDataUrl },
      { label: 'Aadhaar Card Document', src: s.aadhaarDocDataUrl },
      { label: 'GST Certificate', src: s.gstDocDataUrl || '' },
      { label: 'Bank / Passbook / Cheque', src: s.bankDocDataUrl },
      { label: 'Seller Payment QR', src: s.sellerQrDataUrl || '' },
    ].filter((d) => Boolean(d.src));

    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={closeContactDetail}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>All Contacts</span>
            </button>
            <div className="w-11 h-11 rounded-full border border-[#E9D5FF] bg-[#FDF9FE] overflow-hidden shrink-0 flex items-center justify-center">
              {s.sellerPhotoDataUrl ? (
                <img
                  src={getOptimizedMediaUrl(s.sellerPhotoDataUrl, 'image')}
                  alt={s.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Store className="w-5 h-5 text-[#DB2777]" />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="font-display-serif text-xl sm:text-2xl font-bold text-[#1F122B] truncate">
                {s.name}
              </h1>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                <span className="inline-block text-[11px] font-bold text-[#DB2777] bg-[#FDF2F8] border border-[#FBCFE8] rounded-md px-2 py-0.5">
                  Seller
                </span>
                <span
                  className={`inline-block text-[11px] font-bold border rounded-md px-2 py-0.5 ${badge.cls}`}
                >
                  {badge.label}
                </span>
                {s.sellerCode && (
                  <span className="font-mono-num text-[11px] font-bold text-[#6D28D9]">
                    ID: {s.sellerCode}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              onMailContact({
                email: selectedContact.email,
                name: s.name,
                clientId: s.clientId,
              })
            }
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer shrink-0"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Send Mail</span>
          </button>
        </div>

        {/* Complete Seller Profile & KYC Info */}
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <div className="text-[#6B5B7B] mb-0.5">Email Address</div>
              <div className="font-semibold text-sm text-[#6D28D9] break-all">
                {selectedContact.email || 'Not provided'}
              </div>
            </div>
            <div>
              <div className="text-[#6B5B7B] mb-0.5">Phone Number</div>
              <div className="font-mono-num font-semibold text-sm text-[#1F122B]">
                {s.phone || '—'}
              </div>
            </div>
            <div>
              <div className="text-[#6B5B7B] mb-0.5">State</div>
              <div className="font-semibold text-sm text-[#1F122B]">
                {selectedContact.stateName}
              </div>
            </div>
            <div>
              <div className="text-[#6B5B7B] mb-0.5 inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>Date of Birth</span>
              </div>
              <div className="font-mono-num font-semibold text-sm text-[#1F122B]">
                {s.dateOfBirth || 'Not provided'}
              </div>
            </div>
            <div>
              <div className="text-[#6B5B7B] mb-0.5">PAN Number</div>
              <div className="font-mono-num font-bold text-sm text-[#1F122B]">
                {s.panNumber || '—'}
              </div>
            </div>
            <div>
              <div className="text-[#6B5B7B] mb-0.5">Aadhaar Number</div>
              <div className="font-mono-num font-bold text-sm text-[#1F122B]">
                {s.aadhaarNumber || '—'}
              </div>
            </div>
            <div>
              <div className="text-[#6B5B7B] mb-0.5">GST Number</div>
              <div className="font-mono-num font-semibold text-sm text-[#1F122B]">
                {s.gstNumber || 'Not provided'}
              </div>
            </div>
            <div>
              <div className="text-[#6B5B7B] mb-0.5">Applied On</div>
              <div className="font-mono-num font-medium text-sm text-[#1F122B]">
                {s.createdAt ? s.createdAt.slice(0, 10) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[#6B5B7B] mb-0.5">Followers / Products</div>
              <div className="font-mono-num font-semibold text-sm text-[#1F122B]">
                {s.followersCount || 0} followers · {sellerProds.length} products
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="text-[#6B5B7B] mb-0.5 inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                <span>Full Address</span>
              </div>
              <div className="text-sm text-[#1F122B]">{s.fullAddress || '—'}</div>
            </div>
          </div>

          {/* Payout & Payment Settings */}
          {(s.bankAccountDetails ||
            s.sellerUpiId ||
            s.sellerBankAccountNo ||
            s.sellerBankName) && (
            <div className="rounded-xl border border-[#F4ECF8] bg-[#FDF9FE] p-4 space-y-2 text-xs">
              <div className="font-bold text-[#6D28D9] inline-flex items-center gap-1.5">
                <CreditCard className="w-4 h-4" />
                <span>Seller Bank &amp; Payment Details</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#1F122B] font-mono-num">
                {s.sellerUpiId && <div>UPI ID: {s.sellerUpiId}</div>}
                {s.sellerBankAccountName && (
                  <div>Account Holder: {s.sellerBankAccountName}</div>
                )}
                {s.sellerBankName && <div>Bank: {s.sellerBankName}</div>}
                {s.sellerBankAccountNo && (
                  <div>Account No: {s.sellerBankAccountNo}</div>
                )}
                {s.sellerBankIfscBranch && (
                  <div>IFSC / Branch: {s.sellerBankIfscBranch}</div>
                )}
              </div>
              {s.bankAccountDetails && (
                <div className="text-[#4A3B59] whitespace-pre-line">
                  {s.bankAccountDetails}
                </div>
              )}
            </div>
          )}

          {s.adminRemarks && (
            <div className="rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] p-3.5 text-xs text-[#4A3B59]">
              <strong>Admin Remarks:</strong> {s.adminRemarks}
            </div>
          )}

          {/* KYC & Store Documents */}
          {docCards.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-[#F4ECF8]">
              <div className="text-xs font-bold text-[#1F122B] inline-flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#DB2777]" />
                <span>Seller Photos &amp; KYC Documents</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {docCards.map((doc) => (
                  <button
                    key={doc.label}
                    type="button"
                    onClick={() => setDocPreview({ title: doc.label, src: doc.src })}
                    className="group rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] overflow-hidden text-left hover:border-[#9333EA] cursor-pointer"
                  >
                    <div className="h-24 bg-white overflow-hidden flex items-center justify-center border-b border-[#F4ECF8]">
                      <img
                        src={getOptimizedMediaUrl(doc.src, 'image')}
                        alt={doc.label}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <div className="px-2.5 py-1.5 text-[11px] font-semibold text-[#1F122B] truncate">
                      {doc.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Seller Listed Products Summary */}
        {sellerProds.length > 0 && (
          <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5 space-y-3 shadow-xs">
            <h2 className="text-sm font-bold text-[#1F122B] inline-flex items-center gap-1.5">
              <Package className="w-4 h-4 text-[#7E22CE]" />
              <span>Seller Listed Products ({sellerProds.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {sellerProds.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-[#EFE2F5] bg-[#FDFBFE] p-3 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-[#1F122B] truncate">
                      {p.name}
                    </div>
                    <div className="text-[#6B5B7B] font-mono-num">
                      {p.category} · Stock {p.stockQty} ·{' '}
                      <span className="capitalize">
                        {p.sellerApprovalStatus || 'pending'}
                      </span>
                    </div>
                  </div>
                  <div className="font-mono-num font-bold text-[#7E22CE] shrink-0">
                    {formatCurrency(p.sellingPrice, currencySymbol)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {docPreview && (
          <div
            className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setDocPreview(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl rounded-2xl bg-white overflow-hidden shadow-2xl"
            >
              <div className="px-4 py-3 border-b border-[#EFE2F5] flex items-center justify-between">
                <span className="text-sm font-bold text-[#1F122B]">
                  {docPreview.title}
                </span>
                <button
                  type="button"
                  onClick={() => setDocPreview(null)}
                  className="p-1.5 rounded-lg text-[#6B5B7B] hover:bg-[#FAF5FF] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 bg-[#FDFBFE] flex items-center justify-center max-h-[75vh] overflow-auto">
                <img
                  src={getOptimizedMediaUrl(docPreview.src, 'image')}
                  alt={docPreview.title}
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[68vh] object-contain rounded-lg"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const customerCount = combinedContacts.filter(
    (c) => c.role === 'Customer'
  ).length;
  const sellerCount = combinedContacts.filter(
    (c) => c.role === 'Seller'
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5 pb-24 md:pb-10">
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
            <h1 className="font-display-serif text-2xl font-bold text-[#1F122B] flex items-center gap-2">
              <Users className="w-6 h-6 text-[#DB2777]" />
              <span>Customer Seller Contact</span>
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5 font-mono-num">
              {combinedContacts.length} total contacts ({customerCount}{' '}
              customers · {sellerCount} sellers)
            </p>
          </div>
        </div>

        {/* Role Filter Tabs */}
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white border border-[#EFE2F5] shrink-0 self-start sm:self-auto">
          {(
            [
              { id: 'ALL', label: `All (${combinedContacts.length})` },
              { id: 'Customer', label: `Customers (${customerCount})` },
              { id: 'Seller', label: `Sellers (${sellerCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRoleFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                roleFilter === tab.id
                  ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                  : 'text-[#5B4B6B] hover:text-[#1F122B]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative w-full md:max-w-md">
        <Search className="w-4 h-4 text-[#8E7C9E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, state, phone, email, or Customer/Seller..."
          className="w-full rounded-xl border border-[#E6D9EE] bg-white pl-10 pr-4 py-2.5 text-sm text-[#1F122B] placeholder:text-[#A493B5] focus:border-[#9333EA] focus:outline-none"
        />
      </div>

      {/* Numbered Contact Directory (01, 02, 03, 04...) */}
      {filteredContacts.length === 0 ? (
        <div className="rounded-2xl border border-[#EFE2F5] bg-white py-14 px-6 text-center space-y-2">
          <UserCheck className="w-10 h-10 text-[#D8B4FE] mx-auto" />
          <h3 className="text-base font-bold text-[#1F122B]">
            No matching contacts found
          </h3>
          <p className="text-xs text-[#6B5B7B]">
            Try clearing your search filter or check back once customers or sellers register.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#EFE2F5] bg-white divide-y divide-[#F4ECF8] overflow-hidden shadow-xs">
          {filteredContacts.map((entry, idx) => {
            const serialLabel = String(idx + 1).padStart(2, '0');
            return (
              <div
                key={entry.key}
                className="px-3.5 sm:px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-[#FDFBFE] transition-colors"
              >
                {/* Left: 01 + Very Small Avatar + Name with Customer/Seller Sub-Label */}
                <div className="flex items-center gap-3 min-w-0 md:w-[32%]">
                  <span className="font-mono-num text-xs font-bold text-[#7E22CE] bg-[#FAF5FF] border border-[#E9D5FF] rounded-lg px-2 py-1 shrink-0">
                    {serialLabel}
                  </span>

                  {entry.role === 'Customer' ? (
                    <CustomerAvatar
                      photoDataUrl={entry.photoUrl}
                      name={entry.name}
                      size={32}
                      className="shrink-0"
                    />
                  ) : entry.photoUrl ? (
                    <img
                      src={getOptimizedMediaUrl(entry.photoUrl, 'image')}
                      alt={entry.name}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-full object-cover border border-[#FBCFE8] shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#DB2777] to-[#7E22CE] text-white flex items-center justify-center shrink-0">
                      <Store className="w-4 h-4" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#1F122B] truncate">
                      {entry.name}
                    </div>
                    <div
                      className={`text-[11px] font-semibold leading-tight flex items-center gap-1 ${
                        entry.role === 'Seller'
                          ? 'text-[#DB2777]'
                          : 'text-[#7E22CE]'
                      }`}
                    >
                      {entry.role === 'Seller' && (
                        <BadgeCheck className="w-3 h-3 shrink-0" />
                      )}
                      <span>{entry.role}</span>
                    </div>
                  </div>
                </div>

                {/* Middle: State Name, Phone Number & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-3 flex-1 min-w-0 text-xs pl-9 md:pl-0">
                  <div className="flex items-center gap-1.5 text-[#4A3B59] min-w-0">
                    <MapPin className="w-3.5 h-3.5 text-[#9333EA] shrink-0" />
                    <span className="truncate font-medium">
                      {entry.stateName || '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#1F122B] font-mono-num min-w-0">
                    <Phone className="w-3.5 h-3.5 text-[#DB2777] shrink-0" />
                    <span className="truncate">{entry.phone || '—'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#6D28D9] min-w-0">
                    <Mail className="w-3.5 h-3.5 text-[#7E22CE] shrink-0" />
                    <span className="truncate">
                      {entry.email || 'No email'}
                    </span>
                  </div>
                </div>

                {/* Right: Mail Icon + Small View Detail Icon */}
                <div className="flex items-center justify-end gap-1.5 shrink-0 pl-9 md:pl-0">
                  <button
                    type="button"
                    onClick={() =>
                      onMailContact({
                        email: entry.email,
                        name: entry.name,
                        clientId:
                          entry.role === 'Customer'
                            ? entry.client.id
                            : entry.seller.clientId,
                      })
                    }
                    title={
                      entry.email
                        ? `Send email to ${entry.email}`
                        : `Compose email for ${entry.name}`
                    }
                    aria-label={`Send email to ${entry.name}`}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[#E9D5FF] bg-[#FAF5FF] text-[#7E22CE] hover:border-[#DB2777] hover:text-[#DB2777] transition-colors cursor-pointer"
                  >
                    <Mail className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openContactDetail(entry.key)}
                    title={`View full details for ${entry.name}`}
                    aria-label={`View full details for ${entry.name}`}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[#E6D9EE] bg-white text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] transition-colors cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
