import jsPDF from 'jspdf';
import type { ModaKey } from '../types/logistics';
import { formatInt, formatJuta, formatMiliar } from './formatters';

export interface PdfPeriodRow {
  key: 'D1' | 'D2' | 'D3';
  title: string;
  rangeLabel: string;
  days: number;
  revenue: number;
  bop: number;
  margin: number;
  marginPct: number | null;
  soCount: number;
  doCount: number;
  unitQty: number;
  target: number;
  achievePct: number | null;
  growthVsPrevPct: number | null;
}

export interface PdfModaRow {
  moda: ModaKey;
  revenue: number;
  bop: number;
  margin: number;
  marginPct: number | null;
  sharePct: number;
  soCount: number;
  doCount: number;
  unitQty: number;
}

export interface PdfCustomerRow {
  customer: string;
  revenue: number;
  bop: number;
  margin: number;
  soCount: number;
  doCount: number;
  unitQty: number;
}

export interface TenDaysPdfPayload {
  reportMonth: string;
  monthLabel: string;
  scopeLabel: string;
  activePeriodLabel: string;
  daysInMonth: number;
  monthTarget: number;
  isPartialModaFilter: boolean;
  summary: {
    revenue: number;
    bop: number;
    margin: number;
    marginPct: number | null;
    soCount: number;
    doCount: number;
    unitQty: number;
    achievePct: number | null;
    remainingTarget: number;
    surplusTarget: number;
    elapsedDays: number;
    remainingDays: number;
    avgPerDay: number;
    projectedEom: number;
    requiredPerDay: number;
  };
  periods: PdfPeriodRow[];
  modaBreakdown: PdfModaRow[];
  topCustomers: PdfCustomerRow[];
  topRoutes: Array<{
    route: string;
    rev: number;
    bop: number;
    margin: number;
    soCount: number;
    doCount: number;
    unitQty: number;
  }>;
}

const MODA_TONE: Record<ModaKey, string> = {
  'Self Drive': '#CBD5E1',
  'Car Carrier': '#64748B',
  Shipment: '#334155',
  Transporter: '#0F766E',
};

/**
 * Shared high-resolution A4 Landscape canvas renderer (1782 x 1260 px = 6 px/mm)
 * Used by BOTH PDF and PNG exports so both outputs are 100% pixel-identical.
 */
function renderTenDaysCanvas(payload: TenDaysPdfPayload): HTMLCanvasElement {
  const {
    monthLabel,
    scopeLabel,
    activePeriodLabel,
    daysInMonth,
    monthTarget,
    isPartialModaFilter,
    summary,
    periods,
    modaBreakdown,
    topCustomers,
    topRoutes,
  } = payload;

  // Exact A4 Landscape aspect ratio (297 x 210 mm) at 6 px/mm logical, 2x Super HD (3564 x 2520 px, ~305 DPI)
  const S = 6;
  const DPR = 2;
  const W = 297 * S; // 1782 logical
  const H = 210 * S; // 1260 logical
  const mX = 10 * S; // 60
  const cW = W - mX * 2; // 1662

  const canvas = document.createElement('canvas');
  canvas.width = W * DPR; // 3564 px Super HD
  canvas.height = H * DPR; // 2520 px Super HD
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(DPR, DPR);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const font = (sizePt: number, weight: 'normal' | 'bold' = 'normal') =>
    `${weight} ${Math.round(sizePt * 2.1)}px Inter, "Segoe UI", system-ui, sans-serif`;

  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const drawHeading = (x: number, y: number, num: string, title: string) => {
    ctx.fillStyle = '#0F766E';
    ctx.font = font(8.8, 'bold');
    ctx.fillText(`${num}.`, x, y);
    ctx.fillStyle = '#0F172A';
    ctx.font = font(8.8, 'bold');
    ctx.fillText(title, x + 28, y);
  };

  const drawTable = (opts: {
    x: number;
    y: number;
    w: number;
    headers: string[];
    rows: string[][];
    foot?: string[];
    colWidths: number[]; // fractions summing to 1
    aligns: Array<'left' | 'center' | 'right'>;
    rowH?: number;
    headerH?: number;
    fontSize?: number;
    boldCols?: number[];
  }) => {
    const {
      x,
      y,
      w,
      headers,
      rows,
      foot,
      colWidths,
      aligns,
      rowH = 26,
      headerH = 28,
      fontSize = 6.7,
      boldCols = [],
    } = opts;

    const colX: number[] = [];
    let accX = x;
    colWidths.forEach((frac) => {
      colX.push(accX);
      accX += frac * w;
    });

    const drawCellText = (
      text: string,
      colIdx: number,
      rowTop: number,
      h: number,
      color: string,
      weight: 'normal' | 'bold'
    ) => {
      const cx = colX[colIdx];
      const cw = colWidths[colIdx] * w;
      const align = aligns[colIdx];
      ctx.fillStyle = color;
      ctx.font = font(fontSize, weight);
      ctx.textAlign = align;
      const pad = 8;
      const maxTextW = Math.max(20, cw - pad * 2);
      let display = text;
      if (ctx.measureText(display).width > maxTextW) {
        while (display.length > 3 && ctx.measureText(`${display}…`).width > maxTextW) {
          display = display.slice(0, -1);
        }
        display = `${display}…`;
      }
      const tx = align === 'left' ? cx + pad : align === 'right' ? cx + cw - pad : cx + cw / 2;
      ctx.fillText(display, tx, rowTop + h / 2 + fontSize * 0.72);
      ctx.textAlign = 'left';
    };

    // Header
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(x, y, w, headerH);
    headers.forEach((hText, i) => drawCellText(hText, i, y, headerH, '#FFFFFF', 'bold'));

    // Body
    let curY = y + headerH;
    rows.forEach((r, rIdx) => {
      ctx.fillStyle = rIdx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
      ctx.fillRect(x, curY, w, rowH);
      r.forEach((cell, cIdx) => {
        const isBold = boldCols.includes(cIdx);
        drawCellText(cell, cIdx, curY, rowH, isBold ? '#0F172A' : '#475569', isBold ? 'bold' : 'normal');
      });
      curY += rowH;
    });

    // Footer row
    if (foot) {
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(x, curY, w, rowH + 2);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, curY);
      ctx.lineTo(x + w, curY);
      ctx.stroke();
      foot.forEach((cell, cIdx) => drawCellText(cell, cIdx, curY, rowH + 2, '#0F172A', 'bold'));
      curY += rowH + 2;
    }

    // Outer border
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, w, curY - y);

    return curY;
  };

  // White Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  const generatedAt = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // ============================================================================
  // 1. CLEAN MINIMALIST HEADER
  // ============================================================================
  ctx.fillStyle = '#0F172A';
  ctx.font = font(14.5, 'bold');
  ctx.fillText('TEN DAYS SALES REPORT', mX, 65);

  ctx.fillStyle = '#64748B';
  ctx.font = font(8, 'normal');
  ctx.fillText('Penjualan Logistics Jakarta  ·  Ringkasan Performa 10 Harian', mX, 94);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#334155';
  ctx.font = font(8.2, 'bold');
  ctx.fillText(`${monthLabel} - Dicetak: ${generatedAt}`, W - mX, 82);
  ctx.textAlign = 'left';

  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(mX, 118);
  ctx.lineTo(W - mX, 118);
  ctx.stroke();

  // ============================================================================
  // 2. 4-COLUMN EXECUTIVE KPI STRIP
  // ============================================================================
  const kpiY = 138;
  const kpiGap = 24;
  const kpiW = (cW - kpiGap * 3) / 4;
  const kpiH = 108;

  const kpiCards = [
    {
      label: 'TOTAL REVENUE',
      value: formatMiliar(summary.revenue),
      badge:
        !isPartialModaFilter && summary.achievePct !== null
          ? `${summary.achievePct.toFixed(1)}% target`
          : `${formatInt(summary.soCount)} SO`,
      sub: `Target ${formatMiliar(monthTarget)}`,
      highlight: true,
    },
    {
      label: 'MARGIN KOTOR',
      value: formatMiliar(summary.margin),
      badge: summary.marginPct !== null ? `${summary.marginPct.toFixed(1)}% mgn` : '-',
      sub: `BOP ${formatMiliar(summary.bop)}`,
      highlight: false,
    },
    {
      label: 'PROYEKSI EOM',
      value: formatMiliar(summary.projectedEom),
      badge: `s/d Tgl ${summary.elapsedDays || '-'}`,
      sub: `Avg Rp${formatJuta(summary.avgPerDay)} jt/hari`,
      highlight: false,
    },
    {
      label: summary.remainingTarget > 0 ? 'SISA TARGET' : 'SURPLUS TARGET',
      value:
        summary.remainingTarget > 0
          ? formatMiliar(summary.remainingTarget)
          : `+${formatMiliar(summary.surplusTarget)}`,
      badge:
        summary.unitQty > 0
          ? `${formatInt(summary.soCount)} SO · ${formatInt(summary.unitQty)} ${scopeLabel === 'Transporter' ? 'trip' : scopeLabel === 'VLI' ? 'unit' : 'unit/trip'}`
          : `${formatInt(summary.soCount)} SO · ${formatInt(summary.doCount)} DO`,
      sub:
        summary.remainingTarget > 0 && summary.remainingDays > 0
          ? `Butuh Rp${formatJuta(summary.requiredPerDay)} jt/hari`
          : 'Target bulanan tercapai',
      highlight: false,
    },
  ];

  kpiCards.forEach((card, idx) => {
    const x = mX + idx * (kpiW + kpiGap);
    roundRect(x, kpiY, kpiW, kpiH, 8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (card.highlight) {
      ctx.fillStyle = '#0F766E';
      ctx.fillRect(x, kpiY + 4, 6, kpiH - 8);
    }

    ctx.fillStyle = '#64748B';
    ctx.font = font(6.4, 'bold');
    ctx.fillText(card.label, x + 20, kpiY + 28);

    ctx.textAlign = 'right';
    ctx.fillStyle = card.highlight ? '#0F766E' : '#475569';
    ctx.font = font(6.8, 'bold');
    ctx.fillText(card.badge, x + kpiW - 16, kpiY + 28);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#0F172A';
    ctx.font = font(12.2, 'bold');
    ctx.fillText(card.value, x + 20, kpiY + 68);

    ctx.fillStyle = '#64748B';
    ctx.font = font(6.9, 'normal');
    ctx.fillText(card.sub, x + 20, kpiY + 94);
  });

  // ============================================================================
  // 3. TWO-COLUMN MAIN DASHBOARD GRID
  // ============================================================================
  const leftX = mX;
  const leftW = 888;
  const colGap = 30;
  const rightX = leftX + leftW + colGap;
  const rightW = cW - leftW - colGap;

  // --- LEFT (1): Vector Bar Chart ---
  drawHeading(leftX, 284, '1', 'Grafik Revenue vs Target per 10 Hari');

  const chartY = 298;
  const chartH = 246;
  roundRect(leftX, chartY, leftW, chartH, 8);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Legend
  ctx.fillStyle = '#0F766E';
  ctx.fillRect(leftX + leftW - 320, chartY + 16, 14, 12);
  ctx.fillStyle = '#475569';
  ctx.font = font(6.6, 'normal');
  ctx.fillText('Aktual Revenue', leftX + leftW - 298, chartY + 27);

  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(leftX + leftW - 168, chartY + 16, 14, 12);
  ctx.fillStyle = '#475569';
  ctx.fillText('Target Prop.', leftX + leftW - 146, chartY + 27);

  const plotL = leftX + 94;
  const plotR = leftX + leftW - 28;
  const plotT = chartY + 52;
  const plotB = chartY + chartH - 52;
  const plotH = plotB - plotT;
  const maxVal = Math.max(1, ...periods.flatMap((p) => [p.revenue, p.target])) * 1.2;

  for (let i = 0; i <= 3; i++) {
    const ratio = i / 3;
    const gy = plotB - ratio * plotH;
    ctx.strokeStyle = '#F1F5F9';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(plotL, gy);
    ctx.lineTo(plotR, gy);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748B';
    ctx.font = font(6, 'normal');
    ctx.fillText(`${formatJuta(ratio * maxVal)} jt`, plotL - 10, gy + 4);
  }
  ctx.textAlign = 'left';

  const [repY, repM] = payload.reportMonth.split('-').map(Number);
  const nowDate = new Date();
  const todayMidnight = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());

  const groupW = (plotR - plotL) / 3;
  const barW = 68;
  const barGap = 14;
  periods.forEach((p, idx) => {
    const startDay = p.key === 'D1' ? 1 : p.key === 'D2' ? 11 : 21;
    const periodStart =
      Number.isFinite(repY) && Number.isFinite(repM)
        ? new Date(repY, repM - 1, startDay)
        : null;
    const isUpcoming = periodStart !== null && periodStart > todayMidnight && p.revenue === 0;

    const cx = plotL + idx * groupW + groupW / 2;
    const rx = cx - barW - barGap / 2;
    const tx = cx + barGap / 2;
    const rh = p.revenue > 0 ? Math.max(4, (p.revenue / maxVal) * plotH) : 2;
    const th = Math.max(4, (p.target / maxVal) * plotH);

    ctx.save();
    if (isUpcoming) ctx.globalAlpha = 0.35;

    ctx.fillStyle = '#0F766E';
    ctx.fillRect(rx, plotB - rh, barW, rh);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(tx, plotB - th, barW, th);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#0F172A';
    ctx.font = font(6.4, 'bold');
    ctx.fillText(`${formatJuta(p.revenue)}`, rx + barW / 2, plotB - rh - 7);
    ctx.fillStyle = '#64748B';
    ctx.font = font(6.4, 'normal');
    ctx.fillText(`${formatJuta(p.target)}`, tx + barW / 2, plotB - th - 7);

    ctx.fillStyle = '#0F172A';
    ctx.font = font(6.9, 'bold');
    ctx.fillText(p.title, cx, plotB + 22);
    ctx.fillStyle = '#64748B';
    ctx.font = font(5.9, 'normal');
    ctx.fillText(p.rangeLabel, cx, plotB + 40);

    ctx.restore();
  });
  ctx.textAlign = 'left';

  // --- LEFT (2): Tabel Perbandingan Per 10 Hari ---
  drawHeading(leftX, 584, '2', 'Tabel Perbandingan Per 10 Hari (1–10, 11–20, 21–EOM)');

  drawTable({
    x: leftX,
    y: 598,
    w: leftW,
    headers: ['Periode', 'Tanggal', 'Target', 'Revenue', '% Tgt', 'BOP', 'Margin', '% Mgn', 'Unit (Trip)', 'SO/DO'],
    rows: periods.map((p) => [
      p.title,
      p.rangeLabel.replace('Tgl ', ''),
      `${formatJuta(p.target)}`,
      `${formatJuta(p.revenue)}`,
      !isPartialModaFilter && p.achievePct !== null ? `${p.achievePct.toFixed(1)}%` : '-',
      `${formatJuta(p.bop)}`,
      `${formatJuta(p.margin)}`,
      p.marginPct !== null ? `${p.marginPct.toFixed(1)}%` : '-',
      p.unitQty > 0 ? formatInt(p.unitQty) : '-',
      `${formatInt(p.soCount)}/${formatInt(p.doCount)}`,
    ]),
    foot: [
      'Total',
      `1–${daysInMonth}`,
      `${formatJuta(monthTarget)}`,
      `${formatJuta(summary.revenue)}`,
      !isPartialModaFilter && summary.achievePct !== null ? `${summary.achievePct.toFixed(1)}%` : '-',
      `${formatJuta(summary.bop)}`,
      `${formatJuta(summary.margin)}`,
      summary.marginPct !== null ? `${summary.marginPct.toFixed(1)}%` : '-',
      summary.unitQty > 0 ? formatInt(summary.unitQty) : '-',
      `${formatInt(summary.soCount)}/${formatInt(summary.doCount)}`,
    ],
    colWidths: [0.11, 0.13, 0.095, 0.105, 0.075, 0.095, 0.10, 0.08, 0.095, 0.115],
    aligns: ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'],
    rowH: 34,
    headerH: 34,
    fontSize: 6.8,
    boldCols: [0, 3],
  });

  // --- LEFT (3): Breakdown per Moda ---
  drawHeading(leftX, 838, '3', `Breakdown per Moda — ${activePeriodLabel}`);

  // Stacked bar
  const stackY = 852;
  const stackH = 22;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(leftX, stackY, leftW, stackH);
  let curX = leftX;
  modaBreakdown.forEach((m) => {
    const segW = (m.sharePct / 100) * leftW;
    if (segW > 2) {
      ctx.fillStyle = MODA_TONE[m.moda];
      ctx.fillRect(curX, stackY, segW, stackH);
      curX += segW;
    }
  });

  drawTable({
    x: leftX,
    y: 888,
    w: leftW,
    headers: ['Moda', 'Revenue (jt)', 'Share', 'BOP (jt)', 'Margin (jt)', '% Mgn', 'Unit (Trip)', 'SO / DO'],
    rows: modaBreakdown.map((m) => [
      m.moda,
      `${formatJuta(m.revenue)} jt`,
      `${m.sharePct.toFixed(1)}%`,
      `${formatJuta(m.bop)} jt`,
      `${formatJuta(m.margin)} jt`,
      m.marginPct !== null ? `${m.marginPct.toFixed(1)}%` : '-',
      m.unitQty > 0 ? `${formatInt(m.unitQty)} ${m.moda === 'Transporter' ? 'trip' : 'unit'}` : '-',
      `${formatInt(m.soCount)} / ${formatInt(m.doCount)}`,
    ]),
    colWidths: [0.17, 0.14, 0.085, 0.135, 0.135, 0.085, 0.12, 0.13],
    aligns: ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right'],
    rowH: 34,
    headerH: 34,
    fontSize: 6.8,
    boldCols: [0, 1],
  });

  // --- RIGHT: Ringkasan Eksekutif ---
  const bestPeriod = [...periods].sort((a, b) => b.revenue - a.revenue)[0];
  const topModa = [...modaBreakdown].sort((a, b) => b.revenue - a.revenue)[0];
  const insightLines = [
    `• Periode tertinggi: ${bestPeriod.title} (${bestPeriod.rangeLabel}) sebesar Rp${formatJuta(bestPeriod.revenue)} jt (${formatInt(bestPeriod.soCount)} SO).`,
    summary.remainingTarget > 0
      ? `• Capaian ${summary.achievePct !== null ? `${summary.achievePct.toFixed(1)}%` : '-'} target; sisa ${formatMiliar(summary.remainingTarget)}${summary.remainingDays > 0 ? ` (butuh Rp${formatJuta(summary.requiredPerDay)} jt/hr)` : ''}.`
      : `• Target bulanan tercapai (${summary.achievePct !== null ? `${summary.achievePct.toFixed(1)}%` : '-'}) dengan surplus +${formatMiliar(summary.surplusTarget)}.`,
    topModa && topModa.revenue > 0
      ? `• Kontributor utama: ${topModa.moda} (Rp${formatJuta(topModa.revenue)} jt · ${topModa.sharePct.toFixed(1)}%).`
      : `• Belum ada transaksi aktif pada periode yang dipilih.`,
  ];

  const insY = 272;
  const insH = 142;
  roundRect(rightX, insY, rightW, insH, 8);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.fillStyle = '#0F766E';
  ctx.fillRect(rightX, insY + 4, 6, insH - 8);

  ctx.fillStyle = '#0F172A';
  ctx.font = font(7.2, 'bold');
  ctx.fillText('RINGKASAN EKSEKUTIF', rightX + 20, insY + 26);

  ctx.fillStyle = '#475569';
  ctx.font = font(6.4, 'normal');
  insightLines.forEach((line, idx) => {
    const trimmed = line.length > 86 ? `${line.slice(0, 85)}…` : line;
    ctx.fillText(trimmed, rightX + 20, insY + 56 + idx * 30);
  });

  // --- RIGHT (4): Top 10 Customer ---
  const periodTotalRev = modaBreakdown.reduce((s, m) => s + m.revenue, 0);
  drawHeading(rightX, 448, '4', `Top 10 Customer — ${activePeriodLabel}`);

  const afterCustY = drawTable({
    x: rightX,
    y: 462,
    w: rightW,
    headers: ['#', 'Customer', 'Rev (jt)', 'Share', 'Margin', '% Mgn', 'SO/DO'],
    rows:
      topCustomers.length > 0
        ? topCustomers.slice(0, 10).map((c, idx) => [
            String(idx + 1),
            c.customer,
            `${formatJuta(c.revenue)}`,
            periodTotalRev > 0 ? `${((c.revenue / periodTotalRev) * 100).toFixed(1)}%` : '-',
            `${formatJuta(c.margin)}`,
            c.revenue > 0 ? `${((c.margin / c.revenue) * 100).toFixed(1)}%` : '-',
            `${formatInt(c.soCount)}/${formatInt(c.doCount)}`,
          ])
        : [['-', 'Belum ada transaksi pada periode ini', '-', '-', '-', '-', '-']],
    colWidths: [0.04, 0.54, 0.09, 0.07, 0.09, 0.07, 0.10],
    aligns: ['center', 'left', 'right', 'right', 'right', 'right', 'right'],
    rowH: 31,
    headerH: 30,
    fontSize: 6.2,
    boldCols: [1, 2],
  });

  // --- RIGHT (5): Top Rute Pengiriman ---
  const routeY = Math.max(afterCustY + 34, 838);
  drawHeading(rightX, routeY, '5', `Top Rute Pengiriman — ${activePeriodLabel}`);

  drawTable({
    x: rightX,
    y: routeY + 14,
    w: rightW,
    headers: ['#', 'Rute Pengiriman', 'Rev (jt)', 'Share', 'Margin', '% Mgn', 'SO/DO'],
    rows:
      topRoutes.length > 0
        ? topRoutes.slice(0, 6).map((r, idx) => {
            const cleanRoute = r.route.replace('→', '->');
            return [
              String(idx + 1),
              cleanRoute,
              `${formatJuta(r.rev)}`,
              periodTotalRev > 0 ? `${((r.rev / periodTotalRev) * 100).toFixed(1)}%` : '-',
              `${formatJuta(r.margin)}`,
              r.rev > 0 ? `${((r.margin / r.rev) * 100).toFixed(1)}%` : '-',
              `${formatInt(r.soCount)}/${formatInt(r.doCount)}`,
            ];
          })
        : [['-', 'Belum ada data rute pada periode ini', '-', '-', '-', '-', '-']],
    colWidths: [0.04, 0.54, 0.09, 0.07, 0.09, 0.07, 0.10],
    aligns: ['center', 'left', 'right', 'right', 'right', 'right', 'right'],
    rowH: 31,
    headerH: 30,
    fontSize: 6.2,
    boldCols: [1, 2],
  });

  // ============================================================================
  // 4. SINGLE-PAGE RUNNING FOOTER
  // ============================================================================
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(mX, H - 54);
  ctx.lineTo(W - mX, H - 54);
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = font(6.8, 'normal');
  ctx.fillText(
    `Penjualan Logistics Jakarta  ·  Ten Days Report (${monthLabel})  ·  Nilai dalam Juta Rupiah (jt) kecuali dinyatakan lain`,
    mX,
    H - 28
  );
  ctx.textAlign = 'right';
  ctx.fillText('Halaman 1 dari 1', W - mX, H - 28);
  ctx.textAlign = 'left';

  return canvas;
}

/**
 * Export 1-page A4 Landscape PDF — pixel-identical to PNG export, compressed for small file size (~400 KB)
 */
export function exportTenDaysReportPdf(payload: TenDaysPdfPayload): void {
  const canvas = renderTenDaysCanvas(payload);
  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  doc.addImage(imgData, 'JPEG', 0, 0, 297, 210, undefined, 'FAST');
  doc.save(`Ten_Days_Report_${payload.reportMonth}.pdf`);
}

/**
 * Export high-resolution PNG image — pixel-identical to PDF export
 */
export function exportTenDaysReportImage(payload: TenDaysPdfPayload): void {
  const canvas = renderTenDaysCanvas(payload);
  const link = document.createElement('a');
  link.download = `Ten_Days_Report_${payload.reportMonth}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
