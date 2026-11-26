import React, { useMemo, useState } from 'react';
import type { CategorySummaryRow, SalesOrderRecord } from '../types/logistics';
import { calcAgeDays, formatInt, formatJuta, formatMarginPct } from '../utils/formatters';
import { INVOICED_STATUS } from '../utils/logisticsEngine';

interface BillingMarginViewProps {
  orders: SalesOrderRecord[];
  refDate: string;
  categorySummary: CategorySummaryRow[];
  onSelectCustomer: (customer: string) => void;
}

export const BillingMarginView: React.FC<BillingMarginViewProps> = ({
  orders,
  refDate,
  categorySummary,
  onSelectCustomer,
}) => {
  const [marginTab, setMarginTab] = useState<'negative' | 'low'>('negative');

  const topUnbilled = useMemo(
    () =>
      orders
        .filter((s) => s.unbilledVal > 0)
        .sort((a, b) => b.unbilledVal - a.unbilledVal)
        .slice(0, 10),
    [orders]
  );

  const negativeMarginSOs = useMemo(
    () =>
      orders
        .filter((s) => s.rev - s.bop < 0)
        .sort((a, b) => a.rev - a.bop - (b.rev - b.bop)),
    [orders]
  );

  const lowMarginSOs = useMemo(
    () =>
      orders
        .filter((s) => s.rev > 0 && s.rev - s.bop >= 0 && (s.rev - s.bop) / s.rev < 0.1)
        .sort((a, b) => {
          const pctA = a.rev > 0 ? (a.rev - a.bop) / a.rev : 0;
          const pctB = b.rev > 0 ? (b.rev - b.bop) / b.rev : 0;
          return pctA - pctB;
        }),
    [orders]
  );

  const negativeDiffSum = useMemo(
    () => negativeMarginSOs.reduce((acc, s) => acc + (s.rev - s.bop), 0),
    [negativeMarginSOs]
  );

  const displayedMarginSOs = (marginTab === 'negative' ? negativeMarginSOs : lowMarginSOs).slice(
    0,
    15
  );

  const maxCatRev = Math.max(1, ...categorySummary.map((c) => c.revenue));

  return (
    <div className="space-y-5">
      {/* Margin per Kategori */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Margin per Kategori (Level SO)
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Kategori SO ditentukan dari baris berharga terbesar sehingga BOP baris shipment ikut terhitung ke SO induknya (Rp juta).
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-xs whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-200/80 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-3 pr-4 text-left font-semibold">Kategori</th>
                <th className="px-3 py-3 text-right font-semibold">SO</th>
                <th className="px-3 py-3 text-right font-semibold">Revenue (jt)</th>
                <th className="px-3 py-3 text-right font-semibold">BOP (jt)</th>
                <th className="px-3 py-3 text-right font-semibold">Margin (jt)</th>
                <th className="px-3 py-3 text-right font-semibold">Margin %</th>
                <th className="w-44 pl-4 py-3 text-left font-semibold">Porsi Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {categorySummary.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Tidak ada data kategori.
                  </td>
                </tr>
              ) : (
                categorySummary.map((cat) => {
                  const isNeg = cat.margin < 0;
                  const widthPct = (cat.revenue / maxCatRev) * 100;
                  return (
                    <tr
                      key={cat.category}
                      className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 pr-4 font-medium text-slate-800 dark:text-slate-200">
                        {cat.category}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        {formatInt(cat.soCount)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        {formatJuta(cat.revenue)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        {formatJuta(cat.bop)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono font-medium tabular-nums ${
                          isNeg
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {formatJuta(cat.margin)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono tabular-nums ${
                          isNeg ? 'font-semibold text-red-600 dark:text-red-400' : ''
                        }`}
                      >
                        {cat.marginPct !== null ? `${cat.marginPct.toFixed(1)}%` : '-'}
                      </td>
                      <td className="pl-4 py-3">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-teal-600 dark:bg-teal-500"
                            style={{ width: `${Math.max(cat.revenue > 0 ? 3 : 0, widthPct)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top 10 Unbilled */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          SO Unbilled Terbesar (Top 10)
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          10 Sales Order dengan nilai belum ditagih terbesar (baris selain Fully Invoiced). Nilai dalam Rp juta.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-xs whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-200/80 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-3 pr-3 text-left font-semibold">No SO</th>
                <th className="px-3 py-3 text-left font-semibold">Sumber</th>
                <th className="px-3 py-3 text-left font-semibold">Customer</th>
                <th className="px-3 py-3 text-left font-semibold">Tanggal</th>
                <th className="px-3 py-3 text-right font-semibold">Umur (hari)</th>
                <th className="px-3 py-3 text-right font-semibold">Unbilled (jt)</th>
                <th className="pl-3 py-3 text-left font-semibold">Status Baris</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {topUnbilled.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Tidak ada SO unbilled pada filter saat ini.
                  </td>
                </tr>
              ) : (
                topUnbilled.map((s) => {
                  const statuses = Array.from(
                    new Set(s.lines.filter((l) => l[6] !== INVOICED_STATUS).map((l) => l[6] || '-'))
                  ).join(' + ');
                  const age = calcAgeDays(refDate, s.date);
                  return (
                    <tr
                      key={`${s.src}-${s.ref}`}
                      className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 pr-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                        {s.ref}
                      </td>
                      <td className="px-3 py-3 font-mono text-slate-500 dark:text-slate-400">
                        {s.src}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onSelectCustomer(s.customer)}
                          className="font-medium text-teal-700 underline decoration-teal-700/30 underline-offset-4 hover:text-teal-800 dark:text-teal-400"
                        >
                          {s.customer}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-mono text-slate-500 tabular-nums dark:text-slate-400">
                        {s.date}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono tabular-nums ${
                          age > 60 ? 'font-semibold text-red-600 dark:text-red-400' : ''
                        }`}
                      >
                        {formatInt(age)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold text-amber-600 tabular-nums dark:text-amber-400">
                        {formatJuta(s.unbilledVal)}
                      </td>
                      <td className="pl-3 py-3 text-slate-600 dark:text-slate-300">{statuses}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Margin Watch */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Pemantauan SO Margin Negatif & Rendah
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {formatInt(negativeMarginSOs.length)} SO bermargin negatif (selisih Rp
              {formatJuta(negativeDiffSum)} jt) dan {formatInt(lowMarginSOs.length)} SO bermargin
              0–10%. Menampilkan maksimal 15 SO teratas (Rp juta).
            </p>
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMarginTab('negative')}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                marginTab === 'negative'
                  ? 'bg-white text-red-600 shadow-xs dark:bg-slate-900 dark:text-red-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              Negatif ({formatInt(negativeMarginSOs.length)})
            </button>
            <button
              type="button"
              onClick={() => setMarginTab('low')}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                marginTab === 'low'
                  ? 'bg-white text-amber-600 shadow-xs dark:bg-slate-900 dark:text-amber-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              Rendah 0–10% ({formatInt(lowMarginSOs.length)})
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-xs whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-200/80 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-3 pr-3 text-left font-semibold">No SO</th>
                <th className="px-3 py-3 text-left font-semibold">Sumber</th>
                <th className="px-3 py-3 text-left font-semibold">Customer</th>
                <th className="px-3 py-3 text-left font-semibold">Kategori</th>
                <th className="px-3 py-3 text-left font-semibold">Tanggal</th>
                <th className="px-3 py-3 text-right font-semibold">Revenue</th>
                <th className="px-3 py-3 text-right font-semibold">BOP</th>
                <th className="px-3 py-3 text-right font-semibold">Selisih</th>
                <th className="pl-3 py-3 text-right font-semibold">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {displayedMarginSOs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    Tidak ada SO pada kategori ini.
                  </td>
                </tr>
              ) : (
                displayedMarginSOs.map((s) => {
                  const diff = s.rev - s.bop;
                  const isNeg = diff < 0;
                  return (
                    <tr
                      key={`${s.src}-${s.ref}`}
                      className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 pr-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                        {s.ref}
                      </td>
                      <td className="px-3 py-3 font-mono text-slate-500 dark:text-slate-400">
                        {s.src}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onSelectCustomer(s.customer)}
                          className="font-medium text-teal-700 underline decoration-teal-700/30 underline-offset-4 hover:text-teal-800 dark:text-teal-400"
                        >
                          {s.customer}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{s.category}</td>
                      <td className="px-3 py-3 font-mono text-slate-500 tabular-nums dark:text-slate-400">
                        {s.date}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        {formatJuta(s.rev)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        {formatJuta(s.bop)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono font-semibold tabular-nums ${
                          isNeg
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {formatJuta(diff)}
                      </td>
                      <td
                        className={`pl-3 py-3 text-right font-mono tabular-nums ${
                          isNeg ? 'font-semibold text-red-600 dark:text-red-400' : ''
                        }`}
                      >
                        {formatMarginPct(s.rev, s.bop)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
