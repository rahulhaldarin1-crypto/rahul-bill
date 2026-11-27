import {
  CategoryInterestEntry,
  Client,
  CustomerCartItem,
  CustomerEngagementProfile,
  HighlightPlacementRule,
  Product,
} from '../types/business';

export type SmartInteractionType = 'view' | 'wishlist' | 'cart' | 'order';

export const INTERACTION_WEIGHTS: Record<SmartInteractionType, number> = {
  view: 1,
  wishlist: 3,
  cart: 5,
  order: 5,
};

const LOCAL_SMART_PROFILE_KEY = 'gg_smart_discovery_profile_v1';
const LOCAL_VISITOR_SEED_KEY = 'gg_smart_visitor_seed_v1';
const SESSION_ROTATION_KEY = 'gg_smart_session_rot_v1';
const LOCAL_IMPRESSIONS_KEY = 'gg_smart_impressions_v1';
const LOCAL_RECENTLY_VIEWED_KEY = 'gg_recently_viewed_v1';

interface LocalImpressionStore {
  bucket: number;
  counts: Record<string, number>;
}

export interface SmartDiscoverableItem {
  id: string;
  catalogProductId?: string;
  productNumber?: string;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  highlighted?: boolean;
  highlightPlacement?: HighlightPlacementRule;
  boosted?: boolean;
  boostLevel?: number;
  boostExpiresAt?: string;
  size?: string;
  color?: string;
  stockQty?: number;
  description?: string;
  sellerId?: string;
  sellerName?: string;
  viewCount?: number;
  wishlistCount?: number;
  orderCount?: number;
  createdAt?: string;
}

export interface ProductPopularitySignals {
  avgRating?: number;
  reviewCount?: number;
  orderCount?: number;
  wishlistCount?: number;
  viewCount?: number;
}

// Compute current 20-minute rotation time bucket
export function getRotationTimeBucket(nowMs = Date.now()): number {
  return Math.floor(nowMs / (20 * 60 * 1000));
}

// Module-level session rotation nonce increments once per full page load/session
let cachedSessionNonce: string | null = null;

export function getSmartRotationSeed(): string {
  let visitorSeed = 'v-default';
  try {
    const existing = localStorage.getItem(LOCAL_VISITOR_SEED_KEY);
    if (existing && existing.trim()) {
      visitorSeed = existing.trim();
    } else {
      const generated =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID().slice(0, 12)
          : Math.random().toString(36).slice(2, 14);
      localStorage.setItem(LOCAL_VISITOR_SEED_KEY, generated);
      visitorSeed = generated;
    }
  } catch {
    // Fallback when storage is restricted
  }

  if (!cachedSessionNonce) {
    try {
      const prev = Number(sessionStorage.getItem(SESSION_ROTATION_KEY) || '0');
      const next = Number.isFinite(prev) ? (prev + 1) % 100000 : 1;
      sessionStorage.setItem(SESSION_ROTATION_KEY, String(next));
      cachedSessionNonce = `s${next}`;
    } catch {
      cachedSessionNonce = `s${Math.floor(Math.random() * 10000)}`;
    }
  }

  const bucket = getRotationTimeBucket();
  return `${visitorSeed}:${cachedSessionNonce}:b${bucket}`;
}

export function deterministicHash01(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return (hash >>> 0) / 4294967296;
}

export function isProductBoostActive(
  prod: Pick<Product, 'boosted' | 'boostExpiresAt'> | SmartDiscoverableItem,
  nowMs = Date.now()
): boolean {
  if (!prod?.boosted) return false;
  if (!prod.boostExpiresAt || !String(prod.boostExpiresAt).trim()) {
    return true;
  }
  const expiresMs = Date.parse(String(prod.boostExpiresAt));
  if (Number.isNaN(expiresMs)) return true;
  return expiresMs > nowMs;
}

export function getEffectiveBoostLevel(
  prod: Pick<Product, 'boosted' | 'boostLevel' | 'boostExpiresAt'> | SmartDiscoverableItem,
  nowMs = Date.now()
): number {
  if (!isProductBoostActive(prod, nowMs)) return 0;
  const raw = Number(prod.boostLevel);
  if (!Number.isFinite(raw)) return 3;
  return Math.min(5, Math.max(1, Math.round(raw)));
}

export function createEmptyEngagementProfile(): CustomerEngagementProfile {
  return {
    categoryScores: {},
    productScores: {},
    priceAvg: 0,
    priceCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

function sanitizeEngagementProfile(
  raw: Partial<CustomerEngagementProfile> | null | undefined
): CustomerEngagementProfile {
  const categoryScores: Record<string, number> = {};
  if (raw?.categoryScores && typeof raw.categoryScores === 'object') {
    for (const [k, v] of Object.entries(raw.categoryScores)) {
      const cleanKey = String(k || '').trim();
      const num = Number(v);
      if (cleanKey && Number.isFinite(num) && num > 0) {
        categoryScores[cleanKey] = Math.min(10000, Math.round(num * 10) / 10);
      }
    }
  }

  const productScores: Record<string, number> = {};
  if (raw?.productScores && typeof raw.productScores === 'object') {
    const entries = Object.entries(raw.productScores)
      .map(([k, v]) => [String(k || '').trim(), Number(v)] as const)
      .filter(([k, v]) => Boolean(k) && Number.isFinite(v) && v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 120);
    for (const [k, v] of entries) {
      productScores[k] = Math.min(5000, Math.round(v * 10) / 10);
    }
  }

  const priceAvgRaw = Number(raw?.priceAvg);
  const priceCountRaw = Number(raw?.priceCount);

  return {
    categoryScores,
    productScores,
    priceAvg:
      Number.isFinite(priceAvgRaw) && priceAvgRaw > 0
        ? Math.round(priceAvgRaw * 100) / 100
        : 0,
    priceCount:
      Number.isFinite(priceCountRaw) && priceCountRaw > 0
        ? Math.min(1000, Math.round(priceCountRaw))
        : 0,
    updatedAt: String(raw?.updatedAt || new Date().toISOString()),
  };
}

export function readLocalSmartProfile(): CustomerEngagementProfile {
  try {
    const raw = localStorage.getItem(LOCAL_SMART_PROFILE_KEY);
    if (!raw) return createEmptyEngagementProfile();
    return sanitizeEngagementProfile(JSON.parse(raw));
  } catch {
    return createEmptyEngagementProfile();
  }
}

export function saveLocalSmartProfile(
  profile: CustomerEngagementProfile
): CustomerEngagementProfile {
  const clean = sanitizeEngagementProfile(profile);
  try {
    localStorage.setItem(LOCAL_SMART_PROFILE_KEY, JSON.stringify(clean));
  } catch {
    // ignore storage quota errors
  }
  return clean;
}

export function recordSmartInteraction(input: {
  productId: string;
  category?: string;
  price?: number;
  type: SmartInteractionType;
  quantity?: number;
}): CustomerEngagementProfile {
  const current = readLocalSmartProfile();
  const baseWeight = INTERACTION_WEIGHTS[input.type] || 1;
  const multiplier = Math.min(3, Math.max(1, Math.floor(Number(input.quantity) || 1)));
  const points = baseWeight * (input.type === 'cart' || input.type === 'order' ? multiplier : 1);

  const cleanPid = String(input.productId || '').replace(/^cat-/, '').trim();
  const cleanCategory = String(input.category || '').trim();
  const nowIso = new Date().toISOString();

  const nextCategoryScores = { ...current.categoryScores };
  if (cleanCategory) {
    nextCategoryScores[cleanCategory] =
      (nextCategoryScores[cleanCategory] || 0) + points;
  }

  const nextProductScores = { ...current.productScores };
  if (cleanPid) {
    nextProductScores[cleanPid] = (nextProductScores[cleanPid] || 0) + points;
  }

  let nextPriceAvg = current.priceAvg;
  let nextPriceCount = current.priceCount;
  const priceNum = Number(input.price);
  if (Number.isFinite(priceNum) && priceNum > 0) {
    const weightSteps = Math.min(5, Math.max(1, points));
    const effectivePrevCount = Math.min(40, nextPriceCount);
    nextPriceAvg =
      (nextPriceAvg * effectivePrevCount + priceNum * weightSteps) /
      (effectivePrevCount + weightSteps);
    nextPriceCount = Math.min(1000, effectivePrevCount + weightSteps);
  }

  return saveLocalSmartProfile({
    categoryScores: nextCategoryScores,
    productScores: nextProductScores,
    priceAvg: nextPriceAvg,
    priceCount: nextPriceCount,
    updatedAt: nowIso,
  });
}

export function mergeSmartProfiles(
  localProfile: CustomerEngagementProfile,
  client?: Client | null
): CustomerEngagementProfile {
  const cleanLocal = sanitizeEngagementProfile(localProfile);
  if (!client) return cleanLocal;

  const remote = sanitizeEngagementProfile(client.engagementProfile);
  const categoryScores: Record<string, number> = { ...cleanLocal.categoryScores };

  for (const [cat, score] of Object.entries(remote.categoryScores)) {
    categoryScores[cat] = Math.max(categoryScores[cat] || 0, score);
  }

  if (client.categoryInterests) {
    for (const [cat, entry] of Object.entries(
      client.categoryInterests as Record<string, CategoryInterestEntry>
    )) {
      const s = Number(entry?.score) || 0;
      if (cat && s > 0) {
        categoryScores[cat] = Math.max(categoryScores[cat] || 0, s);
      }
    }
  }

  const productScores: Record<string, number> = { ...cleanLocal.productScores };
  for (const [pid, score] of Object.entries(remote.productScores)) {
    productScores[pid] = Math.max(productScores[pid] || 0, score);
  }

  const totalCount = cleanLocal.priceCount + remote.priceCount;
  const priceAvg =
    totalCount > 0
      ? (cleanLocal.priceAvg * cleanLocal.priceCount +
          remote.priceAvg * remote.priceCount) /
        totalCount
      : 0;

  return sanitizeEngagementProfile({
    categoryScores,
    productScores,
    priceAvg,
    priceCount: Math.max(cleanLocal.priceCount, remote.priceCount),
    updatedAt:
      remote.updatedAt > cleanLocal.updatedAt
        ? remote.updatedAt
        : cleanLocal.updatedAt,
  });
}

export function readImpressionCounts(nowMs = Date.now()): Record<string, number> {
  const currentBucket = Math.floor(nowMs / (6 * 60 * 60 * 1000)); // decay every 6 hours
  try {
    const raw = localStorage.getItem(LOCAL_IMPRESSIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LocalImpressionStore;
    if (!parsed || typeof parsed.counts !== 'object') return {};
    if (parsed.bucket !== currentBucket) {
      // Soft-decay older impressions by half so products get recycled smoothly
      const decayed: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed.counts)) {
        const nextVal = Math.floor((Number(v) || 0) / 2);
        if (nextVal > 0) decayed[k] = nextVal;
      }
      localStorage.setItem(
        LOCAL_IMPRESSIONS_KEY,
        JSON.stringify({ bucket: currentBucket, counts: decayed })
      );
      return decayed;
    }
    return parsed.counts;
  } catch {
    return {};
  }
}

export function recordFeedImpressions(
  canonicalIds: string[],
  nowMs = Date.now()
): void {
  if (!Array.isArray(canonicalIds) || canonicalIds.length === 0) return;
  const currentBucket = Math.floor(nowMs / (6 * 60 * 60 * 1000));
  const counts = { ...readImpressionCounts(nowMs) };
  for (const id of canonicalIds.slice(0, 24)) {
    const key = String(id || '').replace(/^cat-/, '').trim();
    if (!key) continue;
    counts[key] = Math.min(100, (Number(counts[key]) || 0) + 1);
  }
  // Keep only latest/top 250 entries
  const trimmedEntries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 250);
  const nextCounts: Record<string, number> = {};
  for (const [k, v] of trimmedEntries) nextCounts[k] = v;
  try {
    localStorage.setItem(
      LOCAL_IMPRESSIONS_KEY,
      JSON.stringify({ bucket: currentBucket, counts: nextCounts })
    );
  } catch {
    // ignore storage errors
  }
}

export function readRecentlyViewedIds(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((id) => String(id || '').replace(/^cat-/, '').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function recordRecentlyViewedProduct(productId: string): string[] {
  const cleanId = String(productId || '').replace(/^cat-/, '').trim();
  if (!cleanId) return readRecentlyViewedIds();
  const prev = readRecentlyViewedIds();
  const next = [cleanId, ...prev.filter((id) => id !== cleanId)].slice(0, 12);
  try {
    localStorage.setItem(LOCAL_RECENTLY_VIEWED_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  return next;
}

// --- Typo-Tolerant Search Helpers ---

const SYNONYM_GROUPS: string[][] = [
  ['perfume', 'perfumes', 'fragrance', 'fragrances', 'scent', 'attar', 'deo', 'mist', 'cologne', 'eau'],
  ['jewellery', 'jewelry', 'jewelery', 'necklace', 'earring', 'earrings', 'bangle', 'bangles', 'bracelet', 'ring', 'pendant', 'jhumka', 'choker'],
  ['cosmetics', 'cosmetic', 'makeup', 'lipstick', 'lipstik', 'lipbalm', 'kajal', 'eyeliner', 'foundation', 'serum', 'cream', 'compact', 'blush', 'beauty', 'skincare'],
  ['clothing', 'dress', 'dresses', 'kurti', 'kurta', 'saree', 'sari', 'lehenga', 'top', 'tops', 'ethnic', 'gown', 'suit', 'salwar', 'dupattas', 'dupatta'],
  ['winter', 'sweater', 'shawl', 'cardigan', 'hoodie', 'jacket', 'woolen', 'wool', 'sweatshirt', 'muffler', 'coat'],
  ['innerwear', 'lingerie', 'bra', 'panty', 'panties', 'nighty', 'nightwear', 'camisole', 'slip'],
  ['accessories', 'accessory', 'bag', 'bags', 'purse', 'handbag', 'clutch', 'sling', 'watch', 'watches', 'hairband', 'scrunchie', 'belt', 'sunglass', 'sunglasses'],
];

const SYNONYM_LOOKUP: Map<string, Set<string>> = (() => {
  const map = new Map<string, Set<string>>();
  for (const group of SYNONYM_GROUPS) {
    const set = new Set(group);
    for (const term of group) {
      map.set(term, set);
    }
  }
  return map;
})();

function normalizeSearchText(raw?: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function damerauLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (Math.abs(la - lb) > 3) return Math.abs(la - lb);

  const dp: number[][] = Array.from({ length: la + 1 }, () =>
    new Array<number>(lb + 1).fill(0)
  );
  for (let i = 0; i <= la; i += 1) dp[i][0] = i;
  for (let j = 0; j <= lb; j += 1) dp[0][j] = j;

  for (let i = 1; i <= la; i += 1) {
    for (let j = 1; j <= lb; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = val;
    }
  }
  return dp[la][lb];
}

function bigramDiceSimilarity(a: string, b: string): number {
  if (a.length < 3 || b.length < 3) return 0;
  const makeBigrams = (s: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i += 1) {
      const bg = s.slice(i, i + 2);
      map.set(bg, (map.get(bg) || 0) + 1);
    }
    return map;
  };
  const mapA = makeBigrams(a);
  const mapB = makeBigrams(b);
  let overlap = 0;
  for (const [bg, countA] of mapA.entries()) {
    const countB = mapB.get(bg) || 0;
    overlap += Math.min(countA, countB);
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

export interface SearchMatchResult {
  matched: boolean;
  score: number;
  fuzzyUsed: boolean;
}

export function scoreProductSearchMatch(
  item: SmartDiscoverableItem,
  rawQuery: string
): SearchMatchResult {
  const qRaw = String(rawQuery || '').trim().toLowerCase();
  if (!qRaw) return { matched: true, score: 0, fuzzyUsed: false };

  const cleanIdQuery = qRaw.replace(/^#/, '');
  const rawId = String(item.id || '').toLowerCase();
  const catalogId = String(item.catalogProductId || '').toLowerCase();
  const strippedId = rawId.replace(/^cat-/, '');
  const productNo = String(item.productNumber || '').toLowerCase();

  // Exact / ID match
  if (
    rawId === cleanIdQuery ||
    catalogId === cleanIdQuery ||
    strippedId === cleanIdQuery ||
    productNo === cleanIdQuery
  ) {
    return { matched: true, score: 1200, fuzzyUsed: false };
  }
  if (
    rawId.includes(cleanIdQuery) ||
    catalogId.includes(cleanIdQuery) ||
    strippedId.includes(cleanIdQuery) ||
    productNo.includes(cleanIdQuery)
  ) {
    return { matched: true, score: 750, fuzzyUsed: false };
  }

  const nameNorm = normalizeSearchText(item.name);
  const catNorm = normalizeSearchText(item.category);
  const colorNorm = normalizeSearchText(item.color);
  const sizeNorm = normalizeSearchText(item.size);
  const descNorm = normalizeSearchText(item.description);
  const sellerNorm = normalizeSearchText(item.sellerName);
  const queryNorm = normalizeSearchText(qRaw);

  if (!queryNorm) return { matched: true, score: 0, fuzzyUsed: false };

  let totalScore = 0;
  let fuzzyUsed = false;

  // Exact phrase bonus
  if (nameNorm === queryNorm) totalScore += 600;
  else if (nameNorm.startsWith(queryNorm)) totalScore += 420;
  else if (nameNorm.includes(queryNorm)) totalScore += 320;
  else if (catNorm.includes(queryNorm)) totalScore += 240;
  else if (colorNorm.includes(queryNorm) || sizeNorm.includes(queryNorm)) totalScore += 180;
  else if (descNorm.includes(queryNorm) || sellerNorm.includes(queryNorm)) totalScore += 140;

  const queryTokens = queryNorm.split(/\s+/).filter(Boolean);
  const nameTokens = nameNorm.split(/\s+/).filter(Boolean);
  const otherTokens = `${catNorm} ${colorNorm} ${sizeNorm} ${descNorm} ${sellerNorm}`
    .split(/\s+/)
    .filter(Boolean);
  const allTargetTokens = Array.from(new Set([...nameTokens, ...otherTokens]));

  if (queryTokens.length === 0) {
    return { matched: totalScore > 0, score: totalScore, fuzzyUsed };
  }

  let matchedTokenCount = 0;
  let tokenPointsSum = 0;

  for (const qt of queryTokens) {
    let bestForToken = 0;
    let tokenWasFuzzy = false;

    // 1. Direct token / prefix / substring in name or metadata
    for (const nt of nameTokens) {
      if (nt === qt) {
        bestForToken = Math.max(bestForToken, 160);
      } else if (nt.startsWith(qt) && qt.length >= 2) {
        bestForToken = Math.max(bestForToken, 130);
      } else if (qt.length >= 3 && nt.includes(qt)) {
        bestForToken = Math.max(bestForToken, 105);
      }
    }

    for (const ot of otherTokens) {
      if (ot === qt) {
        bestForToken = Math.max(bestForToken, 115);
      } else if (ot.startsWith(qt) && qt.length >= 2) {
        bestForToken = Math.max(bestForToken, 95);
      } else if (qt.length >= 3 && ot.includes(qt)) {
        bestForToken = Math.max(bestForToken, 78);
      }
    }

    // 2. Synonym expansion
    if (bestForToken < 80) {
      const synGroup = SYNONYM_LOOKUP.get(qt);
      if (synGroup) {
        for (const tt of allTargetTokens) {
          if (synGroup.has(tt)) {
            bestForToken = Math.max(bestForToken, 82);
            break;
          }
        }
      }
    }

    // 3. Fuzzy / typo tolerance (Damerau-Levenshtein + bigram Dice)
    if (bestForToken === 0 && qt.length >= 3) {
      const maxEdits = qt.length <= 4 ? 1 : qt.length <= 7 ? 2 : 2;
      for (const tt of allTargetTokens) {
        if (Math.abs(tt.length - qt.length) > maxEdits + 1) continue;
        const dist = damerauLevenshtein(qt, tt);
        if (dist <= maxEdits) {
          const isNameToken = nameTokens.includes(tt);
          const pts = (isNameToken ? 92 : 68) - dist * 16;
          if (pts > bestForToken) {
            bestForToken = pts;
            tokenWasFuzzy = true;
          }
        } else if (qt.length >= 4 && tt.length >= 4) {
          const sim = bigramDiceSimilarity(qt, tt);
          if (sim >= 0.56) {
            const pts = Math.round(sim * 74);
            if (pts > bestForToken) {
              bestForToken = pts;
              tokenWasFuzzy = true;
            }
          }
        }
      }

      // Check fuzzy match against synonyms (e.g., "perfuem" -> "perfume" -> matches "fragrance")
      if (bestForToken === 0 && qt.length >= 4) {
        for (const [synWord, synSet] of SYNONYM_LOOKUP.entries()) {
          if (Math.abs(synWord.length - qt.length) > 2) continue;
          const dist = damerauLevenshtein(qt, synWord);
          if (dist <= 1 || (qt.length >= 6 && dist <= 2)) {
            for (const tt of allTargetTokens) {
              if (synSet.has(tt)) {
                bestForToken = Math.max(bestForToken, 64 - dist * 12);
                tokenWasFuzzy = true;
                break;
              }
            }
          }
          if (bestForToken > 0) break;
        }
      }
    }

    if (bestForToken > 0) {
      matchedTokenCount += 1;
      tokenPointsSum += bestForToken;
      if (tokenWasFuzzy) fuzzyUsed = true;
    }
  }

  const requiredMatches =
    queryTokens.length <= 2
      ? queryTokens.length
      : Math.ceil(queryTokens.length * 0.7);

  if (totalScore > 0 || matchedTokenCount >= requiredMatches) {
    return {
      matched: true,
      score: totalScore + tokenPointsSum + (matchedTokenCount === queryTokens.length ? 80 : 0),
      fuzzyUsed: totalScore === 0 && fuzzyUsed,
    };
  }

  return { matched: false, score: 0, fuzzyUsed: false };
}

// --- Composite "For You" + Fair Rotation Ranking ---

export interface SmartRankingContext {
  profile: CustomerEngagementProfile;
  impressions: Record<string, number>;
  popularityByProductId: Map<string, ProductPopularitySignals>;
  rotationSeed: string;
  placementRule: HighlightPlacementRule;
  selectedCategory: string;
  nowMs?: number;
}

export function computeCompositeSmartScore(
  item: SmartDiscoverableItem,
  ctx: SmartRankingContext
): number {
  const nowMs = ctx.nowMs ?? Date.now();
  const canonicalId = (item.catalogProductId || item.id).replace(/^cat-/, '');
  let score = 0;

  // 1. Admin Boost Controller weight (strongest priority tier)
  const boostLevel = getEffectiveBoostLevel(item, nowMs);
  if (boostLevel > 0) {
    const boostBaseMap = [0, 55, 82, 115, 150, 190];
    score += boostBaseMap[boostLevel] || 115;
  }

  // 2. Seller Paid Highlight weight (respects placementRule)
  if (item.highlighted) {
    if (
      ctx.placementRule === 'top_featured' ||
      (ctx.placementRule === 'priority_category' && ctx.selectedCategory !== 'ALL')
    ) {
      score += 36;
    } else {
      score += 20;
    }
  }

  // 3. Personal Category & Price-Range Affinity
  const catScores = ctx.profile.categoryScores || {};
  const maxCatScore = Math.max(1, ...Object.values(catScores));
  const itemCatScore = Number(catScores[item.category] || 0);
  if (itemCatScore > 0) {
    // Normalized logarithmic curve capped at +34 so discovery stays diverse
    const share = itemCatScore / maxCatScore;
    const magnitude = Math.min(1, Math.log1p(itemCatScore) / Math.log1p(40));
    score += (share * 0.65 + magnitude * 0.35) * 34;
  }

  if (ctx.profile.priceCount >= 1 && ctx.profile.priceAvg > 0 && item.price > 0) {
    const ratioDiff =
      Math.abs(item.price - ctx.profile.priceAvg) /
      Math.max(ctx.profile.priceAvg, 1);
    if (ratioDiff <= 0.65) {
      score += (1 - ratioDiff / 0.65) * 14;
    }
  }

  const directProdInterest = Number(ctx.profile.productScores[canonicalId] || 0);
  if (directProdInterest > 0) {
    score += Math.min(9, Math.log1p(directProdInterest) * 3);
  }

  // 4. Overall Popularity + 7-Day Freshness Bonus
  const signals = ctx.popularityByProductId.get(canonicalId);
  const orderCount = Math.max(0, Number(item.orderCount) || 0, Number(signals?.orderCount) || 0);
  const wishlistCount = Math.max(0, Number(item.wishlistCount) || 0, Number(signals?.wishlistCount) || 0);
  const viewCount = Math.max(0, Number(item.viewCount) || 0, Number(signals?.viewCount) || 0);
  const reviewCount = Math.max(0, Number(signals?.reviewCount) || 0);
  const avgRating = Math.max(0, Number(signals?.avgRating) || 0);

  const popularityRaw =
    orderCount * 4 + wishlistCount * 2 + reviewCount * 2.5 + viewCount * 0.25;
  if (popularityRaw > 0) {
    score += Math.min(24, Math.log1p(popularityRaw) * 6.5);
  }
  if (avgRating >= 3.5 && reviewCount > 0) {
    score += Math.min(6, (avgRating - 3) * 3);
  }

  if (item.createdAt) {
    const createdMs = Date.parse(item.createdAt);
    if (!Number.isNaN(createdMs)) {
      const ageDays = (nowMs - createdMs) / (24 * 60 * 60 * 1000);
      if (ageDays >= -1 && ageDays <= 7) {
        const freshness = Math.max(0, (7 - Math.max(0, ageDays)) / 7);
        score += freshness * 24;
      }
    }
  }

  // Discount / price-drop offer boost & low-stock urgency boost
  if (item.originalPrice && item.originalPrice > item.price) {
    const discPct = ((item.originalPrice - item.price) / item.originalPrice) * 100;
    score += Math.min(10, discPct * 0.2);
  }

  // Stock readiness & low-stock urgency boost (keeps out-of-stock visible but lower than active items)
  if (item.stockQty !== undefined && item.stockQty <= 0) {
    score -= 16;
  } else {
    score += 6;
    if (item.stockQty !== undefined && item.stockQty > 0 && item.stockQty <= 5) {
      score += item.stockQty === 1 ? 8 : 6;
    }
  }

  // 5. Fair Exposure + Controlled Rotation Jitter
  const impressions = Math.max(0, Number(ctx.impressions[canonicalId] || 0));
  const fairExposureBonus = 18 / (1 + impressions * 0.45);
  score += fairExposureBonus;

  const jitter =
    deterministicHash01(
      `${canonicalId}:${ctx.rotationSeed}:${ctx.selectedCategory}`
    ) * 20;
  score += jitter;

  return score;
}

export function rankSmartShoppingFeed<T extends SmartDiscoverableItem>(
  items: T[],
  ctx: SmartRankingContext
): T[] {
  if (items.length <= 1) return items;
  const scored = [...items]
    .map((item) => ({
      item,
      score: computeCompositeSmartScore(item, ctx),
    }))
    .sort((a, b) => b.score - a.score);

  // When browsing ALL categories, interleave categories gently so no single category crowds out others
  if (ctx.selectedCategory !== 'ALL' || scored.length <= 3) {
    return scored.map((entry) => entry.item);
  }

  const remaining = [...scored];
  const diversified: T[] = [];
  const categoryCountsInTopWindow = new Map<string, number>();

  while (remaining.length > 0) {
    const lookaheadLimit = Math.min(remaining.length, 10);
    let bestIdx = 0;
    let bestAdjustedScore = -Infinity;
    const prevCat1 = diversified.length >= 1 ? diversified[diversified.length - 1].category : '';
    const prevCat2 = diversified.length >= 2 ? diversified[diversified.length - 2].category : '';

    for (let i = 0; i < lookaheadLimit; i += 1) {
      const candidate = remaining[i];
      let adjusted = candidate.score;
      const cat = candidate.item.category || '';

      // Avoid back-to-back or crowded repeats in top discovery rows unless strongly boosted
      if (cat && cat === prevCat1) adjusted -= 26;
      else if (cat && cat === prevCat2) adjusted -= 12;

      if (diversified.length < 18 && cat) {
        const seenCatCount = categoryCountsInTopWindow.get(cat) || 0;
        adjusted -= seenCatCount * 5;
      }

      if (adjusted > bestAdjustedScore) {
        bestAdjustedScore = adjusted;
        bestIdx = i;
      }
    }

    const [picked] = remaining.splice(bestIdx, 1);
    diversified.push(picked.item);
    const pickedCat = picked.item.category || '';
    if (pickedCat) {
      categoryCountsInTopWindow.set(
        pickedCat,
        (categoryCountsInTopWindow.get(pickedCat) || 0) + 1
      );
    }
  }

  return diversified;
}

// --- Similar Products & Smart Cross-Sell ---

const COMPLEMENTARY_CATEGORY_MAP: Record<string, string[]> = {
  "Women's Clothing": [
    "Women's Jewellery",
    'Fashion Accessories',
    'Perfumes & Fragrances',
    'Cosmetics & Beauty Products',
  ],
  'Winter Collection': [
    'Fashion Accessories',
    'Perfumes & Fragrances',
    'Cosmetics & Beauty Products',
    "Women's Jewellery",
  ],
  "Women's Jewellery": [
    "Women's Clothing",
    'Fashion Accessories',
    'Perfumes & Fragrances',
    'Cosmetics & Beauty Products',
  ],
  'Cosmetics & Beauty Products': [
    'Perfumes & Fragrances',
    'Fashion Accessories',
    "Women's Jewellery",
    "Women's Clothing",
  ],
  'Perfumes & Fragrances': [
    'Cosmetics & Beauty Products',
    'Fashion Accessories',
    "Women's Jewellery",
    "Women's Clothing",
  ],
  "Women's Innerwear": [
    "Women's Clothing",
    'Perfumes & Fragrances',
    'Cosmetics & Beauty Products',
    'Fashion Accessories',
  ],
  'Fashion Accessories': [
    "Women's Jewellery",
    "Women's Clothing",
    'Perfumes & Fragrances',
    'Cosmetics & Beauty Products',
  ],
};

function tokenizeWords(raw?: string): Set<string> {
  return new Set(
    normalizeSearchText(raw)
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  );
}

export function getSimilarProducts<T extends SmartDiscoverableItem>(
  target: T,
  catalog: T[],
  popularityByProductId: Map<string, ProductPopularitySignals>,
  rotationSeed: string,
  limit = 6
): T[] {
  const targetCanonical = (target.catalogProductId || target.id).replace(/^cat-/, '');
  const targetWords = tokenizeWords(`${target.name} ${target.color || ''} ${target.description || ''}`);
  const nowMs = Date.now();

  const candidates = catalog
    .filter((item) => {
      const cid = (item.catalogProductId || item.id).replace(/^cat-/, '');
      return cid !== targetCanonical && item.id !== target.id;
    })
    .map((item) => {
      const cid = (item.catalogProductId || item.id).replace(/^cat-/, '');
      let score = 0;

      // Same category strongly preferred
      if (item.category === target.category) {
        score += 65;
      }

      // Shared keywords / color
      const itemWords = tokenizeWords(`${item.name} ${item.color || ''}`);
      let shared = 0;
      for (const w of targetWords) {
        if (itemWords.has(w)) shared += 1;
      }
      score += Math.min(24, shared * 8);

      // Price proximity
      const maxP = Math.max(target.price, item.price, 1);
      const priceCloseness = 1 - Math.abs(target.price - item.price) / maxP;
      score += Math.max(0, priceCloseness) * 26;

      // Boost / highlight / stock / popularity
      const boostLvl = getEffectiveBoostLevel(item, nowMs);
      if (boostLvl > 0) score += boostLvl * 4;
      if (item.highlighted) score += 8;
      if (item.stockQty !== undefined && item.stockQty <= 0) score -= 25;

      const sig = popularityByProductId.get(cid);
      if (sig?.avgRating) score += sig.avgRating * 1.5;

      score += deterministicHash01(`sim:${targetCanonical}:${cid}:${rotationSeed}`) * 8;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  return candidates.slice(0, limit).map((c) => c.item);
}

export function getComplementaryCrossSellProducts<T extends SmartDiscoverableItem>(
  target: T,
  catalog: T[],
  profile: CustomerEngagementProfile,
  popularityByProductId: Map<string, ProductPopularitySignals>,
  rotationSeed: string,
  limit = 6,
  cartItems: CustomerCartItem[] = []
): T[] {
  const targetCanonical = (target.catalogProductId || target.id).replace(/^cat-/, '');
  const complementaryCats = COMPLEMENTARY_CATEGORY_MAP[target.category] || [];
  const nowMs = Date.now();

  const cartIdsSet = new Set<string>();
  const cartCategoryCounts = new Map<string, number>();
  let cartPriceSum = 0;
  let cartPriceCount = 0;
  for (const ci of cartItems) {
    const cid = String(ci.productId || ci.id || '').replace(/^cat-/, '').trim();
    if (cid) cartIdsSet.add(cid);
    if (ci.id) cartIdsSet.add(ci.id);
    if (ci.category) {
      cartCategoryCounts.set(
        ci.category,
        (cartCategoryCounts.get(ci.category) || 0) + 1
      );
    }
    const p = Number(ci.price);
    if (Number.isFinite(p) && p > 0) {
      cartPriceSum += p;
      cartPriceCount += 1;
    }
  }
  const cartAvgPrice = cartPriceCount > 0 ? cartPriceSum / cartPriceCount : 0;

  const cartComplementaryCats = new Set<string>();
  for (const cartCat of cartCategoryCounts.keys()) {
    for (const comp of COMPLEMENTARY_CATEGORY_MAP[cartCat] || []) {
      if (!cartCategoryCounts.has(comp)) cartComplementaryCats.add(comp);
    }
  }

  const candidates = catalog
    .filter((item) => {
      const cid = (item.catalogProductId || item.id).replace(/^cat-/, '');
      if (cid === targetCanonical || item.id === target.id) return false;
      if (cartIdsSet.has(cid) || cartIdsSet.has(item.id)) return false;
      // Cross-sell focuses on complementary items from OTHER categories
      return item.category !== target.category;
    })
    .map((item) => {
      const cid = (item.catalogProductId || item.id).replace(/^cat-/, '');
      let score = 0;

      const compIdx = complementaryCats.indexOf(item.category);
      if (compIdx === 0) score += 62;
      else if (compIdx === 1) score += 52;
      else if (compIdx >= 2) score += 40;
      else score += 16;

      // Cart-aware bonus: strongly lift items complementing items already in cart
      if (cartComplementaryCats.has(item.category)) {
        score += 24;
      }

      // Personal category affinity
      const catAff = Number(profile.categoryScores?.[item.category] || 0);
      if (catAff > 0) score += Math.min(18, Math.log1p(catAff) * 5);

      // Attractive add-on price point relative to target & cart average
      const referencePrice =
        cartAvgPrice > 0 && target.price > 0
          ? (target.price + cartAvgPrice) / 2
          : target.price || cartAvgPrice;
      if (referencePrice > 0 && item.price > 0 && item.price <= referencePrice * 1.35) {
        score += 14;
      }

      // Boost & popularity
      const boostLvl = getEffectiveBoostLevel(item, nowMs);
      if (boostLvl > 0) score += boostLvl * 5;
      if (item.highlighted) score += 10;
      if (item.stockQty !== undefined && item.stockQty <= 0) score -= 25;

      const sig = popularityByProductId.get(cid);
      const pop =
        (Number(item.orderCount) || 0) * 2 +
        (Number(item.wishlistCount) || 0) +
        (Number(sig?.reviewCount) || 0);
      if (pop > 0) score += Math.min(12, Math.log1p(pop) * 3.5);

      score += deterministicHash01(`xsell:${targetCanonical}:${cid}:${rotationSeed}`) * 10;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  return candidates.slice(0, limit).map((c) => c.item);
}

export function getCartAwareRecommendations<T extends SmartDiscoverableItem>(
  cartItems: CustomerCartItem[],
  catalog: T[],
  profile: CustomerEngagementProfile,
  popularityByProductId: Map<string, ProductPopularitySignals>,
  rotationSeed: string,
  limit = 6
): T[] {
  if (!Array.isArray(cartItems) || cartItems.length === 0 || catalog.length === 0) {
    return [];
  }
  const nowMs = Date.now();
  const cartIdsSet = new Set<string>();
  const cartCategories = new Set<string>();
  let priceSum = 0;
  let priceCount = 0;

  for (const ci of cartItems) {
    const cid = String(ci.productId || ci.id || '').replace(/^cat-/, '').trim();
    if (cid) cartIdsSet.add(cid);
    if (ci.id) cartIdsSet.add(ci.id);
    if (ci.category) cartCategories.add(ci.category);
    const p = Number(ci.price);
    if (Number.isFinite(p) && p > 0) {
      priceSum += p;
      priceCount += 1;
    }
  }
  const avgCartPrice = priceCount > 0 ? priceSum / priceCount : 0;

  const complementaryScoreByCat = new Map<string, number>();
  for (const cartCat of cartCategories) {
    const compList = COMPLEMENTARY_CATEGORY_MAP[cartCat] || [];
    compList.forEach((compCat, idx) => {
      const pts = Math.max(25, 62 - idx * 10);
      complementaryScoreByCat.set(
        compCat,
        Math.max(complementaryScoreByCat.get(compCat) || 0, pts)
      );
    });
  }

  const candidates = catalog
    .filter((item) => {
      const cid = (item.catalogProductId || item.id).replace(/^cat-/, '');
      return !cartIdsSet.has(cid) && !cartIdsSet.has(item.id) && (item.stockQty === undefined || item.stockQty > 0);
    })
    .map((item) => {
      const cid = (item.catalogProductId || item.id).replace(/^cat-/, '');
      let score = 0;
      const compPts = complementaryScoreByCat.get(item.category) || 0;
      if (compPts > 0) score += compPts;
      else if (!cartCategories.has(item.category)) score += 22;
      else score += 10;

      if (avgCartPrice > 0 && item.price > 0) {
        if (item.price <= avgCartPrice * 1.25) score += 16;
        else if (item.price <= avgCartPrice * 1.6) score += 8;
      }

      const catAff = Number(profile.categoryScores?.[item.category] || 0);
      if (catAff > 0) score += Math.min(15, Math.log1p(catAff) * 4);

      const boostLvl = getEffectiveBoostLevel(item, nowMs);
      if (boostLvl > 0) score += boostLvl * 5;
      if (item.highlighted) score += 8;

      const sig = popularityByProductId.get(cid);
      const pop = (Number(item.orderCount) || 0) * 2 + (Number(item.wishlistCount) || 0) + (Number(sig?.reviewCount) || 0);
      if (pop > 0) score += Math.min(12, Math.log1p(pop) * 3);

      score += deterministicHash01(`cartrec:${cid}:${rotationSeed}`) * 10;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  return candidates.slice(0, limit).map((c) => c.item);
}
