import type { RawDeliveryLine } from '../data/initialLogisticsData';

const MONTHS_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('id-ID');
}

export function formatJuta(n: number): string {
  return Math.round(n / 1e6).toLocaleString('id-ID');
}

export function formatMiliar(n: number): string {
  return `Rp${(n / 1e9).toFixed(2)} M`;
}

export function formatRupiahShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) {
    return `${sign}Rp${(abs / 1e9).toFixed(2)} M`;
  }
  if (abs >= 1e6) {
    return `${sign}Rp${(abs / 1e6).toFixed(1)} jt`;
  }
  return `${sign}Rp${Math.round(abs).toLocaleString('id-ID')}`;
}

export function formatMarginPct(rev: number, bop: number): string {
  if (rev <= 0) return '-';
  return `${(((rev - bop) / rev) * 100).toFixed(1)}%`;
}

export function formatMonthLabel(ym: string): string {
  if (!ym || ym.length < 7) return ym;
  const monthIdx = parseInt(ym.slice(5, 7), 10) - 1;
  const year = ym.slice(0, 4);
  return `${MONTHS_ID[monthIdx] ?? ym.slice(5, 7)} ${year}`;
}

export function calcAgeDays(refDate: string, targetDate: string): number {
  if (!refDate || !targetDate) return 0;
  const diff = new Date(refDate).getTime() - new Date(targetDate).getTime();
  return Math.max(0, Math.round(diff / 86400000));
}

export function getSoBillingStatus(lines: RawDeliveryLine[]): 'Billed' | 'Unbilled' | 'Campuran' {
  const billedCount = lines.filter((l) => l[6] === 'Fully Invoiced').length;
  if (billedCount === lines.length && lines.length > 0) return 'Billed';
  if (billedCount === 0) return 'Unbilled';
  return 'Campuran';
}

import * as XLSX from 'xlsx';

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export type ExcelCellValue = string | number | Date | null | undefined;

export function toExcelDate(isoDate?: string | null): Date | string {
  if (!isoDate) return '';
  const match = String(isoDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return isoDate;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (!year || !month || !day) return isoDate;
  // Use local noon to prevent UTC timezone offset from shifting the calendar date
  return new Date(year, month - 1, day, 12, 0, 0);
}

function buildWorksheet(
  headers: string[],
  rows: Array<Array<ExcelCellValue>>
): XLSX.WorkSheet {
  const aoa: Array<Array<ExcelCellValue>> = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });

  // Format all Date cells as native Excel dates (dd/mm/yyyy)
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = worksheet[cellAddress];
      if (cell && cell.t === 'd') {
        cell.z = 'dd/mm/yyyy';
      }
    }
  }

  // Auto-size columns so dates and numbers never render as ###
  worksheet['!cols'] = headers.map((h, colIdx) => {
    let maxLen = h.length;
    for (let r = 0; r < Math.min(rows.length, 200); r++) {
      const val = rows[r]?.[colIdx];
      if (val instanceof Date) {
        maxLen = Math.max(maxLen, 12);
      } else if (val !== null && val !== undefined) {
        maxLen = Math.max(maxLen, Math.min(45, String(val).length));
      }
    }
    return { wch: Math.max(12, maxLen + 2) };
  });

  return worksheet;
}

export function downloadExcelWorkbook(
  filename: string,
  sheets: Array<{
    name: string;
    headers: string[];
    rows: Array<Array<ExcelCellValue>>;
  }>
) {
  const workbook = XLSX.utils.book_new();
  sheets.forEach((s, idx) => {
    const ws = buildWorksheet(s.headers, s.rows);
    const safeName = (s.name || `Sheet${idx + 1}`).slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, ws, safeName);
  });
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, {
    cellDates: true,
  });
}

export function downloadExcelXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: Array<Array<ExcelCellValue>>
) {
  downloadExcelWorkbook(filename, [{ name: sheetName || 'Data', headers, rows }]);
}
