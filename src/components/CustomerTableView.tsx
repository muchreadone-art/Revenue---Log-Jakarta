import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Search } from 'lucide-react';
import type { CustomerSummaryRow } from '../types/logistics';
import { downloadCsv, formatInt, formatJuta } from '../utils/formatters';

interface CustomerTableViewProps {
  rows: CustomerSummaryRow[];
  onSelectCustomer: (customer: string) => void;
}

type SortColumn = keyof CustomerSummaryRow;
type CustomerSegment = 'all' | 'unbilled' | 'negative-margin';

export const CustomerTableView: React.FC<CustomerTableViewProps> = ({
  rows,
  onSelectCustomer,
}) => {
  const [sortCol, setSortCol] = useState<SortColumn>('revenue');
  const [sortAsc, setSortAsc] = useState(false);
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState<CustomerSegment>('all');

  const filteredAndSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (q && !r.customer.toLowerCase().includes(q)) return false;
      if (segment === 'unbilled' && r.unbilledRp <= 0) return false;
      if (segment === 'negative-margin' && r.margin >= 0) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb) * (sortAsc ? 1 : -1);
      }
      const na = va === null ? -1e12 : Number(va);
      const nb = vb === null ? -1e12 : Number(vb);
      return (na - nb) * (sortAsc ? 1 : -1);
    });
  }, [rows, query, segment, sortCol, sortAsc]);

  const totals = useMemo(() => {
    const sum = filteredAndSorted.reduce(
      (acc, r) => ({
        soCount: acc.soCount + r.soCount,
        unitQty: acc.unitQty + (r.unitQty || 0),
        revenue: acc.revenue + r.revenue,
        bop: acc.bop + r.bop,
        margin: acc.margin + r.margin,
        billedRp: acc.billedRp + r.billedRp,
        billedSoCount: acc.billedSoCount + r.billedSoCount,
        unbilledRp: acc.unbilledRp + r.unbilledRp,
        unbilledSoCount: acc.unbilledSoCount + r.unbilledSoCount,
      }),
      {
        soCount: 0,
        unitQty: 0,
        revenue: 0,
        bop: 0,
        margin: 0,
        billedRp: 0,
        billedSoCount: 0,
        unbilledRp: 0,
        unbilledSoCount: 0,
      }
    );
    const marginPct = sum.revenue > 0 ? (sum.margin / sum.revenue) * 100 : null;
    return { ...sum, marginPct };
  }, [filteredAndSorted]);

  const handleSort = (col: SortColumn) => {
    if (col === sortCol) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(col === 'customer');
    }
  };

  const handleExport = () => {
    downloadCsv(
      `performa-customer-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Customer',
        'SO',
        'Unit (Trip)',
        'Revenue (Rp)',
        'BOP (Rp)',
        'Margin (Rp)',
        'Margin %',
        'Billed (Rp)',
        'Billed (SO)',
        'Unbilled (Rp)',
        'Unbilled (SO)',
      ],
      filteredAndSorted.map((r) => [
        r.customer,
        r.soCount,
        r.unitQty || 0,
        r.revenue,
        r.bop,
        r.margin,
        r.marginPct !== null ? `${r.marginPct.toFixed(1)}%` : '-',
        r.billedRp,
        r.billedSoCount,
        r.unbilledRp,
        r.unbilledSoCount,
      ])
    );
  };

  const columns: Array<{ key: SortColumn; label: string }> = [
    { key: 'customer', label: 'Customer' },
    { key: 'soCount', label: 'SO' },
    { key: 'unitQty', label: 'Unit (Trip)' },
    { key: 'revenue', label: 'Revenue (jt)' },
    { key: 'bop', label: 'BOP (jt)' },
    { key: 'margin', label: 'Margin (jt)' },
    { key: 'marginPct', label: 'Margin %' },
    { key: 'billedRp', label: 'Billed (jt)' },
    { key: 'billedSoCount', label: 'Billed (SO)' },
    { key: 'unbilledRp', label: 'Unbilled (jt)' },
    { key: 'unbilledSoCount', label: 'Unbilled (SO)' },
  ];

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Performa per Customer (Rp Juta)
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Klik judul kolom untuk mengurutkan. Klik nama customer untuk menelusuri detail SO dan baris DO.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-slate-800">
            {(
              [
                { id: 'all', label: 'Semua' },
                { id: 'unbilled', label: 'Ada Unbilled' },
                { id: 'negative-margin', label: 'Margin Negatif' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSegment(opt.id)}
                className={`rounded-lg px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                  segment === opt.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama customer..."
              className="h-9 w-52 rounded-xl bg-slate-100/90 pr-3 pl-9 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800"
            />
          </div>

          <button
            type="button"
            onClick={handleExport}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 whitespace-nowrap transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            Ekspor CSV
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-xs whitespace-nowrap">
          <thead>
            <tr className="border-b border-slate-200/80 text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {columns.map((col, idx) => {
                const isSorted = sortCol === col.key;
                return (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`cursor-pointer select-none py-3 font-semibold transition-colors hover:text-slate-900 dark:hover:text-slate-200 ${
                      idx === 0
                        ? 'sticky left-0 bg-white pr-4 text-left dark:bg-slate-900'
                        : 'px-3 text-right'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {isSorted &&
                        (sortAsc ? (
                          <ArrowUp className="h-3 w-3 text-teal-600" />
                        ) : (
                          <ArrowDown className="h-3 w-3 text-teal-600" />
                        ))}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-10 text-center text-slate-500">
                  Tidak ada customer yang cocok dengan filter atau pencarian.
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((r) => {
                const isNeg = r.margin < 0;
                return (
                  <tr
                    key={r.customer}
                    className="group transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="sticky left-0 bg-white py-3 pr-4 text-left transition-colors group-hover:bg-slate-50/80 dark:bg-slate-900 dark:group-hover:bg-slate-800/40">
                      <button
                        type="button"
                        onClick={() => onSelectCustomer(r.customer)}
                        className="font-medium text-teal-700 underline decoration-teal-700/30 underline-offset-4 hover:text-teal-800 dark:text-teal-400"
                      >
                        {r.customer}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatInt(r.soCount)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-teal-700 tabular-nums dark:text-teal-400">
                      {formatInt(r.unitQty || 0)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatJuta(r.revenue)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatJuta(r.bop)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-mono font-medium tabular-nums ${
                        isNeg ? 'text-red-600 dark:text-red-400' : ''
                      }`}
                    >
                      {formatJuta(r.margin)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-mono tabular-nums ${
                        isNeg ? 'font-semibold text-red-600 dark:text-red-400' : ''
                      }`}
                    >
                      {r.marginPct !== null ? `${r.marginPct.toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-700 tabular-nums dark:text-emerald-400">
                      {formatJuta(r.billedRp)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatInt(r.billedSoCount)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-amber-600 tabular-nums dark:text-amber-400">
                      {formatJuta(r.unbilledRp)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatInt(r.unbilledSoCount)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {filteredAndSorted.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/90 font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100">
                <td className="sticky left-0 bg-slate-50/90 py-3 pr-4 text-left dark:bg-slate-800/60">
                  Total ({formatInt(filteredAndSorted.length)} customer)
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {formatInt(totals.soCount)}
                </td>
                <td className="px-3 py-3 text-right font-mono font-bold text-teal-700 tabular-nums dark:text-teal-400">
                  {formatInt(totals.unitQty)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {formatJuta(totals.revenue)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {formatJuta(totals.bop)}
                </td>
                <td
                  className={`px-3 py-3 text-right font-mono tabular-nums ${
                    totals.margin < 0 ? 'text-red-600 dark:text-red-400' : ''
                  }`}
                >
                  {formatJuta(totals.margin)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {totals.marginPct !== null ? `${totals.marginPct.toFixed(1)}%` : '-'}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {formatJuta(totals.billedRp)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {formatInt(totals.billedSoCount)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {formatJuta(totals.unbilledRp)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {formatInt(totals.unbilledSoCount)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
};
