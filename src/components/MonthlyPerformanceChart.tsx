import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, TrendingUp } from 'lucide-react';
import type { MonthlyMetric, SourceKey } from '../types/logistics';
import { formatInt, formatJuta } from '../utils/formatters';

interface MonthlyPerformanceChartProps {
  data: MonthlyMetric[];
  selectedMonth: string[];
  onSelectMonth: (months: string[]) => void;
  sourceFilter?: 'all' | SourceKey;
  hasTrpData?: boolean;
  hasVliData?: boolean;
}

type ActualSeriesKey = 'revenue' | 'bop' | 'margin';
type SeriesKey = 'target' | ActualSeriesKey;
export type TargetScope = 'TOTAL' | 'VLI' | 'TRP';

// Target capaian penjualan bulanan TRANSPORTER (Rp) berdasarkan bulan kalender (01-12)
export const MONTHLY_TARGET_TRANSPORTER: Record<string, number> = {
  '01': 3510875000,
  '02': 3510875000,
  '03': 3795875000,
  '04': 3995875000,
  '05': 4375875000,
  '06': 4575875000,
  '07': 5045475000,
  '08': 5045475000,
  '09': 5045475000,
  '10': 5045475000,
  '11': 5045475000,
  '12': 5045475000,
};

// Target capaian penjualan bulanan VLI (Rp) berdasarkan bulan kalender (01-12)
export const MONTHLY_TARGET_VLI: Record<string, number> = {
  '01': 4956150000,
  '02': 5009400000,
  '03': 5045650000,
  '04': 5069600000,
  '05': 5043600000,
  '06': 5057000000,
  '07': 5090125000,
  '08': 5090125000,
  '09': 5079125000,
  '10': 5095125000,
  '11': 5095125000,
  '12': 5095125000,
};

export function getMonthlyTargets(monthYm: string): {
  trp: number | null;
  vli: number | null;
  total: number | null;
} {
  const mm = monthYm.slice(5, 7);
  const trp = MONTHLY_TARGET_TRANSPORTER[mm] ?? null;
  const vli = MONTHLY_TARGET_VLI[mm] ?? null;
  const total = trp !== null && vli !== null ? trp + vli : trp ?? vli;
  return { trp, vli, total };
}

const TARGET_META: Record<
  TargetScope,
  { label: string; shortLabel: string; color: string; borderClass: string; textClass: string }
> = {
  TOTAL: {
    label: 'Target Total (TRP + VLI)',
    shortLabel: 'Total',
    color: '#7C3AED',
    borderClass: 'border-violet-500',
    textClass: 'text-violet-700 dark:text-violet-400',
  },
  VLI: {
    label: 'Target VLI',
    shortLabel: 'VLI',
    color: '#0284C7',
    borderClass: 'border-sky-500',
    textClass: 'text-sky-700 dark:text-sky-400',
  },
  TRP: {
    label: 'Target Transporter',
    shortLabel: 'Transporter',
    color: '#6366F1',
    borderClass: 'border-indigo-500',
    textClass: 'text-indigo-700 dark:text-indigo-400',
  },
};

export const MonthlyPerformanceChart: React.FC<MonthlyPerformanceChartProps> = ({
  data,
  selectedMonth,
  onSelectMonth,
  sourceFilter = 'all',
  hasTrpData = false,
  hasVliData = true,
}) => {
  const [chartMode, setChartMode] = useState<'bar' | 'line'>('bar');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [targetScope, setTargetScope] = useState<TargetScope>(() => {
    if (sourceFilter === 'TRP') return 'TRP';
    if (sourceFilter === 'VLI') return 'VLI';
    if (hasTrpData && hasVliData) return 'TOTAL';
    if (hasTrpData && !hasVliData) return 'TRP';
    return 'VLI';
  });
  const [visibleSeries, setVisibleSeries] = useState<Record<SeriesKey, boolean>>({
    target: true,
    revenue: true,
    bop: true,
    margin: true,
  });

  useEffect(() => {
    if (sourceFilter === 'TRP') {
      setTargetScope('TRP');
    } else if (sourceFilter === 'VLI') {
      setTargetScope('VLI');
    } else if (hasTrpData && hasVliData) {
      setTargetScope('TOTAL');
    } else if (hasTrpData && !hasVliData) {
      setTargetScope('TRP');
    } else {
      setTargetScope('VLI');
    }
  }, [sourceFilter, hasTrpData, hasVliData]);

  const toggleSeries = (key: SeriesKey) => {
    setVisibleSeries((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  };

  const enrichedData = useMemo(
    () =>
      data.map((d) => {
        const targets = getMonthlyTargets(d.month);
        const activeTarget =
          targetScope === 'TRP'
            ? targets.trp
            : targetScope === 'VLI'
            ? targets.vli
            : targets.total;
        return {
          ...d,
          target: activeTarget,
          targetTrp: targets.trp,
          targetVli: targets.vli,
          targetTotal: targets.total,
        };
      }),
    [data, targetScope]
  );

  const chartGeometry = useMemo(() => {
    const count = Math.max(enrichedData.length, 1);
    const W = Math.max(760, count * 120);
    const H = 320;
    const padL = 60;
    const padR = 24;
    const padT = 32;
    const padB = 34;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const allVals: number[] = [0];
    enrichedData.forEach((d) => {
      if (visibleSeries.target && d.target !== null) allVals.push(d.target / 1e6);
      if (visibleSeries.revenue) allVals.push(d.revenue / 1e6);
      if (visibleSeries.bop) allVals.push(d.bop / 1e6);
      if (visibleSeries.margin) allVals.push(d.margin / 1e6);
    });

    const rawMax = Math.max(10, ...allVals);
    const rawMin = Math.min(0, ...allVals);
    const maxVal = rawMax * 1.14;
    const minVal = rawMin < 0 ? rawMin * 1.15 : 0;
    const span = Math.max(1, maxVal - minVal);

    const yFor = (valJuta: number) => padT + ((maxVal - valJuta) / span) * plotH;
    const zeroY = yFor(0);

    const ticks = Array.from({ length: 5 }, (_, i) => {
      const val = minVal + (span * i) / 4;
      return { val, y: yFor(val) };
    });

    return { W, H, padL, padR, padT, padB, plotW, plotH, zeroY, yFor, ticks };
  }, [enrichedData, visibleSeries]);

  const activeTargetMeta = TARGET_META[targetScope];

  const actualSeriesMeta: Array<{
    key: ActualSeriesKey;
    label: string;
    color: string;
    swatch: string;
  }> = [
    { key: 'revenue', label: 'Revenue', color: '#0D9488', swatch: 'bg-teal-600' },
    { key: 'bop', label: 'BOP', color: '#F59E0B', swatch: 'bg-amber-500' },
    { key: 'margin', label: 'Margin', color: '#10B981', swatch: 'bg-emerald-500' },
  ];

  const colW = chartGeometry.plotW / Math.max(enrichedData.length, 1);

  const targetPoints = useMemo(() => {
    if (!visibleSeries.target) return [];
    return enrichedData
      .map((d, i) => {
        if (d.target === null) return null;
        const valJuta = d.target / 1e6;
        return {
          idx: i,
          x: chartGeometry.padL + i * colW + colW / 2,
          y: chartGeometry.yFor(valJuta),
          raw: d.target,
          valJuta,
          month: d.month,
        };
      })
      .filter((pt): pt is NonNullable<typeof pt> => pt !== null);
  }, [enrichedData, visibleSeries.target, chartGeometry, colW]);

  const targetPathD = useMemo(
    () =>
      targetPoints
        .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
        .join(' '),
    [targetPoints]
  );

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Laporan Penjualan Bulanan
            </h2>
            {selectedMonth.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectMonth([])}
                className="text-xs font-medium text-teal-700 underline underline-offset-4 hover:text-teal-800 dark:text-teal-400"
              >
                Reset filter bulan ({selectedMonth.length === 1 ? selectedMonth[0] : `${selectedMonth.length} bulan`})
              </button>
            )}
          </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Interactive series legend */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {actualSeriesMeta.map((s) => {
              const active = visibleSeries[s.key];
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleSeries(s.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition-all ${
                    active
                      ? 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      : 'text-slate-400 opacity-45 line-through'
                  }`}
                >
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.swatch}`} />
                  <span className="font-medium">{s.label}</span>
                </button>
              );
            })}

            {/* Interactive Target legend matching Revenue, BOP, Margin */}
            <button
              type="button"
              onClick={() => toggleSeries('target')}
              title={`${visibleSeries.target ? 'Sembunyikan' : 'Tampilkan'} ${activeTargetMeta.label}`}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition-all ${
                visibleSeries.target
                  ? 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  : 'text-slate-400 opacity-45 line-through'
              }`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: activeTargetMeta.color }}
              />
              <span className="font-medium">Target</span>
            </button>
          </div>

          {/* Bar / Line toggle for actuals */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setChartMode('bar')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                chartMode === 'bar'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Batang
            </button>
            <button
              type="button"
              onClick={() => setChartMode('line')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                chartMode === 'line'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Garis
            </button>
          </div>
        </div>
      </div>

      {enrichedData.length === 0 ? (
        <div className="mt-6 flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Tidak ada data bulanan pada kombinasi filter saat ini.
        </div>
      ) : (
        <div className="relative mt-4">
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartGeometry.W} ${chartGeometry.H}`}
              className="h-auto min-w-[660px] w-full select-none"
              role="img"
              aria-label="Grafik Revenue, BOP, Margin, dan Garis Target per bulan"
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Soft Horizontal Grid Lines */}
              {chartGeometry.ticks.map((tick, idx) => (
                <g key={idx}>
                  <line
                    x1={chartGeometry.padL}
                    x2={chartGeometry.W - chartGeometry.padR}
                    y1={tick.y}
                    y2={tick.y}
                    className="stroke-slate-200/80 dark:stroke-slate-800"
                    strokeDasharray={Math.abs(tick.val) < 0.01 ? undefined : '4 4'}
                    strokeWidth={Math.abs(tick.val) < 0.01 ? 1.2 : 1}
                  />
                  <text
                    x={chartGeometry.padL - 10}
                    y={tick.y + 3.5}
                    textAnchor="end"
                    className="fill-slate-400 font-mono text-[10px] dark:fill-slate-500"
                  >
                    {formatInt(tick.val)}
                  </text>
                </g>
              ))}

              {/* Hover & Click Column Bands */}
              {enrichedData.map((d, i) => {
                const colX = chartGeometry.padL + i * colW;
                const isSelected = selectedMonth.includes(d.month);
                const isHovered = hoveredIdx === i;
                return (
                  <rect
                    key={`band-${d.month}`}
                    x={colX + 4}
                    y={chartGeometry.padT - 8}
                    width={Math.max(12, colW - 8)}
                    height={chartGeometry.plotH + 14}
                    rx={10}
                    className="cursor-pointer transition-colors"
                    fill={
                      isSelected
                        ? 'rgba(13, 148, 136, 0.09)'
                        : isHovered
                        ? 'rgba(148, 163, 184, 0.08)'
                        : 'transparent'
                    }
                    onMouseEnter={() => setHoveredIdx(i)}
                    onClick={() =>
                      onSelectMonth(
                        isSelected
                          ? selectedMonth.filter((m) => m !== d.month)
                          : [...selectedMonth, d.month].sort()
                      )
                    }
                  />
                );
              })}

              {/* Actual Series: Bar or Line mode */}
              {chartMode === 'bar' ? (
                enrichedData.map((d, i) => {
                  const activeKeys = actualSeriesMeta.filter((s) => visibleSeries[s.key]);
                  const barCount = Math.max(activeKeys.length, 1);
                  const groupW = colW * 0.68;
                  const barW = Math.min(26, (groupW - (barCount - 1) * 5) / barCount);
                  const totalGroupW = barCount * barW + (barCount - 1) * 5;
                  const startX = chartGeometry.padL + i * colW + (colW - totalGroupW) / 2;
                  const [yr, mo] = d.month.split('-').map(Number);
                  const isFutureMonth = yr > new Date().getFullYear() || (yr === new Date().getFullYear() && mo > new Date().getMonth() + 1);
                  const isSelected = selectedMonth.includes(d.month);
                  const isDimmed = (selectedMonth.length > 0 && !isSelected) || isFutureMonth;

                  return (
                    <g
                      key={d.month}
                      className="cursor-pointer transition-opacity duration-200"
                      opacity={isFutureMonth ? 0.45 : isDimmed ? 0.3 : 1}
                      onMouseEnter={() => setHoveredIdx(i)}
                      onClick={() =>
                        onSelectMonth(
                          isSelected
                            ? selectedMonth.filter((m) => m !== d.month)
                            : [...selectedMonth, d.month].sort()
                        )
                      }
                    >
                      {activeKeys.map((s, j) => {
                        const rawVal =
                          s.key === 'revenue'
                            ? d.revenue
                            : s.key === 'bop'
                            ? d.bop
                            : d.margin;
                        const valJuta = rawVal / 1e6;
                        const yVal = chartGeometry.yFor(valJuta);
                        const yTop = Math.min(yVal, chartGeometry.zeroY);
                        const barH = Math.max(3, Math.abs(chartGeometry.zeroY - yVal));
                        const x = startX + j * (barW + 5);
                        const barColor = s.key === 'margin' && valJuta < 0 ? '#EF4444' : s.color;

                        return (
                          <g key={s.key}>
                            <rect
                              x={x}
                              y={yTop}
                              width={barW}
                              height={barH}
                              rx={4}
                              fill={barColor}
                            />
                            <text
                              x={x + barW / 2}
                              y={valJuta >= 0 ? yTop - 6 : yTop + barH + 12}
                              textAnchor="middle"
                              className="fill-slate-500 font-mono text-[9.5px] dark:fill-slate-400"
                            >
                              {formatJuta(rawVal)}
                            </text>
                          </g>
                        );
                      })}
                      <text
                        x={chartGeometry.padL + i * colW + colW / 2}
                        y={chartGeometry.H - 10}
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
                })
              ) : (
                <>
                  {actualSeriesMeta
                    .filter((s) => visibleSeries[s.key])
                    .map((s) => {
                      const pts = enrichedData.map((d, i) => {
                        const raw =
                          s.key === 'revenue'
                            ? d.revenue
                            : s.key === 'bop'
                            ? d.bop
                            : d.margin;
                        const valJuta = raw / 1e6;
                        return {
                          x: chartGeometry.padL + i * colW + colW / 2,
                          y: chartGeometry.yFor(valJuta),
                          raw,
                          valJuta,
                          month: d.month,
                        };
                      });
                      const pathD = pts
                        .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
                        .join(' ');
                      return (
                        <g key={s.key}>
                          <path
                            d={pathD}
                            fill="none"
                            stroke={s.color}
                            strokeWidth={2.75}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="pointer-events-none"
                          />
                          {pts.map((pt, idx) => {
                            const [yr, mo] = pt.month.split('-').map(Number);
                            const isFutureMonth = yr > new Date().getFullYear() || (yr === new Date().getFullYear() && mo > new Date().getMonth() + 1);
                            const isSel = selectedMonth.length > 0 && !selectedMonth.includes(pt.month);
                            const ptOpacity = isFutureMonth ? 0.45 : isSel ? 0.35 : 1;
                            return (
                            <g
                              key={pt.month}
                              className="cursor-pointer"
                              opacity={ptOpacity}
                              onMouseEnter={() => setHoveredIdx(idx)}
                              onClick={() =>
                                onSelectMonth(
                                  selectedMonth.includes(pt.month)
                                    ? selectedMonth.filter((m) => m !== pt.month)
                                    : [...selectedMonth, pt.month].sort()
                                )
                              }
                            >
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={hoveredIdx === idx || selectedMonth.includes(pt.month) ? 6 : 4}
                                fill={s.color}
                                stroke="#ffffff"
                                strokeWidth={2}
                              />
                              {(s.key === 'revenue' ||
                                hoveredIdx === idx ||
                                selectedMonth.includes(pt.month)) && (
                                <text
                                  x={pt.x}
                                  y={pt.y - 10}
                                  textAnchor="middle"
                                  className="pointer-events-none fill-slate-500 font-mono text-[9.5px] dark:fill-slate-400"
                                >
                                  {formatJuta(pt.raw)}
                                </text>
                              )}
                            </g>
                          );
                          })}
                        </g>
                      );
                    })}
                  {enrichedData.map((d, i) => (
                    <text
                      key={d.month}
                      x={chartGeometry.padL + i * colW + colW / 2}
                      y={chartGeometry.H - 10}
                      textAnchor="middle"
                      className={`text-[11px] ${
                        selectedMonth.includes(d.month)
                          ? 'fill-teal-700 font-semibold dark:fill-teal-400'
                          : 'fill-slate-500 font-medium dark:fill-slate-400'
                      }`}
                    >
                      {d.label}
                    </text>
                  ))}
                </>
              )}

              {/* Target Line Overlay (dashed line in both Batang & Garis modes) */}
              {visibleSeries.target && targetPoints.length > 0 && (
                <g className="pointer-events-none">
                  <path
                    d={targetPathD}
                    fill="none"
                    stroke={activeTargetMeta.color}
                    strokeWidth={2.4}
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {targetPoints.map((pt) => {
                    const isActive =
                      hoveredIdx === pt.idx || selectedMonth.includes(pt.month);
                    const isDimmed =
                      selectedMonth.length > 0 && !selectedMonth.includes(pt.month);
                    return (
                      <g key={`target-${pt.month}`} opacity={isDimmed ? 0.35 : 1}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isActive ? 5.5 : 4}
                          fill="#ffffff"
                          stroke={activeTargetMeta.color}
                          strokeWidth={2.25}
                        />
                        <text
                          x={pt.x}
                          y={pt.y - 11}
                          textAnchor="middle"
                          style={{ paintOrder: 'stroke' }}
                          strokeWidth={3.5}
                          fill={activeTargetMeta.color}
                          className="stroke-white font-mono text-[9.5px] font-semibold dark:stroke-slate-900"
                        >
                          {formatJuta(pt.raw)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}
            </svg>
          </div>
        </div>
      )}
    </section>
  );
};
