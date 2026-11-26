import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Layers,
  MapPin,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { ModaKey, SalesOrderRecord, SourceKey } from '../types/logistics';
import { formatInt, formatJuta, formatMiliar, formatMonthLabel } from '../utils/formatters';
import { classifyModa, computeModaSummary, getDistributedLineRevenue } from '../utils/logisticsEngine';
import { exportTenDaysReportPdf, exportTenDaysReportImage } from '../utils/tenDaysPdfExport';
import { exportTenDaysReportExcel } from '../utils/tenDaysExtraExports';
import { getMonthlyTargets } from './MonthlyPerformanceChart';

interface TenDaysReportViewProps {
  orders: SalesOrderRecord[];
  availableMonths: string[];
  selectedMonths: string[];
  sourceFilter: 'all' | SourceKey;
  selectedModas: ModaKey[];
  onSelectCustomer: (customer: string) => void;
}

type PeriodKey = 'all' | 'D1' | 'D2' | 'D3';

interface PeriodBucket {
  key: 'D1' | 'D2' | 'D3';
  title: string;
  rangeLabel: string;
  days: number;
  revenue: number;
  bop: number;
  margin: number;
  marginPct: number | null;
  soCount: number;
  doCount: number;
  unitQty: number;
  target: number;
  achievePct: number | null;
  growthVsPrevPct: number | null;
}

const MODA_DOT_COLOR: Record<ModaKey, string> = {
  'Self Drive': 'bg-sky-500',
  'Car Carrier': 'bg-teal-600',
  Shipment: 'bg-amber-500',
  Transporter: 'bg-indigo-500',
};

function getDayOfMonth(dateStr: string): number {
  const parts = dateStr.split('-');
  if (parts.length < 3) return 1;
  const d = Number(parts[2].slice(0, 2));
  return Number.isFinite(d) && d >= 1 && d <= 31 ? d : 1;
}

function getDaysInMonth(ym: string): number {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 30;
  return new Date(y, m, 0).getDate();
}

export const TenDaysReportView: React.FC<TenDaysReportViewProps> = ({
  orders,
  availableMonths,
  selectedMonths,
  sourceFilter,
  selectedModas,
  onSelectCustomer,
}) => {
  // Determine default active month (prefer first selectedMonth, else latest month with orders)
  const monthsWithData = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.month) set.add(o.month);
    });
    return Array.from(set).sort();
  }, [orders]);

  const monthOptions = useMemo(() => {
    const merged = new Set<string>([...availableMonths, ...monthsWithData]);
    return Array.from(merged).sort();
  }, [availableMonths, monthsWithData]);

  const [reportMonth, setReportMonth] = useState<string>(() => {
    if (selectedMonths.length > 0) return selectedMonths[selectedMonths.length - 1];
    if (monthsWithData.length > 0) return monthsWithData[monthsWithData.length - 1];
    return monthOptions[monthOptions.length - 1] || '2026-04';
  });

  const [activePeriod, setActivePeriod] = useState<PeriodKey>('all');
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!downloadMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setDownloadMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [downloadMenuOpen]);

  useEffect(() => {
    if (selectedMonths.length > 0 && !selectedMonths.includes(reportMonth)) {
      setReportMonth(selectedMonths[selectedMonths.length - 1]);
    }
  }, [selectedMonths, reportMonth]);

  const daysInMonth = useMemo(() => getDaysInMonth(reportMonth), [reportMonth]);

  const monthOrders = useMemo(
    () => orders.filter((o) => o.month === reportMonth),
    [orders, reportMonth]
  );

  const monthTarget = useMemo(() => {
    const t = getMonthlyTargets(reportMonth);
    if (sourceFilter === 'TRP') return t.trp ?? 0;
    if (sourceFilter === 'VLI') return t.vli ?? 0;
    return t.total ?? 0;
  }, [reportMonth, sourceFilter]);

  const isPartialModaFilter = selectedModas.length > 0;

  // Build fixed D1 (1-10), D2 (11-20), D3 (21-EOM) buckets
  const periods = useMemo<PeriodBucket[]>(() => {
    const d3Days = Math.max(1, daysInMonth - 20);
    const defs: Array<{ key: 'D1' | 'D2' | 'D3'; title: string; rangeLabel: string; days: number }> = [
      { key: 'D1', title: 'Periode 1', rangeLabel: 'Tgl 1 – 10', days: 10 },
      { key: 'D2', title: 'Periode 2', rangeLabel: 'Tgl 11 – 20', days: 10 },
      { key: 'D3', title: 'Periode 3', rangeLabel: `Tgl 21 – ${daysInMonth} (EOM)`, days: d3Days },
    ];

    const acc: Record<
      'D1' | 'D2' | 'D3',
      { revenue: number; bop: number; soCount: number; doCount: number; unitQty: number }
    > = {
      D1: { revenue: 0, bop: 0, soCount: 0, doCount: 0, unitQty: 0 },
      D2: { revenue: 0, bop: 0, soCount: 0, doCount: 0, unitQty: 0 },
      D3: { revenue: 0, bop: 0, soCount: 0, doCount: 0, unitQty: 0 },
    };

    monthOrders.forEach((o) => {
      const day = getDayOfMonth(o.date);
      const bucketKey: 'D1' | 'D2' | 'D3' = day <= 10 ? 'D1' : day <= 20 ? 'D2' : 'D3';
      acc[bucketKey].revenue += o.rev;
      acc[bucketKey].bop += o.bop;
      acc[bucketKey].soCount += 1;
      acc[bucketKey].doCount += o.uniqueDoCount;
      acc[bucketKey].unitQty += o.totalUnitQty || 0;
    });

    let prevRev: number | null = null;
    return defs.map((d) => {
      const a = acc[d.key];
      const margin = a.revenue - a.bop;
      const marginPct = a.revenue > 0 ? (margin / a.revenue) * 100 : null;
      const target = daysInMonth > 0 ? (monthTarget * d.days) / daysInMonth : 0;
      const achievePct = target > 0 ? (a.revenue / target) * 100 : null;
      const growthVsPrevPct =
        prevRev !== null && prevRev > 0 ? ((a.revenue - prevRev) / prevRev) * 100 : null;
      prevRev = a.revenue;

      return {
        ...d,
        revenue: a.revenue,
        bop: a.bop,
        margin,
        marginPct,
        soCount: a.soCount,
        doCount: a.doCount,
        unitQty: a.unitQty,
        target,
        achievePct,
        growthVsPrevPct,
      };
    });
  }, [monthOrders, daysInMonth, monthTarget]);

  // Orders filtered by activePeriod (all / D1 / D2 / D3)
  const periodOrders = useMemo(() => {
    if (activePeriod === 'all') return monthOrders;
    return monthOrders.filter((o) => {
      const day = getDayOfMonth(o.date);
      if (activePeriod === 'D1') return day <= 10;
      if (activePeriod === 'D2') return day >= 11 && day <= 20;
      return day >= 21;
    });
  }, [monthOrders, activePeriod]);

  // Month totals & run-rate forecast
  const monthSummary = useMemo(() => {
    const revenue = periods.reduce((s, p) => s + p.revenue, 0);
    const bop = periods.reduce((s, p) => s + p.bop, 0);
    const margin = revenue - bop;
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : null;
    const soCount = periods.reduce((s, p) => s + p.soCount, 0);
    const doCount = periods.reduce((s, p) => s + p.doCount, 0);
    const unitQty = periods.reduce((s, p) => s + p.unitQty, 0);
    const achievePct = monthTarget > 0 ? (revenue / monthTarget) * 100 : null;
    const remainingTarget = Math.max(0, monthTarget - revenue);
    const surplusTarget = Math.max(0, revenue - monthTarget);

    // Determine elapsed days based on latest order date in this month
    const maxDay = monthOrders.reduce((mx, o) => Math.max(mx, getDayOfMonth(o.date)), 0);
    const elapsedDays = maxDay > 0 ? maxDay : 0;
    const remainingDays = Math.max(0, daysInMonth - elapsedDays);
    const avgPerDay = elapsedDays > 0 ? revenue / elapsedDays : 0;
    const projectedEom = elapsedDays > 0 ? avgPerDay * daysInMonth : 0;
    const requiredPerDay = remainingDays > 0 ? remainingTarget / remainingDays : 0;

    return {
      revenue,
      bop,
      margin,
      marginPct,
      soCount,
      doCount,
      unitQty,
      achievePct,
      remainingTarget,
      surplusTarget,
      elapsedDays,
      remainingDays,
      avgPerDay,
      projectedEom,
      requiredPerDay,
    };
  }, [periods, monthOrders, monthTarget, daysInMonth]);

  // Breakdown per Moda for activePeriod
  const modaBreakdown = useMemo(() => {
    const summary = computeModaSummary(periodOrders);
    const totalRev = summary.reduce((s, x) => s + x.revenue, 0);
    const unitByModa: Record<ModaKey, number> = {
      Transporter: 0,
      'Car Carrier': 0,
      'Self Drive': 0,
      Shipment: 0,
    };
    periodOrders.forEach((o) => {
      o.lines.forEach((l) => {
        const qty = Number(l[10] ?? 0) || 0;
        if (qty > 0) {
          const { moda } = classifyModa(l[7], l[1], o.src);
          unitByModa[moda] += qty;
        }
      });
    });
    return summary.map((e) => ({
      moda: e.moda,
      revenue: e.revenue,
      bop: e.bop,
      margin: e.margin,
      marginPct: e.marginPct,
      sharePct: totalRev > 0 ? (e.revenue / totalRev) * 100 : 0,
      soCount: e.soCount,
      doCount: e.doCount,
      unitQty: unitByModa[e.moda] || 0,
    }));
  }, [periodOrders]);

  // Top 10 Customers for activePeriod
  const topCustomers = useMemo(() => {
    const map = new Map<
      string,
      {
        customer: string;
        revenue: number;
        bop: number;
        margin: number;
        soCount: number;
        doCount: number;
        unitQty: number;
      }
    >();
    periodOrders.forEach((o) => {
      const cur = map.get(o.customer) || {
        customer: o.customer,
        revenue: 0,
        bop: 0,
        margin: 0,
        soCount: 0,
        doCount: 0,
        unitQty: 0,
      };
      cur.revenue += o.rev;
      cur.bop += o.bop;
      cur.margin += o.margin;
      cur.soCount += 1;
      cur.doCount += o.uniqueDoCount;
      cur.unitQty += o.totalUnitQty || 0;
      map.set(o.customer, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [periodOrders]);

  // Max value for visual bar comparison
  const maxPeriodVal = useMemo(() => {
    const vals = periods.flatMap((p) => [p.revenue, p.bop, p.target]);
    return Math.max(1, ...vals);
  }, [periods]);

  const activePeriodLabel =
    activePeriod === 'all'
      ? `Full Bulan (${formatMonthLabel(reportMonth)})`
      : periods.find((p) => p.key === activePeriod)?.rangeLabel || activePeriod;

  // Top Routes for activePeriod with Rev, BOP, Margin, SO, DO
  const topRoutes = useMemo(() => {
    const map = new Map<
      string,
      {
        route: string;
        rev: number;
        bop: number;
        margin: number;
        soSet: Set<string>;
        doSet: Set<string>;
        unitQty: number;
      }
    >();
    periodOrders.forEach((o) => {
      o.lines.forEach((l) => {
        const route = `${l[2] || '?'} → ${l[3] || '?'}`;
        const cur = map.get(route) ?? {
          route,
          rev: 0,
          bop: 0,
          margin: 0,
          soSet: new Set<string>(),
          doSet: new Set<string>(),
          unitQty: 0,
        };
        const rev = getDistributedLineRevenue(o, l);
        const bop = Number(l[5]) || 0;
        cur.rev += rev;
        cur.bop += bop;
        cur.margin += rev - bop;
        cur.unitQty += Number(l[10] ?? 0) || 0;
        cur.soSet.add(o.ref);
        if (l[0]) cur.doSet.add(String(l[0]));
        map.set(route, cur);
      });
    });
    return Array.from(map.values())
      .map((r) => ({
        route: r.route,
        rev: r.rev,
        bop: r.bop,
        margin: r.margin,
        soCount: r.soSet.size,
        doCount: r.doSet.size,
        unitQty: r.unitQty,
      }))
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 8);
  }, [periodOrders]);

  const unitLabel =
    sourceFilter === 'TRP' ? 'trip' : sourceFilter === 'VLI' ? 'unit' : 'unit/trip';

  // Build shared export payload
  const buildExportPayload = () => {
    const scopeLabel =
      sourceFilter === 'TRP' ? 'Transporter' : sourceFilter === 'VLI' ? 'VLI' : 'Semua Produk';
    return {
      reportMonth,
      monthLabel: formatMonthLabel(reportMonth),
      scopeLabel,
      activePeriodLabel,
      daysInMonth,
      monthTarget,
      isPartialModaFilter,
      summary: monthSummary,
      periods,
      modaBreakdown,
      topCustomers,
      topRoutes,
    };
  };

  const handleDownload = (type: 'pdf' | 'excel' | 'image') => {
    setDownloadMenuOpen(false);
    const payload = buildExportPayload();
    if (type === 'pdf') exportTenDaysReportPdf(payload);
    else if (type === 'excel') exportTenDaysReportExcel(payload);
    else exportTenDaysReportImage(payload);
  };

  return (
    <div className="space-y-5">
      {/* Top Action Bar: Month Selector + Period Filter + Export PDF */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 sm:px-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Bulan Laporan:
            </span>
          </div>
          <select
            value={reportMonth}
            onChange={(e) => {
              setReportMonth(e.target.value);
              setActivePeriod('all');
            }}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                { key: 'all', label: 'Semua' },
                { key: 'D1', label: '1–10' },
                { key: 'D2', label: '11–20' },
                { key: 'D3', label: `21–${daysInMonth}` },
              ] as Array<{ key: PeriodKey; label: string }>
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActivePeriod(tab.key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  activePeriod === tab.key
                    ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-900 dark:text-teal-400'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div ref={downloadMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setDownloadMenuOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            <Download className="h-3.5 w-3.5" />
            Download
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${downloadMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {downloadMenuOpen && (
            <div className="absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => handleDownload('pdf')}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FileText className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                <span>PDF (.pdf)</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownload('excel')}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownload('image')}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ImageIcon className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                <span>Gambar (.png)</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 3 Fixed Ten-Day Cards (1-10, 11-20, 21-EOM) */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {periods.map((p) => {
          const isSelected = activePeriod === p.key;
          const isNegMargin = p.margin < 0;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setActivePeriod(isSelected ? 'all' : p.key)}
              className={`rounded-2xl border p-5 text-left transition-all ${
                isSelected
                  ? 'border-teal-500 bg-teal-50/40 ring-1 ring-teal-500/30 dark:border-teal-500 dark:bg-teal-950/25'
                  : 'border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {p.title}
                  </span>
                  <span className="ml-2 font-mono text-[11px] text-slate-400">
                    {p.rangeLabel}
                  </span>
                </div>
                {!isPartialModaFilter && p.achievePct !== null && (
                  <span
                    className={`font-mono text-xs font-bold tabular-nums ${
                      p.achievePct >= 100
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : p.achievePct >= 75
                        ? 'text-teal-700 dark:text-teal-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {p.achievePct.toFixed(1)}%
                  </span>
                )}
              </div>

              <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
                {p.revenue >= 1e9 ? formatMiliar(p.revenue) : `Rp${formatJuta(p.revenue)} jt`}
              </p>

              {/* Progress vs proportional target */}
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    (p.achievePct ?? 0) >= 100
                      ? 'bg-emerald-500 dark:bg-emerald-400'
                      : (p.achievePct ?? 0) >= 75
                      ? 'bg-teal-600 dark:bg-teal-500'
                      : 'bg-amber-500 dark:bg-amber-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, p.achievePct ?? 0))}%` }}
                />
              </div>

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                <span>Target Rp{formatJuta(p.target)} jt</span>
                {p.growthVsPrevPct !== null && (
                  <span
                    className={`inline-flex items-center gap-0.5 font-semibold ${
                      p.growthVsPrevPct >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {p.growthVsPrevPct >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {p.growthVsPrevPct >= 0 ? '+' : ''}
                    {p.growthVsPrevPct.toFixed(1)}%
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2.5 font-mono text-[11px] tabular-nums dark:border-slate-800">
                <div>
                  <span className="block text-[10px] text-slate-400">BOP</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {formatJuta(p.bop)} jt
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400">Margin</span>
                  <span
                    className={`font-semibold ${
                      isNegMargin
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {formatJuta(p.margin)} jt
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] text-slate-400">
                    {p.unitQty > 0 ? 'Delivery' : 'Order'}
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {p.unitQty > 0
                      ? `${formatInt(p.unitQty)} ${unitLabel}`
                      : `${formatInt(p.soCount)} SO`}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {/* Run-Rate Forecast & Monthly Target Progress */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Ringkasan &amp; Proyeksi Bulan {formatMonthLabel(reportMonth)}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Perbandingan akumulasi 3 periode dasarian terhadap target bulanan.
            </p>
          </div>
          {!isPartialModaFilter && monthSummary.achievePct !== null && (
            <span
              className={`font-mono text-sm font-bold tabular-nums ${
                monthSummary.achievePct >= 100
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-teal-700 dark:text-teal-400'
              }`}
            >
              {monthSummary.achievePct.toFixed(1)}% dari target bulanan
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Total Revenue Bulan Ini
            </span>
            <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-50">
              {formatMiliar(monthSummary.revenue)}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
              Target: {formatMiliar(monthTarget)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {monthSummary.remainingTarget > 0 ? 'Sisa Target Bulanan' : 'Surplus Target'}
            </span>
            <p
              className={`mt-1 font-mono text-lg font-bold tabular-nums ${
                monthSummary.remainingTarget > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {monthSummary.remainingTarget > 0
                ? formatMiliar(monthSummary.remainingTarget)
                : `+${formatMiliar(monthSummary.surplusTarget)}`}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {monthSummary.remainingTarget > 0 && monthSummary.remainingDays > 0
                ? `Butuh Rp${formatJuta(monthSummary.requiredPerDay)} jt/hari`
                : monthSummary.unitQty > 0
                ? `${formatInt(monthSummary.soCount)} SO · ${formatInt(monthSummary.unitQty)} ${unitLabel}`
                : `${formatInt(monthSummary.soCount)} SO · ${formatInt(monthSummary.doCount)} DO`}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Margin Kotor ({monthSummary.marginPct !== null ? `${monthSummary.marginPct.toFixed(1)}%` : '-'})
            </span>
            <p className="mt-1 font-mono text-lg font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
              {formatMiliar(monthSummary.margin)}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-amber-600 dark:text-amber-400">
              BOP: {formatMiliar(monthSummary.bop)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Rata-rata / Hari (s/d Tgl {monthSummary.elapsedDays || '-'})
            </span>
            <p className="mt-1 font-mono text-lg font-bold text-sky-700 tabular-nums dark:text-sky-400">
              Rp{formatJuta(monthSummary.avgPerDay)} jt
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
              Proyeksi EOM: {formatMiliar(monthSummary.projectedEom)}
            </p>
          </div>
        </div>

        {/* Visual Bar Comparison: D1 vs D2 vs D3 */}
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-slate-100 p-4 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Perbandingan Visual Revenue vs Target per 10 Hari
            </h3>
            {periods.map((p) => {
              const [repY, repM] = reportMonth.split('-').map(Number);
              const nowDate = new Date();
              const todayMidnight = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
              const startDay = p.key === 'D1' ? 1 : p.key === 'D2' ? 11 : 21;
              const periodStart =
                Number.isFinite(repY) && Number.isFinite(repM)
                  ? new Date(repY, repM - 1, startDay)
                  : null;
              const isUpcoming = periodStart !== null && periodStart > todayMidnight && p.revenue === 0;
              const revW = (p.revenue / maxPeriodVal) * 100;
              const tgtW = (p.target / maxPeriodVal) * 100;
              return (
                <div key={p.key} className={`space-y-1 transition-opacity ${isUpcoming ? 'opacity-45' : ''}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {p.title} <span className="text-[11px] text-slate-400">({p.rangeLabel})</span>
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-slate-800 tabular-nums dark:text-slate-100">
                      Rp{formatJuta(p.revenue)} jt{' '}
                      <span className="font-normal text-slate-400">/ {formatJuta(p.target)} jt</span>
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-teal-600 transition-all duration-300 dark:bg-teal-500"
                        style={{ width: `${Math.min(100, revW)}%` }}
                      />
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-violet-400/80 dark:bg-violet-500/80"
                        style={{ width: `${Math.min(100, tgtW)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-4 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-teal-600" /> Aktual Revenue
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-violet-400" /> Target Proporsional
              </span>
            </div>
          </div>

          {/* Summary Table D1 / D2 / D3 */}
          <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/90 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                  <th className="px-3 py-2 text-left font-semibold">Periode</th>
                  <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                  <th className="px-3 py-2 text-right font-semibold">BOP</th>
                  <th className="px-3 py-2 text-right font-semibold">Margin</th>
                  <th className="px-3 py-2 text-right font-semibold">% Mgn</th>
                  <th className="px-3 py-2 text-right font-semibold">Unit (Trip)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
                {periods.map((p) => (
                  <tr
                    key={p.key}
                    onClick={() => setActivePeriod(activePeriod === p.key ? 'all' : p.key)}
                    className={`cursor-pointer transition-colors ${
                      activePeriod === p.key
                        ? 'bg-teal-50/70 dark:bg-teal-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="px-3 py-2 font-sans font-semibold text-slate-800 dark:text-slate-200">
                      {p.title}
                      <span className="block text-[10px] font-normal text-slate-400">
                        {p.rangeLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-100">
                      {formatJuta(p.revenue)} jt
                    </td>
                    <td className="px-3 py-2 text-right text-amber-600 dark:text-amber-400">
                      {formatJuta(p.bop)} jt
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatJuta(p.margin)} jt
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                      {p.marginPct !== null ? `${p.marginPct.toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200">
                      {p.unitQty > 0 ? formatInt(p.unitQty) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/90 font-mono text-xs font-bold tabular-nums dark:border-slate-700 dark:bg-slate-800/70">
                  <td className="px-3 py-2 font-sans text-slate-900 dark:text-slate-100">Total</td>
                  <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-50">
                    {formatJuta(monthSummary.revenue)} jt
                  </td>
                  <td className="px-3 py-2 text-right text-amber-600 dark:text-amber-400">
                    {formatJuta(monthSummary.bop)} jt
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-700 dark:text-emerald-400">
                    {formatJuta(monthSummary.margin)} jt
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200">
                    {monthSummary.marginPct !== null ? `${monthSummary.marginPct.toFixed(1)}%` : '-'}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-50">
                    {monthSummary.unitQty > 0 ? formatInt(monthSummary.unitQty) : '-'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      {/* Bottom Grid: Breakdown per Moda + Top 10 Customers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Breakdown per Moda */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Breakdown per Moda
              </h2>
            </div>
            <span className="font-mono text-[11px] text-slate-400">{activePeriodLabel}</span>
          </div>

          <div className="mt-4 space-y-3">
            {modaBreakdown.map((m) => (
              <div
                key={m.moda}
                className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                    <span className={`h-2.5 w-2.5 rounded-full ${MODA_DOT_COLOR[m.moda]}`} />
                    {m.moda}
                  </span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-50">
                    Rp{formatJuta(m.revenue)} jt{' '}
                    <span className="font-normal text-slate-400">({m.sharePct.toFixed(1)}%)</span>
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700">
                  <div
                    className={`h-full rounded-full ${MODA_DOT_COLOR[m.moda]}`}
                    style={{ width: `${Math.min(100, m.sharePct)}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                  <span>
                    BOP <strong className="text-amber-600 dark:text-amber-400">{formatJuta(m.bop)} jt</strong> ·
                    Margin{' '}
                    <strong className="text-emerald-700 dark:text-emerald-400">
                      {formatJuta(m.margin)} jt
                    </strong>
                  </span>
                  <span>
                    {formatInt(m.soCount)} SO · {formatInt(m.doCount)} DO
                    {m.unitQty > 0 && (
                      <>
                        {' · '}
                        <strong className="text-slate-700 dark:text-slate-200">
                          {formatInt(m.unitQty)} {m.moda === 'Transporter' ? 'trip' : 'unit'}
                        </strong>
                      </>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Top 10 Customer */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Top 10 Customer
            </h2>
            <span className="font-mono text-[11px] text-slate-400">{activePeriodLabel}</span>
          </div>

          {topCustomers.length === 0 ? (
            <div className="mt-6 flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 dark:border-slate-800">
              Belum ada transaksi pada periode ini.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200/80 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2 pr-2 text-left font-semibold">Customer</th>
                    <th className="px-2 py-2 text-right font-semibold">Unit (Trip)</th>
                    <th className="px-2 py-2 text-right font-semibold">Revenue</th>
                    <th className="px-2 py-2 text-right font-semibold">Margin</th>
                    <th className="py-2 pl-2 text-right font-semibold">% Mgn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
                  {topCustomers.map((c) => {
                    const mgnPct = c.revenue > 0 ? (c.margin / c.revenue) * 100 : null;
                    return (
                      <tr
                        key={c.customer}
                        onClick={() => onSelectCustomer(c.customer)}
                        className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <td className="py-2 pr-2 font-sans font-medium text-slate-800 dark:text-slate-200">
                          {c.customer}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-300">
                          {c.unitQty > 0 ? formatInt(c.unitQty) : '-'}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                          {formatJuta(c.revenue)} jt
                        </td>
                        <td className="px-2 py-2 text-right text-emerald-700 dark:text-emerald-400">
                          {formatJuta(c.margin)} jt
                        </td>
                        <td className="py-2 pl-2 text-right text-slate-600 dark:text-slate-300">
                          {mgnPct !== null ? `${mgnPct.toFixed(1)}%` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* 5. Top Rute Pengiriman */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Top Rute Pengiriman
            </h2>
          </div>
          <span className="font-mono text-[11px] text-slate-400">{activePeriodLabel}</span>
        </div>

        {topRoutes.length === 0 ? (
          <div className="mt-4 flex h-28 items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 dark:border-slate-800">
            Belum ada data rute pengiriman pada periode ini.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 pr-2 text-left font-semibold">#</th>
                  <th className="px-2 py-2 text-left font-semibold">Rute Pengiriman</th>
                  <th className="px-2 py-2 text-right font-semibold">Unit (Trip)</th>
                  <th className="px-2 py-2 text-right font-semibold">Rev (jt)</th>
                  <th className="px-2 py-2 text-right font-semibold">Share</th>
                  <th className="px-2 py-2 text-right font-semibold">Margin</th>
                  <th className="px-2 py-2 text-right font-semibold">% Mgn</th>
                  <th className="py-2 pl-2 text-right font-semibold">SO / DO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
                {(() => {
                  const totalPeriodRev = modaBreakdown.reduce((s, m) => s + m.revenue, 0);
                  return topRoutes.map((r, idx) => {
                    const sharePct = totalPeriodRev > 0 ? (r.rev / totalPeriodRev) * 100 : 0;
                    const mgnPct = r.rev > 0 ? (r.margin / r.rev) * 100 : null;
                    return (
                      <tr
                        key={r.route}
                        className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <td className="py-2 pr-2 text-slate-400">{idx + 1}</td>
                        <td className="px-2 py-2 font-sans font-medium text-slate-800 dark:text-slate-200">
                          {r.route}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-300">
                          {r.unitQty > 0 ? formatInt(r.unitQty) : '-'}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                          {formatJuta(r.rev)} jt
                        </td>
                        <td className="px-2 py-2 text-right text-slate-500 dark:text-slate-400">
                          {sharePct.toFixed(1)}%
                        </td>
                        <td
                          className={`px-2 py-2 text-right font-semibold ${
                            r.margin < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {formatJuta(r.margin)} jt
                        </td>
                        <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-300">
                          {mgnPct !== null ? `${mgnPct.toFixed(1)}%` : '-'}
                        </td>
                        <td className="py-2 pl-2 text-right text-slate-600 dark:text-slate-300">
                          {formatInt(r.soCount)}/{formatInt(r.doCount)}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
