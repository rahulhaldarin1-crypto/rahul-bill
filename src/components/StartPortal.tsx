import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Gift,
  Heart,
  Home,
  Image as ImageIcon,
  LayoutGrid,
  LifeBuoy,
  MapPin,
  Menu,
  MessageSquare,
  Minus,
  Package,
  Plus,
  QrCode,
  Search,
  Share2,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Store,
  Tag,
  Truck,
  Upload,
  User,
  UserCheck,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import {
  AdminPaymentSettings,
  BusinessSettings,
  Client,
  CloudinaryMediaRecord,
  CustomerCartItem,
  CustomerOrder,
  CustomerOrderPaymentMethod,
  Invoice,
  MediaResourceType,
  Product,
  ProductReview,
  SellerFollowRecord,
  SellerPublicPaymentProfile,
  ViewPanelConfig,
} from '../types/business';
import { api, formatApiError } from '../utils/api';
import {
  COD_DELIVERY_CHARGE_PER_ITEM,
  DEFAULT_ADMIN_UPI_ID,
  DEFAULT_VIEW_PANEL_CONFIG,
  PRODUCT_CATEGORIES,
  buildUpiDeepLink,
  formatCurrency,
  isProductHighlightActive,
  normalizeAsianPhone,
  resolveEffectivePaymentDetails,
  stripPlus91Prefix,
  validateEnglishName,
} from '../utils/calculations';
import {
  getOptimizedMediaUrl,
  isVideoUrl,
  uploadMediaToCloudinary,
} from '../utils/cloudinary';
import { sanitizeNumericInput } from '../utils/numberInput';
import { auth, getRedirectResult } from '../firebase';
import { AppBackground } from './AppBackground';
import { BrandLogo } from './BrandLogo';
import { CustomerAuthModal, GoogleOnboardingSeed } from './CustomerAuthModal';
import { CustomerAvatar } from './CustomerAvatar';
import {
  CustomerDashboardTab,
  CustomerDashboardView,
} from './CustomerDashboardView';
import { HelpCenterChatView } from './HelpCenterChatView';
import { OfflineIndicator, PWAInstallButton } from './PWAInstallButton';
import { ReferEarnView } from './ReferEarnView';
import { SellerHubView } from './SellerHubView';

interface StartPortalProps {
  settings?: BusinessSettings;
  paymentSettings?: AdminPaymentSettings;
  products?: Product[];
  approvedSellerIds?: string[];
  sellerPaymentProfiles?: Record<string, SellerPublicPaymentProfile>;
  highlightSeatUsage?: Record<string, number>;
  sellerFollows?: SellerFollowRecord[];
  productReviews?: ProductReview[];
  loggedInCustomer?: Client | null;
  customerOrders?: CustomerOrder[];
  customerBills?: Invoice[];
  onCustomerLogin?: (client: Client) => void;
  onCustomerLogout?: () => void;
  onCustomerUpdated?: (client: Client) => void;
  onSaveProduct?: (
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string,
    expectedSellerId?: string
  ) => Promise<void>;
  onDeleteProduct?: (id: string, expectedSellerId?: string) => Promise<void>;
  onToggleFollowSeller?: (
    sellerId: string,
    client: Client
  ) => Promise<{ following: boolean; followersCount: number }>;
  onSubmitProductReview?: (payload: {
    productId: string;
    sellerId?: string;
    client: Client;
    rating: number;
    comment: string;
    mediaUrl?: string;
    mediaType?: MediaResourceType;
    mediaRecord?: CloudinaryMediaRecord;
  }) => Promise<ProductReview>;
}

interface PublicShopProduct {
  id: string;
  catalogProductId?: string;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  highlighted?: boolean;
  highlightPlacement?: Product['highlightPlacement'];
  size?: string;
  color?: string;
  stockQty?: number;
  imageDataUrl?: string;
  imageDataUrls: string[];
  videoUrl?: string;
  description?: string;
  sellerId?: string;
  sellerName?: string;
  sellerPaymentUpiId?: string;
  sellerPaymentBankAccountName?: string;
  sellerPaymentBankName?: string;
  sellerPaymentBankAccountNo?: string;
  sellerPaymentBankIfscBranch?: string;
  sellerPaymentQrDataUrl?: string;
}

type PendingAuthAction =
  | { type: 'cart'; product: PublicShopProduct; qty: number }
  | { type: 'order'; product: PublicShopProduct; qty: number }
  | { type: 'account'; tab: CustomerDashboardTab }
  | { type: 'portal'; view: 'seller-hub' | 'help-center' | 'refer-earn' }
  | { type: 'follow'; sellerId: string }
  | {
      type: 'review';
      product: PublicShopProduct;
      rating: number;
      comment: string;
      mediaUrl?: string;
      mediaType?: MediaResourceType;
      mediaRecord?: CloudinaryMediaRecord;
    }
  | null;

const FAVORITES_STORAGE_KEY = 'gg_customer_favorites_v1';

function isSafeHttpUrl(url?: string): boolean {
  const trimmed = (url || '').trim();
  return /^https?:\/\//i.test(trimmed);
}

function readStoredFavoriteIds(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export const StartPortal: React.FC<StartPortalProps> = ({
  settings,
  paymentSettings,
  products = [],
  approvedSellerIds = [],
  sellerPaymentProfiles = {},
  highlightSeatUsage = {},
  sellerFollows = [],
  productReviews = [],
  loggedInCustomer = null,
  customerOrders = [],
  customerBills = [],
  onCustomerLogin,
  onCustomerLogout,
  onCustomerUpdated,
  onSaveProduct,
  onDeleteProduct,
  onToggleFollowSeller,
  onSubmitProductReview,
}) => {
  // Active View inside Storefront ('shop' | 'account' | 'seller-hub' | 'help-center' | 'refer-earn' | 'seller-profile' | 'favorites')
  const [portalView, setPortalView] = useState<
    | 'shop'
    | 'account'
    | 'seller-hub'
    | 'help-center'
    | 'refer-earn'
    | 'seller-profile'
    | 'favorites'
  >('shop');
  const [viewingSellerId, setViewingSellerId] = useState<string | null>(null);
  const [accountTab, setAccountTab] = useState<CustomerDashboardTab>('cart');
  const [menuSheetOpen, setMenuSheetOpen] = useState(false);
  const [categoriesSheetOpen, setCategoriesSheetOpen] = useState(false);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [genderSheetOpen, setGenderSheetOpen] = useState(false);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const categoriesSectionRef = useRef<HTMLDivElement | null>(null);
  const [favoriteProductIds, setFavoriteProductIds] = useState<string[]>(
    readStoredFavoriteIds
  );

  // Follow & Product Review UI state
  const [followBusySellerId, setFollowBusySellerId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewMediaUrl, setReviewMediaUrl] = useState('');
  const [reviewMediaType, setReviewMediaType] = useState<MediaResourceType | undefined>(
    undefined
  );
  const [reviewMediaRecord, setReviewMediaRecord] = useState<
    CloudinaryMediaRecord | undefined
  >(undefined);
  const [uploadingReviewMedia, setUploadingReviewMedia] = useState(false);
  const [reviewMediaProgress, setReviewMediaProgress] = useState<number | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Customer Auth Modal & pending action after login
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAuthAction>(null);
  const [pendingOnboardingUser, setPendingOnboardingUser] =
    useState<GoogleOnboardingSeed | null>(null);

  // Store Toast
  const [storeNotice, setStoreNotice] = useState('');

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuSheetOpen(false);
        setCategoriesSheetOpen(false);
        setSortSheetOpen(false);
        setGenderSheetOpen(false);
        setFiltersSheetOpen(false);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  // Sync favorites from signed-in customer profile (merging any locally saved favorites)
  useEffect(() => {
    if (!loggedInCustomer) return;
    const remoteFavs = Array.isArray(loggedInCustomer.favoriteProductIds)
      ? loggedInCustomer.favoriteProductIds.filter(Boolean)
      : [];
    const localFavs = readStoredFavoriteIds();
    const merged = Array.from(new Set([...remoteFavs, ...localFavs]));
    setFavoriteProductIds(merged);
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // ignore storage errors
    }
    if (merged.length > remoteFavs.length) {
      void api
        .updateCustomerFavorites(loggedInCustomer.id, merged)
        .then((updated) => onCustomerUpdated?.(updated))
        .catch(() => undefined);
    }
  }, [loggedInCustomer?.id]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const refCode = (params.get('ref') || '').trim();
      if (refCode) {
        localStorage.setItem('gg_referred_by_v1', refCode);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // View Panel section filter ('all' | 'discount' | 'shopping')
  const [sectionTab, setSectionTab] = useState<'all' | 'discount' | 'shopping'>(
    'all'
  );
  const [shoppingCategory, setShoppingCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<
    'featured' | 'price_asc' | 'price_desc' | 'discount_desc' | 'rating_desc'
  >('featured');
  const [genderFilter, setGenderFilter] = useState<
    'ALL' | 'women' | 'men' | 'unisex'
  >('ALL');
  const [priceRangeFilter, setPriceRangeFilter] = useState<
    'ALL' | 'under_299' | '300_599' | '600_999' | '1000_plus'
  >('ALL');
  const [minDiscountFilter, setMinDiscountFilter] = useState<number>(0);
  const [minRatingFilter, setMinRatingFilter] = useState<number>(0);
  const [inStockOnlyFilter, setInStockOnlyFilter] = useState<boolean>(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [failedAdImage, setFailedAdImage] = useState(false);

  // Product Detail & Direct Order Modal
  const [selectedProduct, setSelectedProduct] =
    useState<PublicShopProduct | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [modalStep, setModalStep] = useState<'detail' | 'checkout' | 'success'>(
    'detail'
  );
  const [orderQty, setOrderQty] = useState('1');
  const [addingToCart, setAddingToCart] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerState, setCustomerState] = useState('');
  const [customerPinCode, setCustomerPinCode] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<CustomerOrderPaymentMethod>('COD');
  const [upiScreenshotDataUrl, setUpiScreenshotDataUrl] = useState('');
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [uploadingScreenshotProgress, setUploadingScreenshotProgress] = useState<
    number | null
  >(null);
  const [upiCopied, setUpiCopied] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [placedOrder, setPlacedOrder] = useState<CustomerOrder | null>(null);

  const sym = settings?.currencySymbol || '₹';

  const triggerStoreNotice = (msg: string) => {
    setStoreNotice(msg);
    setTimeout(() => {
      setStoreNotice((prev) => (prev === msg ? '' : prev));
    }, 2800);
  };

  const viewPanel: ViewPanelConfig = useMemo(() => {
    const vp = settings?.viewPanel;
    return {
      advertisement: {
        ...DEFAULT_VIEW_PANEL_CONFIG.advertisement,
        ...(vp?.advertisement || {}),
      },
      discount: {
        ...DEFAULT_VIEW_PANEL_CONFIG.discount,
        ...(vp?.discount || {}),
        offers: Array.isArray(vp?.discount?.offers) ? vp.discount.offers : [],
      },
      shopping: {
        ...DEFAULT_VIEW_PANEL_CONFIG.shopping,
        ...(vp?.shopping || {}),
        items: Array.isArray(vp?.shopping?.items) ? vp.shopping.items : [],
      },
      updatedAt: vp?.updatedAt || '',
    };
  }, [settings?.viewPanel]);

  const showAdvertisement =
    viewPanel.advertisement.enabled &&
    Boolean(
      ((viewPanel.advertisement.videoUrl || viewPanel.advertisement.imageDataUrl) &&
        !failedAdImage) ||
        viewPanel.advertisement.title.trim()
    );

  const approvedSellerIdsSet = useMemo(
    () => new Set(approvedSellerIds),
    [approvedSellerIds]
  );

  const placementRule = settings?.highlightConfig?.placementRule || 'top_featured';

  const shoppingItems: PublicShopProduct[] = useMemo(() => {
    const customItems: PublicShopProduct[] = viewPanel.shopping.items.map(
      (item) => {
        const gallery =
          Array.isArray(item.imageDataUrls) && item.imageDataUrls.length > 0
            ? item.imageDataUrls.filter(Boolean)
            : item.imageDataUrl
              ? [item.imageDataUrl]
              : [];
        return {
          id: item.id,
          name: item.name,
          category: item.category || PRODUCT_CATEGORIES[0],
          price: item.price,
          originalPrice: item.originalPrice,
          highlighted: Boolean(item.highlighted),
          highlightPlacement: item.highlightPlacement,
          size: item.size,
          color: item.color,
          imageDataUrl: gallery[0] || '',
          imageDataUrls: gallery,
          videoUrl: item.videoUrl,
          description: item.description,
          sellerId: item.sellerId,
          sellerName: item.sellerName,
          sellerPaymentUpiId: item.sellerPaymentUpiId,
          sellerPaymentBankAccountName: item.sellerPaymentBankAccountName,
          sellerPaymentBankName: item.sellerPaymentBankName,
          sellerPaymentBankAccountNo: item.sellerPaymentBankAccountNo,
          sellerPaymentBankIfscBranch: item.sellerPaymentBankIfscBranch,
          sellerPaymentQrDataUrl: item.sellerPaymentQrDataUrl,
        };
      }
    );

    const eligibleCatalogProducts = products.filter((prod) => {
      if (!prod.sellerId) return true;
      return (
        prod.sellerApprovalStatus === 'approved' &&
        approvedSellerIdsSet.has(prod.sellerId)
      );
    });

    const catalogItems: PublicShopProduct[] = viewPanel.shopping.includeCatalogProducts
      ? eligibleCatalogProducts.map((prod) => {
          const gallery =
            Array.isArray(prod.imageDataUrls) && prod.imageDataUrls.length > 0
              ? prod.imageDataUrls.filter(Boolean)
              : prod.imageDataUrl
                ? [prod.imageDataUrl]
                : [];
          return {
            id: `cat-${prod.id}`,
            catalogProductId: prod.id,
            name: prod.name,
            category: prod.category || PRODUCT_CATEGORIES[0],
            price: prod.sellingPrice,
            originalPrice: prod.originalPrice,
            highlighted: isProductHighlightActive(prod),
            highlightPlacement: prod.highlightPlacement,
            size: prod.size,
            color: prod.color,
            stockQty: prod.stockQty,
            imageDataUrl: gallery[0] || '',
            imageDataUrls: gallery,
            videoUrl: prod.videoUrl,
            description: prod.description,
            sellerId: prod.sellerId,
            sellerName: prod.sellerName,
            sellerPaymentUpiId: prod.sellerPaymentUpiId,
            sellerPaymentBankAccountName: prod.sellerPaymentBankAccountName,
            sellerPaymentBankName: prod.sellerPaymentBankName,
            sellerPaymentBankAccountNo: prod.sellerPaymentBankAccountNo,
            sellerPaymentBankIfscBranch: prod.sellerPaymentBankIfscBranch,
            sellerPaymentQrDataUrl: prod.sellerPaymentQrDataUrl,
          };
        })
      : [];

    const combined = [...catalogItems, ...customItems];
    if (placementRule === 'top_featured') {
      return combined.sort(
        (a, b) => Number(Boolean(b.highlighted)) - Number(Boolean(a.highlighted))
      );
    }
    return combined;
  }, [
    viewPanel.shopping.items,
    viewPanel.shopping.includeCatalogProducts,
    products,
    approvedSellerIdsSet,
    placementRule,
  ]);

  const reviewsByProductId = useMemo(() => {
    const map = new Map<string, ProductReview[]>();
    for (const rev of productReviews) {
      if (!rev.productId) continue;
      const list = map.get(rev.productId) || [];
      list.push(rev);
      map.set(rev.productId, list);
    }
    return map;
  }, [productReviews]);

  const ratingSummaryByProductId = useMemo(() => {
    const map = new Map<string, { avg: number; count: number }>();
    for (const [pid, list] of reviewsByProductId.entries()) {
      if (list.length === 0) continue;
      const total = list.reduce((s, r) => s + (Number(r.rating) || 0), 0);
      map.set(pid, {
        avg: Number((total / list.length).toFixed(1)),
        count: list.length,
      });
    }
    return map;
  }, [reviewsByProductId]);

  const activeFiltersCount =
    (priceRangeFilter !== 'ALL' ? 1 : 0) +
    (minDiscountFilter > 0 ? 1 : 0) +
    (minRatingFilter > 0 ? 1 : 0) +
    (inStockOnlyFilter ? 1 : 0);

  const resetAllShoppingFilters = () => {
    setSearchQuery('');
    setShoppingCategory('ALL');
    setSortBy('featured');
    setGenderFilter('ALL');
    setPriceRangeFilter('ALL');
    setMinDiscountFilter(0);
    setMinRatingFilter(0);
    setInStockOnlyFilter(false);
  };

  const filteredShoppingItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list =
      shoppingCategory === 'ALL'
        ? shoppingItems
        : shoppingItems.filter((item) => item.category === shoppingCategory);

    if (q) {
      const cleanQ = q.replace(/^#/, '');
      list = list.filter((item) => {
        const rawId = item.id.toLowerCase();
        const catalogId = (item.catalogProductId || '').toLowerCase();
        const strippedId = rawId.replace(/^cat-/, '');
        return (
          rawId.includes(cleanQ) ||
          catalogId.includes(cleanQ) ||
          strippedId.includes(cleanQ) ||
          item.name.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          (item.size || '').toLowerCase().includes(q) ||
          (item.color || '').toLowerCase().includes(q) ||
          (item.description || '').toLowerCase().includes(q) ||
          (item.sellerName || '').toLowerCase().includes(q)
        );
      });
    }

    if (genderFilter !== 'ALL') {
      list = list.filter((item) => {
        const haystack = `${item.category} ${item.name} ${item.description || ''}`.toLowerCase();
        const isMenExplicit = /\b(men|mens|men's|gents|boy|boys|shirt|trouser|beard)\b/.test(
          haystack
        ) && !/\b(women|women's|womens|ladies|girl|girls)\b/.test(haystack);
        const isWomenCategory =
          item.category === "Women's Clothing" ||
          item.category === 'Fashion & Jewellery' ||
          item.category === 'Cosmetics & Makeup' ||
          item.category === 'Innerwear & Essentials' ||
          /\b(women|womens|women's|girl|girls|ladies|saree|kurti|lehenga|blouse|bra|panty|lingerie|bangle|earring|necklace|bridal|lipstick|makeup|handbag|purse)\b/.test(
            haystack
          );
        const isUnisex =
          item.category === 'Perfumes & Fragrances' ||
          item.category === 'Watches & Accessories' ||
          item.category === 'Bags & Handbags' ||
          item.category === 'Gift Hampers & Combos' ||
          item.category === 'Home & Living' ||
          /\b(unisex|watch|perfume|fragrance|sunglass|gift|combo|essential)\b/.test(
            haystack
          );

        if (genderFilter === 'women') return isWomenCategory || (isUnisex && !isMenExplicit);
        if (genderFilter === 'men') return isMenExplicit || (isUnisex && !isWomenCategory);
        return isUnisex || (!isMenExplicit && !isWomenCategory);
      });
    }

    if (priceRangeFilter !== 'ALL') {
      list = list.filter((item) => {
        if (priceRangeFilter === 'under_299') return item.price <= 299;
        if (priceRangeFilter === '300_599') return item.price >= 300 && item.price <= 599;
        if (priceRangeFilter === '600_999') return item.price >= 600 && item.price <= 999;
        return item.price >= 1000;
      });
    }

    if (minDiscountFilter > 0) {
      list = list.filter((item) => {
        if (!item.originalPrice || item.originalPrice <= item.price) return false;
        const pct = Math.round(
          ((item.originalPrice - item.price) / item.originalPrice) * 100
        );
        return pct >= minDiscountFilter;
      });
    }

    if (minRatingFilter > 0) {
      list = list.filter((item) => {
        const canonicalId = item.catalogProductId || item.id;
        const summary = ratingSummaryByProductId.get(canonicalId);
        return Boolean(summary && summary.avg >= minRatingFilter);
      });
    }

    if (inStockOnlyFilter) {
      list = list.filter((item) => item.stockQty === undefined || item.stockQty > 0);
    }

    if (sortBy === 'price_asc') {
      return [...list].sort((a, b) => a.price - b.price);
    }
    if (sortBy === 'price_desc') {
      return [...list].sort((a, b) => b.price - a.price);
    }
    if (sortBy === 'discount_desc') {
      const getDisc = (it: PublicShopProduct) =>
        it.originalPrice && it.originalPrice > it.price
          ? ((it.originalPrice - it.price) / it.originalPrice) * 100
          : 0;
      return [...list].sort((a, b) => getDisc(b) - getDisc(a));
    }
    if (sortBy === 'rating_desc') {
      const getRating = (it: PublicShopProduct) => {
        const summary = ratingSummaryByProductId.get(it.catalogProductId || it.id);
        return summary ? summary.avg : 0;
      };
      return [...list].sort((a, b) => getRating(b) - getRating(a));
    }

    if (shoppingCategory !== 'ALL' && placementRule === 'priority_category') {
      return [...list].sort(
        (a, b) => Number(Boolean(b.highlighted)) - Number(Boolean(a.highlighted))
      );
    }
    return list;
  }, [
    shoppingItems,
    shoppingCategory,
    searchQuery,
    genderFilter,
    priceRangeFilter,
    minDiscountFilter,
    minRatingFilter,
    inStockOnlyFilter,
    sortBy,
    ratingSummaryByProductId,
    placementRule,
  ]);

  const hasDiscountContent =
    viewPanel.discount.enabled &&
    (viewPanel.discount.offers.length > 0 ||
      Boolean(viewPanel.discount.headline.trim()));

  const hasShoppingContent = viewPanel.shopping.enabled;

  const cartItemCount = useMemo(() => {
    if (!loggedInCustomer || !Array.isArray(loggedInCustomer.cart)) return 0;
    return loggedInCustomer.cart.reduce(
      (sum, item) => sum + Math.max(1, Number(item.quantity) || 1),
      0
    );
  }, [loggedInCustomer]);

  const favoriteIdsSet = useMemo(
    () => new Set(favoriteProductIds),
    [favoriteProductIds]
  );

  const isProductFavorited = (item: PublicShopProduct): boolean => {
    const canonical = item.catalogProductId || item.id;
    return favoriteIdsSet.has(canonical) || favoriteIdsSet.has(item.id);
  };

  const favoriteItems = useMemo(
    () =>
      shoppingItems.filter((item) => {
        const canonical = item.catalogProductId || item.id;
        return favoriteIdsSet.has(canonical) || favoriteIdsSet.has(item.id);
      }),
    [shoppingItems, favoriteIdsSet]
  );

  const toggleFavoriteProduct = async (
    item: PublicShopProduct,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    const canonical = item.catalogProductId || item.id;
    const currentlyFav =
      favoriteIdsSet.has(canonical) || favoriteIdsSet.has(item.id);
    const nextIds = currentlyFav
      ? favoriteProductIds.filter((id) => id !== canonical && id !== item.id)
      : [canonical, ...favoriteProductIds.filter((id) => id !== canonical && id !== item.id)];

    setFavoriteProductIds(nextIds);
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(nextIds));
    } catch {
      // ignore storage errors
    }

    triggerStoreNotice(
      currentlyFav
        ? `Removed "${item.name}" from Favorites.`
        : `Saved "${item.name}" to Favorites!`
    );

    if (loggedInCustomer) {
      try {
        const updated = await api.updateCustomerFavorites(
          loggedInCustomer.id,
          nextIds
        );
        onCustomerUpdated?.(updated);
      } catch {
        // local state already updated
      }
    }
  };

  const followerCountsBySeller = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [sid, prof] of Object.entries(sellerPaymentProfiles)) {
      counts[sid] = Math.max(0, Number(prof?.followersCount) || 0);
    }
    const followDocsCount: Record<string, number> = {};
    for (const f of sellerFollows) {
      if (f.sellerId) {
        followDocsCount[f.sellerId] = (followDocsCount[f.sellerId] || 0) + 1;
      }
    }
    for (const [sid, cnt] of Object.entries(followDocsCount)) {
      counts[sid] = Math.max(counts[sid] || 0, cnt);
    }
    return counts;
  }, [sellerPaymentProfiles, sellerFollows]);

  const followedSellerIdsSet = useMemo(() => {
    if (!loggedInCustomer) return new Set<string>();
    return new Set(
      sellerFollows
        .filter((f) => f.clientId === loggedInCustomer.id)
        .map((f) => f.sellerId)
    );
  }, [sellerFollows, loggedInCustomer]);

  const viewingSellerProfile = viewingSellerId
    ? sellerPaymentProfiles[viewingSellerId]
    : undefined;

  const viewingSellerProducts = useMemo(() => {
    if (!viewingSellerId) return [];
    return shoppingItems.filter((item) => item.sellerId === viewingSellerId);
  }, [shoppingItems, viewingSellerId]);

  type CustomerPortalView =
    | 'shop'
    | 'account'
    | 'seller-hub'
    | 'help-center'
    | 'refer-earn'
    | 'seller-profile'
    | 'favorites';
  type CustomerSheetType = 'menu' | 'categories' | 'sort' | 'gender' | 'filters' | null;

  interface CustomerHistorySnapshot {
    ggType: 'customer-state';
    portalView: CustomerPortalView;
    viewingSellerId: string | null;
    accountTab: CustomerDashboardTab;
    selectedProductId: string | null;
    modalStep: 'detail' | 'checkout' | 'success';
    authModalOpen: boolean;
    activeSheet: CustomerSheetType;
  }

  const activeSheet: CustomerSheetType = menuSheetOpen
    ? 'menu'
    : categoriesSheetOpen
      ? 'categories'
      : sortSheetOpen
        ? 'sort'
        : genderSheetOpen
          ? 'gender'
          : filtersSheetOpen
            ? 'filters'
            : null;

  const buildCustomerSig = (s: CustomerHistorySnapshot) =>
    `${s.portalView}|${s.viewingSellerId || ''}|${s.portalView === 'account' ? s.accountTab : ''}|${s.selectedProductId || ''}|${s.selectedProductId ? s.modalStep : ''}|${s.authModalOpen ? 'auth' : ''}|${s.activeSheet || ''}`;

  const currentCustomerSnapshot: CustomerHistorySnapshot = useMemo(
    () => ({
      ggType: 'customer-state',
      portalView,
      viewingSellerId,
      accountTab,
      selectedProductId: selectedProduct?.id || null,
      modalStep: selectedProduct ? modalStep : 'detail',
      authModalOpen,
      activeSheet,
    }),
    [
      portalView,
      viewingSellerId,
      accountTab,
      selectedProduct?.id,
      modalStep,
      authModalOpen,
      activeSheet,
    ]
  );

  const shoppingItemsRef = useRef(shoppingItems);
  shoppingItemsRef.current = shoppingItems;
  const prevCustomerSnapRef = useRef<CustomerHistorySnapshot>(currentCustomerSnapshot);
  const customerDepthRef = useRef(0);
  const skipCustomerPushRef = useRef(false);
  const customerInitializedRef = useRef(false);

  // Stamp initial customer-state & synchronize sub-views/modals/sheets with browser history
  useEffect(() => {
    const currUrl = window.location.pathname + window.location.search + window.location.hash;
    if (!customerInitializedRef.current) {
      customerInitializedRef.current = true;
      prevCustomerSnapRef.current = currentCustomerSnapshot;
      try {
        const existing = window.history.state as { ggType?: string } | null;
        if (
          existing?.ggType !== 'customer-state' &&
          existing?.ggType !== 'seller-sub' &&
          existing?.ggType !== 'products-sub'
        ) {
          window.history.replaceState(currentCustomerSnapshot, '', currUrl);
        }
      } catch {
        // ignore history errors
      }
      return;
    }

    if (skipCustomerPushRef.current) {
      skipCustomerPushRef.current = false;
      prevCustomerSnapRef.current = currentCustomerSnapshot;
      return;
    }

    const prev = prevCustomerSnapRef.current;
    const prevSig = buildCustomerSig(prev);
    const nextSig = buildCustomerSig(currentCustomerSnapshot);
    if (prevSig === nextSig) return;

    const replacingSheet =
      prev.activeSheet !== null &&
      currentCustomerSnapshot.activeSheet === null &&
      (prev.portalView !== currentCustomerSnapshot.portalView ||
        prev.selectedProductId !== currentCustomerSnapshot.selectedProductId ||
        prev.authModalOpen !== currentCustomerSnapshot.authModalOpen);
    const replacingOrderSuccess =
      prev.selectedProductId === currentCustomerSnapshot.selectedProductId &&
      prev.modalStep === 'checkout' &&
      currentCustomerSnapshot.modalStep === 'success';
    const replacingAuthTransition =
      prev.authModalOpen &&
      !currentCustomerSnapshot.authModalOpen &&
      (prev.portalView !== currentCustomerSnapshot.portalView ||
        prev.modalStep !== currentCustomerSnapshot.modalStep ||
        prev.selectedProductId !== currentCustomerSnapshot.selectedProductId);

    try {
      if (replacingSheet || replacingOrderSuccess || replacingAuthTransition) {
        window.history.replaceState(currentCustomerSnapshot, '', currUrl);
      } else {
        window.history.pushState(currentCustomerSnapshot, '', currUrl);
        customerDepthRef.current += 1;
      }
    } catch {
      // ignore history errors
    }

    prevCustomerSnapRef.current = currentCustomerSnapshot;
  }, [currentCustomerSnapshot]);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as
        | (Omit<CustomerHistorySnapshot, 'ggType'> & { ggType?: string })
        | null;
      if (state?.ggType === 'products-sub' || state?.ggType === 'seller-sub') {
        return;
      }

      if (state?.ggType === 'customer-state') {
        const customerState: CustomerHistorySnapshot = {
          ...state,
          ggType: 'customer-state',
        };
        const incomingSig = buildCustomerSig(customerState);
        if (incomingSig === buildCustomerSig(prevCustomerSnapRef.current)) {
          // Child overlay (SellerHubView or ProductsView) popped back onto this customer-state level
          return;
        }
        customerDepthRef.current = Math.max(0, customerDepthRef.current - 1);
        skipCustomerPushRef.current = true;
        prevCustomerSnapRef.current = customerState;

        setPortalView(customerState.portalView || 'shop');
        setViewingSellerId(customerState.viewingSellerId ?? null);
        if (customerState.accountTab) setAccountTab(customerState.accountTab);
        setAuthModalOpen(Boolean(customerState.authModalOpen));
        setMenuSheetOpen(customerState.activeSheet === 'menu');
        setCategoriesSheetOpen(customerState.activeSheet === 'categories');
        setSortSheetOpen(customerState.activeSheet === 'sort');
        setGenderSheetOpen(customerState.activeSheet === 'gender');
        setFiltersSheetOpen(customerState.activeSheet === 'filters');

        if (customerState.selectedProductId) {
          const found =
            shoppingItemsRef.current.find((i) => i.id === customerState.selectedProductId) || null;
          setSelectedProduct(found);
          setModalStep(customerState.modalStep || 'detail');
          setOrderError('');
        } else {
          setSelectedProduct(null);
          setPlacedOrder(null);
          setOrderError('');
        }
        return;
      }

      const rootSig = 'shop||||||';
      if (buildCustomerSig(prevCustomerSnapRef.current) !== rootSig) {
        customerDepthRef.current = 0;
        const rootSnap: CustomerHistorySnapshot = {
          ggType: 'customer-state',
          portalView: 'shop',
          viewingSellerId: null,
          accountTab: 'cart',
          selectedProductId: null,
          modalStep: 'detail',
          authModalOpen: false,
          activeSheet: null,
        };
        skipCustomerPushRef.current = true;
        prevCustomerSnapRef.current = rootSnap;
        setPortalView('shop');
        setViewingSellerId(null);
        setSelectedProduct(null);
        setPlacedOrder(null);
        setOrderError('');
        setAuthModalOpen(false);
        setMenuSheetOpen(false);
        setCategoriesSheetOpen(false);
        setSortSheetOpen(false);
        setGenderSheetOpen(false);
        setFiltersSheetOpen(false);
        try {
          window.history.replaceState(
            rootSnap,
            '',
            window.location.pathname + window.location.search + window.location.hash
          );
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const popCustomerOverlayOrReset = (
    matchCondition: boolean,
    fallback: () => void
  ) => {
    if (matchCondition && customerDepthRef.current > 0) {
      window.history.back();
      return;
    }
    fallback();
  };

  const handleCopyCode = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeId(id);
      setTimeout(() => {
        setCopiedCodeId((curr) => (curr === id ? null : curr));
      }, 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyUpi = async (upiValue: string) => {
    if (!upiValue) return;
    try {
      await navigator.clipboard.writeText(upiValue);
      setUpiCopied(true);
      setTimeout(() => setUpiCopied(false), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  // --- Customer Cart & Order Helpers (Auth-Gated) ---
  const addItemToClientCart = async (
    client: Client,
    product: PublicShopProduct,
    qtyToAdd: number
  ) => {
    setAddingToCart(true);
    try {
      const existingCart: CustomerCartItem[] = Array.isArray(client.cart)
        ? [...client.cart]
        : [];
      const idx = existingCart.findIndex(
        (c) =>
          c.id === product.id ||
          (product.catalogProductId &&
            c.productId === product.catalogProductId)
      );
      if (idx >= 0) {
        existingCart[idx] = {
          ...existingCart[idx],
          quantity: Math.max(1, existingCart[idx].quantity + qtyToAdd),
        };
      } else {
        existingCart.push({
          id: product.id,
          productId: product.catalogProductId,
          name: product.name,
          category: product.category,
          size: product.size,
          color: product.color,
          price: product.price,
          originalPrice: product.originalPrice,
          quantity: Math.max(1, qtyToAdd),
          imageDataUrl: product.imageDataUrls[0] || product.imageDataUrl || '',
          sellerId: product.sellerId,
          sellerName: product.sellerName,
        });
      }

      const updated = await api.updateCustomerCart(client.id, existingCart);
      onCustomerUpdated?.(updated);
      triggerStoreNotice(`Added "${product.name}" to your cart.`);
    } catch (err) {
      setOrderError(formatApiError(err, 'Could not add item to cart.'));
    } finally {
      setAddingToCart(false);
    }
  };

  const prefillCheckoutFromClient = (client: Client) => {
    setCustomerName(client.name || '');
    setCustomerPhone(stripPlus91Prefix(client.mobile));
    setCustomerWhatsapp(stripPlus91Prefix(client.whatsapp || client.mobile));
    setCustomerAddress(client.address || '');
    setCustomerCity(client.city || '');
    setCustomerState(client.state || '');
    setCustomerPinCode(client.pinCode || '');
    setOrderError('');
    setPaymentMethod('COD');
    setUpiScreenshotDataUrl('');
  };

  const openAuthForAction = (
    action: PendingAuthAction,
    notice: string,
    _mode?: 'login' | 'register'
  ) => {
    setPendingOnboardingUser(null);
    setPendingAction(action);
    setAuthNotice(notice);
    setAuthModalOpen(true);
  };

  const handleCustomerAuthSuccess = async (client: Client) => {
    setAuthModalOpen(false);
    setAuthNotice('');
    setPendingOnboardingUser(null);
    onCustomerLogin?.(client);

    const action = pendingAction;
    setPendingAction(null);

    if (!action) {
      triggerStoreNotice(`Signed in as ${client.name}`);
      return;
    }

    if (action.type === 'account') {
      setAccountTab(action.tab);
      setPortalView('account');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (action.type === 'portal') {
      setPortalView(action.view);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (action.type === 'cart') {
      await addItemToClientCart(client, action.product, action.qty);
      return;
    }

    if (action.type === 'order') {
      setSelectedProduct(action.product);
      setActiveImageIndex(0);
      setOrderQty(String(action.qty));
      setPlacedOrder(null);
      prefillCheckoutFromClient(client);
      setModalStep('checkout');
      return;
    }

    if (action.type === 'follow') {
      await runFollowSeller(action.sellerId, client);
      return;
    }

    if (action.type === 'review') {
      setSelectedProduct(action.product);
      setActiveImageIndex(0);
      setModalStep('detail');
      await runSubmitReview(
        action.product,
        client,
        action.rating,
        action.comment,
        action.mediaUrl,
        action.mediaType,
        action.mediaRecord
      );
    }
  };

  const runFollowSeller = async (sellerId: string, client: Client) => {
    if (!sellerId) return;
    setFollowBusySellerId(sellerId);
    try {
      const res = onToggleFollowSeller
        ? await onToggleFollowSeller(sellerId, client)
        : await api.toggleSellerFollow({
            sellerId,
            clientId: client.id,
            customerName: client.name,
          });
      triggerStoreNotice(
        res.following ? 'Following seller store!' : 'Unfollowed seller store.'
      );
    } catch (err) {
      triggerStoreNotice(
        formatApiError(err, 'Could not update follow status. Please try again.')
      );
    } finally {
      setFollowBusySellerId(null);
    }
  };

  const handleToggleFollowAction = async (
    sellerId?: string,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    if (!sellerId) return;
    if (!loggedInCustomer) {
      openAuthForAction(
        { type: 'follow', sellerId },
        'Please sign in or create an account to follow this seller.'
      );
      return;
    }
    await runFollowSeller(sellerId, loggedInCustomer);
  };

  const openSellerProfile = (sellerId?: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!sellerId) return;
    setSelectedProduct(null);
    setViewingSellerId(sellerId);
    setPortalView('seller-profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const runSubmitReview = async (
    product: PublicShopProduct,
    client: Client,
    ratingVal: number,
    commentText: string,
    mediaUrl?: string,
    mediaType?: MediaResourceType,
    mediaRecord?: CloudinaryMediaRecord
  ) => {
    const canonicalProductId = product.catalogProductId || product.id;
    setReviewError('');
    setReviewSubmitting(true);
    try {
      if (onSubmitProductReview) {
        await onSubmitProductReview({
          productId: canonicalProductId,
          sellerId: product.sellerId,
          client,
          rating: ratingVal,
          comment: commentText,
          mediaUrl,
          mediaType,
          mediaRecord,
        });
      } else {
        await api.submitProductReview({
          productId: canonicalProductId,
          sellerId: product.sellerId,
          clientId: client.id,
          customerName: client.name,
          rating: ratingVal,
          comment: commentText,
          mediaUrl,
          mediaType,
          mediaRecord,
        });
      }
      setReviewComment('');
      setReviewRating(5);
      setReviewMediaUrl('');
      setReviewMediaType(undefined);
      setReviewMediaRecord(undefined);
      triggerStoreNotice('Your rating and review have been posted!');
    } catch (err) {
      setReviewError(
        formatApiError(err, 'Could not submit review. Please try again.')
      );
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleUploadReviewMedia = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedProduct) return;
    setReviewError('');
    setUploadingReviewMedia(true);
    setReviewMediaProgress(1);
    try {
      const record = await uploadMediaToCloudinary(file, {
        role: 'customer',
        appSource: 'glamour-galleria',
        folder: 'glamour-galleria/customer/reviews',
        relatedEntityType: 'review',
        relatedEntityId: selectedProduct.catalogProductId || selectedProduct.id,
        uploadedByUid: loggedInCustomer?.id,
        allowedTypes: ['image', 'video'],
        onProgress: (pct) => setReviewMediaProgress(pct),
      });
      setReviewMediaUrl(record.secureUrl);
      setReviewMediaType(record.resourceType);
      setReviewMediaRecord(record);
    } catch (err) {
      setReviewError(
        err instanceof Error
          ? err.message
          : 'Failed to upload review photo/video to Cloudinary.'
      );
    } finally {
      setUploadingReviewMedia(false);
      setReviewMediaProgress(null);
    }
  };

  const handleSubmitReviewForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setReviewError('');
    const cleanComment = reviewComment.trim();
    if (cleanComment.length < 2) {
      setReviewError('Please write a review comment (minimum 2 characters).');
      return;
    }
    if (!loggedInCustomer) {
      openAuthForAction(
        {
          type: 'review',
          product: selectedProduct,
          rating: reviewRating,
          comment: cleanComment,
          mediaUrl: reviewMediaUrl || undefined,
          mediaType: reviewMediaType,
          mediaRecord: reviewMediaRecord,
        },
        'Please sign in or create an account to post your rating and review.'
      );
      return;
    }
    await runSubmitReview(
      selectedProduct,
      loggedInCustomer,
      reviewRating,
      cleanComment,
      reviewMediaUrl || undefined,
      reviewMediaType,
      reviewMediaRecord
    );
  };

  const handleOpenAccount = (tab: CustomerDashboardTab = 'cart') => {
    if (!loggedInCustomer) {
      openAuthForAction(
        { type: 'account', tab },
        'Sign in or create an account to view your cart, orders, and bills.'
      );
      return;
    }
    setAccountTab(tab);
    setPortalView('account');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Recover mobile browser Google Sign-In redirect result automatically (routing seller intent to Seller Hub)
  useEffect(() => {
    let active = true;
    const intent = (() => {
      try {
        return sessionStorage.getItem('gg_google_auth_intent');
      } catch {
        return null;
      }
    })();
    if (intent === 'seller') {
      setPortalView('seller-hub');
      return () => {
        active = false;
      };
    }

    getRedirectResult(auth)
      .then(async (result) => {
        try {
          sessionStorage.removeItem('gg_google_auth_intent');
        } catch {
          // ignore storage errors
        }
        if (!active || !result?.user) return;
        const user = result.user;
        const resolved = await api.resolveGoogleCustomerAccount({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        });
        if (!active) return;
        if (!resolved.needsOnboarding && resolved.client) {
          onCustomerLogin?.(resolved.client);
          triggerStoreNotice(`Signed in as ${resolved.client.name}`);
          return;
        }
        setPendingOnboardingUser({
          uid: user.uid,
          email: String(user.email || '').trim().toLowerCase(),
          displayName: String(resolved.client?.name || user.displayName || ''),
          photoURL: resolved.client?.profilePhotoDataUrl || user.photoURL || '',
          existingMobile: resolved.client?.mobile,
        });
        setAuthNotice('Complete your 10-second profile setup to continue.');
        setAuthModalOpen(true);
      })
      .catch(() => {
        try {
          sessionStorage.removeItem('gg_google_auth_intent');
        } catch {
          // ignore storage errors
        }
      });

    return () => {
      active = false;
    };
  }, [onCustomerLogin]);

  // Debounced search tracking per category for logged-in customer
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!loggedInCustomer || q.length < 2) return;
    const timer = setTimeout(() => {
      const matchedCats = new Set<string>();
      for (const cat of PRODUCT_CATEGORIES) {
        if (cat.toLowerCase().includes(q)) matchedCats.add(cat);
      }
      for (const item of shoppingItems) {
        if (
          item.name.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          (item.description || '').toLowerCase().includes(q)
        ) {
          if (item.category) matchedCats.add(item.category);
        }
        if (matchedCats.size >= 3) break;
      }
      if (shoppingCategory !== 'ALL') matchedCats.add(shoppingCategory);
      for (const cat of Array.from(matchedCats).slice(0, 3)) {
        void api.trackCustomerCategoryActivity(loggedInCustomer.id, {
          category: cat,
          type: 'search',
        });
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [searchQuery, loggedInCustomer, shoppingItems, shoppingCategory]);

  const handleSelectShoppingCategory = (category: string) => {
    setShoppingCategory(category);
    if (category !== 'ALL' && loggedInCustomer) {
      void api.trackCustomerCategoryActivity(loggedInCustomer.id, {
        category,
        type: 'search',
      });
    }
  };

  const scrollToCategoriesSection = () => {
    if (sectionTab === 'discount') {
      setSectionTab('all');
    }
    setPortalView('shop');
    setTimeout(() => {
      const el =
        categoriesSectionRef.current ||
        document.getElementById('shop-categories-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
  };

  // --- Product Detail & Checkout Modal ---
  const handledQueryProductRef = useRef(false);

  const openProductDetail = (item: PublicShopProduct) => {
    if (loggedInCustomer && item.category) {
      void api.trackCustomerCategoryActivity(loggedInCustomer.id, {
        category: item.category,
        type: 'view',
      });
    }
    setSelectedProduct(item);
    setActiveImageIndex(0);
    setModalStep('detail');
    setOrderQty('1');
    setOrderError('');
    setPlacedOrder(null);
    setReviewError('');
    setReviewRating(5);
    setReviewComment('');
    setReviewMediaUrl('');
    setReviewMediaType(undefined);
    setReviewMediaRecord(undefined);
  };

  useEffect(() => {
    if (handledQueryProductRef.current || shoppingItems.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const queryProdId = (params.get('product') || '').trim();
    const pathMatch = window.location.pathname.match(/^\/product\/([^/]+)/i);
    const pathSlugOrId = pathMatch ? decodeURIComponent(pathMatch[1]).trim() : '';
    const sharedProductKey = queryProdId || pathSlugOrId;
    if (!sharedProductKey) return;

    const toSlug = (val: string) =>
      val
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const targetLower = sharedProductKey.toLowerCase();
    const targetSlug = toSlug(sharedProductKey);

    const match = shoppingItems.find(
      (i) =>
        i.id === sharedProductKey ||
        i.catalogProductId === sharedProductKey ||
        i.id.toLowerCase() === targetLower ||
        (i.catalogProductId || '').toLowerCase() === targetLower ||
        `cat-${sharedProductKey}`.toLowerCase() === i.id.toLowerCase() ||
        (Boolean(targetSlug) && toSlug(i.name) === targetSlug)
    );
    if (match) {
      handledQueryProductRef.current = true;
      setPortalView('shop');
      setSelectedProduct(match);
      setActiveImageIndex(0);
      setModalStep('detail');
      setOrderQty('1');
      setOrderError('');
      setPlacedOrder(null);
    }
  }, [shoppingItems]);

  useEffect(() => {
    const upsertMeta = (
      attrName: 'name' | 'property',
      attrValue: string,
      content: string
    ) => {
      let tag = document.head.querySelector<HTMLMetaElement>(
        `meta[${attrName}="${attrValue}"]`
      );
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attrName, attrValue);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    const origin = window.location.origin;
    const defaultTitle = 'Glamour Galleria - Online Shopping';
    const defaultDescription =
      'Glamour Galleria - Online Shopping. Your Style, Our Priority.';
    const defaultImage = `${origin}/pwa-512x512.png`;

    if (selectedProduct) {
      const cleanedDesc = String(selectedProduct.description || '')
        .replace(/\s+/g, ' ')
        .trim();
      const priceText = formatCurrency(selectedProduct.price, sym);
      const productDescription =
        cleanedDesc || `${selectedProduct.name} — ${priceText} on Glamour Galleria.`;
      const productImages =
        Array.isArray(selectedProduct.imageDataUrls) &&
        selectedProduct.imageDataUrls.length > 0
          ? selectedProduct.imageDataUrls
          : selectedProduct.imageDataUrl
            ? [selectedProduct.imageDataUrl]
            : [];
      const primaryHttpImage =
        productImages.find((u) => /^https?:\/\//i.test(u)) || defaultImage;
      const shareUrl = `${origin}/?product=${encodeURIComponent(selectedProduct.id)}`;

      document.title = `${selectedProduct.name} | Glamour Galleria`;
      upsertMeta('name', 'description', productDescription);
      upsertMeta('property', 'og:title', selectedProduct.name);
      upsertMeta('property', 'og:description', productDescription);
      upsertMeta('property', 'og:type', 'product');
      upsertMeta('property', 'og:url', shareUrl);
      upsertMeta('property', 'og:image', primaryHttpImage);
      upsertMeta('name', 'twitter:card', 'summary_large_image');
      upsertMeta('name', 'twitter:title', selectedProduct.name);
      upsertMeta('name', 'twitter:description', productDescription);
      upsertMeta('name', 'twitter:image', primaryHttpImage);
    } else {
      document.title = defaultTitle;
      upsertMeta('name', 'description', defaultDescription);
      upsertMeta('property', 'og:title', defaultTitle);
      upsertMeta('property', 'og:description', defaultDescription);
      upsertMeta('property', 'og:type', 'website');
      upsertMeta('property', 'og:url', `${origin}/`);
      upsertMeta('property', 'og:image', defaultImage);
      upsertMeta('name', 'twitter:card', 'summary_large_image');
      upsertMeta('name', 'twitter:title', defaultTitle);
      upsertMeta('name', 'twitter:description', defaultDescription);
      upsertMeta('name', 'twitter:image', defaultImage);
    }
  }, [selectedProduct, sym]);

  const closeProductModal = () => {
    setSelectedProduct(null);
    setOrderError('');
    setPlacedOrder(null);
    const nextSnap: CustomerHistorySnapshot = {
      ...prevCustomerSnapRef.current,
      selectedProductId: null,
      modalStep: 'detail',
    };
    if (window.location.search.includes('product=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('product');
      window.history.replaceState(nextSnap, '', url.pathname + url.search + url.hash);
    } else if (/^\/product\//i.test(window.location.pathname)) {
      window.history.replaceState(nextSnap, '', '/');
    }
  };

  const handleShareProduct = async (
    item: PublicShopProduct,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    const shareUrl = `${window.location.origin}${window.location.pathname}?product=${encodeURIComponent(item.id)}`;
    const symPrice = formatCurrency(item.price, sym);
    try {
      if (navigator.share) {
        await navigator.share({
          title: item.name,
          text: `${item.name} (${symPrice}) - ${settings?.businessName || 'Glamour Galleria'}`,
          url: shareUrl,
        });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      triggerStoreNotice('Product share link copied!');
    } catch {
      triggerStoreNotice('Share link ready: ' + shareUrl);
    }
  };

  const parsedQty = Math.max(1, Math.floor(Number(orderQty) || 1));
  const checkoutSubtotal = selectedProduct
    ? Number((parsedQty * selectedProduct.price).toFixed(2))
    : 0;
  const codDeliveryCharge =
    paymentMethod === 'COD' ? COD_DELIVERY_CHARGE_PER_ITEM * parsedQty : 0;
  const checkoutTotal = Number(
    (checkoutSubtotal + codDeliveryCharge).toFixed(2)
  );

  const handleAddToCartAction = async (
    product: PublicShopProduct,
    qtyToAdd = 1
  ) => {
    if (!loggedInCustomer) {
      openAuthForAction(
        { type: 'cart', product, qty: qtyToAdd },
        'Please sign in or create an account to add products to your cart.'
      );
      return;
    }
    await addItemToClientCart(loggedInCustomer, product, qtyToAdd);
  };

  const openCheckoutStep = () => {
    if (!selectedProduct) return;
    if (!loggedInCustomer) {
      openAuthForAction(
        { type: 'order', product: selectedProduct, qty: parsedQty },
        'Please sign in or create a customer account to place your order.'
      );
      return;
    }
    prefillCheckoutFromClient(loggedInCustomer);
    setModalStep('checkout');
  };

  const selectedEffectivePayment = useMemo(() => {
    const sellerProfile = selectedProduct?.sellerId
      ? sellerPaymentProfiles?.[selectedProduct.sellerId]
      : undefined;
    return resolveEffectivePaymentDetails({
      product: selectedProduct,
      sellerProfile,
      adminPaymentSettings: paymentSettings,
      settings,
    });
  }, [selectedProduct, sellerPaymentProfiles, paymentSettings, settings]);

  const handleUploadUpiScreenshot = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setOrderError('');
    setUploadingScreenshot(true);
    setUploadingScreenshotProgress(1);
    try {
      const record = await uploadMediaToCloudinary(file, {
        role: 'customer',
        appSource: 'glamour-galleria',
        folder: 'glamour-galleria/customer/order-payments',
        relatedEntityType: 'order_payment',
        relatedEntityId:
          selectedProduct?.catalogProductId || selectedProduct?.id,
        uploadedByUid: loggedInCustomer?.id,
        allowedTypes: ['image'],
        onProgress: (pct) => setUploadingScreenshotProgress(pct),
      });
      setUpiScreenshotDataUrl(record.secureUrl);
    } catch (err) {
      setOrderError(
        err instanceof Error
          ? err.message
          : 'Invalid screenshot image. Please choose a valid JPG, PNG, or WebP file.'
      );
    } finally {
      setUploadingScreenshot(false);
      setUploadingScreenshotProgress(null);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !loggedInCustomer) return;
    setOrderError('');

    const nameCheck = validateEnglishName(customerName, 'Full Name');
    if (!nameCheck.valid) {
      setOrderError(nameCheck.error || 'Please enter your full name in English.');
      return;
    }
    const phoneCheck = normalizeAsianPhone(customerPhone);
    if (!phoneCheck.valid) {
      setOrderError(
        phoneCheck.error || 'Please enter a valid mobile number.'
      );
      return;
    }

    let formattedWhatsapp = phoneCheck.formatted;
    if (customerWhatsapp.trim()) {
      const waCheck = normalizeAsianPhone(customerWhatsapp);
      if (!waCheck.valid) {
        setOrderError(
          `WhatsApp Number: ${waCheck.error || 'Please enter a valid mobile number.'}`
        );
        return;
      }
      formattedWhatsapp = waCheck.formatted;
    }

    if (!customerAddress.trim()) {
      setOrderError('Please enter your full delivery address.');
      return;
    }
    if (paymentMethod === 'UPI' && !upiScreenshotDataUrl) {
      setOrderError(
        `Please upload your payment screenshot after paying to ${
          selectedEffectivePayment.upiId || 'the displayed Bank / QR details'
        }.`
      );
      return;
    }

    setOrderSubmitting(true);
    try {
      const res = await api.createCustomerOrder({
        clientId: loggedInCustomer.id,
        clearCart: false,
        customerName: nameCheck.cleaned,
        customerPhone: phoneCheck.formatted,
        customerWhatsapp: formattedWhatsapp,
        customerAddress: customerAddress.trim(),
        customerCity: customerCity.trim(),
        customerState: customerState.trim(),
        customerPinCode: customerPinCode.trim(),
        items: [
          {
            id: selectedProduct.id,
            productId: selectedProduct.catalogProductId,
            productName: selectedProduct.name,
            productCategory: selectedProduct.category,
            productSize: selectedProduct.size,
            productColor: selectedProduct.color,
            quantity: parsedQty,
            unitPrice: selectedProduct.price,
            originalPrice: selectedProduct.originalPrice,
            lineTotal: checkoutSubtotal,
            imageDataUrl:
              selectedProduct.imageDataUrls[0] ||
              selectedProduct.imageDataUrl ||
              '',
            sellerId: selectedProduct.sellerId,
            sellerName: selectedProduct.sellerName,
          },
        ],
        productId: selectedProduct.catalogProductId,
        productName: selectedProduct.name,
        productCategory: selectedProduct.category,
        productSize: selectedProduct.size,
        productColor: selectedProduct.color,
        quantity: parsedQty,
        unitPrice: selectedProduct.price,
        paymentMethod,
        upiIdUsed:
          paymentMethod === 'UPI'
            ? selectedEffectivePayment.upiId ||
              (selectedEffectivePayment.bankAccountNo ||
              selectedEffectivePayment.qrDataUrl
                ? 'Bank/QR'
                : DEFAULT_ADMIN_UPI_ID)
            : '',
        sellerId: selectedEffectivePayment.sellerId || selectedProduct.sellerId,
        paymentRecipientType:
          paymentMethod === 'UPI'
            ? selectedEffectivePayment.recipientType
            : undefined,
        paymentRecipientName:
          paymentMethod === 'UPI'
            ? selectedEffectivePayment.recipientName
            : undefined,
        paymentScreenshotDataUrl:
          paymentMethod === 'UPI' ? upiScreenshotDataUrl : '',
        customerNote: customerNote.trim(),
      });
      onCustomerUpdated?.(res.client);
      setPlacedOrder(res.order);
      setModalStep('success');
    } catch (err) {
      setOrderError(
        formatApiError(err, 'Could not submit order. Please try again.')
      );
    } finally {
      setOrderSubmitting(false);
    }
  };

  const adMediaRawSrc =
    viewPanel.advertisement.videoUrl ||
    viewPanel.advertisement.imageDataUrl ||
    '';
  const adMediaIsVideo = isVideoUrl(
    adMediaRawSrc,
    viewPanel.advertisement.mediaType
  );

  const adBannerCard = (
    <div className="rounded-2xl overflow-hidden border border-[#EFE2F5] bg-white/95 backdrop-blur-md shadow-sm relative">
      {adMediaRawSrc && !failedAdImage ? (
        <div className="relative">
          {adMediaIsVideo ? (
            <video
              src={getOptimizedMediaUrl(adMediaRawSrc, 'video')}
              autoPlay
              muted
              loop
              playsInline
              controls
              onError={() => setFailedAdImage(true)}
              className="w-full max-h-[240px] sm:max-h-[320px] object-cover bg-black"
            />
          ) : (
            <img
              src={getOptimizedMediaUrl(adMediaRawSrc, 'image')}
              alt={viewPanel.advertisement.title || 'Featured Advertisement'}
              referrerPolicy="no-referrer"
              onError={() => setFailedAdImage(true)}
              className="w-full max-h-[240px] sm:max-h-[320px] object-cover"
            />
          )}
          {(viewPanel.advertisement.title ||
            viewPanel.advertisement.subtitle) && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-5 py-4 text-white">
              {viewPanel.advertisement.title && (
                <div className="font-display-serif text-lg sm:text-xl font-bold leading-snug">
                  {viewPanel.advertisement.title}
                </div>
              )}
              {viewPanel.advertisement.subtitle && (
                <p className="text-xs sm:text-sm text-white/90 mt-0.5">
                  {viewPanel.advertisement.subtitle}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gradient-to-r from-[#FDF2F8] via-white to-[#F3E8FF] px-5 py-4">
          <div className="font-display-serif text-lg font-bold text-[#1F122B]">
            {viewPanel.advertisement.title}
          </div>
          {viewPanel.advertisement.subtitle && (
            <p className="text-xs sm:text-sm text-[#5B4B6B] mt-0.5">
              {viewPanel.advertisement.subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );

  const upiDeepLink = selectedEffectivePayment.upiId
    ? buildUpiDeepLink(
        selectedEffectivePayment.upiId,
        selectedEffectivePayment.recipientName,
        checkoutSubtotal
      )
    : '';

  return (
    <div className="relative min-h-screen text-[#1F122B] flex flex-col">
      <AppBackground
        backgroundImageDataUrl={settings?.backgroundImageDataUrl}
      />

      {/* Top Portal Header: Brand Logo + Top-Right Favorites Heart & Profile Avatar */}
      <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#EFE2F5]">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setPortalView('shop');
              setMenuSheetOpen(false);
              setCategoriesSheetOpen(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
          >
            <BrandLogo
              logoDataUrl={settings?.logoDataUrl}
              businessName={settings?.businessName}
              size={34}
            />
            <div className="min-w-0">
              <div className="font-display-serif text-base sm:text-lg font-bold text-[#6D28D9] truncate">
                {settings?.businessName || 'Glamour Galleria'}
              </div>
              <div className="text-[11px] font-medium text-[#9D174D] truncate hidden sm:block">
                {settings?.tagline || 'Your Style, Our Priority'}
              </div>
            </div>
          </button>

          {/* Top-Right Action Icons: Install App (when available), Favorites (Heart) & Profile Avatar */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton variant="header-chip" />
            <button
              type="button"
              onClick={() => {
                setMenuSheetOpen(false);
                setCategoriesSheetOpen(false);
                setPortalView((prev) =>
                  prev === 'favorites' ? 'shop' : 'favorites'
                );
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              aria-label="Favorites"
              title="Saved Favorites"
              className={`relative inline-flex items-center justify-center w-10 h-10 rounded-full border transition-colors cursor-pointer ${
                portalView === 'favorites'
                  ? 'border-[#DB2777] bg-[#FDF2F8] text-[#DB2777]'
                  : 'border-[#E6D9EE] bg-white text-[#4A3B59] hover:border-[#DB2777] hover:text-[#DB2777]'
              }`}
            >
              <Heart
                className={`w-5 h-5 ${
                  portalView === 'favorites' || favoriteItems.length > 0
                    ? 'fill-[#DB2777] text-[#DB2777]'
                    : ''
                }`}
              />
              {favoriteItems.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#DB2777] text-white text-[10px] font-mono-num font-bold flex items-center justify-center border-2 border-white">
                  {favoriteItems.length > 99 ? '99+' : favoriteItems.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMenuSheetOpen(false);
                setCategoriesSheetOpen(false);
                if (loggedInCustomer) {
                  handleOpenAccount('orders');
                } else {
                  openAuthForAction(
                    { type: 'account', tab: 'orders' },
                    '',
                    'login'
                  );
                }
              }}
              aria-label={
                loggedInCustomer
                  ? `Profile (${loggedInCustomer.name})`
                  : 'Sign in or create account'
              }
              title={
                loggedInCustomer
                  ? loggedInCustomer.name
                  : 'Sign In / Create Account'
              }
              className={`inline-flex items-center justify-center rounded-full border transition-all cursor-pointer shrink-0 ${
                loggedInCustomer
                  ? `p-0.5 ${
                      portalView === 'account'
                        ? 'border-[#7E22CE] ring-2 ring-[#7E22CE]/25'
                        : 'border-[#E6D9EE] hover:border-[#9333EA]'
                    }`
                  : 'w-10 h-10 border-[#E6D9EE] bg-white text-[#6D28D9] hover:border-[#9333EA] hover:bg-[#FAF5FF]'
              }`}
            >
              {loggedInCustomer ? (
                <CustomerAvatar
                  photoDataUrl={loggedInCustomer.profilePhotoDataUrl}
                  name={loggedInCustomer.name}
                  size={36}
                  className="border-0"
                />
              ) : (
                <User className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 pt-4 pb-24 sm:pt-6 sm:pb-24 space-y-5">
        {portalView === 'favorites' ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setPortalView('shop')}
                  aria-label="Back to home"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-[#E6D9EE] bg-white text-[#4A3B59] hover:border-[#9333EA] cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h1 className="font-display-serif text-xl sm:text-2xl font-bold text-[#1F122B]">
                    Saved Favorites
                  </h1>
                  <p className="text-xs text-[#6B5B7B] font-mono-num">
                    {favoriteItems.length}{' '}
                    {favoriteItems.length === 1 ? 'item saved' : 'items saved'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPortalView('shop')}
                className="rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] whitespace-nowrap cursor-pointer"
              >
                Continue Shopping
              </button>
            </div>

            {favoriteItems.length === 0 ? (
              <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 p-8 sm:p-12 text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-[#FDF2F8] border border-[#FBCFE8] text-[#DB2777] flex items-center justify-center mx-auto">
                  <Heart className="w-7 h-7" />
                </div>
                <h2 className="font-display-serif text-lg font-bold text-[#1F122B]">
                  Your Favorites list is empty
                </h2>
                <p className="text-xs sm:text-sm text-[#6B5B7B] max-w-sm mx-auto">
                  Tap the heart icon on any product to save items here for quick access later.
                </p>
                <button
                  type="button"
                  onClick={() => setPortalView('shop')}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2.5 text-xs font-bold text-white hover:opacity-95 cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Explore Products</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
                {favoriteItems.map((item) => {
                  const mainImg = item.imageDataUrls[0] || item.imageDataUrl || '';
                  const discountPercent =
                    item.originalPrice && item.originalPrice > item.price
                      ? Math.round(
                          ((item.originalPrice - item.price) /
                            item.originalPrice) *
                            100
                        )
                      : 0;
                  return (
                    <div
                      key={`fav-${item.id}`}
                      className="group rounded-2xl border border-[#EFE2F5] bg-white overflow-hidden flex flex-col justify-between hover:border-[#9333EA] hover:shadow-md transition-all text-left"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => openProductDetail(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openProductDetail(item);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <div className="aspect-square bg-gradient-to-br from-[#FDF2F8] to-[#F5F3FF] relative overflow-hidden border-b border-[#F4ECF8] flex items-center justify-center">
                          {mainImg ? (
                            <img
                              src={getOptimizedMediaUrl(mainImg, 'image')}
                              alt={item.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <ShoppingBag className="w-8 h-8 text-[#C084FC]" />
                          )}
                          <button
                            type="button"
                            onClick={(e) => toggleFavoriteProduct(item, e)}
                            aria-label={`Remove ${item.name} from favorites`}
                            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/95 border border-[#FBCFE8] text-[#DB2777] flex items-center justify-center shadow-xs hover:scale-105 transition-transform cursor-pointer"
                          >
                            <Heart className="w-4 h-4 fill-[#DB2777]" />
                          </button>
                          {discountPercent > 0 && (
                            <span className="absolute top-2 left-2 rounded-md bg-[#15803D] px-1.5 py-0.5 text-[10px] font-bold text-white font-mono-num">
                              {discountPercent}% OFF
                            </span>
                          )}
                        </div>
                        <div className="p-2.5 sm:p-3 space-y-1">
                          <div className="text-[10px] font-semibold text-[#7E22CE] truncate">
                            {item.category}
                          </div>
                          <h3 className="text-xs sm:text-sm font-bold text-[#1F122B] leading-snug line-clamp-2 min-h-[2.25rem]">
                            {item.name}
                          </h3>
                        </div>
                      </div>
                      <div className="px-2.5 sm:px-3 pb-2.5 sm:pb-3 pt-1 space-y-2">
                        <div className="font-mono-num flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-sm sm:text-base font-bold text-[#1F122B]">
                            {formatCurrency(item.price, sym)}
                          </span>
                          {item.originalPrice &&
                            item.originalPrice > item.price && (
                              <span className="text-[11px] text-[#8E7C9E] line-through">
                                {formatCurrency(item.originalPrice, sym)}
                              </span>
                            )}
                        </div>
                        <button
                          type="button"
                          disabled={addingToCart}
                          onClick={() => handleAddToCartAction(item, 1)}
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#7E22CE] bg-white py-2 px-2 text-[11px] font-bold text-[#6D28D9] hover:bg-[#FAF5FF] cursor-pointer whitespace-nowrap"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          <span>Add to Cart</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : portalView === 'account' && loggedInCustomer ? (
          <CustomerDashboardView
            client={loggedInCustomer}
            orders={customerOrders}
            bills={customerBills}
            settings={settings}
            products={products}
            paymentSettings={paymentSettings}
            sellerPaymentProfiles={sellerPaymentProfiles}
            initialTab={accountTab}
            onBackToShop={() => setPortalView('shop')}
            onLogout={() => {
              onCustomerLogout?.();
              setPortalView('shop');
              triggerStoreNotice('Signed out of customer account.');
            }}
            onClientUpdated={(updated) => onCustomerUpdated?.(updated)}
          />
        ) : portalView === 'seller-hub' ? (
          <SellerHubView
            loggedInCustomer={loggedInCustomer}
            products={products}
            settings={settings}
            paymentSettings={paymentSettings}
            highlightSeatUsage={highlightSeatUsage}
            sellerFollows={sellerFollows}
            productReviews={productReviews}
            currencySymbol={sym}
            defaultLowStock={settings?.lowStockThreshold || 5}
            onBackToShop={() => setPortalView('shop')}
            onOpenHelpCenter={() => {
              setPortalView('help-center');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSaveProduct={async (payload, existingId, expectedSellerId) => {
              if (onSaveProduct) {
                await onSaveProduct(payload, existingId, expectedSellerId);
              } else if (existingId) {
                await api.updateProduct(existingId, payload, expectedSellerId);
              } else {
                await api.createProduct(payload);
              }
              triggerStoreNotice(
                existingId
                  ? 'Product updated and sent for Admin review.'
                  : 'Product submitted for Admin approval!'
              );
            }}
            onDeleteProduct={async (id, expectedSellerId) => {
              if (onDeleteProduct) {
                await onDeleteProduct(id, expectedSellerId);
              } else {
                await api.deleteProduct(id, expectedSellerId);
              }
              triggerStoreNotice('Product deleted.');
            }}
            onApplicationSubmitted={() =>
              triggerStoreNotice('Seller application submitted!')
            }
          />
        ) : portalView === 'seller-profile' && viewingSellerId ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPortalView('shop')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Shop</span>
              </button>
            </div>

            {/* Public Seller Store Banner (Strictly Public Info Only — zero private KYC/phone/email/status) */}
            <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md overflow-hidden shadow-sm">
              <div className="h-36 sm:h-48 w-full bg-gradient-to-r from-[#FDF2F8] via-[#FAF5FF] to-[#F3E8FF] relative overflow-hidden">
                {viewingSellerProfile?.sellerCoverPhotoDataUrl ? (
                  <img
                    src={getOptimizedMediaUrl(
                      viewingSellerProfile.sellerCoverPhotoDataUrl,
                      'image'
                    )}
                    alt={`${viewingSellerProfile.sellerName} store cover`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#C084FC]/50">
                    <Store className="w-12 h-12" />
                  </div>
                )}
              </div>

              <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 -mt-10 sm:-mt-12 relative z-10 rounded-2xl border-4 border-white bg-[#FDF9FE] shadow-md overflow-hidden shrink-0 flex items-center justify-center">
                    {viewingSellerProfile?.sellerPhotoDataUrl ? (
                      <img
                        src={getOptimizedMediaUrl(
                          viewingSellerProfile.sellerPhotoDataUrl,
                          'image'
                        )}
                        alt={viewingSellerProfile.sellerName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Store className="w-8 h-8 text-[#7E22CE]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#15803D]">
                      Verified Seller Store
                    </div>
                    <h1 className="font-display-serif text-xl sm:text-2xl font-bold text-[#1F122B] truncate">
                      {viewingSellerProfile?.sellerName ||
                        viewingSellerProducts[0]?.sellerName ||
                        'Seller Store'}
                    </h1>
                    <div className="text-xs text-[#5B4B6B] font-mono-num mt-0.5 flex flex-wrap items-center gap-x-2.5">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-[#7E22CE]" />
                        <strong>
                          {followerCountsBySeller[viewingSellerId] || 0}
                        </strong>{' '}
                        Followers
                      </span>
                      <span>·</span>
                      <span>
                        <strong>{viewingSellerProducts.length}</strong> Products
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={followBusySellerId === viewingSellerId}
                  onClick={() => handleToggleFollowAction(viewingSellerId)}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 disabled:opacity-60 ${
                    followedSellerIdsSet.has(viewingSellerId)
                      ? 'border border-[#7E22CE] bg-[#FAF5FF] text-[#6D28D9]'
                      : 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white hover:opacity-95'
                  }`}
                >
                  {followedSellerIdsSet.has(viewingSellerId) ? (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span>Following</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Follow Store</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Seller Store Products Grid */}
            <section className="rounded-3xl border border-[#EFE2F5] bg-white/92 backdrop-blur-md p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-[#F4ECF8] pb-3">
                <h2 className="font-display-serif text-lg sm:text-xl font-bold text-[#1F122B]">
                  Products by{' '}
                  {viewingSellerProfile?.sellerName ||
                    viewingSellerProducts[0]?.sellerName ||
                    'Seller'}
                </h2>
                <span className="text-xs font-mono-num text-[#6B5B7B]">
                  {viewingSellerProducts.length} items
                </span>
              </div>

              {viewingSellerProducts.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#6B5B7B]">
                  This seller currently has no live approved products listed.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {viewingSellerProducts.map((item) => {
                    const mainImg =
                      item.imageDataUrls[0] || item.imageDataUrl || '';
                    const canonicalId = item.catalogProductId || item.id;
                    const ratingSummary =
                      ratingSummaryByProductId.get(canonicalId);
                    return (
                      <div
                        key={item.id}
                        className="group rounded-2xl border border-[#EFE2F5] bg-white overflow-hidden flex flex-col justify-between hover:border-[#9333EA] hover:shadow-md transition-all text-left"
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => openProductDetail(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openProductDetail(item);
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <div className="aspect-square bg-gradient-to-br from-[#FDF2F8] to-[#F5F3FF] relative overflow-hidden border-b border-[#F4ECF8] flex items-center justify-center">
                            {mainImg ? (
                              <img
                                src={getOptimizedMediaUrl(mainImg, 'image')}
                                alt={item.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <ShoppingBag className="w-8 h-8 text-[#C084FC]" />
                            )}
                            <button
                              type="button"
                              onClick={(e) => toggleFavoriteProduct(item, e)}
                              aria-label={
                                isProductFavorited(item)
                                  ? `Remove ${item.name} from favorites`
                                  : `Save ${item.name} to favorites`
                              }
                              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/95 border border-[#E6D9EE] flex items-center justify-center shadow-xs hover:scale-105 transition-transform cursor-pointer"
                            >
                              <Heart
                                className={`w-4 h-4 ${
                                  isProductFavorited(item)
                                    ? 'fill-[#DB2777] text-[#DB2777]'
                                    : 'text-[#6B5B7B]'
                                }`}
                              />
                            </button>
                            {item.videoUrl && (
                              <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                <Video className="w-3 h-3" />
                                <span>Video</span>
                              </span>
                            )}
                          </div>
                          <div className="p-2.5 sm:p-3 space-y-1">
                            <div className="text-[10px] font-semibold text-[#7E22CE] truncate">
                              {item.category}
                            </div>
                            <h3 className="text-xs sm:text-sm font-bold text-[#1F122B] leading-snug line-clamp-2 min-h-[2.25rem]">
                              {item.name}
                            </h3>
                            {ratingSummary && (
                              <div className="text-[11px] font-mono-num text-[#B45309] font-semibold">
                                ★ {ratingSummary.avg.toFixed(1)} ({ratingSummary.count})
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="px-2.5 sm:px-3 pb-2.5 sm:pb-3 pt-1 space-y-2">
                          <div className="font-mono-num flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-sm sm:text-base font-bold text-[#1F122B]">
                              {formatCurrency(item.price, sym)}
                            </span>
                            {item.originalPrice &&
                              item.originalPrice > item.price && (
                                <span className="text-[11px] text-[#8E7C9E] line-through">
                                  {formatCurrency(item.originalPrice, sym)}
                                </span>
                              )}
                          </div>
                          <div className="grid grid-cols-[auto_1fr] gap-1.5">
                            <button
                              type="button"
                              disabled={addingToCart}
                              onClick={() => handleAddToCartAction(item, 1)}
                              title="Add to Cart"
                              className="inline-flex items-center justify-center rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-2.5 py-1.5 text-[11px] font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openProductDetail(item)}
                              className="rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-1.5 px-2 text-center text-[11px] font-semibold text-white hover:opacity-95 cursor-pointer"
                            >
                              View &amp; Order
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : portalView === 'help-center' ? (
          <HelpCenterChatView
            loggedInCustomer={loggedInCustomer}
            onBackToShop={() => setPortalView('shop')}
            onRequestSignIn={() =>
              openAuthForAction(
                { type: 'portal', view: 'help-center' },
                'Sign in to sync your Help Center support chat across devices.',
                'login'
              )
            }
          />
        ) : portalView === 'refer-earn' ? (
          <ReferEarnView
            loggedInCustomer={loggedInCustomer}
            settings={settings}
            onBackToShop={() => setPortalView('shop')}
            onRequestSignIn={() =>
              openAuthForAction(
                { type: 'portal', view: 'refer-earn' },
                'Sign in or create an account to generate your personal referral link.',
                'login'
              )
            }
          />
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {/* TOP OF HOME: MEESHO-STYLE SEARCH BAR + SORT / CATEGORY / GENDER / FILTERS BAR */}
            {hasShoppingContent && (
              <div className="no-print -mx-3 sm:mx-0 bg-white/95 backdrop-blur-md border-b sm:border border-[#EFE2F5] sm:rounded-2xl shadow-xs overflow-hidden">
                <div className="px-3 pt-2.5 pb-2 sm:px-4 sm:pt-3 sm:pb-2.5">
                  <div className="relative">
                    <Search className="w-4 h-4 text-[#9333EA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (sectionTab === 'discount' && e.target.value.trim()) {
                          setSectionTab('all');
                        }
                      }}
                      placeholder="Search by Keyword or Product ID"
                      aria-label="Search by Keyword or Product ID"
                      className="w-full rounded-full border border-[#E6D9EE] bg-[#FDFBFE] pl-10 pr-9 py-2.5 text-xs sm:text-sm text-[#1F122B] placeholder:text-[#8E7C9E] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B5B7B] hover:text-[#1F122B] cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Sort · Category · Gender · Filters Control Strip */}
                <div className="grid grid-cols-4 border-t border-[#EFE2F5] divide-x divide-[#EFE2F5] text-xs font-semibold text-[#1F122B]">
                  <button
                    type="button"
                    onClick={() => {
                      setCategoriesSheetOpen(false);
                      setGenderSheetOpen(false);
                      setFiltersSheetOpen(false);
                      setSortSheetOpen(true);
                    }}
                    className={`min-h-[42px] px-1.5 py-2 flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                      sortBy !== 'featured'
                        ? 'bg-[#FAF5FF] text-[#7E22CE]'
                        : 'hover:bg-[#FDF9FC]'
                    }`}
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Sort</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSortSheetOpen(false);
                      setGenderSheetOpen(false);
                      setFiltersSheetOpen(false);
                      setCategoriesSheetOpen(true);
                    }}
                    className={`min-h-[42px] px-1.5 py-2 flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                      shoppingCategory !== 'ALL'
                        ? 'bg-[#FDF2F8] text-[#DB2777]'
                        : 'hover:bg-[#FDF9FC]'
                    }`}
                  >
                    <span className="truncate">
                      {shoppingCategory === 'ALL' ? 'Category' : shoppingCategory.split('&')[0].trim()}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSortSheetOpen(false);
                      setCategoriesSheetOpen(false);
                      setFiltersSheetOpen(false);
                      setGenderSheetOpen(true);
                    }}
                    className={`min-h-[42px] px-1.5 py-2 flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                      genderFilter !== 'ALL'
                        ? 'bg-[#FAF5FF] text-[#7E22CE]'
                        : 'hover:bg-[#FDF9FC]'
                    }`}
                  >
                    <span className="truncate">
                      {genderFilter === 'ALL'
                        ? 'Gender'
                        : genderFilter === 'women'
                          ? 'Women'
                          : genderFilter === 'men'
                            ? 'Men'
                            : 'Unisex'}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSortSheetOpen(false);
                      setCategoriesSheetOpen(false);
                      setGenderSheetOpen(false);
                      setFiltersSheetOpen(true);
                    }}
                    className={`min-h-[42px] px-1.5 py-2 flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                      activeFiltersCount > 0
                        ? 'bg-[#FDF2F8] text-[#DB2777]'
                        : 'hover:bg-[#FDF9FC]'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      Filters{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Welcome bar shown only when a customer is signed in */}
            {loggedInCustomer && (
              <div className="no-print flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md px-3.5 py-2 text-xs text-[#4A3B59]">
                <div className="flex flex-wrap items-center gap-2">
                  <CustomerAvatar
                    photoDataUrl={loggedInCustomer.profilePhotoDataUrl}
                    name={loggedInCustomer.name}
                    size={26}
                  />
                  <span>
                    Welcome, <strong>{loggedInCustomer.name}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAccount('orders')}
                    className="font-bold text-[#7E22CE] hover:underline cursor-pointer"
                  >
                    Orders ({customerOrders.length})
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => handleOpenAccount('bills')}
                    className="font-bold text-[#DB2777] hover:underline cursor-pointer"
                  >
                    Bills ({customerBills.length})
                  </button>
                </div>
              </div>
            )}

            {/* ADVERTISEMENT BANNER */}
            {showAdvertisement && (
              <section className="no-print" aria-label="Featured Advertisement">
                {isSafeHttpUrl(viewPanel.advertisement.linkUrl) ? (
                  <a
                    href={viewPanel.advertisement.linkUrl.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:opacity-95 transition-opacity"
                  >
                    {adBannerCard}
                  </a>
                ) : (
                  adBannerCard
                )}
              </section>
            )}

            {/* 2. DISCOUNT & FULL-SCREEN EDGE-TO-EDGE PRODUCT FEED */}
            {(hasDiscountContent || hasShoppingContent) && (
              <div className="no-print space-y-4">
                {hasDiscountContent && hasShoppingContent && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/90 backdrop-blur-md border border-[#EFE2F5]">
                      <button
                        type="button"
                        onClick={() => setSectionTab('all')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          sectionTab === 'all'
                            ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                            : 'text-[#5B4B6B] hover:text-[#1F122B]'
                        }`}
                      >
                        All Offers &amp; Shop
                      </button>
                      <button
                        type="button"
                        onClick={() => setSectionTab('discount')}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          sectionTab === 'discount'
                            ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                            : 'text-[#5B4B6B] hover:text-[#1F122B]'
                        }`}
                      >
                        <Tag className="w-3.5 h-3.5" />
                        <span>Discount</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSectionTab('shopping')}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          sectionTab === 'shopping'
                            ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                            : 'text-[#5B4B6B] hover:text-[#1F122B]'
                        }`}
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Shopping</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* DISCOUNT SECTION */}
                {hasDiscountContent &&
                  (sectionTab === 'all' || sectionTab === 'discount') && (
                    <section
                      aria-label="Discount Offers"
                      className="rounded-3xl border border-[#EFE2F5] bg-white/92 backdrop-blur-md p-4 sm:p-6 space-y-4"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#F4ECF8] pb-3">
                        <div>
                          <h2 className="font-display-serif text-xl font-bold text-[#1F122B] flex items-center gap-2">
                            <Tag className="w-4 h-4 text-[#DB2777] shrink-0" />
                            <span>
                              {viewPanel.discount.sectionTitle ||
                                'Special Discounts & Offers'}
                            </span>
                          </h2>
                          {viewPanel.discount.headline && (
                            <p className="text-xs sm:text-sm text-[#6B5B7B] mt-0.5">
                              {viewPanel.discount.headline}
                            </p>
                          )}
                        </div>
                      </div>

                      {viewPanel.discount.offers.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                          {viewPanel.discount.offers.map((offer) => (
                            <div
                              key={offer.id}
                              className="rounded-2xl border border-[#F2E6F7] bg-[#FDF9FE] p-4 flex flex-col justify-between gap-3"
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-baseline justify-between gap-2">
                                  <h3 className="text-sm font-bold text-[#1F122B]">
                                    {offer.title}
                                  </h3>
                                  <span className="font-mono-num text-sm font-bold text-[#DB2777] shrink-0">
                                    {offer.discountLabel}
                                  </span>
                                </div>
                                {offer.description && (
                                  <p className="text-xs text-[#5B4B6B] leading-relaxed">
                                    {offer.description}
                                  </p>
                                )}
                              </div>

                              {(offer.promoCode || offer.validTill) && (
                                <div className="pt-2.5 border-t border-[#EFE2F5] flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="text-[#6B5B7B]">
                                    {offer.validTill || 'Limited time offer'}
                                  </span>
                                  {offer.promoCode && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCopyCode(
                                          offer.id,
                                          offer.promoCode!
                                        )
                                      }
                                      className="inline-flex items-center gap-1 font-mono-num font-bold text-[#7E22CE] hover:text-[#DB2777] cursor-pointer whitespace-nowrap"
                                    >
                                      {copiedCodeId === offer.id ? (
                                        <>
                                          <Check className="w-3.5 h-3.5 text-[#15803D]" />
                                          <span className="text-[#15803D]">
                                            Copied
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3.5 h-3.5" />
                                          <span>{offer.promoCode}</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                {/* FULL-SCREEN EDGE-TO-EDGE MEESHO-STYLE SHOPPING PRODUCT FEED */}
                {hasShoppingContent &&
                  (sectionTab === 'all' || sectionTab === 'shopping') && (
                    <section
                      id="shop-categories-section"
                      ref={categoriesSectionRef}
                      aria-label="Shopping Collection"
                      className="space-y-3 scroll-mt-20"
                    >
                      {/* Horizontal Quick Category Strip + Active Filters Summary */}
                      <div className="-mx-3 px-3 sm:mx-0 sm:px-0 space-y-2">
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleSelectShoppingCategory('ALL')}
                            className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              shoppingCategory === 'ALL'
                                ? 'border-[#7E22CE] bg-[#7E22CE] text-white'
                                : 'border-[#E6D9EE] bg-white text-[#4A3B59] hover:border-[#9333EA]'
                            }`}
                          >
                            All ({shoppingItems.length})
                          </button>
                          {PRODUCT_CATEGORIES.map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => handleSelectShoppingCategory(cat)}
                              className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                shoppingCategory === cat
                                  ? 'border-[#DB2777] bg-[#DB2777] text-white'
                                  : 'border-[#E6D9EE] bg-white text-[#4A3B59] hover:border-[#DB2777]'
                              }`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>

                        {(searchQuery ||
                          shoppingCategory !== 'ALL' ||
                          genderFilter !== 'ALL' ||
                          sortBy !== 'featured' ||
                          activeFiltersCount > 0) && (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 border border-[#EFE2F5] px-3 py-1.5 text-xs">
                            <span className="text-[#5B4B6B] font-mono-num">
                              Showing <strong>{filteredShoppingItems.length}</strong>{' '}
                              {filteredShoppingItems.length === 1 ? 'product' : 'products'}
                            </span>
                            <button
                              type="button"
                              onClick={resetAllShoppingFilters}
                              className="font-bold text-[#DB2777] hover:underline cursor-pointer"
                            >
                              Reset Filters
                            </button>
                          </div>
                        )}
                      </div>

                      {filteredShoppingItems.length === 0 ? (
                        <div className="rounded-2xl border border-[#EFE2F5] bg-white/95 py-12 px-4 text-center space-y-2.5">
                          <div className="text-xs sm:text-sm font-semibold text-[#5B4B6B]">
                            No products match your current search or filter selection.
                          </div>
                          <button
                            type="button"
                            onClick={resetAllShoppingFilters}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#FAF5FF] border border-[#D8B4FE] px-4 py-2 text-xs font-bold text-[#6D28D9] cursor-pointer"
                          >
                            Reset All Filters
                          </button>
                        </div>
                      ) : (
                        <div className="-mx-3 px-1.5 sm:mx-0 sm:px-0 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 sm:gap-3">
                          {filteredShoppingItems.map((item) => {
                            const discountPercent =
                              item.originalPrice &&
                              item.originalPrice > item.price
                                ? Math.round(
                                    ((item.originalPrice - item.price) /
                                      item.originalPrice) *
                                      100
                                  )
                                : 0;
                            const mainImg =
                              item.imageDataUrls[0] || item.imageDataUrl || '';
                            const isFav = isProductFavorited(item);

                            return (
                              <div
                                key={item.id}
                                className={`group rounded-xl sm:rounded-2xl border bg-white overflow-hidden flex flex-col justify-between hover:border-[#9333EA] hover:shadow-md transition-all text-left ${
                                  item.highlighted
                                    ? 'border-[#DB2777]/60 ring-1 ring-[#DB2777]/20'
                                    : 'border-[#EFE2F5]'
                                }`}
                              >
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => openProductDetail(item)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      openProductDetail(item);
                                    }
                                  }}
                                  className="cursor-pointer"
                                >
                                  <div className="aspect-square bg-gradient-to-br from-[#FDF2F8] to-[#F5F3FF] relative overflow-hidden border-b border-[#F4ECF8] flex items-center justify-center">
                                    {mainImg ? (
                                      <img
                                        src={getOptimizedMediaUrl(mainImg, 'image')}
                                        alt={item.name}
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                      />
                                    ) : (
                                      <ShoppingBag className="w-8 h-8 text-[#C084FC]" />
                                    )}
                                    <div className="absolute top-1.5 left-1.5 flex flex-col items-start gap-1">
                                      {item.highlighted && (
                                        <span className="rounded-md bg-[#DB2777] px-1.5 py-0.5 text-[10px] font-bold text-white">
                                          Featured
                                        </span>
                                      )}
                                      {discountPercent > 0 && (
                                        <span className="rounded-md bg-[#15803D] px-1.5 py-0.5 text-[10px] font-bold text-white font-mono-num">
                                          {discountPercent}% OFF
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => toggleFavoriteProduct(item, e)}
                                      title={
                                        isFav
                                          ? 'Remove from Favorites'
                                          : 'Save to Favorites'
                                      }
                                      aria-label={
                                        isFav
                                          ? `Remove ${item.name} from favorites`
                                          : `Save ${item.name} to favorites`
                                      }
                                      className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-white/95 border border-[#E6D9EE] flex items-center justify-center shadow-xs hover:scale-105 transition-transform cursor-pointer"
                                    >
                                      <Heart
                                        className={`w-4 h-4 ${
                                          isFav
                                            ? 'fill-[#DB2777] text-[#DB2777]'
                                            : 'text-[#6B5B7B]'
                                        }`}
                                      />
                                    </button>
                                    {(item.imageDataUrls.length > 1 || item.videoUrl) && (
                                      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
                                        {item.videoUrl && (
                                          <span className="inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                            <Video className="w-3 h-3" />
                                            <span>Video</span>
                                          </span>
                                        )}
                                        {item.imageDataUrls.length > 1 && (
                                          <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white font-mono-num">
                                            {item.imageDataUrls.length} photos
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <div className="p-2 sm:p-3 space-y-1">
                                    <div className="text-[10px] font-semibold text-[#7E22CE] truncate">
                                      {item.category}
                                    </div>
                                    <h3 className="text-xs sm:text-sm font-bold text-[#1F122B] leading-snug line-clamp-2 min-h-[2.25rem]">
                                      {item.name}
                                    </h3>
                                    {(() => {
                                      const canonicalId =
                                        item.catalogProductId || item.id;
                                      const ratingSummary =
                                        ratingSummaryByProductId.get(
                                          canonicalId
                                        );
                                      if (!ratingSummary) return null;
                                      return (
                                        <div className="text-[11px] font-mono-num text-[#B45309] font-semibold">
                                          ★ {ratingSummary.avg.toFixed(1)} ({ratingSummary.count})
                                        </div>
                                      );
                                    })()}
                                    {(item.size || item.color) && (
                                      <div className="text-[10px] text-[#6B5B7B] truncate">
                                        {[
                                          item.size ? `Size ${item.size}` : '',
                                          item.color,
                                        ]
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="px-2 sm:px-3 pb-2.5 sm:pb-3 pt-1 space-y-2">
                                  <div className="font-mono-num flex items-baseline gap-1.5 flex-wrap">
                                    <span className="text-sm sm:text-base font-bold text-[#1F122B]">
                                      {formatCurrency(item.price, sym)}
                                    </span>
                                    {item.originalPrice &&
                                      item.originalPrice > item.price && (
                                        <span className="text-[11px] text-[#8E7C9E] line-through">
                                          {formatCurrency(
                                            item.originalPrice,
                                            sym
                                          )}
                                        </span>
                                      )}
                                  </div>

                                  <div className="grid grid-cols-[auto_1fr] gap-1.5">
                                    <button
                                      type="button"
                                      disabled={addingToCart}
                                      onClick={() =>
                                        handleAddToCartAction(item, 1)
                                      }
                                      title="Add to Cart"
                                      className="inline-flex items-center justify-center rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-2.5 py-1.5 text-[11px] font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
                                    >
                                      <ShoppingCart className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openProductDetail(item)}
                                      className="rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-1.5 px-2 text-center text-[11px] font-semibold text-white hover:opacity-95 cursor-pointer"
                                    >
                                      View &amp; Order
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* FULL-SCREEN PRODUCT DETAIL + AUTH-GATED ORDER CHECKOUT VIEW */}
      {selectedProduct && (
        <div
          className="no-print fixed inset-0 z-50 bg-[#FDFBFE] flex flex-col overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label={
            modalStep === 'detail'
              ? selectedProduct.name
              : modalStep === 'checkout'
                ? 'Complete Your Order'
                : 'Order Placed Successfully'
          }
        >
          {/* Full-Screen Top Header with Back Button (←) & Cart Icon */}
          <header className="shrink-0 sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-[#EFE2F5]">
            <div className="max-w-5xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    if (modalStep === 'checkout') {
                      popCustomerOverlayOrReset(
                        prevCustomerSnapRef.current.modalStep === 'checkout',
                        () => {
                          setModalStep('detail');
                          setOrderError('');
                        }
                      );
                    } else {
                      if (
                        window.location.search.includes('product=') ||
                        /^\/product\//i.test(window.location.pathname)
                      ) {
                        closeProductModal();
                        return;
                      }
                      popCustomerOverlayOrReset(
                        Boolean(prevCustomerSnapRef.current.selectedProductId),
                        closeProductModal
                      );
                    }
                  }}
                  aria-label="Back"
                  className="inline-flex items-center justify-center w-10 h-10 -ml-1.5 rounded-full text-[#1F122B] hover:bg-[#FAF5FF] transition-colors cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="text-sm sm:text-base font-bold text-[#1F122B] truncate">
                  {modalStep === 'detail'
                    ? 'Product Details'
                    : modalStep === 'checkout'
                      ? 'Complete Your Order'
                      : 'Order Placed Successfully'}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  closeProductModal();
                  handleOpenAccount('cart');
                }}
                aria-label={`Open cart (${cartItemCount} items)`}
                className="relative inline-flex items-center justify-center w-10 h-10 rounded-full border border-[#E6D9EE] bg-white text-[#4A3B59] hover:border-[#9333EA] hover:text-[#6D28D9] transition-colors cursor-pointer shrink-0"
              >
                <ShoppingCart className="w-5 h-5" />
                {cartItemCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#DB2777] text-white text-[10px] font-mono-num font-bold flex items-center justify-center border-2 border-white">
                    {cartItemCount > 99 ? '99+' : cartItemCount}
                  </span>
                )}
              </button>
            </div>
          </header>

          {/* Scrollable Body */}
          <div
            className={`flex-1 overflow-y-auto ${
              modalStep === 'detail' ? 'pb-24 sm:pb-24' : 'pb-10'
            }`}
          >
            <div className="max-w-5xl mx-auto">
              {/* STEP 1: PRODUCT DETAIL VIEW WITH MULTI-IMAGE & VIDEO GALLERY */}
              {modalStep === 'detail' && (
                <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {(() => {
                  const mediaSlides: Array<{ type: 'image' | 'video'; url: string }> = [
                    ...selectedProduct.imageDataUrls.map((url) => ({
                      type: 'image' as const,
                      url,
                    })),
                    ...(selectedProduct.videoUrl
                      ? [{ type: 'video' as const, url: selectedProduct.videoUrl }]
                      : []),
                  ];
                  const safeSlideIdx =
                    mediaSlides.length > 0
                      ? Math.min(activeImageIndex, mediaSlides.length - 1)
                      : 0;
                  const currentSlide = mediaSlides[safeSlideIdx];

                  return (
                    <div className="space-y-2.5">
                      <div className="aspect-square rounded-2xl border border-[#EFE2F5] bg-gradient-to-br from-[#FDF2F8] to-[#F5F3FF] relative overflow-hidden flex items-center justify-center">
                        {currentSlide ? (
                          <>
                            {currentSlide.type === 'video' ? (
                              <video
                                key={currentSlide.url}
                                src={getOptimizedMediaUrl(currentSlide.url, 'video')}
                                controls
                                playsInline
                                className="w-full h-full object-contain bg-black"
                              />
                            ) : (
                              <img
                                src={getOptimizedMediaUrl(currentSlide.url, 'image')}
                                alt={`${selectedProduct.name} photo ${safeSlideIdx + 1}`}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            )}
                            {mediaSlides.length > 1 && (
                              <>
                                <button
                                  type="button"
                                  aria-label="Previous media"
                                  onClick={() =>
                                    setActiveImageIndex((prev) =>
                                      prev <= 0 ? mediaSlides.length - 1 : prev - 1
                                    )
                                  }
                                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 border border-[#E6D9EE] p-1.5 text-[#1F122B] hover:bg-white shadow-sm cursor-pointer"
                                >
                                  <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Next media"
                                  onClick={() =>
                                    setActiveImageIndex(
                                      (prev) => (prev + 1) % mediaSlides.length
                                    )
                                  }
                                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 border border-[#E6D9EE] p-1.5 text-[#1F122B] hover:bg-white shadow-sm cursor-pointer"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                                <span className="pointer-events-none absolute bottom-2 right-2 rounded-lg bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white font-mono-num">
                                  {safeSlideIdx + 1} / {mediaSlides.length}
                                </span>
                              </>
                            )}
                          </>
                        ) : (
                          <ShoppingBag className="w-14 h-14 text-[#C084FC]" />
                        )}
                      </div>

                      {mediaSlides.length > 1 && (
                        <div className="grid grid-cols-5 gap-2">
                          {mediaSlides.map((slide, idx) => (
                            <button
                              key={`${slide.type}-${idx}-${slide.url.slice(0, 20)}`}
                              type="button"
                              onClick={() => setActiveImageIndex(idx)}
                              className={`aspect-square rounded-xl border overflow-hidden cursor-pointer transition-all flex items-center justify-center ${
                                safeSlideIdx === idx
                                  ? 'border-[#DB2777] ring-2 ring-[#DB2777]/30'
                                  : 'border-[#E6D9EE] opacity-75 hover:opacity-100'
                              } ${slide.type === 'video' ? 'bg-[#1F122B] text-white' : ''}`}
                            >
                              {slide.type === 'video' ? (
                                <div className="flex flex-col items-center justify-center gap-0.5">
                                  <Video className="w-4 h-4" />
                                  <span className="text-[9px] font-bold">Video</span>
                                </div>
                              ) : (
                                <img
                                  src={getOptimizedMediaUrl(slide.url, 'image')}
                                  alt={`Thumbnail ${idx + 1}`}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="space-y-4">
                  <div className="space-y-2 rounded-2xl border border-[#EFE2F5] bg-white p-4">
                    <div className="text-xs font-semibold text-[#7E22CE]">
                      {selectedProduct.category}
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-display-serif text-xl sm:text-2xl font-bold text-[#1F122B] leading-snug flex-1">
                        {selectedProduct.name}
                      </h2>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => toggleFavoriteProduct(selectedProduct, e)}
                          aria-label={
                            isProductFavorited(selectedProduct)
                              ? 'Remove from Favorites'
                              : 'Save to Favorites'
                          }
                          title={
                            isProductFavorited(selectedProduct)
                              ? 'Saved in Favorites'
                              : 'Save to Favorites'
                          }
                          className={`inline-flex items-center justify-center w-10 h-10 rounded-full border transition-colors cursor-pointer ${
                            isProductFavorited(selectedProduct)
                              ? 'border-[#FBCFE8] bg-[#FDF2F8] text-[#DB2777]'
                              : 'border-[#E6D9EE] bg-[#FDFBFE] text-[#4A3B59] hover:border-[#DB2777] hover:text-[#DB2777]'
                          }`}
                        >
                          <Heart
                            className={`w-4 h-4 ${
                              isProductFavorited(selectedProduct)
                                ? 'fill-[#DB2777] text-[#DB2777]'
                                : ''
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShareProduct(selectedProduct)}
                          aria-label="Share product link"
                          title="Share"
                          className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-[#E6D9EE] bg-[#FDFBFE] text-[#6D28D9] hover:border-[#9333EA] hover:bg-[#FAF5FF] transition-colors cursor-pointer"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-baseline gap-2.5 flex-wrap font-mono-num pt-1">
                      <span className="text-2xl font-bold text-[#1F122B]">
                        {formatCurrency(selectedProduct.price, sym)}
                      </span>
                      {selectedProduct.originalPrice &&
                        selectedProduct.originalPrice > selectedProduct.price && (
                          <>
                            <span className="text-sm text-[#8E7C9E] line-through">
                              {formatCurrency(selectedProduct.originalPrice, sym)}
                            </span>
                            <span className="text-xs font-bold text-[#15803D]">
                              {Math.round(
                                ((selectedProduct.originalPrice -
                                  selectedProduct.price) /
                                  selectedProduct.originalPrice) *
                                  100
                              )}
                              % OFF
                            </span>
                          </>
                        )}
                    </div>

                    {(() => {
                      const canonicalId =
                        selectedProduct.catalogProductId || selectedProduct.id;
                      const summary = ratingSummaryByProductId.get(canonicalId);
                      if (!summary) return null;
                      return (
                        <div className="text-xs font-mono-num font-bold text-[#B45309]">
                          ★ {summary.avg.toFixed(1)} · {summary.count}{' '}
                          {summary.count === 1 ? 'review' : 'reviews'}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Verified Seller Info + Follow + View Store (Public Store Info Only) */}
                  {selectedProduct.sellerId &&
                    approvedSellerIdsSet.has(selectedProduct.sellerId) && (() => {
                      const sid = selectedProduct.sellerId!;
                      const sellerProf = sellerPaymentProfiles[sid];
                      const sellerDisplayName =
                        sellerProf?.sellerName ||
                        selectedProduct.sellerName ||
                        'Verified Seller';
                      const isFollowing = followedSellerIdsSet.has(sid);
                      const followers = followerCountsBySeller[sid] || 0;
                      return (
                        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-3.5 flex flex-wrap items-center justify-between gap-2.5">
                          <button
                            type="button"
                            onClick={(e) => openSellerProfile(sid, e)}
                            className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
                          >
                            <div className="w-10 h-10 rounded-xl border border-[#D8B4FE] bg-[#FDF9FE] overflow-hidden shrink-0 flex items-center justify-center">
                              {sellerProf?.sellerPhotoDataUrl ? (
                                <img
                                  src={getOptimizedMediaUrl(
                                    sellerProf.sellerPhotoDataUrl,
                                    'image'
                                  )}
                                  alt={sellerDisplayName}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Store className="w-4 h-4 text-[#7E22CE]" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[#1F122B] group-hover:text-[#7E22CE] truncate">
                                {sellerDisplayName}
                              </div>
                              <div className="text-[11px] text-[#6B5B7B] font-mono-num">
                                {followers}{' '}
                                {followers === 1 ? 'Follower' : 'Followers'} ·
                                View Store
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={followBusySellerId === sid}
                              onClick={(e) => handleToggleFollowAction(sid, e)}
                              className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 ${
                                isFollowing
                                  ? 'border border-[#7E22CE] bg-[#FAF5FF] text-[#6D28D9]'
                                  : 'bg-[#7E22CE] text-white hover:opacity-95'
                              }`}
                            >
                              {isFollowing ? (
                                <>
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>Following</span>
                                </>
                              ) : (
                                <>
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>Follow</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => openSellerProfile(sid, e)}
                              className="inline-flex items-center gap-1 rounded-xl border border-[#E6D9EE] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] cursor-pointer"
                            >
                              <Store className="w-3.5 h-3.5 text-[#DB2777]" />
                              <span>Store</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                  {(selectedProduct.size ||
                    selectedProduct.color ||
                    selectedProduct.stockQty !== undefined) && (
                    <div className="rounded-2xl border border-[#EFE2F5] bg-white p-3.5 space-y-1 text-xs text-[#4A3B59]">
                      {selectedProduct.size && (
                        <div>
                          Size: <strong>{selectedProduct.size}</strong>
                        </div>
                      )}
                      {selectedProduct.color && (
                        <div>
                          Color: <strong>{selectedProduct.color}</strong>
                        </div>
                      )}
                      {selectedProduct.stockQty !== undefined && (
                        <div
                          className={
                            selectedProduct.stockQty > 0
                              ? 'text-[#15803D] font-semibold'
                              : 'text-[#B45309] font-semibold'
                          }
                        >
                          {selectedProduct.stockQty > 0
                            ? `In Stock (${selectedProduct.stockQty} available)`
                            : 'Made to order / Limited stock'}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedProduct.description && (
                    <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4 space-y-1.5">
                      <div className="text-xs font-bold text-[#4A3B59]">
                        Product Information
                      </div>
                      <p className="text-xs sm:text-sm text-[#5B4B6B] leading-relaxed whitespace-pre-line">
                        {selectedProduct.description}
                      </p>
                    </div>
                  )}

                  {/* Quantity Selector */}
                  <div className="rounded-2xl border border-[#EFE2F5] bg-white px-4 py-3 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-[#4A3B59]">
                      Select Quantity
                    </span>
                    <div className="inline-flex items-center rounded-xl border border-[#E6D9EE] bg-[#FDFBFE]">
                      <button
                        type="button"
                        onClick={() =>
                          setOrderQty(String(Math.max(1, parsedQty - 1)))
                        }
                        aria-label="Decrease quantity"
                        className="p-2 text-[#5B4B6B] hover:text-[#1F122B] cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={orderQty}
                        onChange={(e) =>
                          setOrderQty(
                            sanitizeNumericInput(e.target.value, {
                              allowDecimal: false,
                            })
                          )
                        }
                        className="w-10 text-center text-sm font-mono-num font-bold text-[#1F122B] bg-transparent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setOrderQty(String(parsedQty + 1))}
                        aria-label="Increase quantity"
                        className="p-2 text-[#5B4B6B] hover:text-[#1F122B] cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {orderError && (
                    <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2 text-xs font-medium text-[#BE123C]">
                      {orderError}
                    </div>
                  )}
                </div>

                {/* Product Ratings & Customer Reviews Section */}
                {(() => {
                  const canonicalId =
                    selectedProduct.catalogProductId || selectedProduct.id;
                  const itemReviews = reviewsByProductId.get(canonicalId) || [];
                  const summary = ratingSummaryByProductId.get(canonicalId);
                  return (
                    <div className="md:col-span-2 pt-5 border-t border-[#F4ECF8] space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-2 text-sm font-bold text-[#1F122B]">
                          <MessageSquare className="w-4 h-4 text-[#7E22CE]" />
                          <span>
                            Ratings &amp; Customer Reviews ({itemReviews.length})
                          </span>
                        </div>
                        {summary && (
                          <span className="text-xs font-mono-num font-bold text-[#B45309]">
                            Average: ★ {summary.avg.toFixed(1)} / 5
                          </span>
                        )}
                      </div>

                      <form
                        onSubmit={handleSubmitReviewForm}
                        className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FE] p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#4A3B59]">
                            Rate &amp; Review this Product
                          </span>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((starVal) => (
                              <button
                                key={starVal}
                                type="button"
                                onClick={() => setReviewRating(starVal)}
                                aria-label={`Rate ${starVal} star${starVal > 1 ? 's' : ''}`}
                                className="p-0.5 cursor-pointer"
                              >
                                <Star
                                  className={`w-5 h-5 ${
                                    starVal <= reviewRating
                                      ? 'text-[#F59E0B] fill-[#F59E0B]'
                                      : 'text-[#D6C9E0]'
                                  }`}
                                />
                              </button>
                            ))}
                            <span className="ml-1.5 text-xs font-mono-num font-bold text-[#4A3B59]">
                              {reviewRating}/5
                            </span>
                          </div>
                        </div>

                        {reviewError && (
                          <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs font-medium text-[#BE123C]">
                            {reviewError}
                          </div>
                        )}

                        <textarea
                          rows={2}
                          maxLength={1000}
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          placeholder="Share your honest review about quality, sizing, or delivery..."
                          className="w-full rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs sm:text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                        />

                        <div className="flex flex-wrap items-center gap-2.5">
                          <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            <span>
                              {uploadingReviewMedia
                                ? `Uploading${reviewMediaProgress !== null ? ` ${reviewMediaProgress}%` : ''}...`
                                : reviewMediaUrl
                                  ? 'Change Photo / Video'
                                  : 'Attach Photo / Video (Optional)'}
                            </span>
                            <input
                              type="file"
                              accept="image/*,video/*"
                              disabled={uploadingReviewMedia}
                              onChange={handleUploadReviewMedia}
                              className="sr-only"
                            />
                          </label>

                          {reviewMediaUrl && (
                            <div className="flex items-center gap-2">
                              {isVideoUrl(reviewMediaUrl, reviewMediaType) ? (
                                <video
                                  src={getOptimizedMediaUrl(reviewMediaUrl, 'video')}
                                  controls
                                  playsInline
                                  className="w-16 h-12 rounded-lg object-cover border border-[#D8B4FE] bg-black"
                                />
                              ) : (
                                <img
                                  src={getOptimizedMediaUrl(reviewMediaUrl, 'image')}
                                  alt="Review attachment preview"
                                  referrerPolicy="no-referrer"
                                  className="w-12 h-12 rounded-lg object-cover border border-[#D8B4FE]"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setReviewMediaUrl('');
                                  setReviewMediaType(undefined);
                                  setReviewMediaRecord(undefined);
                                }}
                                className="text-[11px] font-semibold text-[#BE123C] cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-[#6B5B7B]">
                            {loggedInCustomer
                              ? `Posting as ${loggedInCustomer.name}`
                              : 'Sign in required to post your review.'}
                          </span>
                          <button
                            type="submit"
                            disabled={reviewSubmitting || uploadingReviewMedia}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-bold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
                          >
                            <Star className="w-3.5 h-3.5 fill-current" />
                            <span>
                              {reviewSubmitting
                                ? 'Posting...'
                                : 'Post Rating & Review'}
                            </span>
                          </button>
                        </div>
                      </form>

                      {itemReviews.length === 0 ? (
                        <p className="text-xs text-[#6B5B7B]">
                          No reviews yet. Be the first customer to review this product.
                        </p>
                      ) : (
                        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                          {itemReviews.map((rev) => (
                            <div
                              key={rev.id}
                              className="rounded-2xl border border-[#EFE2F5] bg-white p-3 space-y-1.5 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-[#1F122B]">
                                  {rev.customerName}
                                </span>
                                <span className="text-[#D97706] font-mono-num font-bold">
                                  {'★'.repeat(rev.rating)}
                                  <span className="text-[#D6C9E0]">
                                    {'★'.repeat(Math.max(0, 5 - rev.rating))}
                                  </span>
                                </span>
                              </div>
                              <p className="text-[#4A3B59] leading-relaxed">
                                {rev.comment}
                              </p>
                              {rev.mediaUrl && (
                                <div className="pt-1">
                                  {isVideoUrl(rev.mediaUrl, rev.mediaType) ? (
                                    <video
                                      src={getOptimizedMediaUrl(rev.mediaUrl, 'video')}
                                      controls
                                      playsInline
                                      className="max-h-44 rounded-xl border border-[#EFE2F5] bg-black"
                                    />
                                  ) : (
                                    <img
                                      src={getOptimizedMediaUrl(rev.mediaUrl, 'image')}
                                      alt={`Review media by ${rev.customerName}`}
                                      referrerPolicy="no-referrer"
                                      className="max-h-40 rounded-xl border border-[#EFE2F5] object-cover"
                                    />
                                  )}
                                </div>
                              )}
                              <div className="text-[10px] text-[#8E7C9E] font-mono-num">
                                {rev.createdAt.slice(0, 10)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* STEP 2: AUTHENTICATED CUSTOMER CHECKOUT & PAYMENT */}
            {modalStep === 'checkout' && (
              <form onSubmit={handlePlaceOrder} className="p-5 sm:p-6 space-y-5">
                {/* Item & Total Summary Breakdown */}
                <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FC] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl border border-[#EFE2F5] bg-white overflow-hidden shrink-0 flex items-center justify-center">
                        {selectedProduct.imageDataUrl ? (
                          <img
                            src={getOptimizedMediaUrl(
                              selectedProduct.imageDataUrl,
                              'image'
                            )}
                            alt={selectedProduct.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ShoppingBag className="w-5 h-5 text-[#C084FC]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#1F122B] truncate">
                          {selectedProduct.name}
                        </div>
                        <div className="text-xs text-[#6B5B7B] font-mono-num">
                          Qty: {parsedQty} ×{' '}
                          {formatCurrency(selectedProduct.price, sym)}
                        </div>
                      </div>
                    </div>
                    <div className="font-mono-num text-base font-bold text-[#7E22CE] shrink-0">
                      {formatCurrency(checkoutTotal, sym)}
                    </div>
                  </div>

                  <div className="border-t border-[#F4ECF8] pt-2 space-y-1 text-xs">
                    <div className="flex justify-between text-[#5B4B6B]">
                      <span>Item Subtotal</span>
                      <span className="font-mono-num font-semibold text-[#1F122B]">
                        {formatCurrency(checkoutSubtotal, sym)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#5B4B6B]">
                      <span>
                        Delivery Fee{' '}
                        {paymentMethod === 'COD'
                          ? `(COD ₹${COD_DELIVERY_CHARGE_PER_ITEM} × ${parsedQty})`
                          : '(Online UPI Free)'}
                      </span>
                      <span
                        className={`font-mono-num font-semibold ${
                          codDeliveryCharge > 0 ? 'text-[#B45309]' : 'text-[#15803D]'
                        }`}
                      >
                        {codDeliveryCharge > 0
                          ? `+ ${formatCurrency(codDeliveryCharge, sym)}`
                          : 'FREE'}
                      </span>
                    </div>
                  </div>
                </div>

                {orderError && (
                  <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C]">
                    {orderError}
                  </div>
                )}

                {/* Customer Info (Pre-filled from logged-in account) */}
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-[#4A3B59]">
                    Customer &amp; Delivery Details
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                        Full Name <span className="text-[#DB2777]">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Your full name"
                        className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                        Phone Number <span className="text-[#DB2777]">*</span>
                      </label>
                      <div className="flex items-stretch rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] overflow-hidden focus-within:border-[#9333EA] focus-within:bg-white">
                        <span className="inline-flex items-center px-3 bg-[#F6EFFA] border-r border-[#E6D9EE] text-xs font-mono-num font-bold text-[#6D28D9] select-none shrink-0">
                          +91
                        </span>
                        <input
                          type="tel"
                          inputMode="tel"
                          required
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="9876543210"
                          className="w-full bg-transparent px-3 py-2 text-sm font-mono-num text-[#1F122B] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      Full Delivery Address{' '}
                      <span className="text-[#DB2777]">*</span>
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="House/Flat No, Street, Landmark, Area..."
                      className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        value={customerCity}
                        onChange={(e) => setCustomerCity(e.target.value)}
                        placeholder="City"
                        className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                        State
                      </label>
                      <input
                        type="text"
                        value={customerState}
                        onChange={(e) => setCustomerState(e.target.value)}
                        placeholder="State"
                        className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                        PIN Code
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={customerPinCode}
                        onChange={(e) =>
                          setCustomerPinCode(
                            sanitizeNumericInput(e.target.value, {
                              allowDecimal: false,
                            })
                          )
                        }
                        placeholder="700001"
                        className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                        WhatsApp Number (if different)
                      </label>
                      <div className="flex items-stretch rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] overflow-hidden focus-within:border-[#9333EA] focus-within:bg-white">
                        <span className="inline-flex items-center px-3 bg-[#F6EFFA] border-r border-[#E6D9EE] text-xs font-mono-num font-bold text-[#6D28D9] select-none shrink-0">
                          +91
                        </span>
                        <input
                          type="tel"
                          inputMode="tel"
                          value={customerWhatsapp}
                          onChange={(e) => setCustomerWhatsapp(e.target.value)}
                          placeholder="Optional"
                          className="w-full bg-transparent px-3 py-2 text-sm font-mono-num text-[#1F122B] focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                        Order Note / Size Note (optional)
                      </label>
                      <input
                        type="text"
                        value={customerNote}
                        onChange={(e) => setCustomerNote(e.target.value)}
                        placeholder="e.g. Size M preferred"
                        className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Payment Method Selection */}
                <div className="space-y-3 pt-2 border-t border-[#F4ECF8]">
                  <div className="text-xs font-bold uppercase tracking-wide text-[#4A3B59]">
                    Select Payment Method
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethod('COD');
                        setOrderError('');
                      }}
                      className={`rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
                        paymentMethod === 'COD'
                          ? 'border-[#7E22CE] bg-[#FAF5FF] ring-1 ring-[#7E22CE]'
                          : 'border-[#E6D9EE] bg-white hover:border-[#C084FC]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#1F122B]">
                          Cash on Delivery (COD)
                        </span>
                        <Truck className="w-4 h-4 text-[#7E22CE]" />
                      </div>
                      <p className="text-xs text-[#6B5B7B] mt-1">
                        Pay when your order arrives.{' '}
                        <strong className="text-[#B45309]">
                          + ₹{COD_DELIVERY_CHARGE_PER_ITEM}/item delivery fee
                        </strong>
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethod('UPI');
                        setOrderError('');
                      }}
                      className={`rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
                        paymentMethod === 'UPI'
                          ? 'border-[#7E22CE] bg-[#FAF5FF] ring-1 ring-[#7E22CE]'
                          : 'border-[#E6D9EE] bg-white hover:border-[#C084FC]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#1F122B]">
                          Online Payment (UPI)
                        </span>
                        <CreditCard className="w-4 h-4 text-[#DB2777]" />
                      </div>
                      <p className="text-xs text-[#6B5B7B] mt-1">
                        Pay via UPI &amp; upload screenshot.{' '}
                        <strong className="text-[#15803D]">
                          ₹0 delivery fee
                        </strong>
                      </p>
                    </button>
                  </div>

                  {paymentMethod === 'UPI' && (
                    <div className="rounded-2xl border border-[#E9D5FF] bg-[#FDF9FF] p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#7E22CE] bg-white border border-[#E6D9EE] rounded-md px-2 py-0.5">
                            <span>
                              {selectedEffectivePayment.source === 'product'
                                ? 'Product Custom Payment'
                                : selectedEffectivePayment.source === 'seller'
                                  ? 'Seller Payment'
                                  : 'Store Payment'}
                            </span>
                            <span>·</span>
                            <span>{selectedEffectivePayment.recipientName}</span>
                          </div>
                          <div className="text-[11px] font-semibold text-[#6B5B7B] pt-1">
                            Pay {formatCurrency(checkoutSubtotal, sym)}
                            {selectedEffectivePayment.upiId
                              ? ' to UPI ID:'
                              : ' via Bank / QR Details:'}
                          </div>
                          {selectedEffectivePayment.upiId && (
                            <div className="font-mono-num text-base font-bold text-[#6D28D9] select-all">
                              {selectedEffectivePayment.upiId}
                            </div>
                          )}
                          {selectedEffectivePayment.upiNumber && (
                            <div className="text-[11px] font-mono-num text-[#4A3B59]">
                              UPI Number:{' '}
                              <strong>{selectedEffectivePayment.upiNumber}</strong>
                            </div>
                          )}
                        </div>

                        {selectedEffectivePayment.upiId && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyUpi(selectedEffectivePayment.upiId)
                              }
                              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-white px-3 py-1.5 text-xs font-semibold text-[#7E22CE] hover:bg-[#FAF5FF] cursor-pointer whitespace-nowrap"
                            >
                              {upiCopied ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-[#15803D]" />
                                  <span className="text-[#15803D]">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy UPI ID</span>
                                </>
                              )}
                            </button>

                            {upiDeepLink && (
                              <a
                                href={upiDeepLink}
                                className="inline-flex items-center gap-1 rounded-xl bg-[#7E22CE] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap"
                              >
                                <span>Pay App</span>
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      {(selectedEffectivePayment.bankAccountNo ||
                        selectedEffectivePayment.bankAccountName ||
                        selectedEffectivePayment.bankName ||
                        selectedEffectivePayment.bankIfscBranch ||
                        selectedEffectivePayment.qrDataUrl) && (
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-start pt-2 border-t border-[#EFE2F5]">
                          {(selectedEffectivePayment.bankAccountNo ||
                            selectedEffectivePayment.bankAccountName ||
                            selectedEffectivePayment.bankName ||
                            selectedEffectivePayment.bankIfscBranch) && (
                            <div className="rounded-xl border border-[#EFE2F5] bg-white p-2.5 text-[11px] text-[#4A3B59] space-y-0.5">
                              <div className="font-bold text-[#1F122B]">
                                Bank Transfer Details
                              </div>
                              {selectedEffectivePayment.bankAccountName && (
                                <div>
                                  Holder:{' '}
                                  <strong>
                                    {selectedEffectivePayment.bankAccountName}
                                  </strong>
                                </div>
                              )}
                              {selectedEffectivePayment.bankName && (
                                <div>
                                  Bank:{' '}
                                  <strong>
                                    {selectedEffectivePayment.bankName}
                                  </strong>
                                </div>
                              )}
                              {selectedEffectivePayment.bankAccountNo && (
                                <div className="font-mono-num">
                                  A/C:{' '}
                                  <strong>
                                    {selectedEffectivePayment.bankAccountNo}
                                  </strong>
                                </div>
                              )}
                              {selectedEffectivePayment.bankIfscBranch && (
                                <div className="font-mono-num">
                                  IFSC / Branch:{' '}
                                  <strong>
                                    {selectedEffectivePayment.bankIfscBranch}
                                  </strong>
                                </div>
                              )}
                            </div>
                          )}

                          {selectedEffectivePayment.qrDataUrl && (
                            <div className="rounded-xl border border-[#EFE2F5] bg-white p-2 text-center">
                              <div className="inline-flex items-center gap-1 text-[10px] font-bold text-[#6D28D9] mb-1">
                                <QrCode className="w-3 h-3" />
                                <span>Scan QR</span>
                              </div>
                              <img
                                src={getOptimizedMediaUrl(
                                  selectedEffectivePayment.qrDataUrl,
                                  'image'
                                )}
                                alt="Payment QR Code"
                                referrerPolicy="no-referrer"
                                className="w-28 h-28 object-contain rounded-lg mx-auto"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      <div className="pt-2 border-t border-[#EFE2F5] space-y-2">
                        <div className="text-xs font-semibold text-[#4A3B59]">
                          Upload Payment Screenshot{' '}
                          <span className="text-[#DB2777]">*</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-white px-3.5 py-2 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer whitespace-nowrap">
                            <Upload className="w-3.5 h-3.5" />
                            <span>
                              {uploadingScreenshot
                                ? `Uploading${uploadingScreenshotProgress !== null ? ` ${uploadingScreenshotProgress}%` : ''}...`
                                : upiScreenshotDataUrl
                                  ? 'Change Screenshot'
                                  : 'Upload Screenshot'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingScreenshot}
                              onChange={handleUploadUpiScreenshot}
                              className="sr-only"
                            />
                          </label>

                          {upiScreenshotDataUrl && (
                            <div className="flex items-center gap-2">
                              <img
                                src={getOptimizedMediaUrl(upiScreenshotDataUrl, 'image')}
                                alt="Uploaded UPI payment screenshot"
                                referrerPolicy="no-referrer"
                                className="w-10 h-10 rounded-lg object-cover border border-[#D8B4FE]"
                              />
                              <span className="text-xs font-semibold text-[#15803D] inline-flex items-center gap-1">
                                <ImageIcon className="w-3.5 h-3.5" />
                                Attached
                              </span>
                              <button
                                type="button"
                                onClick={() => setUpiScreenshotDataUrl('')}
                                className="text-xs font-semibold text-[#BE123C] cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                          <span className="text-[11px] text-[#6B5B7B]">
                            Saved to Cloudinary
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#F4ECF8]">
                  <button
                    type="button"
                    onClick={() => setModalStep('detail')}
                    className="rounded-xl border border-[#E6D9EE] px-4 py-2.5 text-xs font-semibold text-[#5B4B6B] cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={orderSubmitting || uploadingScreenshot}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-6 py-2.5 text-xs sm:text-sm font-bold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {orderSubmitting
                        ? 'Placing Order...'
                        : `Place Order (${formatCurrency(checkoutTotal, sym)})`}
                    </span>
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: ORDER PLACED CONFIRMATION */}
            {modalStep === 'success' && placedOrder && (
              <div className="p-6 sm:p-8 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] text-[#15803D] flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div className="space-y-1">
                  <h3 className="font-display-serif text-2xl font-bold text-[#1F122B]">
                    Order Placed!
                  </h3>
                  <p className="text-xs sm:text-sm text-[#6B5B7B]">
                    Order{' '}
                    <strong className="font-mono-num text-[#6D28D9]">
                      {placedOrder.orderNumber}
                    </strong>{' '}
                    has been saved to your account.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FC] p-4 text-left text-xs space-y-1.5 max-w-md mx-auto">
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6B5B7B]">Item</span>
                    <span className="font-bold text-[#1F122B]">
                      {placedOrder.productName} × {placedOrder.quantity}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6B5B7B] inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Order Date
                    </span>
                    <span className="font-mono-num font-semibold text-[#1F122B]">
                      {placedOrder.orderDate ||
                        placedOrder.createdAt.slice(0, 10)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6B5B7B] inline-flex items-center gap-1">
                      <Truck className="w-3 h-3" />
                      Est. Delivery
                    </span>
                    <span className="font-mono-num font-bold text-[#15803D]">
                      {placedOrder.estimatedDeliveryDate || 'Within 5 days'}
                    </span>
                  </div>
                  {(placedOrder.deliveryCharge || 0) > 0 && (
                    <div className="flex justify-between gap-2">
                      <span className="text-[#6B5B7B]">COD Delivery Fee</span>
                      <span className="font-mono-num font-semibold text-[#B45309]">
                        + {formatCurrency(placedOrder.deliveryCharge || 0, sym)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6B5B7B]">Total Payable</span>
                    <span className="font-mono-num font-bold text-[#7E22CE]">
                      {formatCurrency(placedOrder.totalAmount, sym)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6B5B7B]">Payment</span>
                    <span className="font-semibold text-[#1F122B]">
                      {placedOrder.paymentMethod === 'UPI'
                        ? 'Online Payment (UPI)'
                        : 'Cash on Delivery (COD)'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2 pt-1 border-t border-[#F4ECF8]">
                    <span className="text-[#6B5B7B] inline-flex items-center gap-1 shrink-0">
                      <MapPin className="w-3 h-3" />
                      Address
                    </span>
                    <span className="text-right text-[#1F122B]">
                      {[
                        placedOrder.customerAddress,
                        placedOrder.customerCity,
                        placedOrder.customerPinCode,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-[#6B5B7B] max-w-md mx-auto">
                  Once confirmed by our team, your official bill/invoice will appear automatically in your Account &rarr; Bills tab.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      closeProductModal();
                      setAccountTab('orders');
                      setPortalView('account');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>View My Orders &amp; Bills</span>
                  </button>
                  <button
                    type="button"
                    onClick={closeProductModal}
                    className="rounded-xl border border-[#E6D9EE] bg-white px-5 py-2.5 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] cursor-pointer"
                  >
                    Continue Shopping
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>

          {/* Sticky Bottom Action Bar on Product Details View (Equal-Width Add to Cart | Buy Now) */}
          {modalStep === 'detail' && (
            <div className="shrink-0 sticky bottom-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#EFE2F5] shadow-[0_-4px_20px_rgba(31,18,43,0.08)] px-3 sm:px-6 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <div className="max-w-5xl mx-auto grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={addingToCart}
                  onClick={() =>
                    handleAddToCartAction(selectedProduct, parsedQty)
                  }
                  className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#7E22CE] bg-white px-4 text-sm font-bold text-[#6D28D9] hover:bg-[#FAF5FF] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 whitespace-nowrap"
                >
                  <ShoppingCart className="w-4 h-4 shrink-0" />
                  <span>{addingToCart ? 'Adding...' : 'Add to Cart'}</span>
                </button>

                <button
                  type="button"
                  onClick={openCheckoutStep}
                  className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 text-sm font-bold text-white shadow-sm hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
                >
                  <ShoppingBag className="w-4 h-4 shrink-0" />
                  <span>Buy Now</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Menu Sheet Drawer (Seller Hub, Help Center, Refer & Earn) */}
      {menuSheetOpen && (
        <div
          className="no-print fixed inset-0 z-[45] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Store Menu"
          onClick={() =>
            popCustomerOverlayOrReset(
              prevCustomerSnapRef.current.activeSheet === 'menu',
              () => setMenuSheetOpen(false)
            )
          }
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-[#EFE2F5] bg-white shadow-2xl p-4 pb-24 sm:p-5 space-y-2"
          >
            <div className="w-10 h-1 rounded-full bg-[#D6C9E0] mx-auto mb-2 sm:hidden" />
            <div className="flex items-center justify-between px-1 pb-2 border-b border-[#F4ECF8]">
              <h2 className="font-display-serif text-base font-bold text-[#1F122B]">
                Menu
              </h2>
              <button
                type="button"
                onClick={() =>
                  popCustomerOverlayOrReset(
                    prevCustomerSnapRef.current.activeSheet === 'menu',
                    () => setMenuSheetOpen(false)
                  )
                }
                aria-label="Close menu"
                className="p-1.5 rounded-full text-[#6B5B7B] hover:bg-[#FAF5FF] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setMenuSheetOpen(false);
                setPortalView('seller-hub');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`w-full min-h-[52px] flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors cursor-pointer ${
                portalView === 'seller-hub'
                  ? 'bg-[#FAF5FF] text-[#6D28D9]'
                  : 'hover:bg-[#FDF8FC] text-[#1F122B]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FDF2F8] text-[#DB2777] flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold">Seller Hub</div>
                  <div className="text-[11px] text-[#6B5B7B]">
                    Become a seller or manage your storefront products
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8E7C9E]" />
            </button>

            <button
              type="button"
              onClick={() => {
                setMenuSheetOpen(false);
                setPortalView('help-center');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`w-full min-h-[52px] flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors cursor-pointer ${
                portalView === 'help-center'
                  ? 'bg-[#FAF5FF] text-[#6D28D9]'
                  : 'hover:bg-[#FDF8FC] text-[#1F122B]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F3E8FF] text-[#7E22CE] flex items-center justify-center shrink-0">
                  <LifeBuoy className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold">Help Center</div>
                  <div className="text-[11px] text-[#6B5B7B]">
                    Chat with customer support &amp; track inquiries
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8E7C9E]" />
            </button>

            <button
              type="button"
              onClick={() => {
                setMenuSheetOpen(false);
                setPortalView('refer-earn');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`w-full min-h-[52px] flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors cursor-pointer ${
                portalView === 'refer-earn'
                  ? 'bg-[#FAF5FF] text-[#6D28D9]'
                  : 'hover:bg-[#FDF8FC] text-[#1F122B]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F0FDF4] text-[#15803D] flex items-center justify-center shrink-0">
                  <Gift className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold">Refer &amp; Earn</div>
                  <div className="text-[11px] text-[#6B5B7B]">
                    Share your personal referral code and earn rewards
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8E7C9E]" />
            </button>

            <PWAInstallButton
              variant="menu-card"
              onActionComplete={() => setMenuSheetOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Categories Sheet Drawer */}
      {categoriesSheetOpen && (
        <div
          className="no-print fixed inset-0 z-[45] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Browse Categories"
          onClick={() =>
            popCustomerOverlayOrReset(
              prevCustomerSnapRef.current.activeSheet === 'categories',
              () => setCategoriesSheetOpen(false)
            )
          }
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-[#EFE2F5] bg-white shadow-2xl p-4 pb-24 sm:p-5 space-y-3 max-h-[82vh] overflow-y-auto"
          >
            <div className="w-10 h-1 rounded-full bg-[#D6C9E0] mx-auto sm:hidden" />
            <div className="flex items-center justify-between px-1 pb-2 border-b border-[#F4ECF8]">
              <h2 className="font-display-serif text-base font-bold text-[#1F122B]">
                Product Categories
              </h2>
              <button
                type="button"
                onClick={() =>
                  popCustomerOverlayOrReset(
                    prevCustomerSnapRef.current.activeSheet === 'categories',
                    () => setCategoriesSheetOpen(false)
                  )
                }
                aria-label="Close categories"
                className="p-1.5 rounded-full text-[#6B5B7B] hover:bg-[#FAF5FF] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setCategoriesSheetOpen(false);
                  handleSelectShoppingCategory('ALL');
                  scrollToCategoriesSection();
                }}
                className={`min-h-[48px] rounded-2xl border px-3.5 py-2.5 text-left transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                  shoppingCategory === 'ALL'
                    ? 'border-[#7E22CE] bg-[#FAF5FF] text-[#6D28D9]'
                    : 'border-[#EFE2F5] bg-[#FDFBFE] text-[#1F122B] hover:border-[#9333EA]'
                }`}
              >
                <span className="text-xs font-bold truncate">All Categories</span>
                <span className="text-[11px] font-mono-num text-[#6B5B7B]">
                  {shoppingItems.length}
                </span>
              </button>

              {PRODUCT_CATEGORIES.map((cat) => {
                const count = shoppingItems.filter((i) => i.category === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setCategoriesSheetOpen(false);
                      handleSelectShoppingCategory(cat);
                      scrollToCategoriesSection();
                    }}
                    className={`min-h-[48px] rounded-2xl border px-3.5 py-2.5 text-left transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                      shoppingCategory === cat
                        ? 'border-[#DB2777] bg-[#FDF2F8] text-[#DB2777]'
                        : 'border-[#EFE2F5] bg-[#FDFBFE] text-[#1F122B] hover:border-[#DB2777]'
                    }`}
                  >
                    <span className="text-xs font-bold truncate">{cat}</span>
                    <span className="text-[11px] font-mono-num text-[#6B5B7B]">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sort Sheet Drawer */}
      {sortSheetOpen && (
        <div
          className="no-print fixed inset-0 z-[45] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Sort Products"
          onClick={() =>
            popCustomerOverlayOrReset(
              prevCustomerSnapRef.current.activeSheet === 'sort',
              () => setSortSheetOpen(false)
            )
          }
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-[#EFE2F5] bg-white shadow-2xl p-4 pb-24 sm:p-5 space-y-2"
          >
            <div className="w-10 h-1 rounded-full bg-[#D6C9E0] mx-auto sm:hidden" />
            <div className="flex items-center justify-between px-1 pb-2 border-b border-[#F4ECF8]">
              <h2 className="font-display-serif text-base font-bold text-[#1F122B]">
                Sort By
              </h2>
              <button
                type="button"
                onClick={() =>
                  popCustomerOverlayOrReset(
                    prevCustomerSnapRef.current.activeSheet === 'sort',
                    () => setSortSheetOpen(false)
                  )
                }
                aria-label="Close sort"
                className="p-1.5 rounded-full text-[#6B5B7B] hover:bg-[#FAF5FF] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {(
              [
                { id: 'featured', label: 'Featured & Relevance' },
                { id: 'price_asc', label: 'Price: Low to High' },
                { id: 'price_desc', label: 'Price: High to Low' },
                { id: 'discount_desc', label: 'Highest Discount' },
                { id: 'rating_desc', label: 'Customer Rating' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setSortBy(opt.id);
                  setSortSheetOpen(false);
                }}
                className={`w-full min-h-[46px] rounded-2xl px-3.5 py-2.5 text-left text-xs sm:text-sm font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                  sortBy === opt.id
                    ? 'bg-[#FAF5FF] text-[#7E22CE] border border-[#D8B4FE]'
                    : 'text-[#1F122B] hover:bg-[#FDF8FC] border border-transparent'
                }`}
              >
                <span>{opt.label}</span>
                {sortBy === opt.id && <Check className="w-4 h-4 text-[#7E22CE]" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Gender Sheet Drawer */}
      {genderSheetOpen && (
        <div
          className="no-print fixed inset-0 z-[45] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Filter by Gender"
          onClick={() =>
            popCustomerOverlayOrReset(
              prevCustomerSnapRef.current.activeSheet === 'gender',
              () => setGenderSheetOpen(false)
            )
          }
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-[#EFE2F5] bg-white shadow-2xl p-4 pb-24 sm:p-5 space-y-2"
          >
            <div className="w-10 h-1 rounded-full bg-[#D6C9E0] mx-auto sm:hidden" />
            <div className="flex items-center justify-between px-1 pb-2 border-b border-[#F4ECF8]">
              <h2 className="font-display-serif text-base font-bold text-[#1F122B]">
                Gender
              </h2>
              <button
                type="button"
                onClick={() =>
                  popCustomerOverlayOrReset(
                    prevCustomerSnapRef.current.activeSheet === 'gender',
                    () => setGenderSheetOpen(false)
                  )
                }
                aria-label="Close gender filter"
                className="p-1.5 rounded-full text-[#6B5B7B] hover:bg-[#FAF5FF] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {(
                [
                  { id: 'ALL', label: 'All Styles' },
                  { id: 'women', label: 'Women & Girls' },
                  { id: 'men', label: 'Men' },
                  { id: 'unisex', label: 'Unisex & Gifts' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setGenderFilter(opt.id);
                    setGenderSheetOpen(false);
                  }}
                  className={`min-h-[48px] rounded-2xl border px-3.5 py-2.5 text-xs font-bold flex items-center justify-between cursor-pointer transition-colors ${
                    genderFilter === opt.id
                      ? 'border-[#DB2777] bg-[#FDF2F8] text-[#DB2777]'
                      : 'border-[#EFE2F5] bg-[#FDFBFE] text-[#1F122B] hover:border-[#9333EA]'
                  }`}
                >
                  <span>{opt.label}</span>
                  {genderFilter === opt.id && <Check className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters Sheet Drawer */}
      {filtersSheetOpen && (
        <div
          className="no-print fixed inset-0 z-[45] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Product Filters"
          onClick={() =>
            popCustomerOverlayOrReset(
              prevCustomerSnapRef.current.activeSheet === 'filters',
              () => setFiltersSheetOpen(false)
            )
          }
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-[#EFE2F5] bg-white shadow-2xl p-4 pb-24 sm:p-5 space-y-4 max-h-[84vh] overflow-y-auto"
          >
            <div className="w-10 h-1 rounded-full bg-[#D6C9E0] mx-auto sm:hidden" />
            <div className="flex items-center justify-between px-1 pb-2 border-b border-[#F4ECF8]">
              <h2 className="font-display-serif text-base font-bold text-[#1F122B]">
                Filters
              </h2>
              <button
                type="button"
                onClick={() =>
                  popCustomerOverlayOrReset(
                    prevCustomerSnapRef.current.activeSheet === 'filters',
                    () => setFiltersSheetOpen(false)
                  )
                }
                aria-label="Close filters"
                className="p-1.5 rounded-full text-[#6B5B7B] hover:bg-[#FAF5FF] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-[#4A3B59]">Price Range</div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: 'ALL', label: 'Any Price' },
                    { id: 'under_299', label: `Under ${sym}299` },
                    { id: '300_599', label: `${sym}300 – ${sym}599` },
                    { id: '600_999', label: `${sym}600 – ${sym}999` },
                    { id: '1000_plus', label: `${sym}1,000+` },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPriceRangeFilter(p.id)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      priceRangeFilter === p.id
                        ? 'border-[#7E22CE] bg-[#7E22CE] text-white'
                        : 'border-[#E6D9EE] bg-[#FDFBFE] text-[#4A3B59]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-[#4A3B59]">Minimum Discount</div>
              <div className="flex flex-wrap gap-2">
                {[0, 10, 25, 40].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setMinDiscountFilter(pct)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      minDiscountFilter === pct
                        ? 'border-[#DB2777] bg-[#DB2777] text-white'
                        : 'border-[#E6D9EE] bg-[#FDFBFE] text-[#4A3B59]'
                    }`}
                  >
                    {pct === 0 ? 'Any Discount' : `${pct}%+ OFF`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-[#4A3B59]">Customer Rating</div>
              <div className="flex flex-wrap gap-2">
                {[0, 3, 4].map((stars) => (
                  <button
                    key={stars}
                    type="button"
                    onClick={() => setMinRatingFilter(stars)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      minRatingFilter === stars
                        ? 'border-[#7E22CE] bg-[#7E22CE] text-white'
                        : 'border-[#E6D9EE] bg-[#FDFBFE] text-[#4A3B59]'
                    }`}
                  >
                    {stars === 0 ? 'All Ratings' : `${stars}★ & above`}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between rounded-2xl border border-[#EFE2F5] bg-[#FDFBFE] px-3.5 py-2.5 cursor-pointer">
              <span className="text-xs font-semibold text-[#1F122B]">
                In Stock Items Only
              </span>
              <input
                type="checkbox"
                checked={inStockOnlyFilter}
                onChange={(e) => setInStockOnlyFilter(e.target.checked)}
                className="w-4 h-4 accent-[#7E22CE]"
              />
            </label>

            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[#F4ECF8]">
              <button
                type="button"
                onClick={resetAllShoppingFilters}
                className="rounded-xl border border-[#E6D9EE] bg-white py-2.5 text-xs font-bold text-[#5B4B6B] cursor-pointer"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => setFiltersSheetOpen(false)}
                className="rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-2.5 text-xs font-bold text-white cursor-pointer"
              >
                Done ({filteredShoppingItems.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed 5-Tab Bottom Navigation Bar (Always Sticky While Scrolling) */}
      <nav
        aria-label="Primary Customer Navigation"
        className="no-print fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#EFE2F5] shadow-[0_-4px_20px_rgba(31,18,43,0.06)] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="max-w-6xl mx-auto grid grid-cols-5 items-center h-16">
          {/* 1. Menu */}
          <button
            type="button"
            onClick={() => {
              setCategoriesSheetOpen(false);
              setMenuSheetOpen((prev) => !prev);
            }}
            className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
              menuSheetOpen ||
              portalView === 'seller-hub' ||
              portalView === 'help-center' ||
              portalView === 'refer-earn'
                ? 'text-[#7E22CE]'
                : 'text-[#5B4B6B] hover:text-[#1F122B]'
            }`}
          >
            <Menu className="w-5 h-5" />
            <span className="whitespace-nowrap">Menu</span>
          </button>

          {/* 2. Home */}
          <button
            type="button"
            onClick={() => {
              setMenuSheetOpen(false);
              setCategoriesSheetOpen(false);
              setPortalView('shop');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
              portalView === 'shop' && !menuSheetOpen && !categoriesSheetOpen
                ? 'text-[#DB2777]'
                : 'text-[#5B4B6B] hover:text-[#1F122B]'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="whitespace-nowrap">Home</span>
          </button>

          {/* 3. Categories */}
          <button
            type="button"
            onClick={() => {
              setMenuSheetOpen(false);
              setCategoriesSheetOpen((prev) => !prev);
              scrollToCategoriesSection();
            }}
            className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
              categoriesSheetOpen
                ? 'text-[#DB2777]'
                : 'text-[#5B4B6B] hover:text-[#1F122B]'
            }`}
          >
            <LayoutGrid className="w-5 h-5" />
            <span className="whitespace-nowrap">Categories</span>
          </button>

          {/* 4. Cart */}
          <button
            type="button"
            onClick={() => {
              setMenuSheetOpen(false);
              setCategoriesSheetOpen(false);
              handleOpenAccount('cart');
            }}
            className={`relative h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
              portalView === 'account' && accountTab === 'cart'
                ? 'text-[#DB2777]'
                : 'text-[#5B4B6B] hover:text-[#1F122B]'
            }`}
          >
            <div className="relative">
              <ShoppingCart className="w-5 h-5" />
              {cartItemCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[#DB2777] text-white text-[9px] font-mono-num font-bold flex items-center justify-center">
                  {cartItemCount > 99 ? '99+' : cartItemCount}
                </span>
              )}
            </div>
            <span className="whitespace-nowrap">Cart</span>
          </button>

          {/* 5. My Orders */}
          <button
            type="button"
            onClick={() => {
              setMenuSheetOpen(false);
              setCategoriesSheetOpen(false);
              handleOpenAccount('orders');
            }}
            className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
              portalView === 'account' &&
              (accountTab === 'orders' || accountTab === 'bills')
                ? 'text-[#7E22CE]'
                : 'text-[#5B4B6B] hover:text-[#1F122B]'
            }`}
          >
            <Package className="w-5 h-5" />
            <span className="whitespace-nowrap">My Orders</span>
          </button>
        </div>
      </nav>

      {/* Customer Google Sign-In & Quick Onboarding Modal */}
      <CustomerAuthModal
        open={authModalOpen}
        noticeBanner={authNotice}
        initialOnboardingUser={pendingOnboardingUser}
        onClose={() =>
          popCustomerOverlayOrReset(
            prevCustomerSnapRef.current.authModalOpen,
            () => {
              setAuthModalOpen(false);
              setPendingAction(null);
              setPendingOnboardingUser(null);
              setAuthNotice('');
            }
          )
        }
        onSuccess={handleCustomerAuthSuccess}
      />

      {/* Offline Status Indicator & Storefront Notification Toast */}
      <OfflineIndicator />
      {storeNotice && (
        <div className="no-print fixed bottom-20 right-4 z-[55] rounded-xl bg-[#1F122B] text-white px-4 py-2.5 text-xs font-semibold shadow-lg border border-[#A855F7]/40">
          {storeNotice}
        </div>
      )}
    </div>
  );
};
