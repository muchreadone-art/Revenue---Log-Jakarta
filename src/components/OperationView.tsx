import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Download, MapPin, Search, Upload } from 'lucide-react';
import type {
  NopolRevenueRow,
  OperationAnalytics,
  UnitFrequencyTier,
  UnitUsageRow,
} from '../types/logistics';
import {
  downloadCsv,
  downloadExcelWorkbook,
  formatInt,
  formatJuta,
  formatMarginPct,
  formatMiliar,
  formatRupiahShort,
  toExcelDate,
} from '../utils/formatters';

interface OperationViewProps {
  analytics: OperationAnalytics;
  soCount: number;
  onSelectCustomer: (customer: string) => void;
  onSelectRoute: (route: string) => void;
  onOpenSources?: () => void;
}

type TierFilter = 'all' | 'frequent' | 'moderate' | 'rare';
type UnitMetric = 'doCount' | 'bop' | 'avgBopPerDo' | 'revenue';
type NopolMetric = 'revenue' | 'margin' | 'doCount' | 'bop';

const TIER_TEXT_TONE: Record<UnitFrequencyTier, string> = {
  'Sangat Sering': 'text-teal-700 dark:text-teal-400',
  Sering: 'text-sky-700 dark:text-sky-400',
  Sedang: 'text-slate-600 dark:text-slate-300',
  'Jarang Dipakai': 'text-amber-700 dark:text-amber-400',
};

const TIER_BAR_COLOR: Record<UnitFrequencyTier, string> = {
  'Sangat Sering': 'bg-teal-600 dark:bg-teal-500',
  Sering: 'bg-sky-600 dark:bg-sky-500',
  Sedang: 'bg-slate-500 dark:bg-slate-400',
  'Jarang Dipakai': 'bg-amber-500 dark:bg-amber-400',
};

const UNIT_PALETTE = ['#0D9488', '#0284C7', '#6366F1', '#D97706', '#64748B'];

export const OperationView: React.FC<OperationViewProps> = ({
  analytics,
  soCount,
  onSelectCustomer,
  onSelectRoute,
  onOpenSources,
}) => {
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [metric, setMetric] = useState<UnitMetric>('doCount');
  const [selectedUnitName, setSelectedUnitName] = useState<string>(
    () => analytics.units[0]?.unit || ''
  );
  const [nopolSearch, setNopolSearch] = useState('');
  const [nopolTypeFilter, setNopolTypeFilter] = useState<'all' | 'vendor' | 'asset'>('all');
  const [nopolMetric, setNopolMetric] = useState<NopolMetric>('revenue');
  const [selectedNopolPlate, setSelectedNopolPlate] = useState<string>(
    () => analytics.nopols[0]?.nopol || ''
  );
  const [hubMode, setHubMode] = useState<'origin' | 'destination'>('origin');
  const [hoveredMonthIdx, setHoveredMonthIdx] = useState<number | null>(null);

  const filteredUnits = useMemo(() => {
    return analytics.units.filter((u) => {
      if (tierFilter === 'frequent') {
        return u.tier === 'Sangat Sering' || u.tier === 'Sering';
      }
      if (tierFilter === 'moderate') {
        return u.tier === 'Sedang';
      }
      if (tierFilter === 'rare') {
        return u.tier === 'Jarang Dipakai';
      }
      return true;
    });
  }, [analytics.units, tierFilter]);

  useEffect(() => {
    if (
      filteredUnits.length > 0 &&
      !filteredUnits.some((u) => u.unit === selectedUnitName)
    ) {
      setSelectedUnitName(filteredUnits[0].unit);
    }
  }, [filteredUnits, selectedUnitName]);

  const selectedUnit: UnitUsageRow | null = useMemo(
    () =>
      analytics.units.find((u) => u.unit === selectedUnitName) ||
      filteredUnits[0] ||
      analytics.units[0] ||
      null,
    [analytics.units, filteredUnits, selectedUnitName]
  );

  const mostUsedUnit = analytics.units[0] ?? null;
  const rareUnits = analytics.units.filter((u) => u.tier === 'Jarang Dipakai');
  const leastUsedUnit =
    analytics.units.length > 0 ? analytics.units[analytics.units.length - 1] : null;

  const getMetricVal = (u: UnitUsageRow) => u[metric];

  const maxBarVal = Math.max(
    1,
    ...filteredUnits.map((u) => Math.max(0, getMetricVal(u)))
  );

  const formatMetricValue = (val: number) => {
    if (metric === 'doCount') return `${formatInt(val)} DO`;
    if (metric === 'avgBopPerDo') return formatRupiahShort(val);
    return `Rp${formatJuta(val)} jt`;
  };



  const filteredNopols = useMemo(() => {
    const q = nopolSearch.trim().toLowerCase();
    return analytics.nopols
      .filter((n) => {
        if (nopolTypeFilter === 'vendor' && n.nopolType !== 'Vendor') return false;
        if (nopolTypeFilter === 'asset' && n.nopolType !== 'Asset') return false;
        if (q) {
          const hitPlate = n.nopol.toLowerCase().includes(q);
          const hitVehicle = n.vehicle.toLowerCase().includes(q);
          const hitUnit = n.unitTypes.some((u) => u.toLowerCase().includes(q));
          if (!hitPlate && !hitVehicle && !hitUnit) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (nopolMetric === 'margin') return b.margin - a.margin || b.revenue - a.revenue;
        if (nopolMetric === 'doCount') return b.doCount - a.doCount || b.revenue - a.revenue;
        if (nopolMetric === 'bop') return b.bop - a.bop || b.revenue - a.revenue;
        return b.revenue - a.revenue || b.doCount - a.doCount;
      });
  }, [analytics.nopols, nopolSearch, nopolTypeFilter, nopolMetric]);

  useEffect(() => {
    if (
      filteredNopols.length > 0 &&
      !filteredNopols.some((n) => n.nopol === selectedNopolPlate)
    ) {
      setSelectedNopolPlate(filteredNopols[0].nopol);
    }
  }, [filteredNopols, selectedNopolPlate]);

  const selectedNopol: NopolRevenueRow | null = useMemo(
    () =>
      analytics.nopols.find((n) => n.nopol === selectedNopolPlate) ||
      filteredNopols[0] ||
      analytics.nopols[0] ||
      null,
    [analytics.nopols, filteredNopols, selectedNopolPlate]
  );

  const topNopol = analytics.nopols[0] ?? null;



  const handleExportNopolUtilizationCsv = () => {
    const dailyRows = filteredNopols
      .flatMap((n) =>
        n.dailyTrend.map((d) => ({
          isoDate: d.date,
          nopol: n.nopol,
          row: [
            toExcelDate(d.date),
            n.nopol,
            n.vehicle,
            n.nopolType,
            n.unitTypes.join(', '),
            d.doCount,
            d.soCount,
            d.customerCount,
            d.revenue,
            d.bop,
            d.margin,
            d.routes.join('; ') || '-',
            d.customers.join('; ') || '-',
          ],
        }))
      )
      .sort((a, b) => a.isoDate.localeCompare(b.isoDate) || a.nopol.localeCompare(b.nopol))
      .map((item) => item.row);

    const summaryRows = filteredNopols.map((n) => [
      n.nopol,
      n.vehicle,
      n.nopolType,
      n.minDate ? toExcelDate(n.minDate) : '',
      n.maxDate ? toExcelDate(n.maxDate) : '',
      n.unitTypes.join(', '),
      n.doCount,
      n.unitQty,
      `${n.sharePct.toFixed(1)}%`,
      n.soCount,
      n.customerCount,
      n.revenue,
      n.bop,
      n.margin,
      n.topRoute,
      n.topCustomers[0]?.customer || '-',
    ]);

    downloadExcelWorkbook(
      `utilisasi-nopol-armada-${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        {
          name: 'Utilisasi Harian',
          headers: [
            'Tanggal',
            'Nopol',
            'Kendaraan',
            'Tipe (Vendor/Asset)',
            'Jenis Unit DO',
            'Jumlah DO Unik',
            'Jumlah SO',
            'Jumlah Customer',
            'Revenue (Rp)',
            'BOP (Rp)',
            'Margin (Rp)',
            'Rute',
            'Customer',
          ],
          rows: dailyRows,
        },
        {
          name: 'Ringkasan Nopol',
          headers: [
            'Nopol',
            'Kendaraan',
            'Tipe (Vendor/Asset)',
            'Tanggal Mulai DO',
            'Tanggal Akhir DO',
            'Jenis Unit DO',
            'Total DO Unik (Utilisasi)',
            'Unit (Trip)',
            'Porsi Utilisasi (%)',
            'Jumlah SO',
            'Jumlah Customer',
            'Revenue (Rp)',
            'BOP (Rp)',
            'Margin (Rp)',
            'Rute Utama',
            'Customer Utama',
          ],
          rows: summaryRows,
        },
      ]
    );
  };

  const handleExportCsv = () => {
    downloadCsv(
      `pemakaian-unit-do-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Unit / Kategori',
        'Moda',
        'Klasifikasi Frekuensi',
        'DO Unik',
        'Porsi DO (%)',
        'SO',
        'Customer Aktif',
        'Total BOP (Rp)',
        'Rata-rata BOP/DO (Rp)',
        'Revenue (Rp)',
        'Rute Utama',
      ],
      filteredUnits.map((u) => [
        u.unit,
        u.moda,
        u.tier,
        u.doCount,
        `${u.sharePct.toFixed(1)}%`,
        u.soCount,
        u.customerCount,
        u.bop,
        Math.round(u.avgBopPerDo),
        u.revenue,
        u.topRoute,
      ])
    );
  };

  // Monthly comparison chart for top 5 units
  const top5Units = useMemo(() => analytics.units.slice(0, 5), [analytics.units]);
  const monthlyChart = useMemo(() => {
    const months = analytics.monthlyUnitMonths;
    const count = Math.max(months.length, 1);
    const W = Math.max(720, count * 116);
    const H = 260;
    const padL = 48;
    const padR = 16;
    const padT = 22;
    const padB = 30;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    let maxVal = 5;
    months.forEach((m, mIdx) => {
      top5Units.forEach((u) => {
        const pt = u.monthlyTrend[mIdx];
        if (pt && pt.doCount > maxVal) maxVal = pt.doCount;
      });
    });
    const yMax = Math.ceil(maxVal * 1.15);
    const yFor = (val: number) => padT + ((yMax - val) / Math.max(1, yMax)) * plotH;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const val = Math.round(yMax * t);
      return { val, y: yFor(val) };
    });
    return { W, H, padL, padR, padT, padB, plotW, plotH, yMax, yFor, ticks, months };
  }, [analytics.monthlyUnitMonths, top5Units]);

  const activeHubs = hubMode === 'origin' ? analytics.origins : analytics.destinations;
  const maxHubDo = Math.max(1, activeHubs[0]?.doCount ?? 1);
  const totalLegSos =
    analytics.legBreakdown.single +
      analytics.legBreakdown.double +
      analytics.legBreakdown.multi || 1;

  return (
    <div className="space-y-5">
      {/* 4-Column Operation KPI Strip */}
      <section aria-label="Ringkasan Operasional Unit DO" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total DO Unik
            </span>
            <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              {soCount > 0 ? (analytics.totalUniqueDo / soCount).toFixed(2) : '0.00'} DO / SO
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
            {formatInt(analytics.totalUniqueDo)}
          </p>
          <p className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            {formatInt(analytics.totalLines)} baris ·{' '}
            <span className="font-semibold text-teal-700 dark:text-teal-400">
              {formatInt(analytics.totalUnitQty)} Unit (Trip)
            </span>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Jenis Unit Aktif
          </span>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
            {formatInt(analytics.units.length)}{' '}
            <span className="text-sm font-semibold text-slate-400">unit</span>
          </p>
          <p className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            {formatInt(analytics.units.filter((u) => u.tier !== 'Jarang Dipakai').length)} rutin ·{' '}
            {formatInt(rareUnits.length)} jarang dipakai
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Unit Paling Sering Dipakai
          </span>
          <p className="mt-2 truncate text-xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
            {mostUsedUnit?.unit || '-'}
          </p>
          <p className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            {mostUsedUnit
              ? `${formatInt(mostUsedUnit.doCount)} DO · ${formatInt(mostUsedUnit.unitQty)} Unit (Trip)`
              : '-'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          {topNopol ? (
            <>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Top Revenue Nopol ({formatInt(analytics.nopols.length)} aktif)
              </span>
              <p className="mt-2 truncate font-mono text-xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
                {topNopol.nopol}
              </p>
              <p className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                {formatMiliar(topNopol.revenue)} · {formatInt(topNopol.doCount)} DO · {formatInt(topNopol.unitQty)} Unit (Trip)
              </p>
            </>
          ) : (
            <>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Unit Paling Jarang Dipakai
              </span>
              <p className="mt-2 truncate text-xl font-bold tracking-tight text-amber-700 dark:text-amber-400">
                {leastUsedUnit?.unit || '-'}
              </p>
              <p className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                {leastUsedUnit
                  ? `${formatInt(leastUsedUnit.doCount)} DO · ${leastUsedUnit.sharePct.toFixed(1)}% porsi`
                  : '-'}
              </p>
            </>
          )}
        </div>
      </section>

      {/* Revenue per Nopol Armada */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Revenue per Nopol Armada
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {analytics.nopols.length > 0 ? (
                <span className="font-mono tabular-nums">
                  {formatInt(analytics.nopols.length)} Nopol tercatat · Revenue{' '}
                  {formatMiliar(analytics.nopolRecordedRevenue)} (
                  {formatInt(analytics.nopolRecordedDoCount)} DO)
                  {(analytics.nopolUnassignedRevenue > 0 ||
                    analytics.nopolUnassignedDoCount > 0) && (
                    <>
                      {' '}
                      · Tanpa Nopol {formatMiliar(analytics.nopolUnassignedRevenue)} (
                      {formatInt(analytics.nopolUnassignedDoCount)} DO)
                    </>
                  )}
                </span>
              ) : (
                'Menampilkan kontribusi revenue, BOP, margin, dan rute tiap kendaraan berdasarkan kolom Fleet DOs/Vehicle & License Plate.'
              )}
            </p>
          </div>

          {analytics.nopols.length > 0 && (
            <button
              type="button"
              onClick={handleExportNopolUtilizationCsv}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white whitespace-nowrap transition-colors hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              <Download className="h-3.5 w-3.5" />
              Ekspor Utilisasi Unit (.xlsx)
            </button>
          )}
        </div>

        {analytics.nopols.length === 0 ? (
          <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center dark:border-slate-700 dark:bg-slate-800/40">
            <div className="space-y-1 text-xs">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Data Nopol belum tersedia pada dataset aktif
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Unggah file Excel Odoo yang memuat kolom{' '}
                <strong className="font-medium text-slate-700 dark:text-slate-300">
                  Fleet DOs/Vehicle
                </strong>{' '}
                dan{' '}
                <strong className="font-medium text-slate-700 dark:text-slate-300">
                  Fleet DOs/Vehicle/License Plate
                </strong>{' '}
                untuk menghitung revenue per nopol secara otomatis.
              </p>
            </div>
            {onOpenSources && (
              <button
                type="button"
                onClick={onOpenSources}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white whitespace-nowrap transition-colors hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
              >
                <Upload className="h-3.5 w-3.5" />
                Unggah Excel
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Left: Nopol Revenue Ranking Table */}
            <div className="lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={nopolSearch}
                      onChange={(e) => setNopolSearch(e.target.value)}
                      placeholder="Cari nopol atau vehicle..."
                      aria-label="Cari Nopol atau Kendaraan"
                      className="h-9 w-52 rounded-xl bg-slate-100/90 pr-3 pl-9 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-slate-800">
                    {(
                      [
                        { id: 'all', label: 'Semua' },
                        { id: 'vendor', label: 'Vendor' },
                        { id: 'asset', label: 'Asset' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setNopolTypeFilter(f.id)}
                        className={`rounded-lg px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                          nopolTypeFilter === f.id
                            ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-slate-800">
                  {(
                    [
                      { id: 'revenue', label: 'Revenue' },
                      { id: 'margin', label: 'Margin' },
                      { id: 'doCount', label: 'DO' },
                      { id: 'bop', label: 'BOP' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setNopolMetric(m.id)}
                      className={`rounded-lg px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                        nopolMetric === m.id
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 max-h-[460px] overflow-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
                <table className="w-full border-collapse text-xs whitespace-nowrap">
                  <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <th className="py-2.5 pr-2 pl-3 text-left font-semibold">#</th>
                      <th className="px-2 py-2.5 text-left font-semibold">Nopol &amp; Kendaraan</th>
                      <th className="px-2 py-2.5 text-right font-semibold">DO</th>
                      <th className="px-2 py-2.5 text-right font-semibold">Revenue</th>
                      <th className="px-2 py-2.5 text-right font-semibold">BOP</th>
                      <th className="py-2.5 pr-3 pl-2 text-right font-semibold">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredNopols.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-500">
                          Tidak ada nopol yang cocok dengan pencarian.
                        </td>
                      </tr>
                    ) : (
                      filteredNopols.map((n, idx) => {
                        const isSelected = selectedNopol?.nopol === n.nopol;
                        return (
                          <tr
                            key={n.nopol}
                            onClick={() => setSelectedNopolPlate(n.nopol)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-teal-50/70 dark:bg-teal-950/35'
                                : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-2.5 pr-2 pl-3 font-mono text-slate-400 tabular-nums">
                              {idx + 1}
                            </td>
                            <td className="px-2 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                                  {n.nopol}
                                </span>
                                <span
                                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                    n.nopolType === 'Vendor'
                                      ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'
                                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  }`}
                                >
                                  {n.nopolType}
                                </span>
                              </div>
                              <div className="max-w-[220px] truncate text-[11px] text-slate-500 dark:text-slate-400">
                                {n.vehicle !== '-' ? n.vehicle : n.unitTypes[0] || '-'}
                                {n.vehicle !== '-' && n.unitTypes[0]
                                  ? ` · ${n.unitTypes[0]}`
                                  : ''}
                              </div>
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                              {formatInt(n.doCount)}
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                              {formatJuta(n.revenue)} jt
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                              {formatJuta(n.bop)} jt
                            </td>
                            <td
                              className={`py-2.5 pr-3 pl-2 text-right font-mono tabular-nums ${
                                n.margin < 0
                                  ? 'font-semibold text-red-600 dark:text-red-400'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {formatJuta(n.margin)} jt
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: Selected Nopol Inspector */}
            <div className="flex flex-col border-t border-slate-100 pt-4 lg:col-span-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5 dark:border-slate-800">
              {!selectedNopol ? (
                <p className="py-12 text-center text-xs text-slate-500">
                  Pilih nopol pada tabel di kiri untuk melihat rincian revenue dan rutenya.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                        {selectedNopol.nopol}
                      </h3>
                      <span className="font-mono text-xs font-semibold text-teal-700 tabular-nums dark:text-teal-400">
                        {selectedNopol.sharePct.toFixed(1)}% porsi
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                      {selectedNopol.vehicle !== '-' ? `${selectedNopol.vehicle} · ` : ''}
                      {selectedNopol.unitTypes.join(', ') || '-'}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400 tabular-nums">
                      {formatInt(selectedNopol.doCount)} DO · {formatInt(selectedNopol.soCount)} SO ·{' '}
                      {formatInt(selectedNopol.customerCount)} customer
                    </p>

                    <div className="mt-3.5 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400">Total Revenue</span>
                        <p className="mt-0.5 font-mono font-bold text-teal-700 tabular-nums dark:text-teal-400">
                          {formatMiliar(selectedNopol.revenue)}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Total BOP</span>
                        <p className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
                          {formatMiliar(selectedNopol.bop)}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Margin</span>
                        <p
                          className={`mt-0.5 font-mono font-bold tabular-nums ${
                            selectedNopol.margin < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {formatMiliar(selectedNopol.margin)} (
                          {formatMarginPct(selectedNopol.revenue, selectedNopol.bop)})
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Rata-rata Rev / DO</span>
                        <p className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
                          {formatRupiahShort(selectedNopol.avgRevPerDo)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Mini Monthly Revenue Sparkline */}
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Tren Revenue Bulanan — {selectedNopol.nopol}
                    </p>
                    <div className="mt-2 flex h-20 items-end gap-1.5 border-b border-slate-100 pb-2 dark:border-slate-800">
                      {selectedNopol.monthlyTrend.length === 0 ? (
                        <span className="text-xs text-slate-400">Tidak ada tren bulanan.</span>
                      ) : (
                        (() => {
                          const maxRev = Math.max(
                            1,
                            ...selectedNopol.monthlyTrend.map((m) => m.revenue)
                          );
                          return selectedNopol.monthlyTrend.map((m) => {
                            const hPct = (m.revenue / maxRev) * 100;
                            return (
                              <div
                                key={m.month}
                                className="group flex flex-1 flex-col items-center justify-end gap-1"
                                title={`${m.label}: Rev Rp${formatJuta(m.revenue)} jt · ${formatInt(m.doCount)} DO`}
                              >
                                <div className="flex h-12 w-full items-end justify-center">
                                  <div
                                    className="w-full max-w-[24px] rounded-t bg-teal-600/85 transition-colors group-hover:bg-teal-500 dark:bg-teal-500/85"
                                    style={{
                                      height: `${m.revenue > 0 ? Math.max(8, hPct) : 0}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-400">
                                  {m.label.split(' ')[0]}
                                </span>
                              </div>
                            );
                          });
                        })()
                      )}
                    </div>
                  </div>

                  {/* Top Routes for Selected Nopol */}
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Rute Penyumbang Revenue
                    </p>
                    <div className="mt-1.5 space-y-1">
                      {selectedNopol.topRoutes.slice(0, 3).map((r) => (
                        <button
                          key={r.route}
                          type="button"
                          onClick={() => onSelectRoute(r.route)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        >
                          <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-slate-700 hover:text-teal-700 dark:text-slate-200 dark:hover:text-teal-300">
                            <MapPin className="h-3 w-3 shrink-0 text-teal-600" />
                            <span className="truncate">{r.route}</span>
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                            <strong className="text-slate-900 dark:text-slate-100">
                              Rp{formatJuta(r.rev)} jt
                            </strong>{' '}
                            · {formatInt(r.doCount)} DO
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Top Customers for Selected Nopol */}
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Customer Terkait
                    </p>
                    <div className="mt-1.5 space-y-1">
                      {selectedNopol.topCustomers.slice(0, 3).map((c) => (
                        <button
                          key={c.customer}
                          type="button"
                          onClick={() => onSelectCustomer(c.customer)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        >
                          <span className="truncate font-medium text-teal-700 hover:underline dark:text-teal-400">
                            {c.customer}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                            <strong className="text-slate-900 dark:text-slate-100">
                              Rp{formatJuta(c.rev)} jt
                            </strong>{' '}
                            · {formatInt(c.doCount)} DO
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Master-Detail: Unit Utilization Ranking + Interactive Inspector */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Interactive Unit List */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Frekuensi Pemakaian Unit DO
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Pilih unit untuk melihat tren bulanan, rute utama, dan customer pemakai di panel kanan.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 whitespace-nowrap transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              Ekspor CSV
            </button>
          </div>

          {/* Controls Toolbar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
            <div className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1 text-xs dark:bg-slate-800">
              {(
                [
                  { id: 'all', label: `Semua (${analytics.units.length})` },
                  { id: 'frequent', label: 'Sering (≥15%)' },
                  { id: 'moderate', label: 'Sedang (5–14%)' },
                  { id: 'rare', label: `Jarang (<5% · ${rareUnits.length})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTierFilter(f.id)}
                  className={`rounded-lg px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                    tierFilter === f.id
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-slate-800">
              {(
                [
                  { id: 'doCount', label: 'DO' },
                  { id: 'bop', label: 'BOP' },
                  { id: 'avgBopPerDo', label: 'BOP/DO' },
                  { id: 'revenue', label: 'Revenue' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMetric(m.id)}
                  className={`rounded-lg px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                    metric === m.id
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Unit List */}
          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {filteredUnits.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500">
                Tidak ada unit pada kategori frekuensi ini.
              </p>
            ) : (
              filteredUnits.map((u) => {
                const val = getMetricVal(u);
                const widthPct = maxBarVal > 0 ? (Math.max(0, val) / maxBarVal) * 100 : 0;
                const isSelected = selectedUnit?.unit === u.unit;

                return (
                  <button
                    key={u.unit}
                    type="button"
                    onClick={() => setSelectedUnitName(u.unit)}
                    className={`w-full px-3 py-3 text-left transition-colors ${
                      isSelected
                        ? 'bg-teal-50/70 dark:bg-teal-950/35'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                          {u.unit}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          {u.moda} ·{' '}
                          <span className={`font-medium ${TIER_TEXT_TONE[u.tier]}`}>
                            {u.tier}
                          </span>
                        </span>
                      </div>

                      <div className="font-mono text-xs tabular-nums">
                        <strong className="text-slate-900 dark:text-slate-100">
                          {formatMetricValue(val)}
                        </strong>
                        <span className="ml-2 text-slate-500 dark:text-slate-400">
                          ({u.sharePct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${TIER_BAR_COLOR[u.tier]}`}
                        style={{ width: `${val > 0 ? Math.max(2, widthPct) : 0}%` }}
                      />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                      <span>{formatInt(u.doCount)} DO</span>
                      <span>{formatInt(u.soCount)} SO</span>
                      <span>{formatInt(u.customerCount)} cust</span>
                      <span>BOP Rp{formatJuta(u.bop)} jt</span>
                      <span>Avg {formatRupiahShort(u.avgBopPerDo)}/DO</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Right: Selected Unit Inspector */}
        <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          {!selectedUnit ? (
            <p className="py-12 text-center text-xs text-slate-500">
              Pilih unit di daftar kiri untuk melihat detail operasionalnya.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {selectedUnit.unit}
                  </h3>
                  <span className={`text-xs font-semibold ${TIER_TEXT_TONE[selectedUnit.tier]}`}>
                    {selectedUnit.tier}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                  {selectedUnit.moda} · {formatInt(selectedUnit.doCount)} DO ({selectedUnit.sharePct.toFixed(1)}%) ·{' '}
                  {formatInt(selectedUnit.soCount)} SO
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400">Total BOP</span>
                    <p className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
                      {formatMiliar(selectedUnit.bop)}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Rata-rata BOP / DO</span>
                    <p className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
                      {formatRupiahShort(selectedUnit.avgBopPerDo)}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Revenue</span>
                    <p className="mt-0.5 font-mono font-bold text-teal-700 tabular-nums dark:text-teal-400">
                      {formatMiliar(selectedUnit.revenue)}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Margin Unit</span>
                    <p className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
                      {formatMarginPct(selectedUnit.revenue, selectedUnit.bop)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Mini Monthly Sparkline for Selected Unit */}
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tren DO Bulanan — {selectedUnit.unit}
                </p>
                <div className="mt-2.5 flex h-24 items-end gap-1.5 border-b border-slate-100 pb-2 dark:border-slate-800">
                  {selectedUnit.monthlyTrend.length === 0 ? (
                    <span className="text-xs text-slate-400">Tidak ada tren bulanan.</span>
                  ) : (
                    (() => {
                      const maxDo = Math.max(
                        1,
                        ...selectedUnit.monthlyTrend.map((m) => m.doCount)
                      );
                      return selectedUnit.monthlyTrend.map((m) => {
                        const hPct = (m.doCount / maxDo) * 100;
                        return (
                          <div
                            key={m.month}
                            className="group flex flex-1 flex-col items-center justify-end gap-1"
                            title={`${m.label}: ${formatInt(m.doCount)} DO · BOP Rp${formatJuta(m.bop)} jt`}
                          >
                            <span className="font-mono text-[10px] text-slate-500 tabular-nums opacity-80 group-hover:font-bold group-hover:text-teal-700 dark:group-hover:text-teal-300">
                              {m.doCount > 0 ? formatInt(m.doCount) : ''}
                            </span>
                            <div className="flex h-14 w-full items-end justify-center">
                              <div
                                className="w-full max-w-[26px] rounded-t bg-teal-600/85 transition-colors group-hover:bg-teal-500 dark:bg-teal-500/85"
                                style={{ height: `${m.doCount > 0 ? Math.max(6, hPct) : 0}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {m.label.split(' ')[0]}
                            </span>
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              </div>

              {/* Top Routes for Selected Unit */}
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Rute Terbanyak Unit Ini
                </p>
                <div className="mt-2 space-y-1.5">
                  {selectedUnit.topRoutes.slice(0, 4).map((r) => (
                    <button
                      key={r.route}
                      type="button"
                      onClick={() => onSelectRoute(r.route)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-slate-700 hover:text-teal-700 dark:text-slate-200 dark:hover:text-teal-300">
                        <MapPin className="h-3 w-3 shrink-0 text-teal-600" />
                        <span className="truncate">{r.route}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        <strong className="text-slate-900 dark:text-slate-100">
                          {formatInt(r.doCount)}
                        </strong>{' '}
                        DO
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Top Customers for Selected Unit */}
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Customer Pemakai Terbanyak
                </p>
                <div className="mt-2 space-y-1.5">
                  {selectedUnit.topCustomers.slice(0, 4).map((c) => (
                    <button
                      key={c.customer}
                      type="button"
                      onClick={() => onSelectCustomer(c.customer)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <span className="truncate font-medium text-teal-700 hover:underline dark:text-teal-400">
                        {c.customer}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        <strong className="text-slate-900 dark:text-slate-100">
                          {formatInt(c.doCount)}
                        </strong>{' '}
                        DO · BOP Rp{formatJuta(c.bop)} jt
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Tren Bulanan Pemakaian Top 5 Unit */}
      {top5Units.length > 0 && monthlyChart.months.length > 0 && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Tren Pemakaian Top 5 Unit per Bulan (DO Unik)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Memantau pergeseran beban operasional antar unit utama setiap bulan.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {top5Units.map((u, idx) => (
                <span key={u.unit} className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: UNIT_PALETTE[idx % UNIT_PALETTE.length] }}
                  />
                  <span className="font-medium">{u.unit}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="mt-3 flex min-h-8 flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2 text-xs dark:bg-slate-800/60">
            {hoveredMonthIdx !== null && monthlyChart.months[hoveredMonthIdx] ? (
              <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums">
                <span className="font-sans font-semibold text-slate-900 dark:text-slate-100">
                  {monthlyChart.months[hoveredMonthIdx].label}
                </span>
                {top5Units.map((u, idx) => (
                  <span key={u.unit} style={{ color: UNIT_PALETTE[idx % UNIT_PALETTE.length] }}>
                    {u.unit}: {formatInt(u.monthlyTrend[hoveredMonthIdx]?.doCount || 0)} DO
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                Arahkan kursor ke salah satu bulan untuk membandingkan jumlah DO tiap unit.
              </span>
            )}
          </div>

          <div className="mt-3 overflow-x-auto">
            <svg
              viewBox={`0 0 ${monthlyChart.W} ${monthlyChart.H}`}
              className="h-auto min-w-[640px] w-full select-none"
              onMouseLeave={() => setHoveredMonthIdx(null)}
            >
              {monthlyChart.ticks.map((t, i) => (
                <g key={i}>
                  <line
                    x1={monthlyChart.padL}
                    x2={monthlyChart.W - monthlyChart.padR}
                    y1={t.y}
                    y2={t.y}
                    className="stroke-slate-200/80 dark:stroke-slate-800"
                    strokeDasharray={t.val === 0 ? undefined : '4 4'}
                  />
                  <text
                    x={monthlyChart.padL - 8}
                    y={t.y + 3.5}
                    textAnchor="end"
                    className="fill-slate-400 font-mono text-[10px] dark:fill-slate-500"
                  >
                    {formatInt(t.val)}
                  </text>
                </g>
              ))}

              {monthlyChart.months.map((m, mIdx) => {
                const colW = monthlyChart.plotW / Math.max(1, monthlyChart.months.length);
                const colX = monthlyChart.padL + mIdx * colW;
                const barCount = top5Units.length;
                const gap = 3;
                const groupW = colW * 0.72;
                const barW = Math.min(18, (groupW - (barCount - 1) * gap) / barCount);
                const totalGroupW = barCount * barW + (barCount - 1) * gap;
                const startX = colX + (colW - totalGroupW) / 2;
                const baseY = monthlyChart.yFor(0);

                return (
                  <g
                    key={m.month}
                    onMouseEnter={() => setHoveredMonthIdx(mIdx)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={colX + 3}
                      y={monthlyChart.padT - 4}
                      width={Math.max(10, colW - 6)}
                      height={monthlyChart.plotH + 8}
                      rx={8}
                      fill={
                        hoveredMonthIdx === mIdx ? 'rgba(148, 163, 184, 0.08)' : 'transparent'
                      }
                    />
                    {top5Units.map((u, uIdx) => {
                      const val = u.monthlyTrend[mIdx]?.doCount || 0;
                      const yTop = monthlyChart.yFor(val);
                      const barH = Math.max(val > 0 ? 3 : 0, baseY - yTop);
                      return (
                        <rect
                          key={u.unit}
                          x={startX + uIdx * (barW + gap)}
                          y={yTop}
                          width={barW}
                          height={barH}
                          rx={3}
                          fill={UNIT_PALETTE[uIdx % UNIT_PALETTE.length]}
                        />
                      );
                    })}
                    <text
                      x={colX + colW / 2}
                      y={monthlyChart.H - 8}
                      textAnchor="middle"
                      className="fill-slate-500 text-[11px] font-medium dark:fill-slate-400"
                    >
                      {m.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>
      )}

      {/* Hub Muat/Bongkar Tersibuk + Struktur Perjalanan SO */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Titik Hub Tersibuk (Top 8)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Lokasi muat dan bongkar dengan aktivitas DO tertinggi.
              </p>
            </div>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setHubMode('origin')}
                className={`rounded-md px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                  hubMode === 'origin'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                Muat (Origin)
              </button>
              <button
                type="button"
                onClick={() => setHubMode('destination')}
                className={`rounded-md px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                  hubMode === 'destination'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                Bongkar (Dest)
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            {activeHubs.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">Tidak ada data hub.</p>
            ) : (
              activeHubs.map((h) => {
                const pct = (h.doCount / maxHubDo) * 100;
                return (
                  <div key={h.hub} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                        {h.hub}
                      </span>
                      <span className="shrink-0 font-mono text-slate-500 tabular-nums dark:text-slate-400">
                        <strong className="text-slate-900 dark:text-slate-100">
                          {formatInt(h.doCount)}
                        </strong>{' '}
                        DO · BOP Rp{formatJuta(h.bop)} jt
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-sky-600 dark:bg-sky-500"
                        style={{ width: `${Math.max(3, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Struktur Rantai DO &amp; Audit Biaya Operasional
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Kompleksitas jumlah DO per Sales Order dan pemeriksaan baris BOP.
          </p>

          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {(
              [
                {
                  label: 'Single-Leg (1 DO per SO)',
                  count: analytics.legBreakdown.single,
                  note: 'Pengiriman langsung titik ke titik',
                },
                {
                  label: 'Dual-Leg (2 DO per SO)',
                  count: analytics.legBreakdown.double,
                  note: 'Kombinasi jemput/antar atau pelabuhan',
                },
                {
                  label: 'Multi-Leg (3+ DO per SO)',
                  count: analytics.legBreakdown.multi,
                  note: 'Rantai multimoda (misal Darat → RoRo → Darat)',
                },
              ] as const
            ).map((row) => {
              const pct = (row.count / totalLegSos) * 100;
              return (
                <div key={row.label} className="py-3 first:pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {row.label}
                    </span>
                    <span className="font-mono text-slate-600 tabular-nums dark:text-slate-300">
                      <strong className="text-slate-900 dark:text-slate-100">
                        {formatInt(row.count)} SO
                      </strong>{' '}
                      ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                    {row.note}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs dark:border-slate-800">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Baris BOP = 0</span>
              <p className="mt-0.5 font-mono text-base font-bold text-slate-900 tabular-nums dark:text-slate-100">
                {formatInt(analytics.zeroBopLines)}{' '}
                <span className="text-xs font-normal text-slate-400">baris</span>
              </p>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                Rev = 0 dengan BOP &gt; 0
              </span>
              <p className="mt-0.5 font-mono text-base font-bold text-amber-600 tabular-nums dark:text-amber-400">
                {formatInt(analytics.zeroRevWithBopLines)}{' '}
                <span className="text-xs font-normal text-slate-400">baris</span>
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3.5 text-xs dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">
              Lihat pemetaan jalur antar-hub di peta
            </span>
            <button
              type="button"
              onClick={() => {
                if (analytics.units[0]?.topRoute && analytics.units[0].topRoute !== '-') {
                  onSelectRoute(analytics.units[0].topRoute);
                }
              }}
              className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap dark:text-teal-400 dark:hover:text-teal-300"
            >
              Buka Peta Rute <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
