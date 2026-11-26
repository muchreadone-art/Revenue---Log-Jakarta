import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Search, Users } from 'lucide-react';
import { FINANCE_PICS, type CategorySummaryRow, type FinancePic, type SalesOrderRecord } from '../types/logistics';
import {
  calcAgeDays,
  downloadCsv,
  formatInt,
  formatJuta,
  formatMiliar,
  getSoBillingStatus,
} from '../utils/formatters';
import { INVOICED_STATUS, computeUnbilledAging, computeLineInvoiceStatuses } from '../utils/logisticsEngine';
import { BillingMarginView } from './BillingMarginView';

interface FinanceViewProps {
  orders: SalesOrderRecord[];
  refDate: string;
  revenue: number;
  billed: number;
  unbilled: number;
  agingBuckets: Array<{
    key: string;
    label: string;
    value: number;
    count: number;
    min: number;
    max: number;
  }>;
  toInvoiceVal: number;
  nothingToInvoiceVal: number;
  invoiceStatuses: Array<{ status: string; lineCount: number; value: number }>;
  categorySummary: CategorySummaryRow[];
  customerPics: Record<string, FinancePic>;
  onSelectCustomer: (customer: string) => void;
}

type LineStatusFilter = 'all' | 'To Invoice' | 'Nothing to Invoice' | 'Fully Invoiced' | 'Campuran';
type AgingFilter = 'all' | '0-30' | '31-60' | '60+';
type SortMode = 'unbilled-desc' | 'age-desc' | 'rev-desc' | 'date-desc';

export const FinanceView: React.FC<FinanceViewProps> = ({
  orders,
  refDate,
  revenue,
  billed,
  unbilled,
  agingBuckets,
  toInvoiceVal,
  nothingToInvoiceVal,
  invoiceStatuses,
  categorySummary,
  customerPics,
  onSelectCustomer,
}) => {
  const [statusFilter, setStatusFilter] = useState<LineStatusFilter>('all');
  const [agingFilter, setAgingFilter] = useState<AgingFilter>('all');
  const [picFilter, setPicFilter] = useState<'all' | 'unassigned' | FinancePic>('all');
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('unbilled-desc');
  const [expandedSos, setExpandedSos] = useState<Record<string, boolean>>({});

  const picSummary = useMemo(() => {
    const map: Record<
      FinancePic | 'unassigned',
      { revenue: number; billed: number; unbilled: number; soCount: number }
    > = {
      DICKA: { revenue: 0, billed: 0, unbilled: 0, soCount: 0 },
      IRFAN: { revenue: 0, billed: 0, unbilled: 0, soCount: 0 },
      JOKO: { revenue: 0, billed: 0, unbilled: 0, soCount: 0 },
      unassigned: { revenue: 0, billed: 0, unbilled: 0, soCount: 0 },
    };
    orders.forEach((o) => {
      const key: FinancePic | 'unassigned' = customerPics[o.customer] ?? 'unassigned';
      map[key].revenue += o.rev;
      map[key].billed += o.billedVal;
      map[key].unbilled += o.unbilledVal;
      map[key].soCount += 1;
    });
    return map;
  }, [orders, customerPics]);

  const picFilteredOrders = useMemo(() => {
    if (picFilter === 'all') return orders;
    return orders.filter((o) => {
      const assignedPic = customerPics[o.customer];
      if (picFilter === 'unassigned' && assignedPic) return false;
      if (picFilter !== 'unassigned' && assignedPic !== picFilter) return false;
      return true;
    });
  }, [orders, customerPics, picFilter]);

  const picRevenue = useMemo(() => {
    let sum = 0;
    picFilteredOrders.forEach((o) => (sum += o.rev));
    return sum;
  }, [picFilteredOrders]);

  const picBilled = useMemo(() => {
    let sum = 0;
    picFilteredOrders.forEach((o) => (sum += o.billedVal));
    return sum;
  }, [picFilteredOrders]);

  const picUnbilled = useMemo(() => {
    let sum = 0;
    picFilteredOrders.forEach((o) => (sum += o.unbilledVal));
    return sum;
  }, [picFilteredOrders]);

  const picAging = useMemo(() => {
    return computeUnbilledAging(picFilteredOrders, refDate);
  }, [picFilteredOrders, refDate]);

  const picInvoiceStatuses = useMemo(() => {
    return computeLineInvoiceStatuses(picFilteredOrders);
  }, [picFilteredOrders]);

  const activeRevenue = picFilter === 'all' ? revenue : picRevenue;
  const activeBilled = picFilter === 'all' ? billed : picBilled;
  const activeUnbilled = picFilter === 'all' ? unbilled : picUnbilled;
  const activeAgingBuckets = picFilter === 'all' ? agingBuckets : picAging.buckets;
  const activeToInvoiceVal = picFilter === 'all' ? toInvoiceVal : picAging.toInvoiceVal;
  const activeNothingToInvoiceVal = picFilter === 'all' ? nothingToInvoiceVal : picAging.nothingToInvoiceVal;
  const activeInvoiceStatuses = picFilter === 'all' ? invoiceStatuses : picInvoiceStatuses;

  const billedPct = activeRevenue > 0 ? (activeBilled / activeRevenue) * 100 : 0;
  const toInvoiceLines =
    activeInvoiceStatuses.find((s) => s.status === 'To Invoice')?.lineCount ?? 0;
  const nothingToInvoiceLines =
    activeInvoiceStatuses.find((s) => s.status === 'Nothing to Invoice')?.lineCount ?? 0;
  const fullyInvoicedLines =
    activeInvoiceStatuses.find((s) => s.status === 'Fully Invoiced')?.lineCount ?? 0;
  const over60 = activeAgingBuckets.find((b) => b.key === '60+');

  const totalLinesCount = activeInvoiceStatuses.reduce((a, s) => a + s.lineCount, 0);
  const totalLinesDenom = totalLinesCount || 1;
  const maxAging = Math.max(1, ...activeAgingBuckets.map((b) => b.value));

  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;
  const statusHex = (status: string) => {
    if (status === 'Fully Invoiced') return '#10B981';
    if (status === 'To Invoice') return '#F59E0B';
    return '#94A3B8';
  };
  const donutSegments = activeInvoiceStatuses.map((s) => {
    const fraction = s.lineCount / totalLinesDenom;
    const dash = fraction * circumference;
    const offset = -cumulativeOffset;
    cumulativeOffset += dash;
    return {
      ...s,
      dash,
      offset,
      pct: fraction * 100,
      color: statusHex(s.status),
    };
  });

  const filteredSoList = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = picFilteredOrders.filter((s) => {
      const billingStatus = getSoBillingStatus(s.lines);
      const hasToInvoice = s.lines.some((l) => l[6] === 'To Invoice');
      const hasNothingToInv = s.lines.some((l) => l[6] === 'Nothing to Invoice');

      if (statusFilter === 'To Invoice' && !hasToInvoice) return false;
      if (statusFilter === 'Nothing to Invoice' && !hasNothingToInv) return false;
      if (statusFilter === 'Fully Invoiced' && billingStatus !== 'Billed') return false;
      if (statusFilter === 'Campuran' && billingStatus !== 'Campuran') return false;

      if (agingFilter !== 'all') {
        if (s.unbilledVal <= 0) return false;
        const age = calcAgeDays(refDate, s.date);
        if (agingFilter === '0-30' && age > 30) return false;
        if (agingFilter === '31-60' && (age < 31 || age > 60)) return false;
        if (agingFilter === '60+' && age <= 60) return false;
      }

      if (q) {
        const matchRef = s.ref.toLowerCase().includes(q);
        const matchCust = s.customer.toLowerCase().includes(q);
        const matchPic = (customerPics[s.customer] || '').toLowerCase().includes(q);
        const matchDo = s.lines.some((l) => l[0].toLowerCase().includes(q));
        if (!matchRef && !matchCust && !matchPic && !matchDo) return false;
      }

      return true;
    });

    return [...list].sort((a, b) => {
      if (sortMode === 'unbilled-desc') {
        return b.unbilledVal - a.unbilledVal || b.rev - a.rev;
      }
      if (sortMode === 'age-desc') {
        return calcAgeDays(refDate, b.date) - calcAgeDays(refDate, a.date);
      }
      if (sortMode === 'rev-desc') {
        return b.rev - a.rev;
      }
      return b.date.localeCompare(a.date);
    });
  }, [picFilteredOrders, statusFilter, agingFilter, query, sortMode, refDate, customerPics]);

  const toggleSo = (key: string) => {
    setExpandedSos((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExportCsv = () => {
    downloadCsv(
      `status-invoicing-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Customer',
        'No SO',
        'Sumber',
        'Unit (Trip)',
        'Tanggal',
        'Umur (hari)',
        'Status SO',
        'Status Baris',
        'Revenue (Rp)',
        'Billed (Rp)',
        'Unbilled (Rp)',
      ],
      filteredSoList.map((s) => {
        const lineStatuses = Array.from(new Set(s.lines.map((l) => l[6] || '-'))).join(' + ');
        return [
          s.customer,
          s.ref,
          s.src,
          s.totalUnitQty || 0,
          s.date,
          calcAgeDays(refDate, s.date),
          getSoBillingStatus(s.lines),
          lineStatuses,
          s.rev,
          s.billedVal,
          s.unbilledVal,
        ];
      })
    );
  };

  const hasLocalFilter = statusFilter !== 'all' || agingFilter !== 'all' || query.trim() !== '';

  return (
    <div className="space-y-5">
      {/* 4-Column Finance Invoicing KPI Strip */}
      <section aria-label="Ringkasan Status Invoicing" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Fully Invoiced (Billed)
            </span>
            <span className="font-mono text-[11px] font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
              {billedPct.toFixed(1)}%
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-emerald-700 tabular-nums dark:text-emerald-400">
            {formatMiliar(activeBilled)}
          </p>
          <p className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            {formatInt(fullyInvoicedLines)} baris DO sudah ditagih
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              To Invoice (Siap Tagih)
            </span>
            <span className="font-mono text-[11px] font-semibold text-amber-600 tabular-nums dark:text-amber-400">
              {activeRevenue > 0 ? `${((activeToInvoiceVal / activeRevenue) * 100).toFixed(1)}%` : '0%'}
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-amber-600 tabular-nums dark:text-amber-400">
            {formatMiliar(activeToInvoiceVal)}
          </p>
          <p className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            {formatInt(toInvoiceLines)} baris DO menunggu invoice
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Nothing to Invoice
            </span>
            <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              {activeRevenue > 0 ? `${((activeNothingToInvoiceVal / activeRevenue) * 100).toFixed(1)}%` : '0%'}
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
            {formatMiliar(activeNothingToInvoiceVal)}
          </p>
          <p className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            {formatInt(nothingToInvoiceLines)} baris DO tercatat
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Unbilled &gt; 60 Hari
            </span>
            <span className="font-mono text-[11px] font-semibold text-red-600 tabular-nums dark:text-red-400">
              {formatInt(over60?.count ?? 0)} SO
            </span>
          </div>
          <p
            className={`mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums ${
              (over60?.value ?? 0) > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-900 dark:text-slate-50'
            }`}
          >
            {formatMiliar(over60?.value ?? 0)}
          </p>
          <p className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            Total unbilled{picFilter !== 'all' ? ` (${picFilter})` : ' keseluruhan'}: {formatMiliar(activeUnbilled)}
          </p>
        </div>
      </section>

      {/* Finance PIC Summary & Filter Strip (DICKA, IRFAN, JOKO) */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Monitoring Penagihan per PIC Finance
            </h3>
          </div>
          {picFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setPicFilter('all')}
              className="text-xs font-medium text-teal-700 underline underline-offset-4 hover:text-teal-800 dark:text-teal-400"
            >
              Tampilkan Semua PIC
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(FINANCE_PICS as FinancePic[]).map((pic) => {
            const stat = picSummary[pic];
            const pct = stat.revenue > 0 ? (stat.billed / stat.revenue) * 100 : 0;
            const active = picFilter === pic;

            const theme =
              pic === 'DICKA'
                ? {
                    border: active ? 'border-teal-500 ring-1 ring-teal-500/30' : 'border-teal-200/80 hover:border-teal-300 dark:border-teal-900/60',
                    bg: active ? 'bg-teal-50/80 dark:bg-teal-950/40' : 'bg-teal-50/30 dark:bg-teal-950/20',
                    headerText: 'text-teal-900 dark:text-teal-200',
                    pill: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
                    accentDot: 'bg-teal-600',
                  }
                : pic === 'IRFAN'
                ? {
                    border: active ? 'border-indigo-500 ring-1 ring-indigo-500/30' : 'border-indigo-200/80 hover:border-indigo-300 dark:border-indigo-900/60',
                    bg: active ? 'bg-indigo-50/80 dark:bg-indigo-950/40' : 'bg-indigo-50/30 dark:bg-indigo-950/20',
                    headerText: 'text-indigo-900 dark:text-indigo-200',
                    pill: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
                    accentDot: 'bg-indigo-600',
                  }
                : {
                    border: active ? 'border-amber-500 ring-1 ring-amber-500/30' : 'border-amber-200/80 hover:border-amber-300 dark:border-amber-900/60',
                    bg: active ? 'bg-amber-50/80 dark:bg-amber-950/40' : 'bg-amber-50/30 dark:bg-amber-950/20',
                    headerText: 'text-amber-900 dark:text-amber-200',
                    pill: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
                    accentDot: 'bg-amber-500',
                  };

            return (
              <button
                key={pic}
                type="button"
                onClick={() => setPicFilter(active ? 'all' : pic)}
                className={`rounded-xl border p-4 text-left transition-all ${theme.border} ${theme.bg}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`inline-flex items-center gap-1.5 font-mono text-xs font-bold ${theme.headerText}`}>
                    <span className={`h-2 w-2 rounded-full ${theme.accentDot}`} />
                    {pic}
                  </span>
                  <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${theme.pill}`}>
                    {pct.toFixed(0)}% billed
                  </span>
                </div>
                <p className="mt-2 font-mono text-base font-bold text-slate-900 tabular-nums dark:text-slate-50">
                  {formatMiliar(stat.unbilled)}{' '}
                  <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400">
                    unbilled
                  </span>
                </p>
                <p className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                  Billed {formatMiliar(stat.billed)} · {formatInt(stat.soCount)} SO
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Clean Invoicing View */}
      <div className="space-y-5">
          {/* Interactive 2-Column Visual Filters */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Donut Status Invoice (Clickable Filter) */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Proporsi Status Invoicing
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Klik status di bawah untuk langsung memfilter daftar Sales Order.
              </p>

              <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
                <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
                  <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                    <circle
                      cx="60"
                      cy="60"
                      r={radius}
                      fill="none"
                      className="stroke-slate-100 dark:stroke-slate-800"
                      strokeWidth="15"
                    />
                    {donutSegments.map((seg) => (
                      <circle
                        key={seg.status}
                        cx="60"
                        cy="60"
                        r={radius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="15"
                        strokeDasharray={`${seg.dash} ${circumference}`}
                        strokeDashoffset={seg.offset}
                        opacity={
                          statusFilter === 'all' || statusFilter === seg.status ? 1 : 0.3
                        }
                        className="cursor-pointer transition-opacity"
                        onClick={() =>
                          setStatusFilter((prev) =>
                            prev === seg.status
                              ? 'all'
                              : (seg.status as LineStatusFilter)
                          )
                        }
                      />
                    ))}
                  </svg>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="font-mono text-base font-bold text-slate-900 tabular-nums dark:text-slate-100">
                      {formatInt(totalLinesCount)}
                    </span>
                    <span className="text-[10px] text-slate-400">Baris DO</span>
                  </div>
                </div>

                <div className="w-full flex-1 space-y-2">
                  {donutSegments.map((seg) => {
                    const active = statusFilter === seg.status;
                    return (
                      <button
                        key={seg.status}
                        type="button"
                        onClick={() =>
                          setStatusFilter((prev) =>
                            prev === seg.status
                              ? 'all'
                              : (seg.status as LineStatusFilter)
                          )
                        }
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                          active
                            ? 'bg-teal-50 text-teal-900 dark:bg-teal-950/50 dark:text-teal-200'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 font-medium">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: seg.color }}
                          />
                          {seg.status}
                        </span>
                        <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          <strong className="text-slate-900 dark:text-slate-100">
                            {seg.pct.toFixed(1)}%
                          </strong>{' '}
                          · {formatInt(seg.lineCount)} · Rp{formatJuta(seg.value)} jt
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Umur Tagihan Unbilled (Clickable Filter) */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                    Umur Tagihan Unbilled
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Dihitung hingga {refDate || '-'}. Klik rentang umur untuk memfilter tabel SO.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                {activeAgingBuckets.map((bucket) => {
                  const pct = (bucket.value / maxAging) * 100;
                  const active = agingFilter === bucket.key;
                  const barTone =
                    bucket.key === '60+'
                      ? 'bg-red-500'
                      : bucket.key === '31-60'
                      ? 'bg-amber-500'
                      : 'bg-teal-600 dark:bg-teal-500';
                  return (
                    <button
                      key={bucket.key}
                      type="button"
                      onClick={() =>
                        setAgingFilter((prev) =>
                          prev === bucket.key ? 'all' : (bucket.key as AgingFilter)
                        )
                      }
                      className={`w-full space-y-1.5 rounded-xl px-3 py-2 text-left transition-colors ${
                        active
                          ? 'bg-teal-50 dark:bg-teal-950/50'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {bucket.label}
                        </span>
                        <span className="font-mono text-slate-600 tabular-nums dark:text-slate-300">
                          <strong className="text-slate-900 dark:text-slate-100">
                            Rp{formatJuta(bucket.value)} jt
                          </strong>{' '}
                          · {formatInt(bucket.count)} SO
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${barTone}`}
                          style={{ width: `${Math.max(bucket.value > 0 ? 3 : 0, pct)}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Interactive SO Invoicing Ledger Table */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  Daftar Status Invoicing Sales Order
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Menampilkan {formatInt(Math.min(filteredSoList.length, 100))} dari{' '}
                  {formatInt(filteredSoList.length)} SO cocok. Klik baris SO untuk memeriksa status invoice per DO.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as LineStatusFilter)}
                  aria-label="Filter status invoice"
                  className="h-9 rounded-xl bg-slate-100/90 px-3 text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="all">Semua Status</option>
                  <option value="To Invoice">Ada Baris To Invoice</option>
                  <option value="Nothing to Invoice">Ada Baris Nothing to Invoice</option>
                  <option value="Fully Invoiced">Fully Invoiced (Lunas)</option>
                  <option value="Campuran">Status Campuran</option>
                </select>

                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  aria-label="Urutkan daftar SO"
                  className="h-9 rounded-xl bg-slate-100/90 px-3 text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="unbilled-desc">Unbilled Terbesar</option>
                  <option value="age-desc">Umur Terlama</option>
                  <option value="rev-desc">Revenue Terbesar</option>
                  <option value="date-desc">Tanggal Terbaru</option>
                </select>

                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cari SO, DO, customer..."
                    className="h-9 w-48 rounded-xl bg-slate-100/90 pr-3 pl-9 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 whitespace-nowrap transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  Ekspor CSV
                </button>
              </div>
            </div>

            <div className="mt-4 max-h-[540px] overflow-auto">
              <table className="w-full border-collapse text-xs whitespace-nowrap">
                <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900">
                  <tr className="border-b border-slate-200/80 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-3 pr-3 text-left font-semibold">Customer</th>
                    <th className="px-3 py-3 text-left font-semibold">No SO</th>
                    <th className="px-3 py-3 text-right font-semibold">Unit (Trip)</th>
                    <th className="px-3 py-3 text-left font-semibold">Tanggal</th>
                    <th className="px-3 py-3 text-right font-semibold">Umur (hari)</th>
                    <th className="px-3 py-3 text-right font-semibold">Revenue (jt)</th>
                    <th className="px-3 py-3 text-right font-semibold">Billed (jt)</th>
                    <th className="px-3 py-3 text-right font-semibold">Unbilled (jt)</th>
                    <th className="pl-3 py-3 text-left font-semibold">Status Baris</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredSoList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-500">
                        Tidak ada SO yang sesuai dengan filter invoicing saat ini.
                      </td>
                    </tr>
                  ) : (
                    filteredSoList.slice(0, 100).map((s) => {
                      const rowKey = `${s.src}:${s.ref}`;
                      const isOpen = !!expandedSos[rowKey];
                      const age = calcAgeDays(refDate, s.date);
                      const statuses = Array.from(
                        new Set(s.lines.map((l) => l[6] || '-'))
                      ).join(' + ');
                      const hasToInv = s.lines.some((l) => l[6] === 'To Invoice');
                      const allBilled = s.lines.every((l) => l[6] === INVOICED_STATUS);
                      const unitLabel = s.src === 'TRP' ? 'trip' : 'unit';

                      return (
                        <React.Fragment key={rowKey}>
                          <tr
                            onClick={() => toggleSo(rowKey)}
                            className="cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                          >
                            <td className="py-3 pr-3">
                              <div className="flex flex-wrap items-center gap-2">
                                {isOpen ? (
                                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectCustomer(s.customer);
                                  }}
                                  className="font-medium text-teal-700 underline decoration-teal-700/30 underline-offset-4 hover:text-teal-800 dark:text-teal-400"
                                >
                                  {s.customer}
                                </button>
                                {customerPics[s.customer] && (
                                  <span
                                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                                      customerPics[s.customer] === 'DICKA'
                                        ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300'
                                        : customerPics[s.customer] === 'IRFAN'
                                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300'
                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                                    }`}
                                  >
                                    {customerPics[s.customer]}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                              {s.ref}
                            </td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-200">
                              {s.totalUnitQty > 0 ? (
                                <span>
                                  {formatInt(s.totalUnitQty)}{' '}
                                  <span className="text-[10px] text-slate-400">{unitLabel}</span>
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="px-3 py-3 font-mono text-slate-500 tabular-nums dark:text-slate-400">
                              {s.date || '-'}
                            </td>
                            <td
                              className={`px-3 py-3 text-right font-mono tabular-nums ${
                                s.unbilledVal > 0 && age > 60
                                  ? 'font-semibold text-red-600 dark:text-red-400'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {formatInt(age)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums">
                              {formatJuta(s.rev)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-emerald-700 tabular-nums dark:text-emerald-400">
                              {formatJuta(s.billedVal)}
                            </td>
                            <td
                              className={`px-3 py-3 text-right font-mono font-semibold tabular-nums ${
                                s.unbilledVal > 0
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-400'
                              }`}
                            >
                              {formatJuta(s.unbilledVal)}
                            </td>
                            <td
                              className={`pl-3 py-3 font-medium ${
                                allBilled
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : hasToInv
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {statuses}
                            </td>
                          </tr>

                          {isOpen && (
                            <tr className="bg-slate-50/90 dark:bg-slate-800/45">
                              <td colSpan={9} className="p-3.5">
                                <table className="w-full border-collapse text-[11px]">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                      <th className="py-1.5 pr-3 text-left font-semibold">No DO</th>
                                      <th className="px-2 py-1.5 text-left font-semibold">Kategori</th>
                                      <th className="px-2 py-1.5 text-left font-semibold">Rute</th>
                                      <th className="px-2 py-1.5 text-right font-semibold">Unit (Trip)</th>
                                      <th className="px-2 py-1.5 text-right font-semibold">Revenue (Rp)</th>
                                      <th className="px-2 py-1.5 text-right font-semibold">BOP (Rp)</th>
                                      <th className="pl-2 py-1.5 text-left font-semibold">Status Invoice</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                                    {s.lines.map((l, idx) => (
                                      <tr key={`${l[0]}-${idx}`}>
                                        <td className="py-1.5 pr-3 font-mono text-slate-800 dark:text-slate-200">
                                          {l[0]}
                                        </td>
                                        <td className="px-2 py-1.5 text-slate-600 dark:text-slate-300">
                                          {l[1]}
                                        </td>
                                        <td className="px-2 py-1.5 text-slate-600 dark:text-slate-300">
                                          {l[2]} → {l[3]}
                                        </td>
                                        <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-200">
                                          {l[10] && l[10] > 0 ? `${formatInt(l[10])} ${unitLabel}` : '-'}
                                        </td>
                                        <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                                          {formatInt(l[4])}
                                        </td>
                                        <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                                          {formatInt(l[5])}
                                        </td>
                                        <td
                                          className={`pl-2 py-1.5 font-medium ${
                                            l[6] === INVOICED_STATUS
                                              ? 'text-emerald-700 dark:text-emerald-400'
                                              : l[6] === 'To Invoice'
                                              ? 'text-amber-600 dark:text-amber-400'
                                              : 'text-slate-500 dark:text-slate-400'
                                          }`}
                                        >
                                          {l[6] || '-'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
    </div>
  );
};
