import React, { useMemo, useState } from 'react';
import { ArrowRight, MapPin, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react';
import type {
  CustomerSummaryRow,
  ModaKey,
  ModaSummaryMetric,
  MonthlyMetric,
  SourceKey,
} from '../types/logistics';
import {
  formatInt,
  formatJuta,
  formatMarginPct,
  formatMiliar,
  formatMonthLabel,
} from '../utils/formatters';
import { getMonthlyTargets, MonthlyPerformanceChart } from './MonthlyPerformanceChart';

interface PerformanceViewProps {
  revenue: number;
  bop: number;
  soCount: number;
  doCount: number;
  unitQty?: number;
  billed: number;
  unbilled: number;
  totalBaselineSo: number;
  monthlyMetrics: MonthlyMetric[];
  selectedMonth: string[];
  onSelectMonth: (months: string[]) => void;
  sourceFilter: 'all' | SourceKey;
  selectedModas?: ModaKey[];
  hasTrpData: boolean;
  hasVliData: boolean;
  modaSummary: ModaSummaryMetric[];
  customerSummary: CustomerSummaryRow[];
  topRoutes: Array<{ route: string; count: number; rev: number }>;
  invoiceStatuses: Array<{ status: string; lineCount: number; value: number }>;
  onSelectCustomer: (customer: string) => void;
  onSelectRoute: (route: string) => void;
  onNavigateTab: (tab: 'marketing' | 'finance' | 'operation') => void;
}

const MODA_DOT: Record<ModaKey, string> = {
  Transporter: 'bg-indigo-500',
  'Car Carrier': 'bg-teal-600',
  'Self Drive': 'bg-sky-600',
  Shipment: 'bg-amber-500',
};

const MODA_HEX: Record<ModaKey, string> = {
  Transporter: '#6366F1',
  'Car Carrier': '#0D9488',
  'Self Drive': '#0284C7',
  Shipment: '#D97706',
};

const TRANSPORTER_UNIT_PALETTE: Array<{ hex: string; dot: string }> = [
  { hex: '#4F46E5', dot: 'bg-indigo-600' },
  { hex: '#6366F1', dot: 'bg-indigo-500' },
  { hex: '#0284C7', dot: 'bg-sky-600' },
  { hex: '#0D9488', dot: 'bg-teal-600' },
  { hex: '#F59E0B', dot: 'bg-amber-500' },
  { hex: '#8B5CF6', dot: 'bg-purple-500' },
  { hex: '#64748B', dot: 'bg-slate-500' },
];

export const PerformanceView: React.FC<PerformanceViewProps> = ({
  revenue,
  bop,
  soCount,
  doCount,
  unitQty = 0,
  billed,
  unbilled,
  totalBaselineSo,
  monthlyMetrics,
  selectedMonth,
  onSelectMonth,
  sourceFilter,
  selectedModas = [],
  hasTrpData,
  hasVliData,
  modaSummary,
  customerSummary,
  topRoutes,
  invoiceStatuses,
  onSelectCustomer,
  onSelectRoute,
  onNavigateTab,
}) => {
  const [modaMetric, setModaMetric] = useState<'revenue' | 'margin' | 'doCount'>('revenue');
  const [hoveredModaId, setHoveredModaId] = useState<string | null>(null);

  const margin = revenue - bop;
  const isNegMargin = margin < 0;
  const billedPct = revenue > 0 ? Math.min(100, (billed / revenue) * 100) : 0;
  const unbilledPct = revenue > 0 ? Math.min(100, (unbilled / revenue) * 100) : 0;
  const bopRatio = revenue > 0 ? (bop / revenue) * 100 : 0;

  // Target Penjualan Calculation for Active Filter & Scope
  const activeTargetData = useMemo(() => {
    let targetSum = 0;
    const monthsToSum =
      selectedMonth.length > 0 ? selectedMonth : monthlyMetrics.map((m) => m.month);
    monthsToSum.forEach((monthKey) => {
      const targets = getMonthlyTargets(monthKey);
      const tVal =
        sourceFilter === 'TRP'
          ? (targets.trp ?? 0)
          : sourceFilter === 'VLI'
          ? (targets.vli ?? 0)
          : (targets.total ?? 0);
      targetSum += tVal;
    });

    const achievePct = targetSum > 0 ? (revenue / targetSum) * 100 : null;
    const remainingTarget = Math.max(0, targetSum - revenue);
    const surplusTarget = Math.max(0, revenue - targetSum);
    const remainingMonths = monthlyMetrics.filter((m) => m.revenue <= 0).length;
    return { targetSum, achievePct, remainingTarget, surplusTarget, remainingMonths };
  }, [selectedMonth, monthlyMetrics, sourceFilter, revenue]);

  const isPartialModaFilter = selectedModas.length > 0;

  const dailyMetrics = useMemo(() => {
    const targetMonths =
      selectedMonth.length > 0
        ? selectedMonth
        : monthlyMetrics.filter((m) => m.revenue > 0).map((m) => m.month);

    const activeDays = targetMonths.reduce((sum, ym) => {
      const [yStr, mStr] = ym.split('-');
      const year = Number(yStr);
      const month = Number(mStr);
      if (!Number.isFinite(year) || !Number.isFinite(month)) return sum;
      return sum + new Date(year, month, 0).getDate();
    }, 0);

    const avgRevenuePerDay = activeDays > 0 ? revenue / activeDays : 0;
    const avgSoPerDay = activeDays > 0 ? soCount / activeDays : 0;
    const avgDoPerDay = activeDays > 0 ? doCount / activeDays : 0;
    const avgTargetPerDay =
      activeDays > 0 && activeTargetData.targetSum > 0
        ? activeTargetData.targetSum / activeDays
        : 0;
    const dailyAchievePct =
      avgTargetPerDay > 0 ? (avgRevenuePerDay / avgTargetPerDay) * 100 : null;

    return {
      activeDays,
      avgRevenuePerDay,
      avgSoPerDay,
      avgDoPerDay,
      avgTargetPerDay,
      dailyAchievePct,
    };
  }, [selectedMonth, monthlyMetrics, revenue, soCount, doCount, activeTargetData.targetSum]);

  // Year-to-Date (YTD) Cumulative Comparison: Actual Revenue/BOP/Margin vs Cumulative Monthly Target
  const ytdAnalysis = useMemo(() => {
    let cumTarget = 0;
    let cumRevenue = 0;
    let cumBop = 0;
    let cumMargin = 0;

    const rows = monthlyMetrics.map((m) => {
      const targets = getMonthlyTargets(m.month);
      const monthTarget =
        sourceFilter === 'TRP'
          ? (targets.trp ?? 0)
          : sourceFilter === 'VLI'
          ? (targets.vli ?? 0)
          : (targets.total ?? 0);

      cumTarget += monthTarget;
      cumRevenue += m.revenue;
      cumBop += m.bop;
      cumMargin += m.margin;

      const monthlyAchievePct = monthTarget > 0 ? (m.revenue / monthTarget) * 100 : null;
      const ytdAchievePct = cumTarget > 0 ? (cumRevenue / cumTarget) * 100 : null;
      const ytdVariance = cumRevenue - cumTarget;
      const ytdMarginPct = cumRevenue > 0 ? (cumMargin / cumRevenue) * 100 : null;

      return {
        month: m.month,
        label: m.label,
        monthTarget,
        monthRevenue: m.revenue,
        monthBop: m.bop,
        monthMargin: m.margin,
        monthlyAchievePct,
        cumTarget,
        cumRevenue,
        cumBop,
        cumMargin,
        ytdAchievePct,
        ytdVariance,
        ytdMarginPct,
      };
    });

    // Latest month with actual revenue > 0 represents the active YTD cutoff
    const activeRows = rows.filter((r) => r.monthRevenue > 0);
    const ytdCutoff = activeRows.length > 0 ? activeRows[activeRows.length - 1] : rows[rows.length - 1] ?? null;
    const fullYearRow = rows[rows.length - 1] ?? null;
    const fullYearTarget = fullYearRow?.cumTarget ?? 0;
    const fullYearRevenue = fullYearRow?.cumRevenue ?? 0;
    const fullYearAchievePct = fullYearTarget > 0 ? (fullYearRevenue / fullYearTarget) * 100 : null;

    return {
      rows,
      ytdCutoff,
      fullYearRow,
      fullYearTarget,
      fullYearAchievePct,
    };
  }, [monthlyMetrics, sourceFilter]);

  // MoM Growth Calculation
  const momGrowth = useMemo(() => {
    if (monthlyMetrics.length < 2) return null;
    if (selectedMonth.length === 1) {
      const idx = monthlyMetrics.findIndex((m) => m.month === selectedMonth[0]);
      if (idx > 0) {
        const prev = monthlyMetrics[idx - 1];
        if (prev.revenue > 0) {
          const pct = ((revenue - prev.revenue) / prev.revenue) * 100;
          return { pct, prevLabel: prev.label, isPositive: pct >= 0 };
        }
      }
      return null;
    }
    if (selectedMonth.length > 1) return null;
    const activeMonths = monthlyMetrics.filter((m) => m.revenue > 0);
    const latest = activeMonths[activeMonths.length - 1];
    const prev = activeMonths[activeMonths.length - 2];
    if (latest && prev && prev.revenue > 0) {
      const pct = ((latest.revenue - prev.revenue) / prev.revenue) * 100;
      return { pct, prevLabel: prev.label, isPositive: pct >= 0, latestLabel: latest.label };
    }
    return null;
  }, [monthlyMetrics, selectedMonth, revenue]);

  const sortedCustomers = useMemo(
    () => [...customerSummary].sort((a, b) => b.revenue - a.revenue),
    [customerSummary]
  );

  const top5Share =
    revenue > 0
      ? (sortedCustomers.slice(0, 5).reduce((a, c) => a + c.revenue, 0) / revenue) * 100
      : 0;
  const top10Share =
    revenue > 0
      ? (sortedCustomers.slice(0, 10).reduce((a, c) => a + c.revenue, 0) / revenue) * 100
      : 0;
  const maxCustRev = Math.max(1, sortedCustomers[0]?.revenue ?? 1);

  const donutRadius = 46;
  const donutCirc = 2 * Math.PI * donutRadius;

  interface DisplayModaSegment {
    id: string;
    label: string;
    val: number;
    soCount: number;
    doCount: number;
    revenue: number;
    bop: number;
    margin: number;
    pct: number;
    dash: number;
    offset: number;
    hex: string;
    dotClass: string;
  }

  const { modaSegments, totalModaValue } = useMemo(() => {
    let items: Array<{
      id: string;
      label: string;
      val: number;
      soCount: number;
      doCount: number;
      revenue: number;
      bop: number;
      margin: number;
      hex: string;
      dotClass: string;
    }> = [];

    if (sourceFilter === 'TRP') {
      const trpModa = modaSummary.find((m) => m.moda === 'Transporter');
      const details = trpModa?.details ?? [];

      const filtered = details
        .map((d) => {
          const rawVal =
            modaMetric === 'revenue'
              ? d.revenue
              : modaMetric === 'margin'
              ? d.margin
              : d.doCount;
          return {
            id: d.detail || 'Transporter',
            label: d.detail || 'Transporter',
            val: Math.max(0, rawVal),
            soCount: d.soCount,
            doCount: d.doCount,
            revenue: d.revenue,
            bop: d.bop,
            margin: d.margin,
          };
        })
        .filter((d) => d.val > 0)
        .sort((a, b) => b.val - a.val);

      if (filtered.length > 6) {
        const top5 = filtered.slice(0, 5);
        const others = filtered.slice(5);
        const otherVal = others.reduce((acc, it) => acc + it.val, 0);

        items = top5.map((it, idx) => ({
          ...it,
          hex: TRANSPORTER_UNIT_PALETTE[idx]?.hex ?? '#6366F1',
          dotClass: TRANSPORTER_UNIT_PALETTE[idx]?.dot ?? 'bg-indigo-500',
        }));

        if (otherVal > 0) {
          items.push({
            id: 'other',
            label: `Lainnya (${others.length} tipe)`,
            val: otherVal,
            soCount: others.reduce((acc, it) => acc + it.soCount, 0),
            doCount: others.reduce((acc, it) => acc + it.doCount, 0),
            revenue: others.reduce((acc, it) => acc + it.revenue, 0),
            bop: others.reduce((acc, it) => acc + it.bop, 0),
            margin: others.reduce((acc, it) => acc + it.margin, 0),
            hex: TRANSPORTER_UNIT_PALETTE[5]?.hex ?? '#64748B',
            dotClass: TRANSPORTER_UNIT_PALETTE[5]?.dot ?? 'bg-slate-500',
          });
        }
      } else {
        items = filtered.map((it, idx) => ({
          ...it,
          hex: TRANSPORTER_UNIT_PALETTE[idx % TRANSPORTER_UNIT_PALETTE.length].hex,
          dotClass: TRANSPORTER_UNIT_PALETTE[idx % TRANSPORTER_UNIT_PALETTE.length].dot,
        }));
      }
    } else if (sourceFilter === 'VLI') {
      const vliModas = modaSummary.filter((m) => m.moda !== 'Transporter');
      items = vliModas
        .map((m) => {
          const rawVal =
            modaMetric === 'revenue'
              ? m.revenue
              : modaMetric === 'margin'
              ? m.margin
              : m.doCount;
          return {
            id: m.moda,
            label: m.moda,
            val: Math.max(0, rawVal),
            soCount: m.soCount,
            doCount: m.doCount,
            revenue: m.revenue,
            bop: m.bop,
            margin: m.margin,
            hex: MODA_HEX[m.moda],
            dotClass: MODA_DOT[m.moda],
          };
        })
        .filter((it) => it.val > 0);
    } else {
      // sourceFilter === 'all'
      items = modaSummary.map((m) => {
        const rawVal =
          modaMetric === 'revenue'
            ? m.revenue
            : modaMetric === 'margin'
            ? m.margin
            : m.doCount;
        return {
          id: m.moda,
          label: m.moda,
          val: Math.max(0, rawVal),
          soCount: m.soCount,
          doCount: m.doCount,
          revenue: m.revenue,
          bop: m.bop,
          margin: m.margin,
          hex: MODA_HEX[m.moda],
          dotClass: MODA_DOT[m.moda],
        };
      });
    }

    const total = items.reduce((acc, it) => acc + it.val, 0);
    let offsetAcc = 0;

    const segments: DisplayModaSegment[] = items.map((it) => {
      const frac = total > 0 ? it.val / total : 0;
      const dash = frac * donutCirc;
      const offset = -offsetAcc;
      offsetAcc += dash;
      return {
        ...it,
        pct: frac * 100,
        dash,
        offset,
      };
    });

    return { modaSegments: segments, totalModaValue: total };
  }, [sourceFilter, modaSummary, modaMetric, donutCirc]);

  const maxRouteCount = Math.max(1, topRoutes[0]?.count ?? 1);
  const totalLines = invoiceStatuses.reduce((a, s) => a + s.lineCount, 0) || 1;

  return (
    <div className="space-y-5">
      {/* Active Month Focus Banner */}
      {selectedMonth.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-teal-200/80 bg-teal-50/80 px-3.5 py-2 text-xs text-teal-900 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-200">
          <span className="font-semibold">Fokus Periode:</span>
          <span className="font-mono font-bold text-teal-800 dark:text-teal-300">
            {selectedMonth.map((m) => formatMonthLabel(m)).join(', ')}
          </span>
          <span className="text-teal-700/80 dark:text-teal-400/80">
            · Menampilkan data khusus {selectedMonth.length === 1 ? 'bulan ini' : `${selectedMonth.length} bulan terpilih`}
          </span>
          <button
            type="button"
            onClick={() => onSelectMonth([])}
            className="ml-1 inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            <RotateCcw className="h-3 w-3" />
            Tampilkan Semua Bulan
          </button>
        </div>
      )}

      {/* 4-Column Executive KPI Strip */}
      <section aria-label="Ringkasan Performa Utama" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Revenue
            </span>
            {!isPartialModaFilter && activeTargetData.achievePct !== null ? (
              <span
                className={`font-mono text-[11px] font-semibold tabular-nums ${
                  activeTargetData.achievePct >= 100
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-teal-700 dark:text-teal-400'
                }`}
              >
                {activeTargetData.achievePct.toFixed(1)}% target
              </span>
            ) : (
              <span className="font-mono text-[11px] text-teal-700 tabular-nums dark:text-teal-400">
                {billedPct.toFixed(0)}% ditagih
              </span>
            )}
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
            {formatMiliar(revenue)}
          </p>
          <div className="mt-3.5 space-y-1.5">
            <div
              className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
              title={
                activeTargetData.achievePct !== null
                  ? `Pencapaian Revenue: ${activeTargetData.achievePct.toFixed(1)}% dari target (${formatMiliar(revenue)} / ${formatMiliar(activeTargetData.targetSum)})`
                  : 'Target belum tersedia'
              }
            >
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  (activeTargetData.achievePct ?? 0) >= 100
                    ? 'bg-emerald-500 dark:bg-emerald-400'
                    : (activeTargetData.achievePct ?? 0) >= 75
                    ? 'bg-teal-600 dark:bg-teal-500'
                    : 'bg-amber-500 dark:bg-amber-400'
                }`}
                style={{
                  width: `${Math.min(100, Math.max(0, activeTargetData.achievePct ?? 0))}%`,
                }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-1 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              <span>
                {isPartialModaFilter
                  ? `Target produk ${formatMiliar(activeTargetData.targetSum)}`
                  : `Target ${formatMiliar(activeTargetData.targetSum)}`}
              </span>
              {momGrowth && (
                <span
                  className={`inline-flex items-center gap-0.5 font-medium ${
                    momGrowth.isPositive
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                  title={`Perbandingan vs ${momGrowth.prevLabel}`}
                >
                  {momGrowth.isPositive ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {momGrowth.isPositive ? '+' : ''}
                  {momGrowth.pct.toFixed(1)}% MoM
                </span>
              )}
            </div>
            {!isPartialModaFilter && activeTargetData.targetSum > 0 && (
              <p className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                {activeTargetData.remainingTarget > 0 ? (
                  <>
                    Sisa target{' '}
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {formatMiliar(activeTargetData.remainingTarget)}
                    </span>
                    {selectedMonth.length === 0 && activeTargetData.remainingMonths > 0 && (
                      <>
                        {' '}
                        · ~{formatMiliar(activeTargetData.remainingTarget / activeTargetData.remainingMonths)}/bln
                      </>
                    )}
                  </>
                ) : (
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    Target tercapai (+{formatMiliar(activeTargetData.surplusTarget)})
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total BOP Operasional
            </span>
            <span className="font-mono text-[11px] text-amber-700 tabular-nums dark:text-amber-400">
              {revenue > 0 ? `${bopRatio.toFixed(1)}% rev` : '-'}
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
            {formatMiliar(bop)}
          </p>
          <div className="mt-3.5 space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-amber-500 dark:bg-amber-400"
                style={{ width: `${Math.min(100, bopRatio)}%` }}
              />
            </div>
            <p className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              Rata-rata Rp{soCount > 0 ? (bop / soCount / 1e6).toFixed(1) : '0.0'} jt / SO
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Margin Kotor
            </span>
            <span
              className={`font-mono text-xs font-semibold tabular-nums ${
                isNegMargin
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {formatMarginPct(revenue, bop)}
            </span>
          </div>
          <p
            className={`mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums ${
              isNegMargin
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {margin < 0 ? '-' : ''}
            {formatMiliar(Math.abs(margin))}
          </p>
          <div className="mt-3.5 space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full ${
                  isNegMargin ? 'bg-red-500' : 'bg-emerald-600 dark:bg-emerald-500'
                }`}
                style={{
                  width: `${
                    revenue > 0 ? Math.min(100, Math.abs((margin / revenue) * 100)) : 0
                  }%`,
                }}
              />
            </div>
            <p className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              Rata-rata Rp{soCount > 0 ? (margin / soCount / 1e6).toFixed(1) : '0.0'} jt / SO
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Rata-rata Revenue / Hari
            </span>
            <span className="font-mono text-[11px] text-sky-700 tabular-nums dark:text-sky-400">
              {dailyMetrics.activeDays > 0 ? `${formatInt(dailyMetrics.activeDays)} hari` : '-'}
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
            {dailyMetrics.avgRevenuePerDay >= 1e9
              ? formatMiliar(dailyMetrics.avgRevenuePerDay)
              : `Rp${formatJuta(dailyMetrics.avgRevenuePerDay)} jt`}
            <span className="ml-1 text-xs font-semibold text-slate-400">/hari</span>
          </p>
          <div className="mt-3.5 space-y-1.5">
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
              title={
                dailyMetrics.dailyAchievePct !== null
                  ? `Rata-rata harian ${dailyMetrics.dailyAchievePct.toFixed(1)}% dari target harian (${
                      dailyMetrics.avgTargetPerDay >= 1e9
                        ? formatMiliar(dailyMetrics.avgTargetPerDay)
                        : `Rp${formatJuta(dailyMetrics.avgTargetPerDay)} jt`
                    }/hari)`
                  : 'Rata-rata revenue harian'
              }
            >
              <div
                className="h-full rounded-full bg-sky-600 transition-all duration-300 dark:bg-sky-500"
                style={{
                  width: `${
                    dailyMetrics.dailyAchievePct !== null
                      ? Math.min(100, Math.max(0, dailyMetrics.dailyAchievePct))
                      : totalBaselineSo > 0
                      ? Math.min(100, (soCount / totalBaselineSo) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              ~{dailyMetrics.avgSoPerDay.toFixed(1)} SO/hari · ~{dailyMetrics.avgDoPerDay.toFixed(1)} DO/hari
            </p>
            <p className="font-mono text-[11px] font-semibold text-teal-700 tabular-nums dark:text-teal-400">
              Total {formatInt(unitQty)} Unit (Trip)
            </p>
          </div>
        </div>
      </section>

      {/* Penjualan per Bulan (Interactive Chart) */}
      <MonthlyPerformanceChart
        data={monthlyMetrics}
        selectedMonth={selectedMonth}
        onSelectMonth={onSelectMonth}
        sourceFilter={sourceFilter}
        hasTrpData={hasTrpData}
        hasVliData={hasVliData}
      />

      {/* Perbandingan Year-to-Date (YTD): Aktual vs Akumulasi Target Bulanan */}
      {ytdAnalysis.rows.length > 0 && (
        <section
          aria-label="Perbandingan Year-to-Date (YTD)"
          className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Perbandingan Year-to-Date (YTD)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Akumulasi aktual Revenue, BOP &amp; Margin dibandingkan akumulasi Target bulanan
                {sourceFilter === 'TRP'
                  ? ' (Transporter)'
                  : sourceFilter === 'VLI'
                  ? ' (VLI)'
                  : ''}
                .
              </p>
            </div>
            {ytdAnalysis.ytdCutoff && (
              <span className="font-mono text-[11px] font-medium text-slate-500 tabular-nums dark:text-slate-400">
                Cutoff YTD aktif: s/d {ytdAnalysis.ytdCutoff.label}
              </span>
            )}
          </div>

          {/* 3-Column YTD Executive Strip */}
          {ytdAnalysis.ytdCutoff && (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    YTD Aktual vs Akum. Target ({ytdAnalysis.ytdCutoff.label})
                  </span>
                  {!isPartialModaFilter && ytdAnalysis.ytdCutoff.ytdAchievePct !== null && (
                    <span
                      className={`font-mono text-xs font-bold tabular-nums ${
                        ytdAnalysis.ytdCutoff.ytdAchievePct >= 100
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : ytdAnalysis.ytdCutoff.ytdAchievePct >= 80
                          ? 'text-teal-700 dark:text-teal-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {ytdAnalysis.ytdCutoff.ytdAchievePct.toFixed(1)}%
                    </span>
                  )}
                </div>
                <p className="mt-1.5 font-mono text-base font-bold text-slate-900 tabular-nums dark:text-slate-50">
                  {formatMiliar(ytdAnalysis.ytdCutoff.cumRevenue)}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    / {formatMiliar(ytdAnalysis.ytdCutoff.cumTarget)}
                  </span>
                </p>
                {!isPartialModaFilter && (
                  <p
                    className={`mt-1 font-mono text-[11px] font-semibold tabular-nums ${
                      ytdAnalysis.ytdCutoff.ytdVariance >= 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    Selisih YTD: {ytdAnalysis.ytdCutoff.ytdVariance >= 0 ? '+' : ''}
                    {formatMiliar(ytdAnalysis.ytdCutoff.ytdVariance)}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Akumulasi BOP &amp; Margin YTD
                  </span>
                  {ytdAnalysis.ytdCutoff.ytdMarginPct !== null && (
                    <span
                      className={`font-mono text-xs font-bold tabular-nums ${
                        ytdAnalysis.ytdCutoff.ytdMarginPct < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      Mgn {ytdAnalysis.ytdCutoff.ytdMarginPct.toFixed(1)}%
                    </span>
                  )}
                </div>
                <p className="mt-1.5 font-mono text-base font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                  {formatMiliar(ytdAnalysis.ytdCutoff.cumMargin)}
                </p>
                <p className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                  Akum. BOP: <strong className="text-amber-600 dark:text-amber-400">{formatMiliar(ytdAnalysis.ytdCutoff.cumBop)}</strong>
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Progres Target Full Year (Jan–Des)
                  </span>
                  {!isPartialModaFilter && ytdAnalysis.fullYearAchievePct !== null && (
                    <span className="font-mono text-xs font-bold text-teal-700 tabular-nums dark:text-teal-400">
                      {ytdAnalysis.fullYearAchievePct.toFixed(1)}%
                    </span>
                  )}
                </div>
                <p className="mt-1.5 font-mono text-base font-bold text-slate-900 tabular-nums dark:text-slate-50">
                  {formatMiliar(ytdAnalysis.fullYearTarget)}
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-teal-600 transition-all duration-300 dark:bg-teal-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, ytdAnalysis.fullYearAchievePct ?? 0))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Cumulative YTD Table */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/90 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                  <th className="px-3 py-2.5 text-left font-semibold">Bulan</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Target</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Aktual</th>
                  <th className="px-3 py-2.5 text-right font-semibold">% Bln</th>
                  <th className="px-3 py-2.5 text-right font-semibold">BOP</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Margin</th>
                  <th className="px-3 py-2.5 text-right font-semibold">% Mgn</th>
                  <th className="border-l border-slate-200/80 bg-teal-50/70 px-3 py-2.5 text-right font-semibold text-teal-800 dark:border-slate-700/80 dark:bg-teal-950/35 dark:text-teal-300">
                    Akum. Target
                  </th>
                  <th className="bg-teal-50/70 px-3 py-2.5 text-right font-semibold text-teal-800 dark:bg-teal-950/35 dark:text-teal-300">
                    Akum. Rev
                  </th>
                  <th className="bg-teal-50/70 px-3 py-2.5 text-right font-semibold text-teal-800 dark:bg-teal-950/35 dark:text-teal-300">
                    Akum. BOP
                  </th>
                  <th className="bg-teal-50/70 px-3 py-2.5 text-right font-semibold text-teal-800 dark:bg-teal-950/35 dark:text-teal-300">
                    Akum. Margin
                  </th>
                  <th className="bg-teal-50/70 px-3 py-2.5 text-right font-semibold text-teal-800 dark:bg-teal-950/35 dark:text-teal-300">
                    % Margin
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800/80">
                {ytdAnalysis.rows.map((r) => {
                  const isSelected = selectedMonth.includes(r.month);
                  const isDimmed = selectedMonth.length > 0 && !isSelected;
                  const hasActual = r.monthRevenue > 0;
                  const monthMarginPct =
                    r.monthRevenue > 0 ? (r.monthMargin / r.monthRevenue) * 100 : null;
                  return (
                    <tr
                      key={r.month}
                      onClick={() =>
                        onSelectMonth(
                          isSelected
                            ? selectedMonth.filter((m) => m !== r.month)
                            : [...selectedMonth, r.month].sort()
                        )
                      }
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-teal-50/80 dark:bg-teal-950/40'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      } ${isDimmed ? 'opacity-45' : 'opacity-100'}`}
                    >
                      <td className="px-3 py-2 font-sans font-semibold text-slate-800 dark:text-slate-200">
                        {r.label}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">
                        {formatJuta(r.monthTarget)} jt
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-100">
                        {hasActual ? `${formatJuta(r.monthRevenue)} jt` : '-'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!isPartialModaFilter && hasActual && r.monthlyAchievePct !== null ? (
                          <span
                            className={
                              r.monthlyAchievePct >= 100
                                ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                                : r.monthlyAchievePct >= 80
                                ? 'text-teal-700 dark:text-teal-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }
                          >
                            {r.monthlyAchievePct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-amber-600 dark:text-amber-400">
                        {hasActual ? `${formatJuta(r.monthBop)} jt` : '-'}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-semibold ${
                          !hasActual
                            ? 'text-slate-400'
                            : r.monthMargin < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {hasActual ? `${formatJuta(r.monthMargin)} jt` : '-'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                        {monthMarginPct !== null ? `${monthMarginPct.toFixed(1)}%` : '-'}
                      </td>
                      <td className="border-l border-slate-200/70 bg-teal-50/35 px-3 py-2 text-right text-slate-600 dark:border-slate-800 dark:bg-teal-950/20 dark:text-slate-300">
                        {formatJuta(r.cumTarget)} jt
                      </td>
                      <td className="bg-teal-50/35 px-3 py-2 text-right font-semibold text-teal-700 dark:bg-teal-950/20 dark:text-teal-400">
                        {formatJuta(r.cumRevenue)} jt
                      </td>
                      <td className="bg-teal-50/35 px-3 py-2 text-right text-amber-600 dark:bg-teal-950/20 dark:text-amber-400">
                        {formatJuta(r.cumBop)} jt
                      </td>
                      <td
                        className={`bg-teal-50/35 px-3 py-2 text-right font-semibold dark:bg-teal-950/20 ${
                          r.cumMargin < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {formatJuta(r.cumMargin)} jt
                      </td>
                      <td className="bg-teal-50/35 px-3 py-2 text-right text-slate-700 dark:bg-teal-950/20 dark:text-slate-300">
                        {r.ytdMarginPct !== null ? `${r.ytdMarginPct.toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {ytdAnalysis.fullYearRow && (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50/90 font-mono text-xs font-bold tabular-nums dark:border-slate-700 dark:bg-slate-800/70">
                    <td className="px-3 py-2.5 font-sans text-slate-900 dark:text-slate-100">
                      Total Full Year
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">
                      {formatJuta(ytdAnalysis.fullYearRow.cumTarget)} jt
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-900 dark:text-slate-50">
                      {formatJuta(ytdAnalysis.fullYearRow.cumRevenue)} jt
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-400">-</td>
                    <td className="px-3 py-2.5 text-right text-amber-600 dark:text-amber-400">
                      {formatJuta(ytdAnalysis.fullYearRow.cumBop)} jt
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right ${
                        ytdAnalysis.fullYearRow.cumMargin < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {formatJuta(ytdAnalysis.fullYearRow.cumMargin)} jt
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-200">
                      {ytdAnalysis.fullYearRow.ytdMarginPct !== null
                        ? `${ytdAnalysis.fullYearRow.ytdMarginPct.toFixed(1)}%`
                        : '-'}
                    </td>
                    <td className="border-l border-slate-200/80 bg-teal-50/60 px-3 py-2.5 text-right text-slate-700 dark:border-slate-700 dark:bg-teal-950/35 dark:text-slate-200">
                      {formatJuta(ytdAnalysis.fullYearRow.cumTarget)} jt
                    </td>
                    <td className="bg-teal-50/60 px-3 py-2.5 text-right text-teal-700 dark:bg-teal-950/35 dark:text-teal-400">
                      {formatJuta(ytdAnalysis.fullYearRow.cumRevenue)} jt
                    </td>
                    <td className="bg-teal-50/60 px-3 py-2.5 text-right text-amber-600 dark:bg-teal-950/35 dark:text-amber-400">
                      {formatJuta(ytdAnalysis.fullYearRow.cumBop)} jt
                    </td>
                    <td
                      className={`bg-teal-50/60 px-3 py-2.5 text-right dark:bg-teal-950/35 ${
                        ytdAnalysis.fullYearRow.cumMargin < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {formatJuta(ytdAnalysis.fullYearRow.cumMargin)} jt
                    </td>
                    <td className="bg-teal-50/60 px-3 py-2.5 text-right text-slate-700 dark:bg-teal-950/35 dark:text-slate-200">
                      {ytdAnalysis.fullYearRow.ytdMarginPct !== null
                        ? `${ytdAnalysis.fullYearRow.ytdMarginPct.toFixed(1)}%`
                        : '-'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      {/* Penjualan per Moda + Top 10 Customer */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Ringkasan per Moda / Kategori Unit */}
        <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {sourceFilter === 'TRP'
                ? 'Penjualan Transporter per Kategori Unit'
                : sourceFilter === 'VLI'
                ? 'Penjualan VLI per Moda'
                : 'Penjualan per Moda'}
            </h2>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs dark:bg-slate-800">
              {(
                [
                  { id: 'revenue', label: 'Revenue' },
                  { id: 'margin', label: 'Margin' },
                  { id: 'doCount', label: 'DO' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setModaMetric(opt.id)}
                  className={`rounded-md px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                    modaMetric === opt.id
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const activeSeg = hoveredModaId
              ? modaSegments.find((s) => s.id === hoveredModaId) ?? null
              : null;
            const centerVal = activeSeg ? activeSeg.val : totalModaValue;
            const centerTopLabel = activeSeg
              ? activeSeg.label
              : modaMetric === 'doCount'
              ? 'Total DO'
              : modaMetric === 'margin'
              ? 'Total Margin'
              : 'Total Revenue';
            const centerSubLabel = activeSeg
              ? `${activeSeg.pct.toFixed(1)}% share`
              : `${modaSegments.length} moda`;

            return (
              <div className="mt-5 flex flex-1 flex-col items-center gap-6 xl:flex-row xl:items-center">
                {/* Interactive Donut Chart */}
                <div className="relative flex h-44 w-44 shrink-0 items-center justify-center">
                  <svg viewBox="0 0 116 116" className="h-full w-full -rotate-90 overflow-visible">
                    <circle
                      cx="58"
                      cy="58"
                      r={donutRadius}
                      fill="none"
                      className="stroke-slate-100 dark:stroke-slate-800"
                      strokeWidth="13"
                    />
                    {modaSegments.map((seg) => {
                      if (seg.dash <= 0) return null;
                      const isActive = hoveredModaId === seg.id;
                      const isDimmed = hoveredModaId !== null && !isActive;
                      return (
                        <circle
                          key={seg.id}
                          cx="58"
                          cy="58"
                          r={donutRadius}
                          fill="none"
                          stroke={seg.hex}
                          strokeWidth={isActive ? '16' : '13'}
                          strokeDasharray={`${Math.max(0, seg.dash - 0.8)} ${donutCirc}`}
                          strokeDashoffset={seg.offset}
                          opacity={isDimmed ? 0.28 : 1}
                          className="cursor-pointer transition-all duration-200"
                          onMouseEnter={() => setHoveredModaId(seg.id)}
                          onMouseLeave={() => setHoveredModaId(null)}
                        />
                      );
                    })}
                  </svg>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
                    <span className="max-w-full truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
                      {centerTopLabel}
                    </span>
                    <span className="mt-0.5 font-mono text-sm font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
                      {modaMetric === 'doCount'
                        ? formatInt(centerVal)
                        : formatMiliar(centerVal)}
                    </span>
                    <span
                      className="mt-0.5 font-mono text-[10px] font-semibold tabular-nums"
                      style={{ color: activeSeg ? activeSeg.hex : undefined }}
                    >
                      <span className={!activeSeg ? 'text-slate-400 dark:text-slate-500' : ''}>
                        {centerSubLabel}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Structured Interactive Moda Cards */}
                <div className="w-full flex-1 space-y-2.5">
                  {modaSegments.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-500">
                      Tidak ada data untuk metrik ini pada filter aktif.
                    </p>
                  ) : (
                    modaSegments.map((seg) => {
                      const isActive = hoveredModaId === seg.id;
                      const isDimmed = hoveredModaId !== null && !isActive;
                      const marginPct = seg.revenue > 0 ? (seg.margin / seg.revenue) * 100 : null;
                      return (
                        <div
                          key={seg.id}
                          onMouseEnter={() => setHoveredModaId(seg.id)}
                          onMouseLeave={() => setHoveredModaId(null)}
                          className={`cursor-pointer rounded-xl border p-3 transition-all duration-200 ${
                            isActive
                              ? 'border-slate-300 bg-slate-50/90 shadow-xs dark:border-slate-700 dark:bg-slate-800/70'
                              : 'border-slate-100 bg-slate-50/40 hover:border-slate-200 dark:border-slate-800/80 dark:bg-slate-800/30 dark:hover:border-slate-700'
                          } ${isDimmed ? 'opacity-55' : 'opacity-100'}`}
                        >
                          {/* Card Header */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className={`h-2.5 w-2.5 shrink-0 rounded-full transition-transform duration-200 ${seg.dotClass} ${
                                  isActive ? 'scale-125' : ''
                                }`}
                              />
                              <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                                {seg.label}
                              </span>
                              {marginPct !== null && (
                                <span
                                  className={`hidden font-mono text-[10px] font-semibold tabular-nums sm:inline ${
                                    marginPct < 0
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : marginPct < 10
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-emerald-700 dark:text-emerald-400'
                                  }`}
                                >
                                  Mgn {marginPct.toFixed(1)}%
                                </span>
                              )}
                            </div>
                            <span className="shrink-0 font-mono text-xs font-bold text-slate-800 tabular-nums dark:text-slate-100">
                              {seg.pct.toFixed(1)}%
                            </span>
                          </div>

                          {/* Share Bar */}
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${seg.val > 0 ? Math.max(2, seg.pct) : 0}%`,
                                backgroundColor: seg.hex,
                              }}
                            />
                          </div>

                          {/* 5-Column Crisp Metric Grid */}
                          <div className="mt-2.5 grid grid-cols-3 gap-x-2 gap-y-1.5 sm:grid-cols-5">
                            <div>
                              <span className="block text-[9.5px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                SO
                              </span>
                              <span className="font-mono text-[11px] font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                                {formatInt(seg.soCount)}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[9.5px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                DO
                              </span>
                              <span className="font-mono text-[11px] font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                                {formatInt(seg.doCount)}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[9.5px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                Revenue
                              </span>
                              <span className="font-mono text-[11px] font-semibold text-teal-700 tabular-nums dark:text-teal-400">
                                {formatJuta(seg.revenue)} jt
                              </span>
                            </div>
                            <div>
                              <span className="block text-[9.5px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                BOP
                              </span>
                              <span className="font-mono text-[11px] font-semibold text-amber-600 tabular-nums dark:text-amber-400">
                                {formatJuta(seg.bop)} jt
                              </span>
                            </div>
                            <div>
                              <span className="block text-[9.5px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                Margin
                              </span>
                              <span
                                className={`font-mono text-[11px] font-semibold tabular-nums ${
                                  seg.margin < 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                                }`}
                              >
                                {formatJuta(seg.margin)} jt
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}

          <div className="mt-5 flex items-center justify-end border-t border-slate-100 pt-3.5 text-xs dark:border-slate-800">
            <button
              type="button"
              onClick={() => onNavigateTab('marketing')}
              className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap dark:text-teal-400 dark:hover:text-teal-300"
            >
              Buka Marketing <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>

        {/* Top 10 Customer (Clickable) */}
        <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Top 10 Customer
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Klik nama customer untuk melihat rincian SO & DO.
              </p>
            </div>
            <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              Top 5 = {top5Share.toFixed(1)}% · Top 10 = {top10Share.toFixed(1)}%
            </span>
          </div>

          <div className="mt-4 flex-1 space-y-2">
            {sortedCustomers.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                Tidak ada data customer pada filter saat ini.
              </p>
            ) : (
              sortedCustomers.slice(0, 10).map((c, idx) => {
                const share = revenue > 0 ? (c.revenue / revenue) * 100 : 0;
                const widthPct = (c.revenue / maxCustRev) * 100;
                const custMarginPct = c.revenue > 0 ? (c.margin / c.revenue) * 100 : null;
                const marginColorClass =
                  custMarginPct === null
                    ? 'text-slate-400'
                    : custMarginPct < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : custMarginPct < 10
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400';
                return (
                  <button
                    key={c.customer}
                    type="button"
                    onClick={() => onSelectCustomer(c.customer)}
                    className="group w-full rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-5 shrink-0 font-mono text-[11px] text-slate-400 tabular-nums">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="truncate font-medium text-slate-700 group-hover:text-teal-700 dark:text-slate-200 dark:group-hover:text-teal-300">
                          {c.customer}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 font-mono text-slate-500 tabular-nums dark:text-slate-400">
                        <span>{share.toFixed(1)}%</span>
                        <span>·</span>
                        <strong className="text-slate-800 dark:text-slate-200">
                          Rp{formatJuta(c.revenue)} jt
                        </strong>
                        {custMarginPct !== null && (
                          <>
                            <span>·</span>
                            <span
                              className={`font-semibold ${marginColorClass}`}
                              title={`Margin kotor Rp${formatJuta(c.margin)} jt`}
                            >
                              Mgn {custMarginPct.toFixed(1)}%
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 ml-7 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-teal-600 transition-colors group-hover:bg-teal-500 dark:bg-teal-500"
                        style={{ width: `${Math.max(c.revenue > 0 ? 2 : 0, widthPct)}%` }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3.5 text-xs dark:border-slate-800">
            <span className="font-mono text-slate-500 tabular-nums dark:text-slate-400">
              {formatInt(sortedCustomers.length)} customer aktif
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('marketing')}
              className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap dark:text-teal-400 dark:hover:text-teal-300"
            >
              Semua customer <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      </div>

      {/* Ringkasan Rute Terpadat + Ringkasan Invoicing */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Rute Terpadat */}
        <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Rute Pengiriman Terpadat
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Klik rute untuk membuka jalur pengiriman di Peta Marketing.
              </p>
            </div>
          </div>

          <div className="mt-4 flex-1 space-y-2.5">
            {topRoutes.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">Tidak ada data rute.</p>
            ) : (
              topRoutes.slice(0, 6).map((r) => {
                const widthPct = (r.count / maxRouteCount) * 100;
                const [orig, dest] = r.route.split(' → ');
                return (
                  <button
                    key={r.route}
                    type="button"
                    onClick={() => onSelectRoute(r.route)}
                    className="group w-full space-y-1.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-slate-700 group-hover:text-teal-700 dark:text-slate-200 dark:group-hover:text-teal-300">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-600 opacity-75 group-hover:opacity-100 dark:text-teal-400" />
                        <span className="truncate">{orig || '?'}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="truncate">{dest || '?'}</span>
                      </span>
                      <span className="shrink-0 font-mono text-slate-500 tabular-nums dark:text-slate-400">
                        <strong className="text-slate-900 dark:text-slate-100">
                          {formatInt(r.count)}
                        </strong>{' '}
                        DO · Rp{formatJuta(r.rev)} jt
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-sky-600 transition-colors group-hover:bg-teal-600 dark:bg-sky-500 dark:group-hover:bg-teal-400"
                        style={{ width: `${Math.max(3, widthPct)}%` }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Ringkasan Status Invoicing */}
        <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Ringkasan Status Invoicing
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Proporsi penagihan baris DO pada periode & filter aktif.
            </p>
          </div>

          <div className="mt-4 flex-1 divide-y divide-slate-100 dark:divide-slate-800">
            {invoiceStatuses.map((s) => {
              const pct = (s.lineCount / totalLines) * 100;
              const barColor =
                s.status === 'Fully Invoiced'
                  ? 'bg-emerald-500'
                  : s.status === 'To Invoice'
                  ? 'bg-amber-500'
                  : 'bg-slate-400';
              return (
                <div key={s.status} className="py-3 first:pt-1 last:pb-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {s.status}
                    </span>
                    <span className="font-mono text-slate-600 tabular-nums dark:text-slate-300">
                      <strong className="text-slate-900 dark:text-slate-100">
                        {pct.toFixed(1)}%
                      </strong>{' '}
                      · {formatInt(s.lineCount)} baris · Rp{formatJuta(s.value)} jt
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3.5 text-xs dark:border-slate-800">
            <span className="font-mono text-slate-500 tabular-nums dark:text-slate-400">
              Total {formatInt(totalLines)} baris DO
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('finance')}
              className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap dark:text-teal-400 dark:hover:text-teal-300"
            >
              Kelola di Finance <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
