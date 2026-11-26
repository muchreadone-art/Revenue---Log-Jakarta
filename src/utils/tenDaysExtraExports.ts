import * as XLSX from 'xlsx';
import { formatInt, formatJuta, formatMiliar } from './formatters';
import type { TenDaysPdfPayload } from './tenDaysPdfExport';

/**
 * Export Ten Days Report as a multi-sheet Excel (.xlsx) workbook
 */
export function exportTenDaysReportExcel(payload: TenDaysPdfPayload): void {
  const {
    reportMonth,
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

  const wb = XLSX.utils.book_new();
  const periodTotalRev = modaBreakdown.reduce((s, m) => s + m.revenue, 0);

  // Sheet 1: Ringkasan & Per 10 Hari
  const sheet1Data: (string | number)[][] = [
    ['TEN DAYS SALES REPORT — PENJUALAN LOGISTICS JAKARTA'],
    [`Periode: ${monthLabel}`, `Produk: ${scopeLabel}`, `Fokus: ${activePeriodLabel}`],
    [],
    ['RINGKASAN BULANAN'],
    ['Total Revenue', 'Target Bulanan', '% Target', 'Total BOP', 'Margin Kotor', '% Margin', 'Proyeksi EOM', 'Total SO', 'Total DO', 'Total Unit (Trip)'],
    [
      summary.revenue,
      monthTarget,
      !isPartialModaFilter && summary.achievePct !== null ? Number(summary.achievePct.toFixed(1)) : '-',
      summary.bop,
      summary.margin,
      summary.marginPct !== null ? Number(summary.marginPct.toFixed(1)) : '-',
      summary.projectedEom,
      summary.soCount,
      summary.doCount,
      summary.unitQty,
    ],
    [],
    ['PERBANDINGAN PER 10 HARI (1-10, 11-20, 21-EOM)'],
    ['Periode', 'Tanggal', 'Target (Rp)', 'Revenue (Rp)', '% Target', 'BOP (Rp)', 'Margin (Rp)', '% Margin', 'Unit (Trip)', 'SO', 'DO'],
    ...periods.map((p) => [
      p.title,
      p.rangeLabel,
      Math.round(p.target),
      Math.round(p.revenue),
      !isPartialModaFilter && p.achievePct !== null ? Number(p.achievePct.toFixed(1)) : '-',
      Math.round(p.bop),
      Math.round(p.margin),
      p.marginPct !== null ? Number(p.marginPct.toFixed(1)) : '-',
      p.unitQty,
      p.soCount,
      p.doCount,
    ]),
    [
      'Total Bulan',
      `Tgl 1 - ${daysInMonth}`,
      Math.round(monthTarget),
      Math.round(summary.revenue),
      !isPartialModaFilter && summary.achievePct !== null ? Number(summary.achievePct.toFixed(1)) : '-',
      Math.round(summary.bop),
      Math.round(summary.margin),
      summary.marginPct !== null ? Number(summary.marginPct.toFixed(1)) : '-',
      summary.unitQty,
      summary.soCount,
      summary.doCount,
    ],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  ws1['!cols'] = [
    { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 10 },
    { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan 10 Hari');

  // Sheet 2: Breakdown per Moda
  const sheet2Data: (string | number)[][] = [
    [`BREAKDOWN PER MODA — ${activePeriodLabel}`],
    [],
    ['Moda', 'Revenue (Rp)', 'Share (%)', 'BOP (Rp)', 'Margin (Rp)', '% Margin', 'Unit (Trip)', 'SO', 'DO'],
    ...modaBreakdown.map((m) => [
      m.moda,
      Math.round(m.revenue),
      Number(m.sharePct.toFixed(1)),
      Math.round(m.bop),
      Math.round(m.margin),
      m.marginPct !== null ? Number(m.marginPct.toFixed(1)) : '-',
      m.unitQty,
      m.soCount,
      m.doCount,
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  ws2['!cols'] = [
    { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Breakdown Moda');

  // Sheet 3: Top 10 Customer
  const sheet3Data: (string | number)[][] = [
    [`TOP 10 CUSTOMER — ${activePeriodLabel}`],
    [],
    ['#', 'Nama Customer', 'Revenue (Rp)', 'Share (%)', 'BOP (Rp)', 'Margin (Rp)', '% Margin', 'Unit (Trip)', 'SO', 'DO'],
    ...topCustomers.map((c, idx) => [
      idx + 1,
      c.customer,
      Math.round(c.revenue),
      periodTotalRev > 0 ? Number(((c.revenue / periodTotalRev) * 100).toFixed(1)) : 0,
      Math.round(c.bop),
      Math.round(c.margin),
      c.revenue > 0 ? Number(((c.margin / c.revenue) * 100).toFixed(1)) : '-',
      c.unitQty,
      c.soCount,
      c.doCount,
    ]),
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
  ws3['!cols'] = [
    { wch: 5 }, { wch: 36 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'Top 10 Customer');

  // Sheet 4: Top Rute Pengiriman
  const sheet4Data: (string | number)[][] = [
    [`TOP RUTE PENGIRIMAN — ${activePeriodLabel}`],
    [],
    ['#', 'Rute Pengiriman', 'Revenue (Rp)', 'Share (%)', 'BOP (Rp)', 'Margin (Rp)', '% Margin', 'Unit (Trip)', 'SO', 'DO'],
    ...topRoutes.map((r, idx) => [
      idx + 1,
      r.route,
      Math.round(r.rev),
      periodTotalRev > 0 ? Number(((r.rev / periodTotalRev) * 100).toFixed(1)) : 0,
      Math.round(r.bop),
      Math.round(r.margin),
      r.rev > 0 ? Number(((r.margin / r.rev) * 100).toFixed(1)) : '-',
      r.unitQty,
      r.soCount,
      r.doCount,
    ]),
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(sheet4Data);
  ws4['!cols'] = [
    { wch: 5 }, { wch: 36 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws4, 'Top Rute');

  XLSX.writeFile(wb, `Ten_Days_Report_${reportMonth}.xlsx`);
}

/**
 * Export Ten Days Report as a high-resolution PNG executive summary image (1600 x 1020)
 */
export function exportTenDaysReportImage(payload: TenDaysPdfPayload): void {
  const {
    reportMonth,
    monthLabel,
    scopeLabel,
    activePeriodLabel,
    monthTarget,
    isPartialModaFilter,
    summary,
    periods,
    modaBreakdown,
    topCustomers,
    topRoutes,
  } = payload;

  const W = 1600;
  const H = 1040;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const drawRoundRect = (x: number, y: number, w: number, h: number, r: number) => {
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

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = '#0F766E';
  ctx.fillRect(48, 34, 8, 56);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 30px Inter, system-ui, sans-serif';
  ctx.fillText('TEN DAYS SALES REPORT', 70, 62);

  ctx.fillStyle = '#64748B';
  ctx.font = '15px Inter, system-ui, sans-serif';
  ctx.fillText('Penjualan Logistics Jakarta  ·  Ringkasan Performa 10 Harian', 70, 86);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 17px Inter, system-ui, sans-serif';
  ctx.fillText(`${monthLabel}  ·  ${scopeLabel}`, W - 48, 60);
  ctx.fillStyle = '#64748B';
  ctx.font = '14px Inter, system-ui, sans-serif';
  ctx.fillText(`Fokus: ${activePeriodLabel}`, W - 48, 84);
  ctx.textAlign = 'left';

  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, 108);
  ctx.lineTo(W - 48, 108);
  ctx.stroke();

  // 4 KPI Cards
  const kpiY = 128;
  const kpiGap = 20;
  const kpiW = (W - 96 - kpiGap * 3) / 4;
  const kpiH = 104;

  const kpis = [
    {
      label: 'TOTAL REVENUE',
      value: formatMiliar(summary.revenue),
      badge: !isPartialModaFilter && summary.achievePct !== null ? `${summary.achievePct.toFixed(1)}% target` : `${formatInt(summary.soCount)} SO`,
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
      value: summary.remainingTarget > 0 ? formatMiliar(summary.remainingTarget) : `+${formatMiliar(summary.surplusTarget)}`,
      badge: `${formatInt(summary.soCount)} SO · ${formatInt(summary.doCount)} DO`,
      sub: summary.remainingTarget > 0 && summary.remainingDays > 0 ? `Butuh Rp${formatJuta(summary.requiredPerDay)} jt/hari` : 'Target bulanan tercapai',
      highlight: false,
    },
  ];

  kpis.forEach((k, idx) => {
    const x = 48 + idx * (kpiW + kpiGap);
    drawRoundRect(x, kpiY, kpiW, kpiH, 10);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (k.highlight) {
      ctx.fillStyle = '#0F766E';
      ctx.fillRect(x, kpiY + 6, 5, kpiH - 12);
    }

    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 12px Inter, system-ui, sans-serif';
    ctx.fillText(k.label, x + 18, kpiY + 28);

    ctx.textAlign = 'right';
    ctx.fillStyle = k.highlight ? '#0F766E' : '#475569';
    ctx.font = 'bold 13px Inter, system-ui, sans-serif';
    ctx.fillText(k.badge, x + kpiW - 16, kpiY + 28);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 28px Inter, system-ui, sans-serif';
    ctx.fillText(k.value, x + 18, kpiY + 66);

    ctx.fillStyle = '#64748B';
    ctx.font = '13px Inter, system-ui, sans-serif';
    ctx.fillText(k.sub, x + 18, kpiY + 90);
  });

  // Left Column: Chart + Moda
  const leftX = 48;
  const leftW = 740;
  const rightX = 816;
  const rightW = W - 48 - rightX;

  // Section 1: Bar Chart
  ctx.fillStyle = '#0F766E';
  ctx.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx.fillText('1.', leftX, 268);
  ctx.fillStyle = '#0F172A';
  ctx.fillText('Grafik Revenue vs Target per 10 Hari', leftX + 22, 268);

  drawRoundRect(leftX, 282, leftW, 240, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  const maxVal = Math.max(1, ...periods.flatMap((p) => [p.revenue, p.target])) * 1.22;
  const plotL = leftX + 76;
  const plotR = leftX + leftW - 24;
  const plotT = 324;
  const plotB = 472;
  const plotH = plotB - plotT;
  const groupW = (plotR - plotL) / 3;

  // Legend
  ctx.fillStyle = '#0F766E';
  ctx.fillRect(plotR - 250, 296, 12, 10);
  ctx.fillStyle = '#475569';
  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.fillText('Aktual Revenue', plotR - 232, 305);
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(plotR - 122, 296, 12, 10);
  ctx.fillStyle = '#475569';
  ctx.fillText('Target Prop.', plotR - 104, 305);

  for (let i = 0; i <= 3; i++) {
    const gy = plotB - (i / 3) * plotH;
    ctx.strokeStyle = '#F1F5F9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotL, gy);
    ctx.lineTo(plotR, gy);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748B';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText(`${formatJuta((i / 3) * maxVal)} jt`, plotL - 8, gy + 4);
  }
  ctx.textAlign = 'left';

  periods.forEach((p, idx) => {
    const cx = plotL + idx * groupW + groupW / 2;
    const bw = 44;
    const rh = Math.max(4, (p.revenue / maxVal) * plotH);
    const th = Math.max(4, (p.target / maxVal) * plotH);

    ctx.fillStyle = '#0F766E';
    ctx.fillRect(cx - bw - 5, plotB - rh, bw, rh);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(cx + 5, plotB - th, bw, th);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 12px Inter, system-ui, sans-serif';
    ctx.fillText(`${formatJuta(p.revenue)}`, cx - bw / 2 - 5, plotB - rh - 6);
    ctx.fillStyle = '#64748B';
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.fillText(`${formatJuta(p.target)}`, cx + bw / 2 + 5, plotB - th - 6);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 13px Inter, system-ui, sans-serif';
    ctx.fillText(p.title, cx, plotB + 20);
    ctx.fillStyle = '#64748B';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText(p.rangeLabel, cx, plotB + 36);
  });
  ctx.textAlign = 'left';

  // Section 2: Breakdown Moda (Left Bottom)
  ctx.fillStyle = '#0F766E';
  ctx.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx.fillText('2.', leftX, 560);
  ctx.fillStyle = '#0F172A';
  ctx.fillText(`Breakdown per Moda — ${activePeriodLabel}`, leftX + 22, 560);

  drawRoundRect(leftX, 574, leftW, 385, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  // Table header
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(leftX, 574, leftW, 34);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 12px Inter, system-ui, sans-serif';
  ctx.fillText('Moda', leftX + 16, 595);
  ctx.textAlign = 'right';
  ctx.fillText('Rev (jt)', leftX + 310, 595);
  ctx.fillText('Share', leftX + 400, 595);
  ctx.fillText('BOP (jt)', leftX + 510, 595);
  ctx.fillText('Margin (jt)', leftX + 630, 595);
  ctx.fillText('SO/DO', leftX + leftW - 16, 595);
  ctx.textAlign = 'left';

  modaBreakdown.forEach((m, idx) => {
    const ry = 608 + idx * 42;
    if (idx % 2 === 1) {
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(leftX + 1, ry, leftW - 2, 42);
    }
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 13px Inter, system-ui, sans-serif';
    ctx.fillText(m.moda, leftX + 16, ry + 26);
    ctx.textAlign = 'right';
    ctx.fillText(`${formatJuta(m.revenue)} jt`, leftX + 310, ry + 26);
    ctx.fillStyle = '#475569';
    ctx.font = '13px Inter, system-ui, sans-serif';
    ctx.fillText(`${m.sharePct.toFixed(1)}%`, leftX + 400, ry + 26);
    ctx.fillText(`${formatJuta(m.bop)} jt`, leftX + 510, ry + 26);
    ctx.fillStyle = '#0F172A';
    ctx.fillText(`${formatJuta(m.margin)} jt`, leftX + 630, ry + 26);
    ctx.fillStyle = '#475569';
    ctx.fillText(`${formatInt(m.soCount)}/${formatInt(m.doCount)}`, leftX + leftW - 16, ry + 26);
    ctx.textAlign = 'left';
  });

  // Top Rute inside Left Bottom below Moda
  const routeTitleY = 795;
  ctx.fillStyle = '#0F766E';
  ctx.font = 'bold 14px Inter, system-ui, sans-serif';
  ctx.fillText('Top 5 Rute Pengiriman', leftX + 16, routeTitleY);
  const periodTotalRev = modaBreakdown.reduce((s, m) => s + m.revenue, 0);
  topRoutes.slice(0, 5).forEach((r, idx) => {
    const ry = routeTitleY + 26 + idx * 28;
    const share = periodTotalRev > 0 ? ((r.rev / periodTotalRev) * 100).toFixed(1) : '0.0';
    ctx.fillStyle = '#0F172A';
    ctx.font = '12px Inter, system-ui, sans-serif';
    const label = `${idx + 1}. ${r.route.length > 38 ? `${r.route.slice(0, 37)}…` : r.route}`;
    ctx.fillText(label, leftX + 16, ry);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#334155';
    ctx.fillText(`Rp${formatJuta(r.rev)} jt (${share}%) · Mgn ${formatJuta(r.margin)} jt · ${formatInt(r.soCount)}/${formatInt(r.doCount)}`, leftX + leftW - 16, ry);
    ctx.textAlign = 'left';
  });

  // Right Column: Top 10 Customer
  ctx.fillStyle = '#0F766E';
  ctx.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx.fillText('3.', rightX, 268);
  ctx.fillStyle = '#0F172A';
  ctx.fillText(`Top 10 Customer — ${activePeriodLabel}`, rightX + 22, 268);

  drawRoundRect(rightX, 282, rightW, 677, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  ctx.fillStyle = '#1E293B';
  ctx.fillRect(rightX, 282, rightW, 34);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 12px Inter, system-ui, sans-serif';
  ctx.fillText('#  Customer', rightX + 14, 303);
  ctx.textAlign = 'right';
  ctx.fillText('Rev (jt)', rightX + 430, 303);
  ctx.fillText('Share', rightX + 510, 303);
  ctx.fillText('Margin', rightX + 610, 303);
  ctx.fillText('%Mgn', rightX + 675, 303);
  ctx.fillText('SO/DO', rightX + rightW - 14, 303);
  ctx.textAlign = 'left';

  topCustomers.slice(0, 10).forEach((c, idx) => {
    const ry = 316 + idx * 62;
    if (idx % 2 === 1) {
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(rightX + 1, ry, rightW - 2, 62);
    }
    const share = periodTotalRev > 0 ? ((c.revenue / periodTotalRev) * 100).toFixed(1) : '0.0';
    const mgnPct = c.revenue > 0 ? `${((c.margin / c.revenue) * 100).toFixed(1)}%` : '-';
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 13px Inter, system-ui, sans-serif';
    const name = c.customer.length > 28 ? `${c.customer.slice(0, 27)}…` : c.customer;
    ctx.fillText(`${idx + 1}. ${name}`, rightX + 14, ry + 36);

    ctx.textAlign = 'right';
    ctx.fillText(`${formatJuta(c.revenue)}`, rightX + 430, ry + 36);
    ctx.fillStyle = '#475569';
    ctx.font = '13px Inter, system-ui, sans-serif';
    ctx.fillText(`${share}%`, rightX + 510, ry + 36);
    ctx.fillStyle = '#0F172A';
    ctx.fillText(`${formatJuta(c.margin)}`, rightX + 610, ry + 36);
    ctx.fillStyle = '#475569';
    ctx.fillText(mgnPct, rightX + 675, ry + 36);
    ctx.fillText(`${formatInt(c.soCount)}/${formatInt(c.doCount)}`, rightX + rightW - 14, ry + 36);
    ctx.textAlign = 'left';
  });

  // Footer
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(48, H - 52);
  ctx.lineTo(W - 48, H - 52);
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = '13px Inter, system-ui, sans-serif';
  ctx.fillText(
    `Penjualan Logistics Jakarta  ·  Ten Days Report (${monthLabel})`,
    48,
    H - 26
  );

  // Trigger PNG download
  const link = document.createElement('a');
  link.download = `Ten_Days_Report_${reportMonth}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
