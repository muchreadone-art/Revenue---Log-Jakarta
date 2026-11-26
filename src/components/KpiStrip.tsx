import React from 'react';
import { formatInt, formatMarginPct, formatMiliar } from '../utils/formatters';

interface KpiStripProps {
  revenue: number;
  bop: number;
  soCount: number;
  doCount: number;
  billed: number;
  unbilled: number;
  totalBaselineSo: number;
}

export const KpiStrip: React.FC<KpiStripProps> = ({
  revenue,
  bop,
  soCount,
  doCount,
  billed,
  unbilled,
  totalBaselineSo,
}) => {
  const margin = revenue - bop;
  const marginPct = formatMarginPct(revenue, bop);
  const billedPct = revenue > 0 ? Math.min(100, (billed / revenue) * 100) : 0;
  const unbilledPct = revenue > 0 ? Math.min(100, (unbilled / revenue) * 100) : 0;
  const bopRatio = revenue > 0 ? Math.min(100, (bop / revenue) * 100) : 0;
  const marginRatioNum = revenue > 0 ? (margin / revenue) * 100 : 0;
  const isNegMargin = margin < 0;

  return (
    <section aria-label="Ringkasan Metrik Utama" className="space-y-3.5">
      {/* Baris Utama: 3 Kartu Finansial Utama */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Revenue Card */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Revenue (Total Price)
            </span>
            <span className="font-mono text-[11px] text-teal-700 tabular-nums dark:text-teal-400">
              {formatInt(soCount)} SO aktif
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums sm:text-[28px] dark:text-slate-50">
            {formatMiliar(revenue)}
          </p>
          <div className="mt-4 space-y-1.5">
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="bg-teal-600 transition-all duration-500 dark:bg-teal-500"
                style={{ width: `${billedPct}%` }}
              />
              <div
                className="bg-amber-400 transition-all duration-500 dark:bg-amber-500"
                style={{ width: `${unbilledPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              <span>{billedPct.toFixed(1)}% sudah ditagih</span>
              <span>{unbilledPct.toFixed(1)}% belum ditagih</span>
            </div>
          </div>
        </div>

        {/* BOP Card */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total BOP Operasional
            </span>
            <span className="font-mono text-[11px] text-amber-700 tabular-nums dark:text-amber-400">
              {revenue > 0 ? `${bopRatio.toFixed(1)}% dari rev` : '-'}
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums sm:text-[28px] dark:text-slate-50">
            {formatMiliar(bop)}
          </p>
          <div className="mt-4 space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-500 dark:bg-amber-400"
                style={{ width: `${bopRatio}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              <span>Rasio biaya operasional</span>
              <span>
                Rata-rata Rp{soCount > 0 ? (bop / soCount / 1e6).toFixed(1) : '0.0'} jt / SO
              </span>
            </div>
          </div>
        </div>

        {/* Margin Card */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Margin Kotor (Revenue - BOP)
            </span>
            <span
              className={`font-mono text-xs font-semibold tabular-nums ${
                isNegMargin
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {marginPct}
            </span>
          </div>
          <p
            className={`mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums sm:text-[28px] ${
              isNegMargin
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {margin < 0 ? '-' : ''}
            {formatMiliar(Math.abs(margin))}
          </p>
          <div className="mt-4 space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isNegMargin
                    ? 'bg-red-500'
                    : 'bg-emerald-600 dark:bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, Math.abs(marginRatioNum)))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              <span>Profitabilitas bersih armada</span>
              <span>
                Rata-rata Rp{soCount > 0 ? (margin / soCount / 1e6).toFixed(1) : '0.0'} jt / SO
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Baris Sekunder: 4 Metrik Operasional & Penagihan */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.02)] dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Sales Order</p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {formatInt(soCount)}
            </p>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              dari {formatInt(totalBaselineSo)} SO
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.02)] dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Delivery Order</p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {formatInt(doCount)}
            </p>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              {soCount > 0 ? (doCount / soCount).toFixed(2) : '0.00'} DO / SO
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.02)] dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Billed (Fully Invoiced)
          </p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="font-mono text-lg font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
              {formatMiliar(billed)}
            </p>
            <span className="font-mono text-[11px] text-emerald-700/80 tabular-nums dark:text-emerald-400/80">
              {billedPct.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.02)] dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Unbilled (Tertunda)
          </p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p
              className={`font-mono text-lg font-bold tabular-nums ${
                unbilled > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {formatMiliar(unbilled)}
            </p>
            <span className="font-mono text-[11px] text-amber-600/80 tabular-nums dark:text-amber-400/80">
              {unbilledPct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
