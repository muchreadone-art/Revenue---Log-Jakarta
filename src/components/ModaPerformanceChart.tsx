import React, { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight, PieChart } from 'lucide-react';
import type {
  ModaDetailMetric,
  ModaKey,
  ModaSummaryMetric,
  MonthlyModaMetric,
} from '../types/logistics';
import { formatInt, formatJuta, formatMiliar } from '../utils/formatters';

interface ModaPerformanceChartProps {
  summary: ModaSummaryMetric[];
  monthlyData: MonthlyModaMetric[];
  selectedMonth: string[];
  onSelectMonth: (months: string[]) => void;
}

type MetricKey = 'revenue' | 'bop' | 'margin' | 'doCount';
type ViewMode = 'summary' | 'monthly';

const METRIC_OPTIONS: Array<{ key: MetricKey; label: string; unitHint: string }> = [
  { key: 'revenue', label: 'Revenue', unitHint: 'Rp juta' },
  { key: 'bop', label: 'BOP', unitHint: 'Rp juta' },
  { key: 'margin', label: 'Margin', unitHint: 'Rp juta' },
  { key: 'doCount', label: 'Jumlah DO', unitHint: 'DO unik' },
];

const MODA_STYLE: Record<
  ModaKey,
  {
    hex: string;
    dot: string;
    text: string;
    bar: string;
    subBar: string;
    hint: string;
  }
> = {
  Transporter: {
    hex: '#6366F1',
    dot: 'bg-indigo-500',
    text: 'text-indigo-700 dark:text-indigo-400',
    bar: 'bg-indigo-500 dark:bg-indigo-400',
    subBar: 'bg-indigo-400/80 dark:bg-indigo-400/75',
    hint: 'Transporter',
  },
  'Car Carrier': {
    hex: '#0D9488',
    dot: 'bg-teal-600',
    text: 'text-teal-700 dark:text-teal-400',
    bar: 'bg-teal-600 dark:bg-teal-500',
    subBar: 'bg-teal-500/80 dark:bg-teal-400/75',
    hint: 'CC Towing, Self Loader, Motor Carrier',
  },
  'Self Drive': {
    hex: '#0284C7',
    dot: 'bg-sky-600',
    text: 'text-sky-700 dark:text-sky-400',
    bar: 'bg-sky-600 dark:bg-sky-500',
    subBar: 'bg-sky-500/80 dark:bg-sky-400/75',
    hint: 'SELF DRIVE',
  },
  Shipment: {
    hex: '#D97706',
    dot: 'bg-amber-600',
    text: 'text-amber-700 dark:text-amber-400',
    bar: 'bg-amber-500 dark:bg-amber-400',
    subBar: 'bg-amber-400/85 dark:bg-amber-400/75',
    hint: 'SHIPMENT RORO',
  },
};

export const ModaPerformanceChart: React.FC<ModaPerformanceChartProps> = ({
  summary,
  monthlyData,
  selectedMonth,
  onSelectMonth,
}) => {
  const [metric, setMetric] = useState<MetricKey>('revenue');
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [hoveredModa, setHoveredModa] = useState<ModaKey | null>(null);
  const [hoveredMonthIdx, setHoveredMonthIdx] = useState<number | null>(null);
  const [expandedModas, setExpandedModas] = useState<Record<ModaKey, boolean>>({
    Transporter: true,
    'Car Carrier': true,
    'Self Drive': true,
    Shipment: true,
  });
  const [visibleModas, setVisibleModas] = useState<Record<ModaKey, boolean>>({
    Transporter: true,
    'Car Carrier': true,
    'Self Drive': true,
    Shipment: true,
  });

  const getMetricVal = (
    item: Pick<ModaSummaryMetric, 'revenue' | 'bop' | 'margin' | 'doCount'>,
    key: MetricKey
  ) => {
    if (key === 'revenue') return item.revenue;
    if (key === 'bop') return item.bop;
    if (key === 'margin') return item.margin;
    return item.doCount;
  };

  const formatMetricValue = (val: number, key: MetricKey) => {
    if (key === 'doCount') return `${formatInt(val)} DO`;
    return formatMiliar(val);
  };

  const formatDetailMetricValue = (val: number, key: MetricKey) => {
    if (key === 'doCount') return `${formatInt(val)} DO`;
    return `Rp${formatJuta(val)} jt`;
  };

  const formatCompactTick = (val: number, key: MetricKey) => {
    if (key === 'doCount') return formatInt(val);
    return formatInt(val / 1e6);
  };

  const toggleExpandModa = (moda: ModaKey) => {
    setExpandedModas((prev) => ({ ...prev, [moda]: !prev[moda] }));
  };

  const allExpanded = summary.every((s) => expandedModas[s.moda]);
  const toggleAllExpanded = () => {
    const nextVal = !allExpanded;
    setExpandedModas({
      Transporter: nextVal,
      'Car Carrier': nextVal,
      'Self Drive': nextVal,
      Shipment: nextVal,
    });
  };

  const toggleVisibleModa = (moda: ModaKey) => {
    setVisibleModas((prev) => {
      const next = { ...prev, [moda]: !prev[moda] };
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  };

  const totalPositiveMetric = useMemo(
    () => summary.reduce((acc, r) => acc + Math.max(0, getMetricVal(r, metric)), 0),
    [summary, metric]
  );

  const totalRawMetric = useMemo(
    () => summary.reduce((acc, r) => acc + getMetricVal(r, metric), 0),
    [summary, metric]
  );

  const maxModaBar = useMemo(
    () => Math.max(1, ...summary.map((r) => Math.max(0, getMetricVal(r, metric)))),
    [summary, metric]
  );

  const radius = 58;
  const circumference = 2 * Math.PI * radius;

  const donutSegments = useMemo(() => {
    let cumulative = 0;
    return summary.map((row) => {
      const val = Math.max(0, getMetricVal(row, metric));
      const fraction = totalPositiveMetric > 0 ? val / totalPositiveMetric : 0;
      const dash = fraction * circumference;
      const offset = -cumulative;
      cumulative += dash;
      return {
        ...row,
        val,
        fraction,
        pct: fraction * 100,
        dash,
        offset,
        style: MODA_STYLE[row.moda],
      };
    });
  }, [summary, metric, totalPositiveMetric, circumference]);

  const monthlyGeometry = useMemo(() => {
    const count = Math.max(monthlyData.length, 1);
    const W = Math.max(760, count * 124);
    const H = 300;
    const padL = 56;
    const padR = 20;
    const padT = 28;
    const padB = 34;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const activeModas = summary
      .map((s) => s.moda)
      .filter((m) => visibleModas[m]);

    const vals: number[] = [0];
    monthlyData.forEach((m) => {
      activeModas.forEach((moda) => {
        vals.push(getMetricVal(m.byModa[moda], metric));
      });
    });

    const rawMax = Math.max(metric === 'doCount' ? 10 : 10e6, ...vals);
    const rawMin = Math.min(0, ...vals);
    const maxVal = rawMax * 1.14;
    const minVal = rawMin < 0 ? rawMin * 1.15 : 0;
    const span = Math.max(1, maxVal - minVal);

    const yFor = (v: number) => padT + ((maxVal - v) / span) * plotH;
    const zeroY = yFor(0);

    const ticks = Array.from({ length: 5 }, (_, i) => {
      const val = minVal + (span * i) / 4;
      return { val, y: yFor(val) };
    });

    return { W, H, padL, padR, padT, padB, plotW, plotH, zeroY, yFor, ticks, activeModas };
  }, [monthlyData, metric, summary, visibleModas]);

  const activeMetricMeta =
    METRIC_OPTIONS.find((m) => m.key === metric) ?? METRIC_OPTIONS[0];
  const hoveredMonth =
    hoveredMonthIdx !== null ? monthlyData[hoveredMonthIdx] ?? null : null;
  const hasAnyData = summary.some((s) => s.lineCount > 0);
  const transporterEmpty =
    (summary.find((s) => s.moda === 'Transporter')?.lineCount ?? 0) === 0;

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Penjualan per Moda
            </h2>
            {selectedMonth.length > 0 && viewMode === 'monthly' && (
              <button
                type="button"
                onClick={() => onSelectMonth([])}
                className="text-xs font-medium text-teal-700 underline underline-offset-4 hover:text-teal-800 dark:text-teal-400"
              >
                Reset filter bulan ({selectedMonth.length === 1 ? selectedMonth[0] : `${selectedMonth.length} bulan`})
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Ringkasan 4 moda utama (Self Drive, Car Carrier, Shipment, Transporter) dan rincian sub-kategori masing-masing ({activeMetricMeta.unitHint}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Metric selector */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {METRIC_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setMetric(opt.key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  metric === opt.key
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* View mode toggle */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('summary')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                viewMode === 'summary'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <PieChart className="h-3.5 w-3.5" />
              Proporsi & Detail
            </button>
            <button
              type="button"
              onClick={() => setViewMode('monthly')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                viewMode === 'monthly'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Tren Bulanan
            </button>
          </div>
        </div>
      </div>

      {!hasAnyData ? (
        <div className="mt-6 flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Tidak ada data penjualan pada kombinasi filter saat ini.
        </div>
      ) : viewMode === 'summary' ? (
        <div className="mt-5 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Left: 4-Moda Donut + Legend */}
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-800/30">
            <div className="flex flex-col items-center">
              <div className="relative flex h-48 w-48 items-center justify-center">
                <svg viewBox="0 0 148 148" className="h-full w-full -rotate-90">
                  <circle
                    cx="74"
                    cy="74"
                    r={radius}
                    fill="none"
                    className="stroke-slate-200/70 dark:stroke-slate-800"
                    strokeWidth="18"
                  />
                  {donutSegments.map((seg) =>
                    seg.dash > 0 ? (
                      <circle
                        key={seg.moda}
                        cx="74"
                        cy="74"
                        r={radius}
                        fill="none"
                        stroke={seg.style.hex}
                        strokeWidth={hoveredModa === seg.moda ? '21' : '18'}
                        strokeDasharray={`${seg.dash} ${circumference}`}
                        strokeDashoffset={seg.offset}
                        strokeLinecap="butt"
                        className="cursor-pointer transition-all duration-200"
                        opacity={hoveredModa && hoveredModa !== seg.moda ? 0.35 : 1}
                        onMouseEnter={() => setHoveredModa(seg.moda)}
                        onMouseLeave={() => setHoveredModa(null)}
                        onClick={() => toggleExpandModa(seg.moda)}
                      />
                    ) : null
                  )}
                </svg>

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
                  <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                    {hoveredModa || `Total ${activeMetricMeta.label}`}
                  </span>
                  <span className="mt-0.5 font-mono text-base font-bold text-slate-900 tabular-nums dark:text-slate-100">
                    {hoveredModa
                      ? formatMetricValue(
                          getMetricVal(
                            summary.find((s) => s.moda === hoveredModa) ?? summary[0],
                            metric
                          ),
                          metric
                        )
                      : formatMetricValue(totalRawMetric, metric)}
                  </span>
                  {hoveredModa && (
                    <span className="font-mono text-[11px] font-semibold text-slate-500 tabular-nums dark:text-slate-400">
                      {(
                        donutSegments.find((s) => s.moda === hoveredModa)?.pct ?? 0
                      ).toFixed(1)}
                      %
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 w-full space-y-2">
                {donutSegments.map((seg) => (
                  <button
                    key={seg.moda}
                    type="button"
                    onMouseEnter={() => setHoveredModa(seg.moda)}
                    onMouseLeave={() => setHoveredModa(null)}
                    onClick={() => toggleExpandModa(seg.moda)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs transition-colors ${
                      hoveredModa === seg.moda
                        ? 'bg-white shadow-xs dark:bg-slate-800'
                        : 'bg-white/70 hover:bg-white dark:bg-slate-900/60 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${seg.style.dot}`}
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">
                          {seg.moda}
                        </p>
                        <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">
                          {seg.details.length > 0
                            ? `${seg.details.length} jenis · ${formatInt(seg.doCount)} DO`
                            : 'Belum ada data'}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-mono tabular-nums">
                      <p className="font-bold text-slate-900 dark:text-slate-100">
                        {formatMetricValue(getMetricVal(seg, metric), metric)}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {seg.pct.toFixed(1)}%
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: 4-Moda Breakdown + Expandable Details */}
          <div className="space-y-3 lg:col-span-7">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Rincian isi masing-masing moda (klik judul moda untuk buka/tutup)
              </span>
              <button
                type="button"
                onClick={toggleAllExpanded}
                className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
              >
                {allExpanded ? 'Tutup Semua Detail' : 'Buka Semua Detail'}
              </button>
            </div>

            {donutSegments.map((seg) => {
              const rawVal = getMetricVal(seg, metric);
              const modaWidthPct =
                maxModaBar > 0 ? (Math.max(0, rawVal) / maxModaBar) * 100 : 0;
              const isOpen = expandedModas[seg.moda];
              const maxDetailVal = Math.max(
                1,
                ...seg.details.map((d) => Math.max(0, getMetricVal(d, metric)))
              );
              const sumPositiveDetails = seg.details.reduce(
                (acc, d) => acc + Math.max(0, getMetricVal(d, metric)),
                0
              );

              return (
                <div
                  key={seg.moda}
                  onMouseEnter={() => setHoveredModa(seg.moda)}
                  onMouseLeave={() => setHoveredModa(null)}
                  className={`rounded-xl border transition-colors ${
                    hoveredModa === seg.moda
                      ? 'border-slate-300 bg-slate-50/90 dark:border-slate-700 dark:bg-slate-800/60'
                      : 'border-slate-200/80 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/35'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpandModa(seg.moda)}
                    className="w-full p-3.5 text-left"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        )}
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${seg.style.dot}`}
                        />
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {seg.moda}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                          {formatInt(seg.soCount)} SO · {formatInt(seg.doCount)} DO
                        </span>
                      </div>

                      <div className="flex items-baseline gap-2 font-mono tabular-nums">
                        <span className={`text-sm font-bold ${seg.style.text}`}>
                          {formatMetricValue(rawVal, metric)}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          ({seg.pct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          rawVal < 0 ? 'bg-red-500' : seg.style.bar
                        }`}
                        style={{
                          width: `${rawVal !== 0 ? Math.max(2.5, modaWidthPct) : 0}%`,
                        }}
                      />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-500 tabular-nums dark:text-slate-400">
                      <span>
                        Rev{' '}
                        <strong className="text-slate-700 dark:text-slate-200">
                          Rp{formatJuta(seg.revenue)} jt
                        </strong>
                      </span>
                      <span>
                        BOP{' '}
                        <strong className="text-slate-700 dark:text-slate-200">
                          Rp{formatJuta(seg.bop)} jt
                        </strong>
                      </span>
                      <span>
                        Margin{' '}
                        <strong
                          className={
                            seg.margin < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }
                        >
                          Rp{formatJuta(seg.margin)} jt
                          {seg.marginPct !== null
                            ? ` (${seg.marginPct.toFixed(1)}%)`
                            : ''}
                        </strong>
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-200/70 bg-white/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
                      {seg.details.length === 0 ? (
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          Belum ada data untuk moda {seg.moda} ({seg.style.hint}) pada filter aktif.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {seg.details.map((d: ModaDetailMetric) => {
                            const dVal = getMetricVal(d, metric);
                            const dBarPct =
                              maxDetailVal > 0
                                ? (Math.max(0, dVal) / maxDetailVal) * 100
                                : 0;
                            const shareInModa =
                              sumPositiveDetails > 0
                                ? (Math.max(0, dVal) / sumPositiveDetails) * 100
                                : 0;

                            return (
                              <div key={d.detail} className="space-y-1">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="truncate font-medium text-slate-700 dark:text-slate-200">
                                      {d.detail}
                                    </span>
                                    <span className="font-mono text-[10px] text-slate-400 tabular-nums dark:text-slate-500">
                                      {formatInt(d.doCount)} DO · {formatInt(d.soCount)} SO
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                                    <span
                                      className={`font-semibold ${
                                        dVal < 0
                                          ? 'text-red-600 dark:text-red-400'
                                          : 'text-slate-800 dark:text-slate-100'
                                      }`}
                                    >
                                      {formatDetailMetricValue(dVal, metric)}
                                    </span>
                                    <span className="text-slate-400 dark:text-slate-500">
                                      ({shareInModa.toFixed(1)}%)
                                    </span>
                                  </div>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      dVal < 0 ? 'bg-red-500' : seg.style.subBar
                                    }`}
                                    style={{
                                      width: `${dVal !== 0 ? Math.max(2, dBarPct) : 0}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {transporterEmpty && (
              <p className="rounded-xl bg-slate-50 px-3.5 py-2 text-[11px] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                Catatan: Moda <strong>Transporter</strong> bernilai 0 karena belum ada data dengan{' '}
                <strong>Delivery Order/Product Category = Transporter</strong> pada sumber/filter aktif. Unggah file Excel TRP di menu{' '}
                <strong>Sumber & Kualitas Data</strong> untuk menampilkan rincian Transporter.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="relative mt-4">
          {/* Interactive Legend + Hover Inspector */}
          <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2 text-xs dark:bg-slate-800/60">
            <div className="flex flex-wrap items-center gap-2">
              {summary.map((s) => {
                const active = visibleModas[s.moda];
                const st = MODA_STYLE[s.moda];
                return (
                  <button
                    key={s.moda}
                    type="button"
                    onClick={() => toggleVisibleModa(s.moda)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium transition-all ${
                      active
                        ? 'text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800'
                        : 'text-slate-400 opacity-45 line-through'
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${st.dot}`} />
                    <span>{s.moda}</span>
                  </button>
                );
              })}
            </div>

            {hoveredMonth ? (
              <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums">
                <span className="font-sans text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {hoveredMonth.label}
                </span>
                {monthlyGeometry.activeModas.map((moda) => (
                  <span key={moda} className={MODA_STYLE[moda].text}>
                    {moda}: {formatMetricValue(getMetricVal(hoveredMonth.byModa[moda], metric), metric)}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                Arahkan kursor ke salah satu bulan untuk membandingkan 4 moda.
              </span>
            )}
          </div>

          {monthlyData.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Tidak ada data bulanan tersedia.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${monthlyGeometry.W} ${monthlyGeometry.H}`}
                className="h-auto min-w-[660px] w-full select-none"
                role="img"
                aria-label="Grafik tren bulanan Penjualan per Moda"
                onMouseLeave={() => setHoveredMonthIdx(null)}
              >
                {monthlyGeometry.ticks.map((tick, idx) => (
                  <g key={idx}>
                    <line
                      x1={monthlyGeometry.padL}
                      x2={monthlyGeometry.W - monthlyGeometry.padR}
                      y1={tick.y}
                      y2={tick.y}
                      className="stroke-slate-200/80 dark:stroke-slate-800"
                      strokeDasharray={Math.abs(tick.val) < 0.01 ? undefined : '4 4'}
                      strokeWidth={Math.abs(tick.val) < 0.01 ? 1.2 : 1}
                    />
                    <text
                      x={monthlyGeometry.padL - 10}
                      y={tick.y + 3.5}
                      textAnchor="end"
                      className="fill-slate-400 font-mono text-[10px] dark:fill-slate-500"
                    >
                      {formatCompactTick(tick.val, metric)}
                    </text>
                  </g>
                ))}

                {monthlyData.map((d, i) => {
                  const colW =
                    monthlyGeometry.plotW / Math.max(monthlyData.length, 1);
                  const colX = monthlyGeometry.padL + i * colW;
                  const isSelected = selectedMonth.includes(d.month);
                  const isHovered = hoveredMonthIdx === i;
                  const isDimmed =
                    selectedMonth.length > 0 && !isSelected;

                  const barCount = Math.max(monthlyGeometry.activeModas.length, 1);
                  const groupW = colW * 0.72;
                  const gap = 4;
                  const barW = Math.min(22, (groupW - (barCount - 1) * gap) / barCount);
                  const totalGroupW = barCount * barW + (barCount - 1) * gap;
                  const startX = colX + (colW - totalGroupW) / 2;

                  return (
                    <g
                      key={d.month}
                      className="cursor-pointer transition-opacity duration-200"
                      opacity={isDimmed ? 0.3 : 1}
                      onMouseEnter={() => setHoveredMonthIdx(i)}
                      onClick={() =>
                        onSelectMonth(
                          isSelected
                            ? selectedMonth.filter((m) => m !== d.month)
                            : [...selectedMonth, d.month].sort()
                        )
                      }
                    >
                      <rect
                        x={colX + 4}
                        y={monthlyGeometry.padT - 8}
                        width={Math.max(12, colW - 8)}
                        height={monthlyGeometry.plotH + 14}
                        rx={10}
                        fill={
                          isSelected
                            ? 'rgba(13, 148, 136, 0.09)'
                            : isHovered
                            ? 'rgba(148, 163, 184, 0.08)'
                            : 'transparent'
                        }
                      />

                      {monthlyGeometry.activeModas.map((moda, j) => {
                        const val = getMetricVal(d.byModa[moda], metric);
                        const yVal = monthlyGeometry.yFor(val);
                        const yTop = Math.min(yVal, monthlyGeometry.zeroY);
                        const barH = Math.max(
                          val !== 0 ? 3 : 0,
                          Math.abs(monthlyGeometry.zeroY - yVal)
                        );
                        const x = startX + j * (barW + gap);
                        const labelText =
                          metric === 'doCount' ? formatInt(val) : formatJuta(val);

                        return (
                          <g key={moda}>
                            {barH > 0 && (
                              <rect
                                x={x}
                                y={yTop}
                                width={barW}
                                height={barH}
                                rx={3.5}
                                fill={val < 0 ? '#EF4444' : MODA_STYLE[moda].hex}
                              />
                            )}
                            {val !== 0 && isHovered && (
                              <text
                                x={x + barW / 2}
                                y={val >= 0 ? yTop - 5 : yTop + barH + 11}
                                textAnchor="middle"
                                className="fill-slate-600 font-mono text-[9px] dark:fill-slate-300"
                              >
                                {labelText}
                              </text>
                            )}
                          </g>
                        );
                      })}

                      <text
                        x={colX + colW / 2}
                        y={monthlyGeometry.H - 10}
                        textAnchor="middle"
                        className={`text-[11px] ${
                          selectedMonth.includes(d.month)
                            ? 'fill-teal-700 font-semibold dark:fill-teal-400'
                            : 'fill-slate-500 font-medium dark:fill-slate-400'
                        }`}
                      >
                        {d.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
