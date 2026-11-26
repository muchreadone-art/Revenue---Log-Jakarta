import * as XLSX from 'xlsx';
import type { CustomerOrderMap, DataQualityRow, RawDeliveryLine } from '../data/initialLogisticsData';
import { MANUAL_JAN_APR_2026_ROWS, buildManualHistoricalLine } from '../data/manualJanApr2026Data';
import type {
  CategorySummaryRow,
  CustomerSummaryRow,
  FilterState,
  HubActivityRow,
  ModaDetailMetric,
  ModaKey,
  ModaSummaryMetric,
  MonthlyMetric,
  MonthlyModaMetric,
  MonthlyModaSideMetric,
  NopolRevenueRow,
  OperationAnalytics,
  RouteCorridorRow,
  SalesOrderRecord,
  SoLegStep,
  SourceKey,
  SourceState,
  UnitFrequencyTier,
  UnitUsageRow,
} from '../types/logistics';
import { calcAgeDays, formatMonthLabel } from './formatters';

export const INVOICED_STATUS = 'Fully Invoiced';

export const DATE_COLUMN_PRIORITY = [
  'Delivery Order/Plan Loading Time',
  'Delivery Order/Date',
  'Delivery Order/Created on',
] as const;

export const PRICE_COLUMN_PRIORITY = [
  'Delivery Order/Total Price',
  'Total Price',
  'Unit Price',
] as const;

export const REQUIRED_COLUMNS = [
  'Order Reference',
  'Delivery Order/Reference',
  'Delivery Order/Partner',
  'Delivery Order/Category',
  'Delivery Order/Origin',
  'Delivery Order/Destination',
  'Delivery Order/Status Do',
  'BOP',
  'Invoice Status',
  'Invoice Lines/Number',
  'Invoice Lines/Date',
] as const;

// Master registry of verified date anomaly overrides (e.g. ERP input typos)
export const KNOWN_SO_DATE_OVERRIDES: Record<string, string> = {
  'SO/00408/GLJKT/TRP/9/2026': '2026-09-10',
};

export function reconcileSoDate(ref: string, date: string): string {
  if (KNOWN_SO_DATE_OVERRIDES[ref]) {
    return KNOWN_SO_DATE_OVERRIDES[ref];
  }
  if (!date) return '';
  // Auto-reconcile year mismatch if SO reference has pattern /<month>/<year> and year doesn't match
  const match = ref.match(/\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const refYear = match[2];
    const parts = date.split('-');
    if (parts.length === 3 && parts[0] !== refYear && (parts[0] === '2025' || parts[0] < refYear)) {
      return `${refYear}-${parts[1]}-${parts[2]}`;
    }
  }
  return date;
}

/**
 * Canonical alias map for known customer name variants / typos across Odoo & manual datasets.
 * Keys must be in normalized uppercase form (after standard prefix/whitespace cleanup).
 */
export const CUSTOMER_ALIAS_MAP: Record<string, string> = {
  'BANDAN RISET DAN INOVASI NASIONAL': 'BADAN RISET DAN INOVASI NASIONAL',
  'PT MITRA ANGKUTAN SEJATI (MAS)': 'PT MITRA ANGKUTAN SEJATI',
  'ADI SARANA ARMADA TBK': 'PT ADI SARANA ARMADA TBK',
  'PT KARYA PUTERA LOKATIRTA': 'PT KARYA PUTRA LOKATIRTA',
  'PT KARYA PUTERA LOKATIRTA MANDIRI': 'PT KARYA PUTRA LOKATIRTA MANDIRI',
};

export function normalizeCustomerName(raw: string): string {
  if (!raw) return 'UNKNOWN';
  let name = raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');

  // Standardize business entity prefixes: "PT.", "PT. ", "PT.TRANS", "CV.", "UD.", "PD."
  name = name.replace(/^(PT|CV|UD|PD)\.?\s*/i, '$1 ');

  // Standardize "TBK." -> "TBK" and normalize dash spacing
  name = name
    .replace(/\bTBK\.?(?=\s|$|-)/g, 'TBK')
    .replace(/\s*[-–]\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();

  return CUSTOMER_ALIAS_MAP[name] ?? name;
}

function toCustomerCoreKey(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ') // remove parentheticals like (MAS), (PERSERO)
    .replace(/^(PT|CV|UD|PD)\s+/i, '')
    .replace(/\bTBK\b/g, '')
    .replace(/\bPUTERA\b/g, 'PUTRA')
    .replace(/\bLOGISTICS?\b/g, 'LOGISTIK')
    .replace(/\bEXPRESS\b/g, 'EKSPRES')
    .replace(/\bKARGO\b/g, 'CARGO')
    .replace(/\bTEHNIK\b/g, 'TEKNIK')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinBounded(a: string, b: string, maxDist: number): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > maxDist) return maxDist + 1;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

/**
 * Automatically merges similar / near-duplicate customer names across all active sources
 * (Odoo TRP, Odoo VLI, and Manual Jan–Apr 2026) into a single canonical display name.
 */
function buildCustomerCanonicalMap(counts: Map<string, number>): Map<string, string> {
  const uniqueNames = Array.from(counts.keys());
  const canonical = new Map<string, string>();
  if (uniqueNames.length <= 1) {
    uniqueNames.forEach((n) => canonical.set(n, n));
    return canonical;
  }

  // Sort candidates so the best canonical representative comes first:
  // 1) Higher order frequency, 2) Has formal PT/CV prefix, 3) Longer/more complete name
  const sorted = [...uniqueNames].sort((a, b) => {
    const ca = counts.get(a) ?? 0;
    const cb = counts.get(b) ?? 0;
    if (cb !== ca) return cb - ca;
    const pa = /^(PT|CV)\s/.test(a) ? 1 : 0;
    const pb = /^(PT|CV)\s/.test(b) ? 1 : 0;
    if (pb !== pa) return pb - pa;
    return b.length - a.length;
  });

  const representatives: Array<{ name: string; core: string }> = [];

  for (const name of sorted) {
    const core = toCustomerCoreKey(name);
    let matchedRep: string | null = null;

    for (const rep of representatives) {
      if (core === rep.core) {
        matchedRep = rep.name;
        break;
      }
      // Safe fuzzy match for minor typos on sufficiently long core names (>= 10 chars)
      if (core.length >= 10 && rep.core.length >= 10) {
        const dist = levenshteinBounded(core, rep.core, 2);
        if (dist <= 2) {
          matchedRep = rep.name;
          break;
        }
      }
    }

    if (matchedRep) {
      canonical.set(name, matchedRep);
    } else {
      representatives.push({ name, core });
      canonical.set(name, name);
    }
  }

  return canonical;
}

export function buildSalesOrders(
  sources: Record<SourceKey, SourceState>,
  customAliases?: Record<string, string>,
  options?: { includeManualApril?: boolean }
): { orders: SalesOrderRecord[]; minDate: string; maxDate: string } {
  const includeManualApril = options?.includeManualApril ?? true;
  const orders: SalesOrderRecord[] = [];
  let minDate = '';
  let maxDate = '';

  (['TRP', 'VLI'] as SourceKey[]).forEach((srcKey) => {
    const map = sources[srcKey].data;
    if (!map) return;

    for (const rawCustomer of Object.keys(map)) {
      const customer = normalizeCustomerName(rawCustomer);
      const list = map[rawCustomer];
      for (const item of list) {
        const [ref, rawDate, rawLines] = item;
        const date = reconcileSoDate(ref, rawDate);
        const record = createSalesOrderRecord(srcKey, ref, customer, date, rawLines);
        orders.push(record);
        if (date) {
          if (!minDate || date < minDate) minDate = date;
          if (!maxDate || date > maxDate) maxDate = date;
        }
      }
    }
  });

  // Append verified manual historical data for Jan - Apr 2026 (TRP & VLI)
  for (const row of MANUAL_JAN_APR_2026_ROWS) {
    const [no, date, srcKey, rawCustomer] = row;
    if (!includeManualApril && date.startsWith('2026-04')) continue;
    const customer = normalizeCustomerName(rawCustomer);
    const monthNum = parseInt(date.slice(5, 7), 10);
    const ref = `SO/MANUAL/${no}/${srcKey}/${monthNum}/2026`;
    const rawLine = buildManualHistoricalLine(row);
    const record = createSalesOrderRecord(srcKey, ref, customer, date, [rawLine]);
    orders.push(record);
    if (date) {
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
    }
  }

  // Merge near-duplicate / similar customer names across all sources
  const customerCounts = new Map<string, number>();
  for (const o of orders) {
    customerCounts.set(o.customer, (customerCounts.get(o.customer) ?? 0) + 1);
  }
  const canonicalMap = buildCustomerCanonicalMap(customerCounts);
  for (const o of orders) {
    const merged = canonicalMap.get(o.customer);
    if (merged && merged !== o.customer) {
      o.customer = merged;
    }
    if (customAliases) {
      const customTarget = customAliases[o.customer];
      if (customTarget && customTarget.trim()) {
        o.customer = customTarget.trim().toUpperCase();
      }
    }
  }

  return { orders, minDate, maxDate };
}

export function createSalesOrderRecord(
  src: SourceKey,
  ref: string,
  customer: string,
  date: string,
  rawLines: RawDeliveryLine[]
): SalesOrderRecord {
  let totalRev = 0;
  let totalBop = 0;
  const doSet = new Set<string>();

  for (const l of rawLines) {
    doSet.add(l[0]);
    totalRev += l[4];
    totalBop += l[5];
  }

  let adjustedLines: RawDeliveryLine[] = rawLines;
  if (totalBop > 0 && totalRev > 0) {
    let allocatedSum = 0;
    adjustedLines = rawLines.map((l, idx) => {
      let allocated: number;
      if (idx === rawLines.length - 1) {
        allocated = totalRev - allocatedSum;
      } else {
        allocated = Math.round(totalRev * (l[5] / totalBop));
        allocatedSum += allocated;
      }
      const nextLine: RawDeliveryLine = [...l] as RawDeliveryLine;
      nextLine[4] = Math.max(0, allocated);
      return nextLine;
    });
  }

  let rev = 0;
  let bop = 0;
  let billedVal = 0;
  let unbilledVal = 0;
  let totalUnitQty = 0;
  let hasBilled = false;
  let hasUnbilled = false;
  let bestLine: RawDeliveryLine | null = null;

  for (const l of adjustedLines) {
    rev += l[4];
    bop += l[5];
    totalUnitQty += Number(l[10] ?? 0) || 0;
    if (l[6] === INVOICED_STATUS) {
      billedVal += l[4];
      hasBilled = true;
    } else {
      unbilledVal += l[4];
      hasUnbilled = true;
    }
    if (
      !bestLine ||
      l[4] > bestLine[4] ||
      (l[4] === 0 && bestLine[4] === 0 && l[5] > bestLine[5])
    ) {
      bestLine = l;
    }
  }

  const margin = rev - bop;
  const marginPct = rev > 0 ? (margin / rev) * 100 : null;

  return {
    src,
    ref,
    customer,
    date,
    month: date ? date.slice(0, 7) : '',
    lines: adjustedLines,
    rev,
    bop,
    margin,
    marginPct,
    billedVal,
    unbilledVal,
    hasBilled,
    hasUnbilled,
    category: (bestLine && bestLine[1]) || '(tanpa kategori)',
    uniqueDoCount: doSet.size,
    totalUnitQty,
  };
}

export function filterOrdersByProduct(
  orders: SalesOrderRecord[],
  source: 'all' | SourceKey
): SalesOrderRecord[] {
  if (source === 'all') return orders;
  const targetProd = source === 'TRP' ? 'Transporter' : 'VLI';
  const out: SalesOrderRecord[] = [];
  for (const s of orders) {
    const matchingLines = s.lines.filter(
      (l) => normalizeProductCategory(l[7], s.src) === targetProd
    );
    if (matchingLines.length === 0) continue;
    if (matchingLines.length === s.lines.length) {
      out.push(s);
    } else {
      out.push(createSalesOrderRecord(s.src, s.ref, s.customer, s.date, matchingLines));
    }
  }
  return out;
}

export function filterSalesOrders(
  orders: SalesOrderRecord[],
  filter: FilterState,
  skipMonth = false
): SalesOrderRecord[] {
  const q = filter.search.trim().toLowerCase();
  const scoped = filterOrdersByProduct(orders, filter.source);
  return scoped.filter((s) => {
    if (!skipMonth && filter.month.length > 0 && !filter.month.includes(s.month)) return false;
    if (filter.customer.length > 0 && !filter.customer.includes(s.customer)) return false;
    if (filter.modas.length > 0) {
      const hasMatchingModa = s.lines.some((l) =>
        filter.modas.includes(classifyModa(undefined, l[1], s.src).moda)
      );
      if (!hasMatchingModa) return false;
    }
    if (q) {
      const matchSo = s.ref.toLowerCase().includes(q);
      const matchCust = s.customer.toLowerCase().includes(q);
      const matchDo = s.lines.some(
        (l) =>
          l[0].toLowerCase().includes(q) ||
          (l[8] || '').toLowerCase().includes(q) ||
          (l[9] || '').toLowerCase().includes(q)
      );
      if (!matchSo && !matchCust && !matchDo) return false;
    }
    return true;
  });
}

export function computeMonthlyMetrics(ordersIgnoreMonth: SalesOrderRecord[]): MonthlyMetric[] {
  const map = new Map<
    string,
    {
      revenue: number;
      bop: number;
      soCount: number;
      doSet: Set<string>;
      billed: number;
      unbilled: number;
    }
  >();

  // Ensure full Jan - Dec 2026 calendar months are always present for YTD & target comparison
  for (let m = 1; m <= 12; m++) {
    const key = `2026-${String(m).padStart(2, '0')}`;
    map.set(key, {
      revenue: 0,
      bop: 0,
      soCount: 0,
      doSet: new Set<string>(),
      billed: 0,
      unbilled: 0,
    });
  }

  for (const s of ordersIgnoreMonth) {
    if (!s.month) continue;
    let bucket = map.get(s.month);
    if (!bucket) {
      bucket = {
        revenue: 0,
        bop: 0,
        soCount: 0,
        doSet: new Set<string>(),
        billed: 0,
        unbilled: 0,
      };
      map.set(s.month, bucket);
    }
    bucket.revenue += s.rev;
    bucket.bop += s.bop;
    bucket.soCount += 1;
    bucket.billed += s.billedVal;
    bucket.unbilled += s.unbilledVal;
    s.lines.forEach((l) => bucket!.doSet.add(l[0]));
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, b]) => {
      const margin = b.revenue - b.bop;
      return {
        month,
        label: formatMonthLabel(month),
        revenue: b.revenue,
        bop: b.bop,
        margin,
        marginPct: b.revenue > 0 ? (margin / b.revenue) * 100 : null,
        soCount: b.soCount,
        doCount: b.doSet.size,
        billed: b.billed,
        unbilled: b.unbilled,
      };
    });
}

export function computeCustomerSummary(orders: SalesOrderRecord[]): CustomerSummaryRow[] {
  const map = new Map<string, CustomerSummaryRow>();
  for (const s of orders) {
    let row = map.get(s.customer);
    if (!row) {
      row = {
        customer: s.customer,
        soCount: 0,
        revenue: 0,
        bop: 0,
        margin: 0,
        marginPct: null,
        billedRp: 0,
        billedSoCount: 0,
        unbilledRp: 0,
        unbilledSoCount: 0,
        unitQty: 0,
      };
      map.set(s.customer, row);
    }
    row.soCount += 1;
    row.revenue += s.rev;
    row.bop += s.bop;
    row.billedRp += s.billedVal;
    row.billedSoCount += s.hasBilled ? 1 : 0;
    row.unbilledRp += s.unbilledVal;
    row.unbilledSoCount += s.hasUnbilled ? 1 : 0;
    row.unitQty += s.totalUnitQty || 0;
  }

  return Array.from(map.values()).map((r) => {
    const margin = r.revenue - r.bop;
    return {
      ...r,
      margin,
      marginPct: r.revenue > 0 ? (margin / r.revenue) * 100 : null,
    };
  });
}

export function computeCategorySummary(orders: SalesOrderRecord[]): CategorySummaryRow[] {
  const map = new Map<string, { soCount: number; revenue: number; bop: number }>();
  for (const s of orders) {
    const cur = map.get(s.category) ?? { soCount: 0, revenue: 0, bop: 0 };
    cur.soCount += 1;
    cur.revenue += s.rev;
    cur.bop += s.bop;
    map.set(s.category, cur);
  }
  return Array.from(map.entries())
    .map(([category, v]) => {
      const margin = v.revenue - v.bop;
      return {
        category,
        soCount: v.soCount,
        revenue: v.revenue,
        bop: v.bop,
        margin,
        marginPct: v.revenue > 0 ? (margin / v.revenue) * 100 : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export function computeUnbilledAging(orders: SalesOrderRecord[], refDate: string) {
  const unbilledOrders = orders.filter((s) => s.unbilledVal > 0);
  const buckets = [
    { key: '0-30', label: '0–30 hari', min: 0, max: 30, value: 0, count: 0 },
    { key: '31-60', label: '31–60 hari', min: 31, max: 60, value: 0, count: 0 },
    { key: '60+', label: '> 60 hari', min: 61, max: 1e9, value: 0, count: 0 },
  ];

  for (const s of unbilledOrders) {
    const age = calcAgeDays(refDate, s.date);
    const bucket = buckets.find((b) => age >= b.min && age <= b.max);
    if (bucket) {
      bucket.value += s.unbilledVal;
      bucket.count += 1;
    }
  }

  let toInvoiceVal = 0;
  let nothingToInvoiceVal = 0;
  for (const s of orders) {
    for (const l of s.lines) {
      if (l[6] === 'To Invoice') toInvoiceVal += l[4];
      else if (l[6] === 'Nothing to Invoice') nothingToInvoiceVal += l[4];
    }
  }

  return {
    buckets,
    toInvoiceVal,
    nothingToInvoiceVal,
    totalUnbilledOrders: unbilledOrders,
  };
}

export function computeTopRoutes(orders: SalesOrderRecord[], limit = 8) {
  const seenDo = new Set<string>();
  const routeMap = new Map<string, { route: string; count: number; rev: number }>();

  for (const s of orders) {
    for (const l of s.lines) {
      if (seenDo.has(l[0])) continue;
      seenDo.add(l[0]);
      const route = `${l[2] || '?'} → ${l[3] || '?'}`;
      const cur = routeMap.get(route) ?? { route, count: 0, rev: 0 };
      cur.count += 1;
      cur.rev += l[4];
      routeMap.set(route, cur);
    }
  }

  return Array.from(routeMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function computeLineInvoiceStatuses(orders: SalesOrderRecord[]) {
  const statusMap = new Map<string, { status: string; lineCount: number; value: number }>();
  for (const s of orders) {
    for (const l of s.lines) {
      const status = l[6] || '-';
      const cur = statusMap.get(status) ?? { status, lineCount: 0, value: 0 };
      cur.lineCount += 1;
      cur.value += l[4];
      statusMap.set(status, cur);
    }
  }
  return Array.from(statusMap.values()).sort((a, b) => b.lineCount - a.lineCount);
}

export function normalizeProductCategory(raw?: string, fallbackSrc?: SourceKey): string {
  const cleaned = (raw ?? '').trim();
  if (cleaned) {
    const upper = cleaned.toUpperCase();
    if (upper === 'TRP' || upper.includes('TRANSPORTER')) return 'Transporter';
    if (upper === 'VLI' || upper.includes('VLI')) return 'VLI';
    return cleaned;
  }
  return fallbackSrc === 'TRP' ? 'Transporter' : 'VLI';
}

export const MODA_ORDER: ModaKey[] = [
  'Self Drive',
  'Car Carrier',
  'Shipment',
  'Transporter',
];

const CAR_CARRIER_CATEGORIES = new Set([
  'CC SINGLE TOWING',
  'SELF LOADER',
  'MOTOR CARRIER JUMBO',
  'MOTOR CARRIER',
  'CC DOUBLE TOWING',
  'CC SEMI TRAILER',
]);

export function classifyModa(
  productCategoryRaw: string | undefined,
  lineCategoryRaw: string,
  fallbackSrc: SourceKey
): { moda: ModaKey; detail: string } {
  const prod = normalizeProductCategory(productCategoryRaw, fallbackSrc);
  const lineCat = (lineCategoryRaw || '').trim();
  const upperCat = lineCat.toUpperCase();

  if (prod === 'Transporter') {
    return {
      moda: 'Transporter',
      detail: lineCat || 'Transporter',
    };
  }

  if (upperCat === 'SELF DRIVE') {
    return { moda: 'Self Drive', detail: 'SELF DRIVE' };
  }

  if (CAR_CARRIER_CATEGORIES.has(upperCat)) {
    return { moda: 'Car Carrier', detail: lineCat || 'CAR CARRIER' };
  }

  if (upperCat === 'SHIPMENT RORO' || upperCat.includes('SHIPMENT')) {
    return { moda: 'Shipment', detail: lineCat || 'SHIPMENT RORO' };
  }

  return {
    moda: 'Shipment',
    detail: lineCat || 'SHIPMENT RORO',
  };
}

/**
 * Distribute 1 SO's total revenue across its DO lines proportionally to each DO's actual BOP.
 * Falls back to equal distribution across DO lines when total SO BOP is 0.
 */
export function getDistributedLineRevenue(
  order: SalesOrderRecord,
  line: SalesOrderRecord['lines'][number]
): number {
  if (order.lines.length <= 1) return order.rev;
  if (order.bop > 0) {
    return order.rev * ((line[5] || 0) / order.bop);
  }
  return order.rev / order.lines.length;
}

export function computeModaSummary(orders: SalesOrderRecord[]): ModaSummaryMetric[] {
  interface Acc {
    revenue: number;
    bop: number;
    soSet: Set<string>;
    doSet: Set<string>;
    lineCount: number;
    unitQty: number;
  }

  const makeAcc = (): Acc => ({
    revenue: 0,
    bop: 0,
    soSet: new Set(),
    doSet: new Set(),
    lineCount: 0,
    unitQty: 0,
  });

  const modaMap = new Map<
    ModaKey,
    { acc: Acc; details: Map<string, Acc> }
  >();

  MODA_ORDER.forEach((m) => {
    modaMap.set(m, { acc: makeAcc(), details: new Map() });
  });

  for (const s of orders) {
    const soKey = `${s.src}:${s.ref}`;
    for (const l of s.lines) {
      const { moda, detail } = classifyModa(l[7], l[1], s.src);
      const bucket = modaMap.get(moda)!;
      const distRev = getDistributedLineRevenue(s, l);
      const lineUnitQty = Number(l[10] ?? 0) || 0;

      bucket.acc.revenue += distRev;
      bucket.acc.bop += l[5];
      bucket.acc.soSet.add(soKey);
      if (l[0]) bucket.acc.doSet.add(l[0]);
      bucket.acc.lineCount += 1;
      bucket.acc.unitQty += lineUnitQty;

      let dAcc = bucket.details.get(detail);
      if (!dAcc) {
        dAcc = makeAcc();
        bucket.details.set(detail, dAcc);
      }
      dAcc.revenue += distRev;
      dAcc.bop += l[5];
      dAcc.soSet.add(soKey);
      if (l[0]) dAcc.doSet.add(l[0]);
      dAcc.lineCount += 1;
      dAcc.unitQty += lineUnitQty;
    }
  }

  return MODA_ORDER.map((moda) => {
    const bucket = modaMap.get(moda)!;
    const { revenue, bop, soSet, doSet, lineCount, unitQty } = bucket.acc;
    const margin = revenue - bop;

    const details: ModaDetailMetric[] = Array.from(bucket.details.entries())
      .map(([detail, d]) => {
        const dMargin = d.revenue - d.bop;
        return {
          detail,
          revenue: d.revenue,
          bop: d.bop,
          margin: dMargin,
          marginPct: d.revenue > 0 ? (dMargin / d.revenue) * 100 : null,
          soCount: d.soSet.size,
          doCount: d.doSet.size,
          lineCount: d.lineCount,
          unitQty: d.unitQty,
        };
      })
      .sort((a, b) => b.revenue - a.revenue || b.doCount - a.doCount);

    return {
      moda,
      revenue,
      bop,
      margin,
      marginPct: revenue > 0 ? (margin / revenue) * 100 : null,
      soCount: soSet.size,
      doCount: doSet.size,
      lineCount,
      unitQty,
      details,
    };
  });
}

export function computeMonthlyModaMetrics(
  ordersIgnoreMonth: SalesOrderRecord[]
): MonthlyModaMetric[] {
  interface SideAcc {
    revenue: number;
    bop: number;
    soSet: Set<string>;
    doSet: Set<string>;
  }
  const makeSide = (): SideAcc => ({
    revenue: 0,
    bop: 0,
    soSet: new Set(),
    doSet: new Set(),
  });

  const map = new Map<string, Record<ModaKey, SideAcc>>();

  for (const s of ordersIgnoreMonth) {
    if (!s.month) continue;
    let entry = map.get(s.month);
    if (!entry) {
      entry = {
        Transporter: makeSide(),
        'Car Carrier': makeSide(),
        'Self Drive': makeSide(),
        Shipment: makeSide(),
      };
      map.set(s.month, entry);
    }
    const soKey = `${s.src}:${s.ref}`;
    for (const l of s.lines) {
      const { moda } = classifyModa(l[7], l[1], s.src);
      const side = entry[moda];
      side.revenue += getDistributedLineRevenue(s, l);
      side.bop += l[5];
      side.soSet.add(soKey);
      if (l[0]) side.doSet.add(l[0]);
    }
  }

  const finalizeSide = (acc: SideAcc): MonthlyModaSideMetric => ({
    revenue: acc.revenue,
    bop: acc.bop,
    margin: acc.revenue - acc.bop,
    doCount: acc.doSet.size,
    soCount: acc.soSet.size,
  });

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({
      month,
      label: formatMonthLabel(month),
      byModa: {
        Transporter: finalizeSide(v.Transporter),
        'Car Carrier': finalizeSide(v['Car Carrier']),
        'Self Drive': finalizeSide(v['Self Drive']),
        Shipment: finalizeSide(v.Shipment),
      },
    }));
}

export function computeSourceStats(data: CustomerOrderMap | null) {
  if (!data) return null;
  let soCount = 0;
  let doCount = 0;
  let rev = 0;
  let bop = 0;
  let minDate = '';
  let maxDate = '';
  const doSet = new Set<string>();

  for (const p of Object.keys(data)) {
    for (const x of data[p]) {
      soCount += 1;
      const d = reconcileSoDate(x[0], x[1]);
      if (d) {
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
      }
      for (const l of x[2]) {
        doSet.add(l[0]);
        rev += l[4];
        bop += l[5];
      }
    }
  }
  doCount = doSet.size;
  return { soCount, doCount, rev, bop, minDate, maxDate };
}

// Excel parser matching exact Odoo Sales Order Line rules
const isEmptyCell = (v: unknown) => v === null || v === undefined || v === '';
const toNumber = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (isEmptyCell(v)) return 0;
  const parsed = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const toDateString = (v: unknown): string => {
  if (isEmptyCell(v)) return '';
  if (typeof v === 'number') {
    const daySerial = Math.floor(v);
    return new Date((daySerial - 25569) * 86400000).toISOString().slice(0, 10);
  }
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  const str = String(v).trim();
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }
  return str.slice(0, 10);
};
const fmtMiliar = (x: number) => `Rp${(x / 1e9).toFixed(2)} M`;

export function parseSalesOrderExcel(buffer: ArrayBuffer): {
  DT: CustomerOrderMap;
  dq: DataQualityRow[];
  nSO: number;
  prod: string;
  dateColumnUsed: string;
  priceColumnUsed: string;
  nopolCount: number;
  nopolFilledCount: number;
} {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

  const header = (rows[0] || []).map((x) => String(x ?? '').trim());
  const headerLower = header.map((h) => h.toLowerCase());
  const findColIndex = (col: string): number => {
    const exact = header.indexOf(col);
    if (exact >= 0) return exact;
    return headerLower.indexOf(col.toLowerCase());
  };

  const dateColMatches = DATE_COLUMN_PRIORITY.filter((col) => findColIndex(col) >= 0);
  const priceColMatches = PRICE_COLUMN_PRIORITY.filter((col) => findColIndex(col) >= 0);
  const missing: string[] = REQUIRED_COLUMNS.filter((col) => findColIndex(col) < 0);
  if (dateColMatches.length === 0) {
    missing.splice(2, 0, 'Delivery Order/Plan Loading Time');
  }
  if (priceColMatches.length === 0) {
    missing.push('Delivery Order/Total Price (atau Unit Price)');
  }
  if (missing.length > 0) {
    throw new Error(
      `Kolom tidak ditemukan: ${missing.join(', ')}. Gunakan template Sales Order Line Odoo yang sesuai.`
    );
  }

  const idx: Record<string, number> = {};
  [
    ...REQUIRED_COLUMNS,
    ...DATE_COLUMN_PRIORITY,
    ...PRICE_COLUMN_PRIORITY,
    'Delivery Order/Product Category',
  ].forEach((col) => {
    idx[col] = findColIndex(col);
  });
  const findFirstColIndex = (candidates: string[]): number => {
    for (const c of candidates) {
      const colIdx = findColIndex(c);
      if (colIdx >= 0) return colIdx;
    }
    return -1;
  };
  const vehicleColIdx = findFirstColIndex([
    'Fleet DOs/Vehicle',
    'Fleet DO/Vehicle',
    'Vehicle',
  ]);
  const plateColIdx = findFirstColIndex([
    'Fleet DOs/Vehicle/License Plate',
    'Fleet DO/Vehicle/License Plate',
    'License Plate',
    'Nopol',
  ]);
  const unitQtyColIdx = findFirstColIndex([
    'UNIT/PCS',
    'Unit/Pcs',
    'UNIT / PCS',
    'Unit/PCS',
    'Qty',
    'Quantity',
  ]);
  const primaryDateCol = dateColMatches[0];
  const primaryPriceCol = priceColMatches[0];

  interface GroupedRow {
    r: unknown[];
    invs: Array<[unknown, unknown]>;
  }

  const parsedRows: GroupedRow[] = [];
  let last: GroupedRow | null = null;

  for (let k = 1; k < rows.length; k++) {
    const r = rows[k];
    if (!r || r.every(isEmptyCell)) continue;
    const inv: [unknown, unknown] = [
      r[idx['Invoice Lines/Number']],
      r[idx['Invoice Lines/Date']],
    ];
    const hasInv = !isEmptyCell(inv[0]);
    if (!isEmptyCell(r[idx['Order Reference']])) {
      last = { r, invs: hasInv ? [inv] : [] };
      parsedRows.push(last);
    } else if (last && hasInv) {
      last.invs.push(inv);
    }
  }

  const seenSig = new Set<string>();
  const uniqueRows: GroupedRow[] = [];
  let nDup = 0;

  for (const p of parsedRows) {
    const sig =
      p.r.map((v) => (isEmptyCell(v) ? '' : String(v))).join('|') +
      '#' +
      p.invs.map((i) => i.join(':')).join(',');
    if (seenSig.has(sig)) {
      nDup += 1;
      continue;
    }
    seenSig.add(sig);
    uniqueRows.push(p);
  }

  const hasDO = (p: GroupedRow) => !isEmptyCell(p.r[idx['Delivery Order/Reference']]);
  const statusDO = (p: GroupedRow) =>
    isEmptyCell(p.r[idx['Delivery Order/Status Do']])
      ? ''
      : String(p.r[idx['Delivery Order/Status Do']]).trim();
  const isDoMatch = (p: GroupedRow) => statusDO(p).toLowerCase() === 'do match';

  const noDoRows = uniqueRows.filter((p) => !hasDO(p));
  const otherStatusRows = uniqueRows.filter((p) => hasDO(p) && !isDoMatch(p));
  const usedRows = uniqueRows.filter((p) => hasDO(p) && isDoMatch(p));

  const sumCol = (arr: GroupedRow[], col: string) =>
    arr.reduce((acc, p) => acc + toNumber(p.r[idx[col]]), 0);
  const getPriceValue = (row: unknown[]): number => {
    for (const pCol of priceColMatches) {
      const cIdx = idx[pCol];
      if (cIdx >= 0 && !isEmptyCell(row[cIdx])) {
        return toNumber(row[cIdx]);
      }
    }
    return 0;
  };
  const sumPrice = (arr: GroupedRow[]) =>
    arr.reduce((acc, p) => acc + Math.round(getPriceValue(p.r)), 0);

  const soMap = new Map<
    string,
    {
      partner: string | null;
      date: string;
      lines: RawDeliveryLine[];
      pr: number;
      bp: number;
    }
  >();
  const prodCount: Record<string, number> = {};
  const doToSo = new Map<string, Set<string>>();
  let nullBopCount = 0;
  let zeroPriceBopCount = 0;
  let zeroPriceBopSum = 0;
  let nopolFilledCount = 0;
  const nopolSet = new Set<string>();

  for (const p of usedRows) {
    const r = p.r;
    const ref = String(r[idx['Order Reference']]);
    let entry = soMap.get(ref);
    if (!entry) {
      entry = { partner: null, date: '', lines: [], pr: 0, bp: 0 };
      soMap.set(ref, entry);
    }
    const partnerCell = r[idx['Delivery Order/Partner']];
    if (entry.partner === null && !isEmptyCell(partnerCell)) {
      entry.partner = String(partnerCell);
    }
    let d = '';
    for (const dateCol of dateColMatches) {
      d = toDateString(r[idx[dateCol]]);
      if (d) break;
    }
    if (d && (!entry.date || d < entry.date)) {
      entry.date = d;
    }

    const strCol = (col: string) => (isEmptyCell(r[idx[col]]) ? '' : String(r[idx[col]]));
    const pr = Math.round(getPriceValue(r));
    const bp = Math.round(toNumber(r[idx['BOP']]));
    const dr = strCol('Delivery Order/Reference');

    if (isEmptyCell(r[idx['BOP']])) nullBopCount += 1;
    if (pr === 0 && bp > 0) {
      zeroPriceBopCount += 1;
      zeroPriceBopSum += bp;
    }

    const prodIdx = idx['Delivery Order/Product Category'];
    const prodCatRaw =
      prodIdx >= 0 && !isEmptyCell(r[prodIdx]) ? String(r[prodIdx]).trim() : '';
    const vehicleRaw =
      vehicleColIdx >= 0 && !isEmptyCell(r[vehicleColIdx])
        ? String(r[vehicleColIdx]).trim().replace(/\s+/g, ' ')
        : '';
    const plateRaw =
      plateColIdx >= 0 && !isEmptyCell(r[plateColIdx])
        ? String(r[plateColIdx]).trim().toUpperCase().replace(/\s+/g, ' ')
        : '';
    if (plateRaw && plateRaw !== '-' && plateRaw !== 'N/A' && plateRaw !== 'NONE') {
      nopolFilledCount += 1;
      nopolSet.add(plateRaw);
    }

    const unitQtyRaw =
      unitQtyColIdx >= 0 && !isEmptyCell(r[unitQtyColIdx])
        ? Math.round(toNumber(r[unitQtyColIdx]) * 100) / 100
        : 0;

    entry.pr += pr;
    entry.bp += bp;
    const line: RawDeliveryLine =
      unitQtyRaw > 0
        ? [
            dr,
            strCol('Delivery Order/Category'),
            strCol('Delivery Order/Origin'),
            strCol('Delivery Order/Destination'),
            pr,
            bp,
            strCol('Invoice Status'),
            prodCatRaw || '',
            vehicleRaw,
            plateRaw,
            unitQtyRaw,
          ]
        : vehicleRaw || plateRaw
        ? [
            dr,
            strCol('Delivery Order/Category'),
            strCol('Delivery Order/Origin'),
            strCol('Delivery Order/Destination'),
            pr,
            bp,
            strCol('Invoice Status'),
            prodCatRaw || '',
            vehicleRaw,
            plateRaw,
          ]
        : prodCatRaw
        ? [
            dr,
            strCol('Delivery Order/Category'),
            strCol('Delivery Order/Origin'),
            strCol('Delivery Order/Destination'),
            pr,
            bp,
            strCol('Invoice Status'),
            prodCatRaw,
          ]
        : [
            dr,
            strCol('Delivery Order/Category'),
            strCol('Delivery Order/Origin'),
            strCol('Delivery Order/Destination'),
            pr,
            bp,
            strCol('Invoice Status'),
          ];
    entry.lines.push(line);

    const set = doToSo.get(dr) ?? new Set<string>();
    set.add(ref);
    doToSo.set(dr, set);

    if (prodCatRaw) {
      prodCount[prodCatRaw] = (prodCount[prodCatRaw] || 0) + 1;
    }
  }

  const DT: CustomerOrderMap = {};
  let zeroRevSoCount = 0;
  let zeroRevSoBop = 0;

  soMap.forEach((o, ref) => {
    if (o.pr === 0 && o.bp > 0) {
      zeroRevSoCount += 1;
      zeroRevSoBop += o.bp;
    }
    const finalDate = reconcileSoDate(ref, o.date);
    const pn = o.partner || '(tanpa nama)';
    (DT[pn] = DT[pn] || []).push([ref, finalDate, o.lines]);
  });

  let sharedDoCount = 0;
  doToSo.forEach((s) => {
    if (s.size > 1) sharedDoCount += 1;
  });

  const topProd = Object.entries(prodCount).sort((a, b) => b[1] - a[1])[0];

  const dq: DataQualityRow[] = [
    [
      'Baris SO di file',
      parsedRows.length,
      'Di luar baris anak yang hanya memuat nomor invoice tambahan',
    ],
    ['Baris ganda dibuang', nDup, 'Baris yang sama persis, termasuk invoice-nya'],
    [
      'Baris tanpa DO (dikeluarkan)',
      noDoRows.length,
      `BOP ${fmtMiliar(sumCol(noDoRows, 'BOP'))}, harga ${fmtMiliar(sumPrice(noDoRows))} (perkiraan)`,
    ],
    [
      'Baris DO Draft / Line not Created (dikeluarkan)',
      otherStatusRows.length,
      `BOP ${fmtMiliar(sumCol(otherStatusRows, 'BOP'))}, harga ${fmtMiliar(sumPrice(otherStatusRows))} (perkiraan)`,
    ],
    ['Baris dipakai', usedRows.length, 'Dasar semua angka di dashboard'],
    ['Baris dipakai dengan BOP kosong', nullBopCount, 'Dihitung sebagai 0'],
    [
      'Baris berharga 0 tapi BOP terisi',
      zeroPriceBopCount,
      `BOP ${fmtMiliar(zeroPriceBopSum)}; sering baris shipment yang harganya dicatat di baris lain`,
    ],
    ['SO berrevenue 0 tapi BOP terisi', zeroRevSoCount, `BOP ${fmtMiliar(zeroRevSoBop)}`],
    ['DO yang muncul di lebih dari satu SO', sharedDoCount, 'Tetap tercatat di setiap SO'],
  ];

  if (plateColIdx >= 0 || vehicleColIdx >= 0) {
    dq.push([
      'Baris dengan Nopol terisi',
      nopolFilledCount,
      plateColIdx >= 0
        ? 'Kolom Fleet DOs/Vehicle/License Plate terdeteksi'
        : 'Kolom Fleet DOs/Vehicle terdeteksi (kolom License Plate belum ada)',
    ]);
  }

  return {
    DT,
    dq,
    nSO: soMap.size,
    prod: topProd ? topProd[0] : '',
    dateColumnUsed: primaryDateCol,
    priceColumnUsed: primaryPriceCol,
    nopolCount: nopolSet.size,
    nopolFilledCount,
  };
}

export function computeRouteNetworkSummary(orders: SalesOrderRecord[]): RouteCorridorRow[] {
  const seenDoPerRoute = new Map<string, Set<string>>();
  const routeMap = new Map<
    string,
    {
      route: string;
      origin: string;
      destination: string;
      soSet: Set<string>;
      revenue: number;
      bop: number;
      modaCounts: Record<ModaKey, number>;
      sampleSosMap: Map<string, SalesOrderRecord>;
    }
  >();

  for (const s of orders) {
    const soKey = `${s.src}:${s.ref}`;
    for (const l of s.lines) {
      const origin = (l[2] || '').trim();
      const destination = (l[3] || '').trim();
      if (!origin || !destination) continue;

      const route = `${origin} → ${destination}`;
      let bucket = routeMap.get(route);
      if (!bucket) {
        bucket = {
          route,
          origin,
          destination,
          soSet: new Set<string>(),
          revenue: 0,
          bop: 0,
          modaCounts: {
            Transporter: 0,
            'Car Carrier': 0,
            'Self Drive': 0,
            Shipment: 0,
          },
          sampleSosMap: new Map<string, SalesOrderRecord>(),
        };
        routeMap.set(route, bucket);
        seenDoPerRoute.set(route, new Set<string>());
      }

      const doSet = seenDoPerRoute.get(route)!;
      if (l[0]) doSet.add(l[0]);
      bucket.soSet.add(soKey);
      bucket.revenue += l[4];
      bucket.bop += l[5];

      const { moda } = classifyModa(l[7], l[1], s.src);
      bucket.modaCounts[moda] += 1;

      if (bucket.sampleSosMap.size < 8 && !bucket.sampleSosMap.has(soKey)) {
        bucket.sampleSosMap.set(soKey, s);
      }
    }
  }

  return Array.from(routeMap.entries())
    .map(([route, b]) => {
      const doCount = seenDoPerRoute.get(route)?.size || 0;
      let primaryModa: ModaKey = 'Self Drive';
      let maxModaCount = -1;
      for (const m of MODA_ORDER) {
        if (b.modaCounts[m] > maxModaCount) {
          maxModaCount = b.modaCounts[m];
          primaryModa = m;
        }
      }
      return {
        route: b.route,
        origin: b.origin,
        destination: b.destination,
        doCount,
        soCount: b.soSet.size,
        revenue: b.revenue,
        bop: b.bop,
        margin: b.revenue - b.bop,
        primaryModa,
        modaCounts: b.modaCounts,
        sampleSos: Array.from(b.sampleSosMap.values()),
      };
    })
    .sort((a, b) => b.doCount - a.doCount || b.revenue - a.revenue);
}

export function buildMultiLegJourney(so: SalesOrderRecord): SoLegStep[] {
  return so.lines
    .filter((l) => (l[2] || '').trim() && (l[3] || '').trim())
    .map((l, idx) => {
      const { moda } = classifyModa(l[7], l[1], so.src);
      return {
        index: idx + 1,
        doRef: l[0],
        category: l[1] || '-',
        moda,
        origin: (l[2] || '').trim(),
        destination: (l[3] || '').trim(),
        rev: l[4],
        bop: l[5],
        invoiceStatus: l[6] || '-',
      };
    });
}

const VENDOR_NOPOL_LIST = new Set([
  'AFR-TOB01',
  'ALP-001',
  'ASA MULTI TRANSPORT',
  'AUL-001',
  'AWL-TOB01',
  'DLU-001',
  'DPL-001',
  'DPL -001',
  'FBN-01',
  'FMB-001',
  'GGMJ',
  'JAYA SAKTI SEJATI',
  'JLN-001',
  'JLN-AIS',
  'JLN-OMR',
  'JLN-RAN',
  'LTS-TOB02',
  'MM SEJATI',
  'SAP-001',
  'SHILOH SEJATI',
  'SHT-TOB01',
  'SIMFONI SEJATI',
  'SPIL-001',
  'TM-TBO01',
].map((s) => s.trim().toUpperCase()));

export function classifyNopolType(nopol: string, vehicle: string): 'Vendor' | 'Asset' {
  const cn = (nopol || '').trim().toUpperCase();
  const cv = (vehicle || '').trim().toUpperCase();
  if (VENDOR_NOPOL_LIST.has(cn)) return 'Vendor';
  for (const v of VENDOR_NOPOL_LIST) {
    if (cn.includes(v) || cv.includes(v)) return 'Vendor';
  }
  return 'Asset';
}

export function computeOperationAnalytics(orders: SalesOrderRecord[]): OperationAnalytics {
  interface UnitAcc {
    unit: string;
    modaCounts: Record<ModaKey, number>;
    doSet: Set<string>;
    soSet: Set<string>;
    customerSet: Set<string>;
    lineCount: number;
    unitQty: number;
    revenue: number;
    bop: number;
    customers: Map<string, { doSet: Set<string>; bop: number; rev: number }>;
    routes: Map<string, { doSet: Set<string>; bop: number; rev: number }>;
    months: Map<string, { doSet: Set<string>; bop: number; revenue: number }>;
  }

  interface NopolAcc {
    nopol: string;
    vehicleCounts: Map<string, number>;
    unitCounts: Map<string, number>;
    doSet: Set<string>;
    soSet: Set<string>;
    customerSet: Set<string>;
    lineCount: number;
    unitQty: number;
    revenue: number;
    bop: number;
    customers: Map<string, { doSet: Set<string>; bop: number; rev: number }>;
    routes: Map<string, { doSet: Set<string>; bop: number; rev: number }>;
    months: Map<string, { doSet: Set<string>; bop: number; revenue: number }>;
    dates: Set<string>;
    daily: Map<
      string,
      {
        doSet: Set<string>;
        soSet: Set<string>;
        customerSet: Set<string>;
        routeSet: Set<string>;
        revenue: number;
        bop: number;
      }
    >;
  }

  const normalizePlate = (raw?: string): string => {
    const cleaned = (raw ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!cleaned || cleaned === '-' || cleaned === 'N/A' || cleaned === 'NONE') return '';
    return cleaned;
  };

  const unitMap = new Map<string, UnitAcc>();
  const nopolMap = new Map<string, NopolAcc>();
  const globalDoSet = new Set<string>();
  const nopolRecordedDoSet = new Set<string>();
  const originMap = new Map<string, { doSet: Set<string>; bop: number; revenue: number }>();
  const destMap = new Map<string, { doSet: Set<string>; bop: number; revenue: number }>();
  const allMonthsSet = new Set<string>();

  let totalLines = 0;
  let totalUnitQty = 0;
  let zeroBopLines = 0;
  let zeroRevWithBopLines = 0;
  let nopolRecordedRevenue = 0;
  let nopolUnassignedRevenue = 0;
  const legBreakdown = { single: 0, double: 0, multi: 0 };

  for (const s of orders) {
    const soKey = `${s.src}:${s.ref}`;
    if (s.month) allMonthsSet.add(s.month);

    if (s.uniqueDoCount <= 1) legBreakdown.single += 1;
    else if (s.uniqueDoCount === 2) legBreakdown.double += 1;
    else legBreakdown.multi += 1;

    for (const l of s.lines) {
      totalLines += 1;
      const lineUnitQty = Number(l[10] ?? 0) || 0;
      totalUnitQty += lineUnitQty;
      const doRef = l[0] || `LINE-${totalLines}`;
      if (l[0]) globalDoSet.add(l[0]);
      if (l[5] === 0) zeroBopLines += 1;
      if (l[4] === 0 && l[5] > 0) zeroRevWithBopLines += 1;

      const unitName = (l[1] || '(Tanpa Unit)').trim().toUpperCase();
      const origin = (l[2] || '').trim();
      const dest = (l[3] || '').trim();
      const route = origin && dest ? `${origin} → ${dest}` : '';
      const { moda } = classifyModa(l[7], l[1], s.src);
      const vehicleName = (l[8] || '').trim().replace(/\s+/g, ' ');
      const nopol = normalizePlate(l[9]);

      let uAcc = unitMap.get(unitName);
      if (!uAcc) {
        uAcc = {
          unit: unitName,
          modaCounts: {
            Transporter: 0,
            'Car Carrier': 0,
            'Self Drive': 0,
            Shipment: 0,
          },
          doSet: new Set<string>(),
          soSet: new Set<string>(),
          customerSet: new Set<string>(),
          lineCount: 0,
          unitQty: 0,
          revenue: 0,
          bop: 0,
          customers: new Map(),
          routes: new Map(),
          months: new Map(),
        };
        unitMap.set(unitName, uAcc);
      }

      uAcc.modaCounts[moda] += 1;
      uAcc.doSet.add(doRef);
      uAcc.soSet.add(soKey);
      uAcc.customerSet.add(s.customer);
      uAcc.lineCount += 1;
      uAcc.unitQty += lineUnitQty;
      uAcc.revenue += l[4];
      uAcc.bop += l[5];

      let cAcc = uAcc.customers.get(s.customer);
      if (!cAcc) {
        cAcc = { doSet: new Set<string>(), bop: 0, rev: 0 };
        uAcc.customers.set(s.customer, cAcc);
      }
      cAcc.doSet.add(doRef);
      cAcc.bop += l[5];
      cAcc.rev += l[4];

      if (route) {
        let rAcc = uAcc.routes.get(route);
        if (!rAcc) {
          rAcc = { doSet: new Set<string>(), bop: 0, rev: 0 };
          uAcc.routes.set(route, rAcc);
        }
        rAcc.doSet.add(doRef);
        rAcc.bop += l[5];
        rAcc.rev += l[4];
      }

      if (s.month) {
        let mAcc = uAcc.months.get(s.month);
        if (!mAcc) {
          mAcc = { doSet: new Set<string>(), bop: 0, revenue: 0 };
          uAcc.months.set(s.month, mAcc);
        }
        mAcc.doSet.add(doRef);
        mAcc.bop += l[5];
        mAcc.revenue += l[4];
      }

      if (nopol) {
        nopolRecordedRevenue += l[4];
        if (l[0]) nopolRecordedDoSet.add(l[0]);

        let nAcc = nopolMap.get(nopol);
        if (!nAcc) {
          nAcc = {
            nopol,
            vehicleCounts: new Map(),
            unitCounts: new Map(),
            doSet: new Set<string>(),
            soSet: new Set<string>(),
            customerSet: new Set<string>(),
            lineCount: 0,
            unitQty: 0,
            revenue: 0,
            bop: 0,
            customers: new Map(),
            routes: new Map(),
            months: new Map(),
            dates: new Set<string>(),
            daily: new Map(),
          };
          nopolMap.set(nopol, nAcc);
        }

        if (s.date) {
          nAcc.dates.add(s.date);
          let dAcc = nAcc.daily.get(s.date);
          if (!dAcc) {
            dAcc = {
              doSet: new Set<string>(),
              soSet: new Set<string>(),
              customerSet: new Set<string>(),
              routeSet: new Set<string>(),
              revenue: 0,
              bop: 0,
            };
            nAcc.daily.set(s.date, dAcc);
          }
          dAcc.doSet.add(doRef);
          dAcc.soSet.add(soKey);
          dAcc.customerSet.add(s.customer);
          if (route) dAcc.routeSet.add(route);
          dAcc.revenue += l[4];
          dAcc.bop += l[5];
        }

        if (vehicleName) {
          nAcc.vehicleCounts.set(vehicleName, (nAcc.vehicleCounts.get(vehicleName) || 0) + 1);
        }
        nAcc.unitCounts.set(unitName, (nAcc.unitCounts.get(unitName) || 0) + 1);
        nAcc.doSet.add(doRef);
        nAcc.soSet.add(soKey);
        nAcc.customerSet.add(s.customer);
        nAcc.lineCount += 1;
        nAcc.unitQty += lineUnitQty;
        nAcc.revenue += l[4];
        nAcc.bop += l[5];

        let ncAcc = nAcc.customers.get(s.customer);
        if (!ncAcc) {
          ncAcc = { doSet: new Set<string>(), bop: 0, rev: 0 };
          nAcc.customers.set(s.customer, ncAcc);
        }
        ncAcc.doSet.add(doRef);
        ncAcc.bop += l[5];
        ncAcc.rev += l[4];

        if (route) {
          let nrAcc = nAcc.routes.get(route);
          if (!nrAcc) {
            nrAcc = { doSet: new Set<string>(), bop: 0, rev: 0 };
            nAcc.routes.set(route, nrAcc);
          }
          nrAcc.doSet.add(doRef);
          nrAcc.bop += l[5];
          nrAcc.rev += l[4];
        }

        if (s.month) {
          let nmAcc = nAcc.months.get(s.month);
          if (!nmAcc) {
            nmAcc = { doSet: new Set<string>(), bop: 0, revenue: 0 };
            nAcc.months.set(s.month, nmAcc);
          }
          nmAcc.doSet.add(doRef);
          nmAcc.bop += l[5];
          nmAcc.revenue += l[4];
        }
      } else {
        nopolUnassignedRevenue += l[4];
      }

      if (origin) {
        let oAcc = originMap.get(origin);
        if (!oAcc) {
          oAcc = { doSet: new Set<string>(), bop: 0, revenue: 0 };
          originMap.set(origin, oAcc);
        }
        oAcc.doSet.add(doRef);
        oAcc.bop += l[5];
        oAcc.revenue += l[4];
      }

      if (dest) {
        let dAcc = destMap.get(dest);
        if (!dAcc) {
          dAcc = { doSet: new Set<string>(), bop: 0, revenue: 0 };
          destMap.set(dest, dAcc);
        }
        dAcc.doSet.add(doRef);
        dAcc.bop += l[5];
        dAcc.revenue += l[4];
      }
    }
  }

  const sortedMonths = Array.from(allMonthsSet).sort((a, b) => a.localeCompare(b));
  const monthlyUnitMonths = sortedMonths.map((month) => ({
    month,
    label: formatMonthLabel(month),
  }));

  const rawUnits = Array.from(unitMap.values());
  const sumUnitDos = rawUnits.reduce((acc, u) => acc + u.doSet.size, 0) || 1;

  const classifyTier = (sharePct: number): UnitFrequencyTier => {
    if (sharePct >= 25) return 'Sangat Sering';
    if (sharePct >= 15) return 'Sering';
    if (sharePct >= 5) return 'Sedang';
    return 'Jarang Dipakai';
  };

  const units: UnitUsageRow[] = rawUnits
    .map((u) => {
      const doCount = u.doSet.size;
      const sharePct = (doCount / sumUnitDos) * 100;
      const margin = u.revenue - u.bop;

      let primaryModa: ModaKey = 'Self Drive';
      let bestModaCnt = -1;
      for (const m of MODA_ORDER) {
        if (u.modaCounts[m] > bestModaCnt) {
          bestModaCnt = u.modaCounts[m];
          primaryModa = m;
        }
      }

      const topRoutes = Array.from(u.routes.entries())
        .map(([route, val]) => ({
          route,
          doCount: val.doSet.size,
          bop: val.bop,
          rev: val.rev,
        }))
        .sort((a, b) => b.doCount - a.doCount || b.bop - a.bop)
        .slice(0, 6);

      const topCustomers = Array.from(u.customers.entries())
        .map(([customer, val]) => ({
          customer,
          doCount: val.doSet.size,
          bop: val.bop,
          rev: val.rev,
        }))
        .sort((a, b) => b.doCount - a.doCount || b.bop - a.bop)
        .slice(0, 6);

      const monthlyTrend = sortedMonths.map((month) => {
        const m = u.months.get(month);
        return {
          month,
          label: formatMonthLabel(month),
          doCount: m ? m.doSet.size : 0,
          bop: m ? m.bop : 0,
          revenue: m ? m.revenue : 0,
        };
      });

      return {
        unit: u.unit,
        moda: primaryModa,
        doCount,
        soCount: u.soSet.size,
        lineCount: u.lineCount,
        unitQty: u.unitQty,
        customerCount: u.customerSet.size,
        revenue: u.revenue,
        bop: u.bop,
        margin,
        marginPct: u.revenue > 0 ? (margin / u.revenue) * 100 : null,
        avgBopPerDo: doCount > 0 ? u.bop / doCount : 0,
        avgRevPerDo: doCount > 0 ? u.revenue / doCount : 0,
        sharePct,
        tier: classifyTier(sharePct),
        topRoute: topRoutes[0]?.route || '-',
        topCustomers,
        topRoutes,
        monthlyTrend,
      };
    })
    .sort((a, b) => b.doCount - a.doCount || a.unit.localeCompare(b.unit));

  const totalNopolRev = nopolRecordedRevenue || 1;
  const nopols: NopolRevenueRow[] = Array.from(nopolMap.values())
    .map((n) => {
      const doCount = n.doSet.size;
      const margin = n.revenue - n.bop;
      const topVehicle = Array.from(n.vehicleCounts.entries()).sort(
        (a, b) => b[1] - a[1]
      )[0]?.[0];
      const unitTypes = Array.from(n.unitCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([uName]) => uName);

      const topRoutes = Array.from(n.routes.entries())
        .map(([route, val]) => ({
          route,
          doCount: val.doSet.size,
          bop: val.bop,
          rev: val.rev,
        }))
        .sort((a, b) => b.rev - a.rev || b.doCount - a.doCount)
        .slice(0, 6);

      const topCustomers = Array.from(n.customers.entries())
        .map(([customer, val]) => ({
          customer,
          doCount: val.doSet.size,
          bop: val.bop,
          rev: val.rev,
        }))
        .sort((a, b) => b.rev - a.rev || b.doCount - a.doCount)
        .slice(0, 6);

      const monthlyTrend = sortedMonths.map((month) => {
        const m = n.months.get(month);
        return {
          month,
          label: formatMonthLabel(month),
          doCount: m ? m.doSet.size : 0,
          bop: m ? m.bop : 0,
          revenue: m ? m.revenue : 0,
        };
      });

      const sortedDates = Array.from(n.dates).sort();
      const minDate = sortedDates[0] || '';
      const maxDate = sortedDates[sortedDates.length - 1] || '';
      const nopolType = classifyNopolType(n.nopol, topVehicle || '');

      const dailyTrend = Array.from(n.daily.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, d]) => ({
          date,
          doCount: d.doSet.size,
          soCount: d.soSet.size,
          customerCount: d.customerSet.size,
          revenue: d.revenue,
          bop: d.bop,
          margin: d.revenue - d.bop,
          routes: Array.from(d.routeSet),
          customers: Array.from(d.customerSet),
        }));

      return {
        nopol: n.nopol,
        vehicle: topVehicle || '-',
        unitTypes,
        nopolType,
        minDate,
        maxDate,
        doCount,
        soCount: n.soSet.size,
        lineCount: n.lineCount,
        unitQty: n.unitQty,
        customerCount: n.customerSet.size,
        revenue: n.revenue,
        bop: n.bop,
        margin,
        marginPct: n.revenue > 0 ? (margin / n.revenue) * 100 : null,
        avgRevPerDo: doCount > 0 ? n.revenue / doCount : 0,
        avgBopPerDo: doCount > 0 ? n.bop / doCount : 0,
        sharePct: nopolRecordedRevenue > 0 ? (n.revenue / totalNopolRev) * 100 : 0,
        topRoute: topRoutes[0]?.route || '-',
        topRoutes,
        topCustomers,
        monthlyTrend,
        dailyTrend,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.doCount - a.doCount || a.nopol.localeCompare(b.nopol));

  let nopolUnassignedDoCount = 0;
  globalDoSet.forEach((doRef) => {
    if (!nopolRecordedDoSet.has(doRef)) nopolUnassignedDoCount += 1;
  });

  const mapHubs = (m: Map<string, { doSet: Set<string>; bop: number; revenue: number }>): HubActivityRow[] =>
    Array.from(m.entries())
      .map(([hub, val]) => ({
        hub,
        doCount: val.doSet.size,
        bop: val.bop,
        revenue: val.revenue,
      }))
      .sort((a, b) => b.doCount - a.doCount || b.bop - a.bop)
      .slice(0, 8);

  return {
    units,
    nopols,
    nopolRecordedDoCount: nopolRecordedDoSet.size,
    nopolRecordedRevenue,
    nopolUnassignedDoCount,
    nopolUnassignedRevenue,
    totalUniqueDo: globalDoSet.size,
    totalLines,
    totalUnitQty,
    origins: mapHubs(originMap),
    destinations: mapHubs(destMap),
    legBreakdown,
    zeroBopLines,
    zeroRevWithBopLines,
    monthlyUnitMonths,
  };
}
