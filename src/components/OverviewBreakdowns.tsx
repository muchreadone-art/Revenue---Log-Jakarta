import React from 'react';
import { ArrowRight, MapPin } from 'lucide-react';
import type { CustomerSummaryRow } from '../types/logistics';
import { formatInt, formatJuta } from '../utils/formatters';

interface AgingBucket {
  key: string;
  label: string;
  value: number;
  count: number;
}

interface OverviewBreakdownsProps {
  refDate: string;
  agingBuckets: AgingBucket[];
  toInvoiceVal: number;
  nothingToInvoiceVal: number;
  customerSummary: CustomerSummaryRow[];
  totalRevenue: number;
  topRoutes: Array<{ route: string; count: number; rev: number }>;
  invoiceStatuses: Array<{ status: string; lineCount: number; value: number }>;
  onSelectRoute?: (route: string) => void;
}

export const OverviewBreakdowns: React.FC<OverviewBreakdownsProps> = ({
  refDate,
  agingBuckets,
  toInvoiceVal,
  nothingToInvoiceVal,
  customerSummary,
  totalRevenue,
  topRoutes,
  invoiceStatuses,
  onSelectRoute,
}) => {
  const maxAging = Math.max(1, ...agingBuckets.map((b) => b.value));
  const sortedCustomers = [...customerSummary].sort((a, b) => b.revenue - a.revenue);
  const top5Share =
    totalRevenue > 0
      ? (sortedCustomers.slice(0, 5).reduce((a, c) => a + c.revenue, 0) / totalRevenue) * 100
      : 0;
  const top10Share =
    totalRevenue > 0
      ? (sortedCustomers.slice(0, 10).reduce((a, c) => a + c.revenue, 0) / totalRevenue) * 100
      : 0;
  const maxCustRev = Math.max(1, ...(sortedCustomers[0] ? [sortedCustomers[0].revenue] : [1]));
  const maxRouteCount = Math.max(1, ...(topRoutes[0] ? [topRoutes[0].count] : [1]));
  const totalLines = invoiceStatuses.reduce((a, s) => a + s.lineCount, 0) || 1;

  const statusHex = (status: string) => {
    if (status === 'Fully Invoiced') return '#10B981';
    if (status === 'To Invoice') return '#F59E0B';
    return '#94A3B8';
  };

  // Compute SVG Donut segments
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;
  const donutSegments = invoiceStatuses.map((s) => {
    const fraction = s.lineCount / totalLines;
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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Status Invoice Donut + Summary */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Status Penagihan Baris DO
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Proporsi status invoice Odoo di seluruh baris order pada filter aktif.
        </p>

        {invoiceStatuses.length === 0 ? (
          <p className="mt-6 text-xs text-slate-500">Tidak ada baris order.</p>
        ) : (
          <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
              <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
                <circle
                  cx="66"
                  cy="66"
                  r={radius}
                  fill="none"
                  className="stroke-slate-100 dark:stroke-slate-800"
                  strokeWidth="16"
                />
                {donutSegments.map((seg) => (
                  <circle
                    key={seg.status}
                    cx="66"
                    cy="66"
                    r={radius}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="16"
                    strokeDasharray={`${seg.dash} ${circumference}`}
                    strokeDashoffset={seg.offset}
                    strokeLinecap="butt"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                  {formatInt(totalLines)}
                </span>
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                  Baris DO
                </span>
              </div>
            </div>

            <div className="w-full flex-1 space-y-3">
              {donutSegments.map((seg) => (
                <div key={seg.status} className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {seg.status}
                    </span>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {seg.pct.toFixed(1)}%
                    </span>
                    <span className="ml-2 text-slate-500 dark:text-slate-400">
                      ({formatInt(seg.lineCount)} · Rp{formatJuta(seg.value)} jt)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Umur Tagihan Unbilled */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Umur Tagihan Unbilled
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Usia SO belum lunas dihitung dari tanggal patokan hingga {refDate || '-'}.
        </p>

        <div className="mt-5 space-y-4">
          {agingBuckets.map((bucket) => {
            const pct = (bucket.value / maxAging) * 100;
            const barTone =
              bucket.key === '60+'
                ? 'bg-red-500'
                : bucket.key === '31-60'
                ? 'bg-amber-500'
                : 'bg-teal-600 dark:bg-teal-500';
            return (
              <div key={bucket.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {bucket.label}
                  </span>
                  <span className="font-mono text-slate-600 tabular-nums dark:text-slate-300">
                    <strong className="text-slate-900 dark:text-slate-100">
                      Rp{formatJuta(bucket.value)} jt
                    </strong>{' '}
                    · {formatInt(bucket.count)} SO
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barTone}`}
                    style={{ width: `${Math.max(bucket.value > 0 ? 3 : 0, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs font-mono tabular-nums dark:bg-slate-800/60">
          <span className="text-slate-600 dark:text-slate-300">
            To Invoice:{' '}
            <strong className="text-amber-600 dark:text-amber-400">
              Rp{formatJuta(toInvoiceVal)} jt
            </strong>
          </span>
          <span className="text-slate-600 dark:text-slate-300">
            Nothing to Invoice:{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              Rp{formatJuta(nothingToInvoiceVal)} jt
            </strong>
          </span>
        </div>
      </section>

      {/* Konsentrasi Customer */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Top 10 Kontribusi Customer
          </h2>
          <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            Top 5 = {top5Share.toFixed(1)}% · Top 10 = {top10Share.toFixed(1)}%
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Dari {formatInt(sortedCustomers.length)} customer aktif.
        </p>

        <div className="mt-4 space-y-2.5">
          {sortedCustomers.length === 0 ? (
            <p className="text-xs text-slate-500">Tidak ada data customer.</p>
          ) : (
            sortedCustomers.slice(0, 10).map((c, idx) => {
              const share = totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0;
              const widthPct = (c.revenue / maxCustRev) * 100;
              return (
                <div
                  key={c.customer}
                  className="rounded-xl px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-5 shrink-0 font-mono text-[11px] text-slate-400 tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="truncate font-medium text-slate-700 dark:text-slate-200">
                        {c.customer}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-slate-600 tabular-nums dark:text-slate-400">
                      {share.toFixed(1)}% · Rp{formatJuta(c.revenue)} jt
                    </span>
                  </div>
                  <div className="mt-1.5 ml-7 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-teal-600 dark:bg-teal-500"
                      style={{ width: `${Math.max(c.revenue > 0 ? 2 : 0, widthPct)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Rute Terbanyak */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Rute Pengiriman Terpadat
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          8 rute tersibuk berdasarkan jumlah Delivery Order unik.
        </p>

        <div className="mt-4 space-y-3">
          {topRoutes.length === 0 ? (
            <p className="text-xs text-slate-500">Tidak ada data rute.</p>
          ) : (
            topRoutes.map((r) => {
              const widthPct = (r.count / maxRouteCount) * 100;
              const [orig, dest] = r.route.split(' → ');
              return (
                <button
                  key={r.route}
                  type="button"
                  onClick={() => onSelectRoute?.(r.route)}
                  className="group w-full space-y-1.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className="flex min-w-0 items-center gap-1.5 truncate font-medium text-slate-700 group-hover:text-teal-700 dark:text-slate-200 dark:group-hover:text-teal-300"
                      title={`Lihat jalur ${r.route} di peta`}
                    >
                      <MapPin className="h-3 w-3 shrink-0 text-teal-600 opacity-75 transition-opacity group-hover:opacity-100 dark:text-teal-400" />
                      <span className="truncate">{orig || '?'}</span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                      <span className="truncate">{dest || '?'}</span>
                    </span>
                    <span className="shrink-0 font-mono text-slate-600 tabular-nums dark:text-slate-400">
                      <strong className="text-slate-900 dark:text-slate-100">
                        {formatInt(r.count)}
                      </strong>{' '}
                      DO
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
    </div>
  );
};
