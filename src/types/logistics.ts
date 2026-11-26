import type { CustomerOrderMap, DataQualityRow, RawDeliveryLine } from '../data/initialLogisticsData';

export type SourceKey = 'TRP' | 'VLI';

export type InvoiceStatus = 'Fully Invoiced' | 'To Invoice' | 'Nothing to Invoice' | string;

export interface SourceMeta {
  file: string;
  at: string;
  prod: string;
  warn?: string;
}

export interface SourceState {
  key: SourceKey;
  label: string;
  data: CustomerOrderMap | null;
  dq: DataQualityRow[] | null;
  meta: SourceMeta | null;
  isDefault: boolean;
}

export interface SalesOrderRecord {
  src: SourceKey;
  ref: string;
  customer: string;
  date: string;
  month: string; // YYYY-MM
  lines: RawDeliveryLine[];
  rev: number;
  bop: number;
  margin: number;
  marginPct: number | null;
  billedVal: number;
  unbilledVal: number;
  hasBilled: boolean;
  hasUnbilled: boolean;
  category: string;
  uniqueDoCount: number;
  totalUnitQty: number;
}

export interface FilterState {
  source: 'all' | SourceKey;
  month: string[];
  customer: string[];
  modas: ModaKey[];
  search: string;
}

export interface MonthlyMetric {
  month: string;
  label: string;
  revenue: number;
  bop: number;
  margin: number;
  marginPct: number | null;
  soCount: number;
  doCount: number;
  billed: number;
  unbilled: number;
}

export interface CustomerSummaryRow {
  customer: string;
  soCount: number;
  revenue: number;
  bop: number;
  margin: number;
  marginPct: number | null;
  billedRp: number;
  billedSoCount: number;
  unbilledRp: number;
  unbilledSoCount: number;
  unitQty: number;
}

export interface CategorySummaryRow {
  category: string;
  soCount: number;
  revenue: number;
  bop: number;
  margin: number;
  marginPct: number | null;
}

export type ModaKey = 'Transporter' | 'Car Carrier' | 'Self Drive' | 'Shipment';

export interface ModaDetailMetric {
  detail: string;
  revenue: number;
  bop: number;
  margin: number;
  marginPct: number | null;
  soCount: number;
  doCount: number;
  lineCount: number;
  unitQty: number;
}

export interface ModaSummaryMetric {
  moda: ModaKey;
  revenue: number;
  bop: number;
  margin: number;
  marginPct: number | null;
  soCount: number;
  doCount: number;
  lineCount: number;
  unitQty: number;
  details: ModaDetailMetric[];
}

export interface MonthlyModaSideMetric {
  revenue: number;
  bop: number;
  margin: number;
  doCount: number;
  soCount: number;
}

export interface MonthlyModaMetric {
  month: string;
  label: string;
  byModa: Record<ModaKey, MonthlyModaSideMetric>;
}

export interface RouteCorridorRow {
  route: string;
  origin: string;
  destination: string;
  doCount: number;
  soCount: number;
  revenue: number;
  bop: number;
  margin: number;
  primaryModa: ModaKey;
  modaCounts: Record<ModaKey, number>;
  sampleSos: SalesOrderRecord[];
}

export interface SoLegStep {
  index: number;
  doRef: string;
  category: string;
  moda: ModaKey;
  origin: string;
  destination: string;
  rev: number;
  bop: number;
  invoiceStatus: string;
}

export type UnitFrequencyTier =
  | 'Sangat Sering'
  | 'Sering'
  | 'Sedang'
  | 'Jarang Dipakai';

export interface UnitUsageRow {
  unit: string;
  moda: ModaKey;
  doCount: number;
  soCount: number;
  lineCount: number;
  unitQty: number;
  customerCount: number;
  revenue: number;
  bop: number;
  margin: number;
  marginPct: number | null;
  avgBopPerDo: number;
  avgRevPerDo: number;
  sharePct: number;
  tier: UnitFrequencyTier;
  topRoute: string;
  topCustomers: Array<{ customer: string; doCount: number; bop: number; rev: number }>;
  topRoutes: Array<{ route: string; doCount: number; bop: number; rev: number }>;
  monthlyTrend: Array<{
    month: string;
    label: string;
    doCount: number;
    bop: number;
    revenue: number;
  }>;
}

export interface HubActivityRow {
  hub: string;
  doCount: number;
  bop: number;
  revenue: number;
}

export interface NopolDailyUtilizationRow {
  date: string;
  doCount: number;
  soCount: number;
  customerCount: number;
  revenue: number;
  bop: number;
  margin: number;
  routes: string[];
  customers: string[];
}

export interface NopolRevenueRow {
  nopol: string;
  vehicle: string;
  unitTypes: string[];
  nopolType: 'Vendor' | 'Asset';
  minDate: string;
  maxDate: string;
  doCount: number;
  soCount: number;
  lineCount: number;
  unitQty: number;
  customerCount: number;
  revenue: number;
  bop: number;
  margin: number;
  marginPct: number | null;
  avgRevPerDo: number;
  avgBopPerDo: number;
  sharePct: number;
  topRoute: string;
  topRoutes: Array<{ route: string; doCount: number; bop: number; rev: number }>;
  topCustomers: Array<{ customer: string; doCount: number; bop: number; rev: number }>;
  monthlyTrend: Array<{
    month: string;
    label: string;
    doCount: number;
    bop: number;
    revenue: number;
  }>;
  dailyTrend: NopolDailyUtilizationRow[];
}

export interface OperationAnalytics {
  units: UnitUsageRow[];
  nopols: NopolRevenueRow[];
  nopolRecordedDoCount: number;
  nopolRecordedRevenue: number;
  nopolUnassignedDoCount: number;
  nopolUnassignedRevenue: number;
  totalUniqueDo: number;
  totalLines: number;
  totalUnitQty: number;
  origins: HubActivityRow[];
  destinations: HubActivityRow[];
  legBreakdown: {
    single: number;
    double: number;
    multi: number;
  };
  zeroBopLines: number;
  zeroRevWithBopLines: number;
  monthlyUnitMonths: Array<{ month: string; label: string }>;
}

export type DashboardSection =
  | 'performance'
  | 'tendays'
  | 'marketing'
  | 'finance'
  | 'operation'
  | 'sources';

export type FinancePic = 'DICKA' | 'IRFAN' | 'JOKO';

export const FINANCE_PICS: FinancePic[] = ['DICKA', 'IRFAN', 'JOKO'];
