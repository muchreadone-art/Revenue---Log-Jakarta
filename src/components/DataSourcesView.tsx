import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, RotateCcw, Search, Trash2, Upload, Users } from 'lucide-react';
import { FINANCE_PICS, type FinancePic, type SourceKey, type SourceState } from '../types/logistics';
import { formatInt, formatMiliar } from '../utils/formatters';
import { computeSourceStats, parseSalesOrderExcel } from '../utils/logisticsEngine';

interface DataSourcesViewProps {
  sources: Record<SourceKey, SourceState>;
  activeSourceFilter: 'all' | SourceKey;
  onUpdateSource: (key: SourceKey, next: Partial<SourceState>) => void;
  onResetSource: (key: SourceKey) => void;
  onBack?: () => void;
  onOpenOperation?: () => void;
  customerNames: string[];
  customCustomerAliases: Record<string, string>;
  onUpdateCustomAliases: (next: Record<string, string>) => void;
  customerPics: Record<string, FinancePic>;
  onUpdateCustomerPics: (next: Record<string, FinancePic>) => void;
  includeManualApril: boolean;
  onToggleManualApril: (val: boolean) => void;
  aprilBreakdown: {
    manualCount: number;
    manualRev: number;
    odooCount: number;
    odooRev: number;
  };
}

export const DataSourcesView: React.FC<DataSourcesViewProps> = ({
  sources,
  activeSourceFilter,
  onUpdateSource,
  onResetSource,
  onBack,
  onOpenOperation,
  customerNames,
  customCustomerAliases,
  onUpdateCustomAliases,
  customerPics,
  onUpdateCustomerPics,
  includeManualApril,
  onToggleManualApril,
  aprilBreakdown,
}) => {
  const [picSearch, setPicSearch] = useState('');
  const [picFilter, setPicFilter] = useState<'all' | 'unassigned' | FinancePic>('all');

  const picCounts = useMemo(() => {
    const counts: Record<FinancePic | 'unassigned', number> = {
      DICKA: 0,
      IRFAN: 0,
      JOKO: 0,
      unassigned: 0,
    };
    customerNames.forEach((c) => {
      const assigned = customerPics[c];
      if (assigned) counts[assigned] += 1;
      else counts.unassigned += 1;
    });
    return counts;
  }, [customerNames, customerPics]);

  const filteredPicCustomers = useMemo(() => {
    const q = picSearch.trim().toLowerCase();
    return customerNames.filter((c) => {
      const assigned = customerPics[c];
      if (picFilter === 'unassigned' && assigned) return false;
      if (picFilter !== 'all' && picFilter !== 'unassigned' && assigned !== picFilter) return false;
      if (q && !c.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [customerNames, customerPics, picSearch, picFilter]);

  const handleAssignPic = (customer: string, pic: FinancePic | null) => {
    const next = { ...customerPics };
    if (pic === null) {
      delete next[customer];
    } else {
      next[customer] = pic;
    }
    onUpdateCustomerPics(next);
  };
  const [statusMessage, setStatusMessage] = useState<string>(
    'Unggah ekspor Odoo (.xlsx / .xls) dengan template Sales Order Line untuk memperbarui data TRP atau VLI pada sesi ini.'
  );
  const [isError, setIsError] = useState(false);
  const [uploadedNopolReady, setUploadedNopolReady] = useState(false);
  const [aliasFrom, setAliasFrom] = useState('');
  const [aliasTo, setAliasTo] = useState('');

  const aliasEntries = Object.entries(customCustomerAliases).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  const handleAddAlias = (e: React.FormEvent) => {
    e.preventDefault();
    const fromKey = aliasFrom.trim().toUpperCase();
    const toVal = aliasTo.trim().toUpperCase();
    if (!fromKey || !toVal || fromKey === toVal) return;
    onUpdateCustomAliases({
      ...customCustomerAliases,
      [fromKey]: toVal,
    });
    setAliasFrom('');
    setAliasTo('');
  };

  const handleRemoveAlias = (fromKey: string) => {
    const next = { ...customCustomerAliases };
    delete next[fromKey];
    onUpdateCustomAliases(next);
  };

  const handleFileUpload = async (key: SourceKey, file: File) => {
    setIsError(false);
    setUploadedNopolReady(false);
    setStatusMessage(`Membaca file ${file.name}...`);
    try {
      const buf = await file.arrayBuffer();
      const res = parseSalesOrderExcel(buf);
      if (res.nSO === 0) {
        setIsError(true);
        setStatusMessage(
          'Tidak ditemukan baris dengan Delivery Order/Status Do = DO Match pada file ini. Data tidak diganti.'
        );
        return;
      }

      const upperProd = res.prod.toUpperCase();
      const isMatchedCategory =
        !res.prod ||
        (key === 'TRP'
          ? upperProd.includes('TRP') || upperProd.includes('TRANSPORTER')
          : upperProd.includes(key));

      const warn = !isMatchedCategory
        ? `kategori produk "${res.prod}" tidak cocok dengan ${key}`
        : undefined;

      onUpdateSource(key, {
        data: res.DT,
        dq: res.dq,
        meta: {
          file: file.name,
          at: new Date().toISOString(),
          prod: res.prod,
          warn,
        },
        isDefault: false,
      });

      const nopolNote =
        res.nopolCount > 0
          ? ` · ${formatInt(res.nopolCount)} Nopol unik terdeteksi (${formatInt(res.nopolFilledCount)} baris)`
          : '';
      setUploadedNopolReady(res.nopolCount > 0);
      setStatusMessage(
        `Data ${sources[key].label} dimuat: ${formatInt(res.nSO)} SO dari ${file.name} (patokan periode: ${res.dateColumnUsed}, harga: ${res.priceColumnUsed})${nopolNote}.${
          warn ? ` Perhatian: ${warn}.` : ''
        }`
      );
    } catch (err) {
      setIsError(true);
      setStatusMessage(
        `Gagal memproses file: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const dqSources = (['TRP', 'VLI'] as SourceKey[]).filter(
    (k) => sources[k].dq && (activeSourceFilter === 'all' || activeSourceFilter === k)
  );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Sumber Data &amp; Pembaruan Excel Odoo
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Hanya baris dengan status DO = <strong>DO Match</strong> yang dihitung. Referensi nilai Revenue menggunakan{' '}
              <strong>Delivery Order/Total Price</strong> (atau <strong>Total Price</strong> / <strong>Unit Price</strong> sebagai cadangan), dan patokan periode tanggal menggunakan{' '}
              <strong>Delivery Order/Plan Loading Time</strong> (atau <strong>Delivery Order/Date</strong> / <strong>Created on</strong> sebagai cadangan). Setiap pembaruan otomatis tersimpan di server dan tersinkronisasi secara langsung ke semua tab dan perangkat HP.
            </p>
          </div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 whitespace-nowrap transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Kembali ke Dashboard
            </button>
          )}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-xs whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-200/80 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-3 pr-3 text-left font-semibold">Sumber Data</th>
                <th className="px-3 py-3 text-left font-semibold">File</th>
                <th className="px-3 py-3 text-left font-semibold">Diperbarui</th>
                <th className="px-3 py-3 text-left font-semibold">Periode SO</th>
                <th className="px-3 py-3 text-right font-semibold">SO</th>
                <th className="pl-3 py-3 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {(['TRP', 'VLI'] as SourceKey[]).map((key) => {
                const src = sources[key];
                const stats = computeSourceStats(src.data);
                return (
                  <tr
                    key={key}
                    className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-3.5 pr-3 font-semibold text-slate-800 dark:text-slate-200">
                      {src.label}
                    </td>
                    {stats ? (
                      <>
                        <td className="px-3 py-3.5 text-slate-600 dark:text-slate-300">
                          {src.meta?.file || '-'}
                          {src.meta?.warn && (
                            <span className="ml-1.5 text-red-600 dark:text-red-400">
                              ({src.meta.warn})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 font-mono text-slate-500 dark:text-slate-400">
                          {src.meta?.at ? new Date(src.meta.at).toLocaleString('id-ID') : '-'}
                        </td>
                        <td className="px-3 py-3.5 font-mono text-slate-600 tabular-nums dark:text-slate-300">
                          {stats.minDate} s/d {stats.maxDate}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono tabular-nums">
                          {formatInt(stats.soCount)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-3.5 text-slate-400">Belum ada data</td>
                        <td className="px-3 py-3.5 text-slate-400">-</td>
                        <td className="px-3 py-3.5 text-slate-400">-</td>
                        <td className="px-3 py-3.5 text-right font-mono text-slate-400">-</td>
                      </>
                    )}
                    <td className="pl-3 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-teal-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500">
                          <Upload className="h-3.5 w-3.5" />
                          Pilih Excel
                          <input
                            type="file"
                            accept=".xlsx,.xls"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(key, file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {!src.isDefault && (
                          <button
                            type="button"
                            onClick={() => {
                              onResetSource(key);
                              setIsError(false);
                              setStatusMessage(
                                `Sumber ${src.label} dikembalikan ke snapshot awal.`
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Reset
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div
          className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-xs ${
            isError
              ? 'bg-red-50 font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400'
              : 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400'
          }`}
        >
          <span>{statusMessage}</span>
          {uploadedNopolReady && onOpenOperation && !isError && (
            <button
              type="button"
              onClick={onOpenOperation}
              className="shrink-0 font-semibold text-teal-700 hover:underline whitespace-nowrap dark:text-teal-400"
            >
              Lihat Revenue per Nopol →
            </button>
          )}
        </div>
      </section>

      {/* Kualitas Data */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Audit Kualitas Data
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Ringkasan pembersihan baris dari file Sales Order Line (filter Status Do = DO Match).
        </p>

        {dqSources.length === 0 ? (
          <p className="mt-4 text-xs text-slate-500">
            Belum ada audit kualitas data untuk sumber terpilih.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {dqSources.map((key) => {
              const rows = sources[key].dq || [];
              return (
                <div key={key}>
                  <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-slate-700 uppercase dark:text-slate-300">
                    {sources[key].label}
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200/80 bg-slate-50/80 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                          <th className="px-4 py-2.5 text-left font-semibold">Item Pemeriksaan</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Jumlah</th>
                          <th className="px-4 py-2.5 text-left font-semibold">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {rows.map((r, idx) => (
                          <tr
                            key={idx}
                            className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                          >
                            <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                              {r[0]}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                              {formatInt(r[1])}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                              {r[2]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Manual Customer Name Customization / Merging */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Kustomisasi & Penggabungan Nama Customer
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Gabungkan atau ubah nama customer secara manual tanpa mengubah file Excel. Aturan tersimpan otomatis di browser ini.
            </p>
          </div>
          {aliasEntries.length > 0 && (
            <button
              type="button"
              onClick={() => onUpdateCustomAliases({})}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Semua
            </button>
          )}
        </div>

        <form onSubmit={handleAddAlias} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Nama Customer Asal
            </label>
            <input
              type="text"
              list="customer-source-options"
              value={aliasFrom}
              onChange={(e) => setAliasFrom(e.target.value)}
              placeholder="Pilih atau ketik nama customer asal..."
              className="h-9 w-full rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Gabung / Ubah Menjadi (Nama Resmi)
            </label>
            <input
              type="text"
              list="customer-source-options"
              value={aliasTo}
              onChange={(e) => setAliasTo(e.target.value)}
              placeholder="Pilih atau ketik nama tujuan..."
              className="h-9 w-full rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={!aliasFrom.trim() || !aliasTo.trim() || aliasFrom.trim().toUpperCase() === aliasTo.trim().toUpperCase()}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-45 md:w-auto dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Simpan Aturan
            </button>
          </div>

          <datalist id="customer-source-options">
            {customerNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </form>

        {aliasEntries.length > 0 && (
          <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-800">
            {aliasEntries.map(([fromKey, toVal]) => (
              <div
                key={fromKey}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-600 dark:text-slate-400">{fromKey}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{toVal}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveAlias(fromKey)}
                  aria-label={`Hapus aturan ${fromKey}`}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      {/* April 2026 Source Reconciliation (Manual + Odoo) */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Rekonsiliasi Sumber Data April 2026 (Manual + Odoo)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              April 2026 menggabungkan data manual awal bulan dan data Excel Odoo pertengahan–akhir bulan. Matikan opsi di bawah jika file Excel Odoo yang Anda unggah sudah mencakup April penuh agar tidak terjadi duplikasi.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <input
              type="checkbox"
              checked={includeManualApril}
              onChange={(e) => onToggleManualApril(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span>Sertakan data manual April 2026</span>
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Manual (Awal April 2026)
            </span>
            <p className="mt-1 font-mono text-sm font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {formatMiliar(aprilBreakdown.manualRev)}
            </p>
            <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              {formatInt(aprilBreakdown.manualCount)} transaksi
            </span>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Odoo Excel (April 2026)
            </span>
            <p className="mt-1 font-mono text-sm font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {formatMiliar(aprilBreakdown.odooRev)}
            </p>
            <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              {formatInt(aprilBreakdown.odooCount)} SO
            </span>
          </div>
          <div className="rounded-xl border border-teal-200/70 bg-teal-50/50 p-3.5 dark:border-teal-900/50 dark:bg-teal-950/30">
            <span className="text-[11px] font-semibold text-teal-800 dark:text-teal-300">
              Total Gabungan April 2026
            </span>
            <p className="mt-1 font-mono text-sm font-bold text-teal-900 tabular-nums dark:text-teal-200">
              {formatMiliar(aprilBreakdown.manualRev + aprilBreakdown.odooRev)}
            </p>
            <span className="font-mono text-[11px] text-teal-700/80 tabular-nums dark:text-teal-400/80">
              {formatInt(aprilBreakdown.manualCount + aprilBreakdown.odooCount)} total SO
            </span>
          </div>
        </div>
      </section>

      {/* Permanent Finance PIC Customization per Customer */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
            <div>
              <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Kustomisasi PIC Finance per Customer
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Tentukan PIC Finance (<strong className="text-slate-700 dark:text-slate-200">DICKA</strong>,{' '}
                <strong className="text-slate-700 dark:text-slate-200">IRFAN</strong>, atau{' '}
                <strong className="text-slate-700 dark:text-slate-200">JOKO</strong>) untuk setiap customer. Perubahan tersimpan otomatis secara permanen.
              </p>
            </div>
          </div>
          {Object.keys(customerPics).length > 0 && (
            <button
              type="button"
              onClick={() => onUpdateCustomerPics({})}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Semua PIC
            </button>
          )}
        </div>

        {/* Summary & Filter Controls */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(
              [
                { key: 'all', label: `Semua (${customerNames.length})` },
                { key: 'DICKA', label: `DICKA (${picCounts.DICKA})` },
                { key: 'IRFAN', label: `IRFAN (${picCounts.IRFAN})` },
                { key: 'JOKO', label: `JOKO (${picCounts.JOKO})` },
                { key: 'unassigned', label: `Belum Diisi (${picCounts.unassigned})` },
              ] as Array<{ key: 'all' | 'unassigned' | FinancePic; label: string }>
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPicFilter(tab.key)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  picFilter === tab.key
                    ? 'bg-teal-600 text-white dark:bg-teal-600'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={picSearch}
              onChange={(e) => setPicSearch(e.target.value)}
              placeholder="Cari nama customer..."
              className="h-8 w-full rounded-xl border border-slate-200/90 bg-slate-50/80 pr-3 pl-8 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Scrollable Customer PIC Assignment List */}
        <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-slate-200/80 divide-y divide-slate-100 dark:border-slate-800 dark:divide-slate-800">
          {filteredPicCustomers.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              Tidak ada customer yang cocok dengan filter pencarian.
            </div>
          ) : (
            filteredPicCustomers.map((customer) => {
              const currentPic = customerPics[customer] ?? null;
              return (
                <div
                  key={customer}
                  className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {customer}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {FINANCE_PICS.map((pic) => {
                      const active = currentPic === pic;
                      return (
                        <button
                          key={pic}
                          type="button"
                          onClick={() => handleAssignPic(customer, active ? null : pic)}
                          className={`rounded-lg px-2.5 py-1 font-mono text-[11px] font-semibold transition-all ${
                            active
                              ? 'bg-teal-600 text-white shadow-xs dark:bg-teal-600'
                              : 'border border-slate-200 bg-white text-slate-600 hover:border-teal-400 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-500'
                          }`}
                        >
                          {pic}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
