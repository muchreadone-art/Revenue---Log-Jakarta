import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Download,
  FileSpreadsheet,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { SalesOrderRecord } from '../types/logistics';
import {
  downloadExcelWorkbook,
  formatInt,
  formatMiliar,
  formatMonthLabel,
  toExcelDate,
} from '../utils/formatters';
import { computeCustomerSummary, computeModaSummary, computeMonthlyMetrics } from '../utils/logisticsEngine';

interface AiAssistantDrawerProps {
  allOrders: SalesOrderRecord[];
  minDate: string;
  maxDate: string;
}

interface ExcelExportSpec {
  shouldExport: boolean;
  title?: string;
  filename?: string;
  customerQueries?: string[];
  months?: string[];
  source?: string;
  groupBy?: string;
  columns?: string[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  excelExport?: ExcelExportSpec;
  isError?: boolean;
}

const SUGGESTED_PROMPTS = [
  'Sudah berapa total revenue, BOP, margin, dan Unit (Trip) sampai hari ini?',
  'Customer apa saja yang paling naik dan turun bulan ini?',
  'Minta data revenue, BOP, dan margin customer Fast Retailing 3 bulan terakhir dalam Excel',
  'Buatkan file Excel ringkasan performa per customer untuk semua bulan',
];

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      const isPositive = /^\+Rp|^\+\d/.test(inner);
      const isNegative = /^-Rp|^-\d/.test(inner);
      return (
        <strong
          key={idx}
          className={`font-semibold ${
            isPositive
              ? 'font-mono text-emerald-700 tabular-nums dark:text-emerald-400'
              : isNegative
              ? 'font-mono text-rose-600 tabular-nums dark:text-rose-400'
              : 'text-slate-900 dark:text-slate-50'
          }`}
        >
          {inner}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

const FormattedAiMessage: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i].trim();
    if (!raw) {
      i += 1;
      continue;
    }

    // Heading: ### or ##
    if (/^#{1,3}\s+/.test(raw)) {
      const title = raw.replace(/^#{1,3}\s+/, '');
      const lower = title.toLowerCase();
      const accent =
        lower.includes('naik') || lower.includes('gainer')
          ? 'text-emerald-700 border-emerald-200/80 dark:text-emerald-400 dark:border-emerald-800/60'
          : lower.includes('turun') || lower.includes('decliner')
          ? 'text-rose-700 border-rose-200/80 dark:text-rose-400 dark:border-rose-800/60'
          : 'text-teal-700 border-slate-200/80 dark:text-teal-400 dark:border-slate-700/80';

      blocks.push(
        <div
          key={`h-${i}`}
          className={`mt-3 first:mt-0 border-b pb-1 text-[11px] font-bold tracking-wide uppercase ${accent}`}
        >
          {renderInlineMarkdown(title)}
        </div>
      );
      i += 1;
      continue;
    }

    // Blockquote / Catatan
    if (raw.startsWith('>')) {
      const note = raw.replace(/^>\s*/, '');
      blocks.push(
        <div
          key={`q-${i}`}
          className="mt-2.5 rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200"
        >
          {renderInlineMarkdown(note)}
        </div>
      );
      i += 1;
      continue;
    }

    // Numbered list group
    if (/^\d+\.\s+/.test(raw)) {
      const items: Array<{ num: string; content: string }> = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const m = lines[i].trim().match(/^(\d+)\.\s+(.*)$/);
        if (m) items.push({ num: m[1], content: m[2] });
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="mt-1.5 space-y-1.5">
          {items.map((item, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2 rounded-lg bg-slate-50/90 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
            >
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-teal-700/10 font-mono text-[10px] font-bold text-teal-700 dark:bg-teal-400/15 dark:text-teal-400">
                {item.num}
              </span>
              <span className="min-w-0 flex-1">{renderInlineMarkdown(item.content)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Bullet list group
    if (/^[-•*]\s+/.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^[-•*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-•*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="mt-1.5 space-y-1">
          {items.map((item, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-700 dark:text-slate-200"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600 dark:bg-teal-400" />
              <span className="min-w-0 flex-1">{renderInlineMarkdown(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Regular paragraph
    blocks.push(
      <p
        key={`p-${i}`}
        className="mt-1.5 first:mt-0 text-xs leading-relaxed text-slate-700 dark:text-slate-200"
      >
        {renderInlineMarkdown(raw)}
      </p>
    );
    i += 1;
  }

  return <div className="space-y-1">{blocks}</div>;
};

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({
  allOrders,
  minDate,
  maxDate,
}) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Halo! Saya Asisten AI LogiFlow. Anda bisa menanyakan performa revenue, BOP, margin, tren customer naik/turun, atau meminta saya menyiapkan file Excel (.xlsx) untuk customer & periode tertentu.',
    },
  ]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, loading]);

  // Build compact, mathematically accurate context from allOrders
  const contextSummary = useMemo(() => {
    let totalRevenue = 0;
    let totalBop = 0;
    let totalBilled = 0;
    let totalUnbilled = 0;
    let totalUnitQty = 0;
    const doSet = new Set<string>();

    for (const o of allOrders) {
      totalRevenue += o.rev;
      totalBop += o.bop;
      totalBilled += o.billedVal;
      totalUnbilled += o.unbilledVal;
      totalUnitQty += o.totalUnitQty || 0;
      o.lines.forEach((l) => {
        if (l[0]) doSet.add(l[0]);
      });
    }

    const totalMargin = totalRevenue - totalBop;
    const monthly = computeMonthlyMetrics(allOrders).map((m) => ({
      month: m.month,
      label: m.label,
      revenue: Math.round(m.revenue),
      bop: Math.round(m.bop),
      margin: Math.round(m.margin),
      marginPct: m.marginPct !== null ? Number(m.marginPct.toFixed(1)) : null,
      soCount: m.soCount,
      doCount: m.doCount,
    }));

    const customers = computeCustomerSummary(allOrders)
      .sort((a, b) => b.revenue - a.revenue)
      .map((c) => ({
        customer: c.customer,
        soCount: c.soCount,
        unitQty: c.unitQty,
        revenue: Math.round(c.revenue),
        bop: Math.round(c.bop),
        margin: Math.round(c.margin),
        marginPct: c.marginPct !== null ? Number(c.marginPct.toFixed(1)) : null,
        billedRp: Math.round(c.billedRp),
        unbilledRp: Math.round(c.unbilledRp),
      }));

    // Compute MoM customer movers (latest active month vs previous active month)
    const activeMonths = monthly.filter((m) => m.revenue > 0).map((m) => m.month);
    const latestMonth = activeMonths[activeMonths.length - 1] || '';
    const prevMonth = activeMonths[activeMonths.length - 2] || '';

    let customerMoM: {
      latestMonth: string;
      prevMonth: string;
      topGainers: Array<{ customer: string; prevRev: number; latestRev: number; diff: number; pct: number | null }>;
      topDecliners: Array<{ customer: string; prevRev: number; latestRev: number; diff: number; pct: number | null }>;
    } | null = null;

    if (latestMonth && prevMonth) {
      const custMonthMap = new Map<string, { prev: number; latest: number }>();
      for (const o of allOrders) {
        if (o.month !== latestMonth && o.month !== prevMonth) continue;
        const entry = custMonthMap.get(o.customer) || { prev: 0, latest: 0 };
        if (o.month === prevMonth) entry.prev += o.rev;
        if (o.month === latestMonth) entry.latest += o.rev;
        custMonthMap.set(o.customer, entry);
      }
      const diffs = Array.from(custMonthMap.entries()).map(([customer, v]) => ({
        customer,
        prevRev: Math.round(v.prev),
        latestRev: Math.round(v.latest),
        diff: Math.round(v.latest - v.prev),
        pct: v.prev > 0 ? Number((((v.latest - v.prev) / v.prev) * 100).toFixed(1)) : null,
      }));
      customerMoM = {
        latestMonth,
        prevMonth,
        topGainers: [...diffs].filter((d) => d.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 5),
        topDecliners: [...diffs].filter((d) => d.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 5),
      };
    }

    const modas = computeModaSummary(allOrders).map((m) => ({
      moda: m.moda,
      revenue: Math.round(m.revenue),
      bop: Math.round(m.bop),
      margin: Math.round(m.margin),
      soCount: m.soCount,
      doCount: m.doCount,
      unitQty: m.unitQty,
    }));

    return {
      baseContext: {
        dateRange: { minDate, maxDate },
        availableMonths: activeMonths,
        totals: {
          revenue: Math.round(totalRevenue),
          bop: Math.round(totalBop),
          margin: Math.round(totalMargin),
          marginPct: totalRevenue > 0 ? Number(((totalMargin / totalRevenue) * 100).toFixed(1)) : null,
          billed: Math.round(totalBilled),
          unbilled: Math.round(totalUnbilled),
          soCount: allOrders.length,
          doCount: doSet.size,
          unitQty: totalUnitQty,
        },
        monthly,
        modas,
        topCustomers: customers.slice(0, 15),
        customerMoM,
      },
      allCustomers: customers,
    };
  }, [allOrders, minDate, maxDate]);

  const filterOrdersForExport = (spec: ExcelExportSpec): SalesOrderRecord[] => {
    const queries = (spec.customerQueries || [])
      .map((q) => q.trim().toLowerCase())
      .filter(Boolean);
    const months = (spec.months || []).map((m) => m.trim()).filter(Boolean);
    const src = (spec.source || 'all').toUpperCase();

    return allOrders.filter((o) => {
      if (src === 'VLI' && o.src !== 'VLI') return false;
      if (src === 'TRP' && o.src !== 'TRP') return false;
      if (months.length > 0 && !months.includes(o.month)) return false;
      if (queries.length > 0) {
        const cLower = o.customer.toLowerCase();
        const matched = queries.some((q) => cLower.includes(q) || q.includes(cLower));
        if (!matched) return false;
      }
      return true;
    });
  };

  const handleDownloadExport = (spec: ExcelExportSpec) => {
    const matched = filterOrdersForExport(spec);
    const safeFilename = (spec.filename || `laporan-logiflow-${new Date().toISOString().slice(0, 10)}.xlsx`)
      .replace(/[^a-zA-Z0-9._-]/g, '-');

    const groupBy = (spec.groupBy || 'so').toLowerCase();

    if (groupBy === 'monthly') {
      const mMap = new Map<
        string,
        { month: string; soCount: number; doCount: number; unitQty: number; rev: number; bop: number; billed: number; unbilled: number }
      >();
      for (const o of matched) {
        const cur = mMap.get(o.month) || {
          month: o.month,
          soCount: 0,
          doCount: 0,
          unitQty: 0,
          rev: 0,
          bop: 0,
          billed: 0,
          unbilled: 0,
        };
        cur.soCount += 1;
        cur.doCount += o.uniqueDoCount;
        cur.unitQty += o.totalUnitQty || 0;
        cur.rev += o.rev;
        cur.bop += o.bop;
        cur.billed += o.billedVal;
        cur.unbilled += o.unbilledVal;
        mMap.set(o.month, cur);
      }
      const rows = Array.from(mMap.values())
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((r) => {
          const margin = r.rev - r.bop;
          return [
            formatMonthLabel(r.month),
            r.soCount,
            r.doCount,
            r.unitQty,
            Math.round(r.rev),
            Math.round(r.bop),
            Math.round(margin),
            r.rev > 0 ? `${((margin / r.rev) * 100).toFixed(1)}%` : '-',
            Math.round(r.billed),
            Math.round(r.unbilled),
          ];
        });

      downloadExcelWorkbook(safeFilename, [
        {
          name: 'Ringkasan Bulanan',
          headers: [
            'Bulan',
            'Jumlah SO',
            'DO Unik',
            'Unit (Trip)',
            'Revenue (Rp)',
            'BOP (Rp)',
            'Margin (Rp)',
            'Margin %',
            'Billed (Rp)',
            'Unbilled (Rp)',
          ],
          rows,
        },
      ]);
      return;
    }

    if (groupBy === 'customer') {
      const custRows = computeCustomerSummary(matched)
        .sort((a, b) => b.revenue - a.revenue)
        .map((c) => [
          c.customer,
          c.soCount,
          c.unitQty,
          Math.round(c.revenue),
          Math.round(c.bop),
          Math.round(c.margin),
          c.marginPct !== null ? `${c.marginPct.toFixed(1)}%` : '-',
          Math.round(c.billedRp),
          Math.round(c.unbilledRp),
        ]);

      downloadExcelWorkbook(safeFilename, [
        {
          name: 'Performa Customer',
          headers: [
            'Customer',
            'Jumlah SO',
            'Unit (Trip)',
            'Revenue (Rp)',
            'BOP (Rp)',
            'Margin (Rp)',
            'Margin %',
            'Billed (Rp)',
            'Unbilled (Rp)',
          ],
          rows: custRows,
        },
      ]);
      return;
    }

    // Default: Detail per Sales Order + Sheet Ringkasan Bulanan
    const soRows = matched
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || a.customer.localeCompare(b.customer))
      .map((o) => [
        o.customer,
        o.ref,
        toExcelDate(o.date),
        formatMonthLabel(o.month),
        o.src === 'TRP' ? 'Transporter' : 'VLI',
        o.category,
        o.uniqueDoCount,
        o.totalUnitQty || 0,
        Math.round(o.rev),
        Math.round(o.bop),
        Math.round(o.margin),
        o.marginPct !== null ? `${o.marginPct.toFixed(1)}%` : '-',
        Math.round(o.billedVal),
        Math.round(o.unbilledVal),
      ]);

    const mMap = new Map<string, { rev: number; bop: number; so: number; unitQty: number }>();
    for (const o of matched) {
      const cur = mMap.get(o.month) || { rev: 0, bop: 0, so: 0, unitQty: 0 };
      cur.rev += o.rev;
      cur.bop += o.bop;
      cur.so += 1;
      cur.unitQty += o.totalUnitQty || 0;
      mMap.set(o.month, cur);
    }
    const summaryRows = Array.from(mMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => {
        const margin = v.rev - v.bop;
        return [
          formatMonthLabel(month),
          v.so,
          v.unitQty,
          Math.round(v.rev),
          Math.round(v.bop),
          Math.round(margin),
          v.rev > 0 ? `${((margin / v.rev) * 100).toFixed(1)}%` : '-',
        ];
      });

    downloadExcelWorkbook(safeFilename, [
      {
        name: 'Detail Sales Order',
        headers: [
          'Customer',
          'No SO',
          'Tanggal',
          'Bulan',
          'Produk',
          'Kategori',
          'DO Unik',
          'Unit (Trip)',
          'Revenue (Rp)',
          'BOP (Rp)',
          'Margin (Rp)',
          'Margin %',
          'Billed (Rp)',
          'Unbilled (Rp)',
        ],
        rows: soRows,
      },
      {
        name: 'Ringkasan Bulanan',
        headers: ['Bulan', 'Jumlah SO', 'Unit (Trip)', 'Revenue (Rp)', 'BOP (Rp)', 'Margin (Rp)', 'Margin %'],
        rows: summaryRows,
      },
    ]);
  };

  const handleSend = async (promptText?: string) => {
    const text = (promptText ?? input).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!promptText) setInput('');
    setLoading(true);

    try {
      const historyPayload = messages
        .filter((m) => m.id !== 'welcome' && !m.isError)
        .slice(-4)
        .map((m) => ({ role: m.role, text: m.text }));

      // Smart customer lookup: include any customer matching words in the user's message
      const queryWords = text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3);
      const matchedCustomers = queryWords.length
        ? contextSummary.allCustomers
            .filter((c) => {
              const name = c.customer.toLowerCase();
              return queryWords.some((w) => name.includes(w));
            })
            .slice(0, 10)
        : [];

      const compactContext = {
        ...contextSummary.baseContext,
        ...(matchedCustomers.length > 0 ? { matchedCustomers } : {}),
      };

      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
          contextSummary: compactContext,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || 'Gagal menghubungi Asisten AI.');
      }

      const aiMsg: ChatMessage = {
        id: `m-${Date.now()}`,
        role: 'model',
        text: data.answer || 'Maaf, saya tidak dapat memproses pertanyaan tersebut.',
        excelExport: data.excelExport?.shouldExport ? data.excelExport : undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: unknown) {
      const errText =
        err instanceof Error ? err.message : 'Terjadi kesalahan jaringan saat menghubungi AI.';
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'model',
          text: errText,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'model',
        text: 'Percakapan telah dibersihkan. Silakan ajukan pertanyaan atau minta data Excel (.xlsx) yang Anda butuhkan.',
      },
    ]);
  };

  return (
    <>
      {/* Floating Trigger Button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-5 bottom-5 z-40 inline-flex items-center gap-2 rounded-2xl bg-teal-700 px-4 py-3 text-xs font-semibold text-white shadow-lg shadow-teal-900/25 transition-all hover:scale-[1.02] hover:bg-teal-800 active:scale-[0.98] dark:bg-teal-600 dark:hover:bg-teal-500"
          aria-label="Buka Bantuan AI"
        >
          <Sparkles className="h-4 w-4" />
          <span>Bantuan AI</span>
        </button>
      )}

      {/* Slide-Over Chat Drawer */}
      {open && (
        <div
          className="fixed right-4 bottom-4 z-50 flex h-[min(640px,calc(100vh-2rem))] w-[min(440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          role="dialog"
          aria-label="Asisten AI LogiFlow"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200/80 bg-teal-700 px-4 py-3 text-white dark:border-slate-800 dark:bg-teal-800">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold leading-tight">Asisten AI LogiFlow</h2>
                <p className="text-[11px] text-teal-100">
                  Tanya performa & ekspor data Excel (.xlsx)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClearChat}
                title="Bersihkan percakapan"
                className="rounded-lg p-1.5 text-teal-100 transition-colors hover:bg-white/15 hover:text-white"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Tutup"
                className="rounded-lg p-1.5 text-teal-100 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4 dark:bg-slate-950/40">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const exportStats = msg.excelExport
                ? (() => {
                    const matched = filterOrdersForExport(msg.excelExport);
                    const rev = matched.reduce((a, o) => a + o.rev, 0);
                    const bop = matched.reduce((a, o) => a + o.bop, 0);
                    const unitQty = matched.reduce((a, o) => a + (o.totalUnitQty || 0), 0);
                    return { count: matched.length, rev, bop, margin: rev - bop, unitQty };
                  })()
                : null;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      isUser
                        ? 'rounded-br-md bg-teal-700 text-white shadow-xs whitespace-pre-wrap dark:bg-teal-600'
                        : msg.isError
                        ? 'rounded-bl-md border border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300'
                        : 'w-full rounded-bl-md border border-slate-200/80 bg-white text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {isUser || msg.isError ? msg.text : <FormattedAiMessage text={msg.text} />}
                  </div>

                  {/* Excel Export Card */}
                  {msg.excelExport && exportStats && (
                    <div className="mt-2 w-full max-w-[90%] rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-800/60 dark:bg-emerald-950/30">
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                          <FileSpreadsheet className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {msg.excelExport.title || 'Laporan Data LogiFlow'}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-600 tabular-nums dark:text-slate-300">
                            {formatInt(exportStats.count)} SO · {formatInt(exportStats.unitQty)} Unit (Trip)
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-600 tabular-nums dark:text-slate-300">
                            Rev {formatMiliar(exportStats.rev)} · Margin {formatMiliar(exportStats.margin)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={exportStats.count === 0}
                        onClick={() => handleDownloadExport(msg.excelExport!)}
                        className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {exportStats.count > 0
                          ? `Unduh Excel (${msg.excelExport.filename || 'laporan.xlsx'})`
                          : 'Tidak ada data yang cocok'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
                <span>Menganalisis data dashboard...</span>
              </div>
            )}

            {/* Quick Suggestions on first open */}
            {messages.length <= 1 && !loading && (
              <div className="space-y-1.5 pt-2">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Contoh pertanyaan:
                </p>
                {SUGGESTED_PROMPTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleSend(q)}
                    className="block w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-left text-[11px] text-slate-700 transition-colors hover:border-teal-500 hover:bg-teal-50/50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:border-teal-500"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 border-t border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tanya revenue, customer, atau minta Excel..."
              disabled={loading}
              className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
              aria-label="Kirim pesan"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
