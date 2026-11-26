import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import type { SalesOrderRecord } from '../types/logistics';
import { formatInt, formatMarginPct, formatMiliar, getSoBillingStatus } from '../utils/formatters';

interface CustomerDetailModalProps {
  customer: string | null;
  orders: SalesOrderRecord[];
  onClose: () => void;
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  customer,
  orders,
  onClose,
}) => {
  const [searchSo, setSearchSo] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Billed' | 'Unbilled' | 'Campuran'>('all');
  const [expandedRefs, setExpandedRefs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSearchSo('');
    setStatusFilter('all');
    setExpandedRefs({});
  }, [customer]);

  useEffect(() => {
    if (!customer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [customer, onClose]);

  const customerOrders = useMemo(() => {
    if (!customer) return [];
    return orders
      .filter((s) => s.customer === customer)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.ref < b.ref ? 1 : -1));
  }, [customer, orders]);

  const filteredOrders = useMemo(() => {
    const q = searchSo.trim().toLowerCase();
    return customerOrders.filter((s) => {
      const status = getSoBillingStatus(s.lines);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (
        q &&
        !s.ref.toLowerCase().includes(q) &&
        !s.lines.some(
          (l) =>
            l[0].toLowerCase().includes(q) ||
            (l[8] || '').toLowerCase().includes(q) ||
            (l[9] || '').toLowerCase().includes(q)
        )
      ) {
        return false;
      }
      return true;
    });
  }, [customerOrders, searchSo, statusFilter]);

  if (!customer) return null;

  const totalRev = customerOrders.reduce((acc, s) => acc + s.rev, 0);
  const totalBop = customerOrders.reduce((acc, s) => acc + s.bop, 0);

  const toggleExpand = (key: string) => {
    setExpandedRefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-xs sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-customer-title"
    >
      <div className="w-full max-w-5xl rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h2
              id="modal-customer-title"
              className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100"
            >
              {customer}
            </h2>
            <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
              {formatInt(customerOrders.length)} SO · Revenue {formatMiliar(totalRev)} · BOP{' '}
              {formatMiliar(totalBop)} · Margin {formatMarginPct(totalRev, totalBop)} · Nilai penuh dalam Rupiah
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup rincian"
            className="rounded-xl border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchSo}
              onChange={(e) => setSearchSo(e.target.value)}
              placeholder="Cari SO, DO, atau nopol..."
              className="h-9 w-64 rounded-xl bg-slate-100/90 pr-3 pl-9 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800 dark:focus:ring-teal-500/30"
            />
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-slate-800">
            {(['all', 'Billed', 'Unbilled', 'Campuran'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-lg px-3 py-1 font-medium transition-all ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                {st === 'all' ? 'Semua' : st}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 max-h-[60vh] overflow-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
          <table className="w-full border-collapse text-xs whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="px-3 py-3 text-left font-semibold">No SO</th>
                <th className="px-3 py-3 text-left font-semibold">Tanggal</th>
                <th className="px-3 py-3 text-right font-semibold">DO</th>
                <th className="px-3 py-3 text-right font-semibold">Revenue</th>
                <th className="px-3 py-3 text-right font-semibold">BOP</th>
                <th className="px-3 py-3 text-right font-semibold">Margin</th>
                <th className="px-3 py-3 text-right font-semibold">Margin %</th>
                <th className="px-3 py-3 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    Tidak ada SO yang sesuai filter.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((s) => {
                  const rowKey = `${s.src}-${s.ref}`;
                  const isOpen = !!expandedRefs[rowKey];
                  const margin = s.rev - s.bop;
                  const status = getSoBillingStatus(s.lines);
                  return (
                    <React.Fragment key={rowKey}>
                      <tr
                        onClick={() => toggleExpand(rowKey)}
                        className="cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-3 py-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                          <span className="inline-flex items-center gap-1.5">
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 text-teal-600" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                            )}
                            <span className="select-text" onClick={(e) => e.stopPropagation()}>
                              {s.ref}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-500 tabular-nums dark:text-slate-400">
                          {s.date}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {formatInt(s.uniqueDoCount)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {formatInt(s.rev)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {formatInt(s.bop)}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-mono tabular-nums ${
                            margin < 0 ? 'font-semibold text-red-600 dark:text-red-400' : ''
                          }`}
                        >
                          {formatInt(margin)}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-mono tabular-nums ${
                            margin < 0 ? 'font-semibold text-red-600 dark:text-red-400' : ''
                          }`}
                        >
                          {formatMarginPct(s.rev, s.bop)}
                        </td>
                        <td
                          className={`px-3 py-3 font-medium ${
                            status === 'Billed'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : status === 'Unbilled'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-sky-700 dark:text-sky-400'
                          }`}
                        >
                          {status}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50/90 dark:bg-slate-800/50">
                          <td colSpan={8} className="p-3.5">
                            {(() => {
                              const hasLineNopol = s.lines.some((l) => Boolean(l[9] || l[8]));
                              return (
                                <table className="w-full border-collapse text-[11px]">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                      <th className="py-2 pr-3 text-left font-semibold">DO</th>
                                      <th className="px-2 py-2 text-left font-semibold">Kategori</th>
                                      {hasLineNopol && (
                                        <th className="px-2 py-2 text-left font-semibold">Nopol</th>
                                      )}
                                      <th className="px-2 py-2 text-left font-semibold">Rute</th>
                                      <th className="px-2 py-2 text-right font-semibold">Revenue</th>
                                      <th className="px-2 py-2 text-right font-semibold">BOP</th>
                                      <th className="px-2 py-2 text-right font-semibold">Margin</th>
                                      <th className="pl-2 py-2 text-left font-semibold">
                                        Status Invoice
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                                    {s.lines.map((l, idx) => (
                                      <tr key={`${l[0]}-${idx}`}>
                                        <td className="py-2 pr-3 font-mono text-slate-800 dark:text-slate-200">
                                          {l[0]}
                                        </td>
                                        <td className="px-2 py-2 text-slate-600 dark:text-slate-300">
                                          {l[1]}
                                        </td>
                                        {hasLineNopol && (
                                          <td
                                            className="px-2 py-2 font-mono text-slate-700 dark:text-slate-200"
                                            title={l[8] || undefined}
                                          >
                                            {l[9] || l[8] || '-'}
                                          </td>
                                        )}
                                        <td className="px-2 py-2 text-slate-700 dark:text-slate-300">
                                          {l[2]} → {l[3]}
                                        </td>
                                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                                          {formatInt(l[4])}
                                        </td>
                                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                                          {formatInt(l[5])}
                                        </td>
                                        <td
                                          className={`px-2 py-2 text-right font-mono tabular-nums ${
                                            l[4] - l[5] < 0 ? 'text-red-600 dark:text-red-400' : ''
                                          }`}
                                        >
                                          {formatInt(l[4] - l[5])}
                                        </td>
                                        <td className="pl-2 py-2 text-slate-600 dark:text-slate-300">
                                          {l[6]}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              );
                            })()}
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
      </div>
    </div>
  );
};
