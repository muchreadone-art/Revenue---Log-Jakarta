import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, MapPin, Search } from 'lucide-react';
import type {
  CustomerSummaryRow,
  ModaSummaryMetric,
  MonthlyModaMetric,
  RouteCorridorRow,
  SalesOrderRecord,
} from '../types/logistics';
import {
  downloadCsv,
  formatInt,
  formatJuta,
  formatMarginPct,
  formatMiliar,
} from '../utils/formatters';
import { computeRouteNetworkSummary } from '../utils/logisticsEngine';
import { CustomerTableView } from './CustomerTableView';
import { DeliveryRouteMap } from './DeliveryRouteMap';
import { ModaPerformanceChart } from './ModaPerformanceChart';

export type MarketingSubTab = 'moda' | 'customers' | 'routes';

interface MarketingViewProps {
  orders: SalesOrderRecord[];
  modaSummary: ModaSummaryMetric[];
  monthlyModaMetrics: MonthlyModaMetric[];
  customerSummary: CustomerSummaryRow[];
  selectedMonth: string[];
  onSelectMonth: (months: string[]) => void;
  onSelectCustomer: (customer: string) => void;
  darkMode: boolean;
  mapsApiKey: string;
  mapsConfigLoading: boolean;
  selectedMapRoute: string | null;
  onSelectMapRoute: (route: string | null) => void;
  initialSubTab?: MarketingSubTab;
  routeJumpTrigger?: number;
}

type RouteSortCol = 'doCount' | 'soCount' | 'revenue' | 'bop' | 'margin' | 'route';

export const MarketingView: React.FC<MarketingViewProps> = ({
  orders,
  modaSummary,
  monthlyModaMetrics,
  customerSummary,
  selectedMonth,
  onSelectMonth,
  onSelectCustomer,
  darkMode,
  mapsApiKey,
  mapsConfigLoading,
  selectedMapRoute,
  onSelectMapRoute,
  initialSubTab = 'moda',
  routeJumpTrigger = 0,
}) => {
  const [subTab, setSubTab] = useState<MarketingSubTab>(initialSubTab);
  const [routeQuery, setRouteQuery] = useState('');
  const [routeModaFilter, setRouteModaFilter] = useState<string>('all');
  const [routeSortCol, setRouteSortCol] = useState<RouteSortCol>('doCount');
  const [routeSortAsc, setRouteSortAsc] = useState(false);

  useEffect(() => {
    if (routeJumpTrigger > 0) {
      setSubTab('routes');
    }
  }, [routeJumpTrigger]);

  const routes = useMemo(() => computeRouteNetworkSummary(orders), [orders]);

  const totalRevenue = useMemo(
    () => customerSummary.reduce((acc, c) => acc + c.revenue, 0),
    [customerSummary]
  );

  const totalUnitQty = useMemo(
    () => orders.reduce((acc, o) => acc + (o.totalUnitQty || 0), 0),
    [orders]
  );

  const topModa = useMemo(
    () =>
      [...modaSummary].sort((a, b) => b.revenue - a.revenue || b.doCount - a.doCount)[0] ?? null,
    [modaSummary]
  );

  const top5Share = useMemo(() => {
    if (totalRevenue <= 0) return 0;
    const top5 = [...customerSummary]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .reduce((acc, c) => acc + c.revenue, 0);
    return (top5 / totalRevenue) * 100;
  }, [customerSummary, totalRevenue]);

  const filteredRoutes = useMemo(() => {
    const q = routeQuery.trim().toLowerCase();
    const list = routes.filter((r: RouteCorridorRow) => {
      if (routeModaFilter !== 'all' && r.primaryModa !== routeModaFilter) return false;
      if (q && !r.route.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (routeSortCol === 'route') {
        return a.route.localeCompare(b.route) * (routeSortAsc ? 1 : -1);
      }
      return (a[routeSortCol] - b[routeSortCol]) * (routeSortAsc ? 1 : -1);
    });
  }, [routes, routeQuery, routeModaFilter, routeSortCol, routeSortAsc]);

  const handleSortRoute = (col: RouteSortCol) => {
    if (col === routeSortCol) setRouteSortAsc(!routeSortAsc);
    else {
      setRouteSortCol(col);
      setRouteSortAsc(col === 'route');
    }
  };

  const handleExportRoutes = () => {
    downloadCsv(
      `performa-rute-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Rute', 'Moda Dominan', 'DO Unik', 'SO', 'Revenue (Rp)', 'BOP (Rp)', 'Margin (Rp)', 'Margin %'],
      filteredRoutes.map((r) => [
        r.route,
        r.primaryModa,
        r.doCount,
        r.soCount,
        r.revenue,
        r.bop,
        r.margin,
        r.revenue > 0 ? `${((r.margin / r.revenue) * 100).toFixed(1)}%` : '-',
      ])
    );
  };

  const avgRevPerSo = orders.length > 0 ? totalRevenue / orders.length : 0;
  const topModaShare =
    totalRevenue > 0 && topModa ? (topModa.revenue / totalRevenue) * 100 : 0;

  return (
    <div className="space-y-5">
      {/* 4-Column Marketing KPI Strip */}
      <section aria-label="Ringkasan Komersial & Marketing" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Customer Aktif
          </span>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
            {formatInt(customerSummary.length)}
          </p>
          <p className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            Top 5 menyumbang {top5Share.toFixed(1)}% revenue
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Moda Revenue Tertinggi
          </span>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
            {topModa?.moda || '-'}
          </p>
          <p className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            {topModa ? `${formatMiliar(topModa.revenue)} · ${topModaShare.toFixed(1)}% porsi` : '-'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Koridor Rute Aktif
          </span>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
            {formatInt(routes.length)}
          </p>
          <p className="mt-2 truncate font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            Terpadat: {routes[0]?.route || '-'} ({formatInt(routes[0]?.doCount || 0)} DO)
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Rata-rata Nilai / SO
          </span>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
            Rp{formatJuta(avgRevPerSo)} <span className="text-sm font-semibold text-slate-400">jt</span>
          </p>
          <p className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            Dari {formatInt(orders.length)} SO ·{' '}
            <span className="font-semibold text-teal-700 dark:text-teal-400">
              {formatInt(totalUnitQty)} Unit (Trip)
            </span>
          </p>
        </div>
      </section>

      {/* Clean Sub-Tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-xl border border-slate-200/80 bg-white p-1 dark:border-slate-800 dark:bg-slate-900"
          role="tablist"
          aria-label="Sub-bagian Marketing"
        >
          {(
            [
              { id: 'moda', label: 'Performa Moda' },
              { id: 'customers', label: `Performa Customer (${formatInt(customerSummary.length)})` },
              { id: 'routes', label: `Rute & Peta Jalur (${formatInt(routes.length)})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={subTab === t.id}
              onClick={() => setSubTab(t.id)}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                subTab === t.id
                  ? 'bg-teal-700 text-white dark:bg-teal-600'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {subTab === 'routes' && selectedMapRoute && (
          <button
            type="button"
            onClick={() => onSelectMapRoute(null)}
            className="text-xs font-medium text-teal-700 underline underline-offset-4 hover:text-teal-800 dark:text-teal-400"
          >
            Tampilkan Overview Semua Rute
          </button>
        )}
      </div>

      {/* Active Sub-View */}
      {subTab === 'moda' && (
        <ModaPerformanceChart
          summary={modaSummary}
          monthlyData={monthlyModaMetrics}
          selectedMonth={selectedMonth}
          onSelectMonth={onSelectMonth}
        />
      )}

      {subTab === 'customers' && (
        <CustomerTableView rows={customerSummary} onSelectCustomer={onSelectCustomer} />
      )}

      {subTab === 'routes' && (
        <div className="space-y-5">
          {/* Interactive Google Maps Corridor Explorer */}
          <DeliveryRouteMap
            orders={orders}
            darkMode={darkMode}
            mapsApiKey={mapsApiKey}
            mapsConfigLoading={mapsConfigLoading}
            selectedRouteKey={selectedMapRoute}
            onSelectRouteKey={onSelectMapRoute}
          />

          {/* Interactive Route Performance Table */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  Performa Koridor Rute
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Klik rute mana saja untuk langsung menampilkan jalur titik-ke-titik di peta atas.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  value={routeModaFilter}
                  onChange={(e) => setRouteModaFilter(e.target.value)}
                  aria-label="Filter moda rute"
                  className="h-9 rounded-xl bg-slate-100/90 px-3 text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="all">Semua Moda</option>
                  <option value="Transporter">Transporter</option>
                  <option value="Car Carrier">Car Carrier</option>
                  <option value="Self Drive">Self Drive</option>
                  <option value="Shipment">Shipment</option>
                </select>

                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={routeQuery}
                    onChange={(e) => setRouteQuery(e.target.value)}
                    placeholder="Cari kota asal/tujuan..."
                    className="h-9 w-52 rounded-xl bg-slate-100/90 pr-3 pl-9 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleExportRoutes}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 whitespace-nowrap transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  Ekspor CSV
                </button>
              </div>
            </div>

            <div className="mt-4 max-h-[460px] overflow-auto">
              <table className="w-full border-collapse text-xs whitespace-nowrap">
                <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900">
                  <tr className="border-b border-slate-200/80 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    {(
                      [
                        { key: 'route', label: 'Koridor Rute', align: 'left' },
                        { key: null, label: 'Moda Dominan', align: 'left' },
                        { key: 'doCount', label: 'DO Unik', align: 'right' },
                        { key: 'soCount', label: 'SO', align: 'right' },
                        { key: 'revenue', label: 'Revenue (jt)', align: 'right' },
                        { key: 'bop', label: 'BOP (jt)', align: 'right' },
                        { key: 'margin', label: 'Margin (jt)', align: 'right' },
                        { key: null, label: 'Margin %', align: 'right' },
                      ] as const
                    ).map((col, idx) => (
                      <th
                        key={idx}
                        onClick={() => col.key && handleSortRoute(col.key)}
                        className={`py-3 font-semibold ${
                          col.align === 'left' ? 'pr-4 text-left' : 'px-3 text-right'
                        } ${col.key ? 'cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-200' : ''}`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {col.key &&
                            routeSortCol === col.key &&
                            (routeSortAsc ? (
                              <ArrowUp className="h-3 w-3 text-teal-600" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-teal-600" />
                            ))}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredRoutes.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-500">
                        Tidak ada rute yang cocok dengan pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredRoutes.slice(0, 60).map((r) => {
                      const isSelected = selectedMapRoute === r.route;
                      const isNeg = r.margin < 0;
                      return (
                        <tr
                          key={r.route}
                          onClick={() => {
                            onSelectMapRoute(r.route);
                            window.scrollTo({ top: 180, behavior: 'smooth' });
                          }}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-teal-50/80 dark:bg-teal-950/40'
                              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3 pr-4 font-medium text-slate-800 dark:text-slate-200">
                            <span className="inline-flex items-center gap-2">
                              <MapPin
                                className={`h-3.5 w-3.5 shrink-0 ${
                                  isSelected ? 'text-teal-600' : 'text-slate-400'
                                }`}
                              />
                              <span>{r.route}</span>
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                            {r.primaryModa}
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums">
                            {formatInt(r.doCount)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                            {formatInt(r.soCount)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums">
                            {formatJuta(r.revenue)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                            {formatJuta(r.bop)}
                          </td>
                          <td
                            className={`px-3 py-3 text-right font-mono font-medium tabular-nums ${
                              isNeg
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {formatJuta(r.margin)}
                          </td>
                          <td
                            className={`pl-3 py-3 text-right font-mono tabular-nums ${
                              isNeg ? 'font-semibold text-red-600 dark:text-red-400' : ''
                            }`}
                          >
                            {formatMarginPct(r.revenue, r.bop)}
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
      )}
    </div>
  );
};
