import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Moon, RotateCcw, Search, Sun, Upload } from 'lucide-react';
import { testConnection } from './firebase';
import {
  resetSourceInFirestore,
  saveSourceToFirestore,
  subscribeToFirestoreSources,
} from './services/firestoreSync';
import {
  broadcastSources,
  fetchServerSources,
  loadLocalCache,
  pushServerSource,
  resetServerSource,
  saveLocalCache,
  subscribeToBroadcast,
} from './utils/syncManager';
import { INITIAL_VLI_DATA, INITIAL_VLI_DQ } from './data/initialLogisticsData';
import type {
  DashboardSection,
  FilterState,
  FinancePic,
  SourceKey,
  SourceState,
} from './types/logistics';
import { formatInt, formatMonthLabel } from './utils/formatters';
import {
  buildSalesOrders,
  computeCategorySummary,
  computeCustomerSummary,
  computeLineInvoiceStatuses,
  computeModaSummary,
  computeMonthlyMetrics,
  computeMonthlyModaMetrics,
  computeOperationAnalytics,
  computeTopRoutes,
  computeUnbilledAging,
  filterOrdersByProduct,
  filterSalesOrders,
} from './utils/logisticsEngine';
import { PerformanceView } from './components/PerformanceView';
import { TenDaysReportView } from './components/TenDaysReportView';
import { MarketingView } from './components/MarketingView';
import { FinanceView } from './components/FinanceView';
import { OperationView } from './components/OperationView';
import { AiAssistantDrawer } from './components/AiAssistantDrawer';
import { CustomerDetailModal } from './components/CustomerDetailModal';
import { CustomerFilterDropdown } from './components/CustomerFilterDropdown';
import { MonthFilterDropdown } from './components/MonthFilterDropdown';
import { ModaFilterDropdown } from './components/ModaFilterDropdown';
import { DataSourcesView } from './components/DataSourcesView';

const DEFAULT_SOURCES: Record<SourceKey, SourceState> = {
  TRP: {
    key: 'TRP',
    label: 'Master Data - TRP',
    data: null,
    dq: null,
    meta: null,
    isDefault: true,
  },
  VLI: {
    key: 'VLI',
    label: 'Master Data - VLI',
    data: INITIAL_VLI_DATA,
    dq: INITIAL_VLI_DQ,
    meta: {
      file: 'Data awal (bawaan dashboard)',
      at: '',
      prod: 'VLI',
    },
    isDefault: true,
  },
};

const INITIAL_FILTER: FilterState = {
  source: 'all',
  month: [],
  customer: [],
  modas: [],
  search: '',
};

const MAIN_TABS: Array<{ id: Exclude<DashboardSection, 'sources'>; label: string }> = [
  { id: 'performance', label: 'Performance' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'finance', label: 'Finance' },
  { id: 'operation', label: 'Operation' },
  { id: 'tendays', label: 'Ten Days Report' },
];

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeSection, setActiveSection] = useState<DashboardSection>('performance');
  const [lastMainTab, setLastMainTab] =
    useState<Exclude<DashboardSection, 'sources'>>('performance');

  const [sources, setSources] = useState<Record<SourceKey, SourceState>>(() => {
    const cached = loadLocalCache();
    return cached?.sources || DEFAULT_SOURCES;
  });
  const [lastSyncTime, setLastSyncTime] = useState<number>(() => {
    const cached = loadLocalCache();
    return cached?.updatedAt || 0;
  });
  const [customCustomerAliases, setCustomCustomerAliases] = useState<Record<string, string>>(() => {
    try {
      const saved = window.localStorage.getItem('logiflow_customer_aliases_v1');
      return saved ? (JSON.parse(saved) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'logiflow_customer_aliases_v1',
        JSON.stringify(customCustomerAliases)
      );
    } catch {
      // ignore storage quota errors
    }
  }, [customCustomerAliases]);

  const [customerPics, setCustomerPics] = useState<Record<string, FinancePic>>(() => {
    try {
      const saved = window.localStorage.getItem('logiflow_customer_pics_v1');
      return saved ? (JSON.parse(saved) as Record<string, FinancePic>) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('logiflow_customer_pics_v1', JSON.stringify(customerPics));
    } catch {
      // ignore storage quota errors
    }
  }, [customerPics]);

  const [includeManualApril, setIncludeManualApril] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem('logiflow_include_manual_april_v1');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('logiflow_include_manual_april_v1', String(includeManualApril));
    } catch {
      // ignore storage quota errors
    }
  }, [includeManualApril]);
  const [filter, setFilter] = useState<FilterState>(INITIAL_FILTER);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [selectedMapRoute, setSelectedMapRoute] = useState<string | null>(null);
  const [routeJumpTrigger, setRouteJumpTrigger] = useState(0);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [mapsApiKey, setMapsApiKey] = useState<string>(() => {
    const envKey =
      import.meta.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    return String(envKey || '').trim();
  });
  const [mapsConfigLoading, setMapsConfigLoading] = useState<boolean>(() => {
    const envKey =
      import.meta.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    return !String(envKey || '').trim();
  });
  const firestoreSyncedRef = useRef(false);

  useEffect(() => {
    const handleQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  useEffect(() => {
    if (mapsApiKey) {
      setMapsConfigLoading(false);
      return;
    }
    let cancelled = false;
    setMapsConfigLoading(true);
    fetch('/api/maps-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { apiKey?: string } | null) => {
        if (!cancelled && data?.apiKey) {
          setMapsApiKey(data.apiKey.trim());
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setMapsConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mapsApiKey]);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  useEffect(() => {
    testConnection();

    const unsubscribeFirestore = subscribeToFirestoreSources((key, sourceState) => {
      firestoreSyncedRef.current = true;
      setSources((prev) => {
        const next = {
          ...prev,
          [key]: sourceState,
        };
        saveLocalCache(next, Date.now());
        return next;
      });
      setLastSyncTime(Date.now());
    });

    const unsubscribeBroadcast = subscribeToBroadcast((payload) => {
      setSources(payload.sources);
      setLastSyncTime(payload.updatedAt);
      saveLocalCache(payload.sources, payload.updatedAt);
    });

    fetchServerSources().then((serverData) => {
      if (
        !firestoreSyncedRef.current &&
        serverData &&
        serverData.updatedAt > lastSyncTime &&
        (serverData.sources.TRP.data !== null || !serverData.sources.VLI.isDefault)
      ) {
        setSources(serverData.sources);
        setLastSyncTime(serverData.updatedAt);
        saveLocalCache(serverData.sources, serverData.updatedAt);
      } else if (
        serverData &&
        serverData.sources.TRP.data === null &&
        sources.TRP.data !== null
      ) {
        pushServerSource('TRP', sources.TRP).catch(() => {});
      }
    });

    return () => {
      unsubscribeFirestore();
      unsubscribeBroadcast();
    };
  }, []);

  const { orders: allOrders, minDate, maxDate } = useMemo(
    () => buildSalesOrders(sources, customCustomerAliases, { includeManualApril }),
    [sources, customCustomerAliases, includeManualApril]
  );

  const aprilBreakdown = useMemo(() => {
    let manualCount = 0;
    let manualRev = 0;
    let odooCount = 0;
    let odooRev = 0;
    for (const o of allOrders) {
      if (o.month !== '2026-04') continue;
      if (o.ref.startsWith('SO/MANUAL/')) {
        manualCount += 1;
        manualRev += o.rev;
      } else {
        odooCount += 1;
        odooRev += o.rev;
      }
    }
    return { manualCount, manualRev, odooCount, odooRev };
  }, [allOrders]);

  const sourceScopedOrders = useMemo(
    () => filterOrdersByProduct(allOrders, filter.source),
    [allOrders, filter.source]
  );

  const uploadDisplayText = useMemo(() => {
    const trpAt = sources.TRP.meta?.at || '';
    const vliAt = sources.VLI.meta?.at || '';
    let chosenAt = '';
    if (filter.source === 'TRP') {
      chosenAt = trpAt || vliAt;
    } else if (filter.source === 'VLI') {
      chosenAt = vliAt || trpAt;
    } else {
      chosenAt = [trpAt, vliAt].filter(Boolean).sort().pop() || '';
    }
    if (chosenAt) {
      const d = new Date(chosenAt);
      if (!Number.isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(d);
      }
    }
    return maxDate ? `Data awal (s/d ${maxDate})` : 'Data awal';
  }, [sources.TRP.meta?.at, sources.VLI.meta?.at, filter.source, maxDate]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>(sourceScopedOrders.map((s) => s.month).filter(Boolean));
    for (let m = 1; m <= 12; m++) {
      set.add(`2026-${String(m).padStart(2, '0')}`);
    }
    return Array.from(set).sort();
  }, [sourceScopedOrders]);
  const customerOptions = useMemo(
    () => Array.from(new Set(sourceScopedOrders.map((s) => s.customer))).sort(),
    [sourceScopedOrders]
  );

  useEffect(() => {
    setFilter((prev) => {
      const next = { ...prev };
      let changed = false;
      if (prev.month.length > 0) {
        const validMonths = prev.month.filter((m) => monthOptions.includes(m));
        if (validMonths.length !== prev.month.length) {
          next.month = validMonths;
          changed = true;
        }
      }
      if (prev.customer.length > 0) {
        const validCustomers = prev.customer.filter((c) => customerOptions.includes(c));
        if (validCustomers.length !== prev.customer.length) {
          next.customer = validCustomers;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [monthOptions, customerOptions]);

  const filteredOrders = useMemo(
    () => filterSalesOrders(allOrders, filter, false),
    [allOrders, filter]
  );

  const ordersIgnoreMonth = useMemo(
    () => filterSalesOrders(allOrders, filter, true),
    [allOrders, filter]
  );

  const kpiTotals = useMemo(() => {
    let revenue = 0;
    let bop = 0;
    let billed = 0;
    let unbilled = 0;
    let unitQty = 0;
    const doSet = new Set<string>();
    for (const s of filteredOrders) {
      revenue += s.rev;
      bop += s.bop;
      billed += s.billedVal;
      unbilled += s.unbilledVal;
      unitQty += s.totalUnitQty || 0;
      s.lines.forEach((l) => doSet.add(l[0]));
    }
    return {
      revenue,
      bop,
      billed,
      unbilled,
      unitQty,
      soCount: filteredOrders.length,
      doCount: doSet.size,
    };
  }, [filteredOrders]);

  const monthlyMetrics = useMemo(
    () => computeMonthlyMetrics(ordersIgnoreMonth),
    [ordersIgnoreMonth]
  );

  const agingData = useMemo(
    () => computeUnbilledAging(filteredOrders, maxDate),
    [filteredOrders, maxDate]
  );

  const customerSummary = useMemo(
    () => computeCustomerSummary(filteredOrders),
    [filteredOrders]
  );

  const categorySummary = useMemo(
    () => computeCategorySummary(filteredOrders),
    [filteredOrders]
  );

  const topRoutes = useMemo(() => computeTopRoutes(filteredOrders, 8), [filteredOrders]);

  const invoiceStatuses = useMemo(
    () => computeLineInvoiceStatuses(filteredOrders),
    [filteredOrders]
  );

  const modaSummary = useMemo(
    () => computeModaSummary(filteredOrders),
    [filteredOrders]
  );

  const monthlyModaMetrics = useMemo(
    () => computeMonthlyModaMetrics(ordersIgnoreMonth),
    [ordersIgnoreMonth]
  );

  const operationAnalytics = useMemo(
    () => computeOperationAnalytics(filteredOrders),
    [filteredOrders]
  );

  const hasTrpData = useMemo(
    () =>
      Boolean(sources.TRP.data) ||
      monthlyModaMetrics.some((m) => m.byModa.Transporter.doCount > 0),
    [sources.TRP.data, monthlyModaMetrics]
  );

  const hasVliData = useMemo(
    () =>
      Boolean(sources.VLI.data) ||
      monthlyModaMetrics.some(
        (m) =>
          m.byModa['Car Carrier'].doCount +
            m.byModa['Self Drive'].doCount +
            m.byModa.Shipment.doCount >
          0
      ),
    [sources.VLI.data, monthlyModaMetrics]
  );

  const handleUpdateSource = async (key: SourceKey, next: Partial<SourceState>) => {
    const now = Date.now();
    const nextSources: Record<SourceKey, SourceState> = {
      ...sources,
      [key]: { ...sources[key], ...next },
    };
    setSources(nextSources);
    setLastSyncTime(now);
    saveLocalCache(nextSources, now);
    broadcastSources(nextSources, now);

    const results = await Promise.allSettled([
      saveSourceToFirestore(key, nextSources[key]),
      pushServerSource(key, next),
    ]);
    if (results[0].status === 'rejected') {
      console.warn('[Firestore] Sync deferred (offline/quota limit):', results[0].reason);
    }
  };

  const handleResetSource = async (key: SourceKey) => {
    const now = Date.now();
    const nextSources: Record<SourceKey, SourceState> = {
      ...sources,
      [key]: DEFAULT_SOURCES[key],
    };
    setSources(nextSources);
    setLastSyncTime(now);
    saveLocalCache(nextSources, now);
    broadcastSources(nextSources, now);

    const results = await Promise.allSettled([
      resetSourceInFirestore(key),
      resetServerSource(key),
    ]);
    if (results[0].status === 'rejected') {
      console.warn('[Firestore] Reset deferred (offline/quota limit):', results[0].reason);
    }
  };

  const navigateMainTab = (tab: Exclude<DashboardSection, 'sources'>) => {
    setLastMainTab(tab);
    setActiveSection(tab);
  };

  const handleSelectRoute = (route: string) => {
    setSelectedMapRoute(route);
    setRouteJumpTrigger((n) => n + 1);
    navigateMainTab('marketing');
  };

  const hasActiveFilter =
    filter.source !== 'all' ||
    filter.month.length > 0 ||
    filter.customer.length > 0 ||
    filter.modas.length > 0 ||
    filter.search.trim() !== '';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 dark:bg-[#090D16] dark:text-slate-100">
      {gmpQuotaExceeded && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-950 underline hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Clean 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => navigateMainTab('performance')}
            className="shrink-0 whitespace-nowrap text-left text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-100"
          >
            Penjualan Logistics Jakarta
          </button>

          {/* Zone 2: 4 Primary Dashboard Tabs */}
          <nav
            className="hidden h-full items-center gap-7 md:flex"
            aria-label="Navigasi Dashboard Utama"
          >
            {MAIN_TABS.map((tab) => {
              const active = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => navigateMainTab(tab.id)}
                  className={`relative flex h-full shrink-0 items-center whitespace-nowrap text-sm font-medium transition-colors ${
                    active
                      ? 'text-teal-700 dark:text-teal-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  <span>{tab.label}</span>
                  {active && (
                    <span className="absolute right-0 bottom-0 left-0 h-0.5 bg-teal-700 dark:bg-teal-400" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Theme Toggle + Primary Action */}
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
              aria-label={darkMode ? 'Mode terang' : 'Mode gelap'}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('sources')}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 text-xs font-semibold transition-colors ${
                activeSection === 'sources'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              Unggah Excel
            </button>
          </div>
        </div>

        {/* Mobile Tab Strip (clean single-line scrollable on mobile) */}
        <nav
          className="flex items-center gap-5 overflow-x-auto border-t border-slate-100 px-4 md:hidden dark:border-slate-800"
          aria-label="Navigasi Mobile"
        >
          {MAIN_TABS.map((tab) => {
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigateMainTab(tab.id)}
                className={`relative shrink-0 whitespace-nowrap py-2.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'text-teal-700 dark:text-teal-400'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {tab.label}
                {active && (
                  <span className="absolute right-0 bottom-0 left-0 h-0.5 bg-teal-700 dark:bg-teal-400" />
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-[1440px] space-y-5 px-4 py-5 sm:px-6">
        {/* Clean Context & Filter Bar */}
        {activeSection !== 'sources' && (
          <section aria-label="Konteks & Filter Data" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {MAIN_TABS.find((t) => t.id === activeSection)?.label || 'Performance'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  Update {uploadDisplayText}
                </span>
              </div>

              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={() => setFilter(INITIAL_FILTER)}
                  className="inline-flex items-center gap-1 font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap dark:text-teal-400"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset filter
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5 dark:border-slate-800 dark:bg-slate-900">
              <select
                aria-label="Filter Kategori Produk"
                value={filter.source}
                onChange={(e) =>
                  setFilter((p) => ({
                    ...p,
                    source: e.target.value as FilterState['source'],
                  }))
                }
                className="h-9 rounded-xl bg-slate-100/90 px-3 text-xs font-medium text-slate-800 transition-colors focus:bg-white focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="all">Produk: Semua</option>
                <option value="VLI">Produk: VLI</option>
                <option value="TRP">Produk: Transporter</option>
              </select>

              <MonthFilterDropdown
                value={filter.month}
                options={monthOptions}
                onChange={(month) => setFilter((p) => ({ ...p, month }))}
              />

              <CustomerFilterDropdown
                value={filter.customer}
                options={customerOptions}
                onChange={(customer) => setFilter((p) => ({ ...p, customer }))}
              />

              <ModaFilterDropdown
                value={filter.modas}
                onChange={(modas) => setFilter((p) => ({ ...p, modas }))}
              />

              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  aria-label="Pencarian Cepat"
                  value={filter.search}
                  onChange={(e) => setFilter((p) => ({ ...p, search: e.target.value }))}
                  placeholder="Cari SO, DO, customer, nopol..."
                  className="h-9 w-full rounded-xl bg-slate-100/90 pr-3 pl-9 text-xs text-slate-800 placeholder:text-slate-400 transition-colors focus:bg-white focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          </section>
        )}

        {/* Active Tab Viewport */}
        <div key={activeSection}>
          {activeSection === 'performance' && (
            <PerformanceView
              revenue={kpiTotals.revenue}
              bop={kpiTotals.bop}
              soCount={kpiTotals.soCount}
              doCount={kpiTotals.doCount}
              unitQty={kpiTotals.unitQty}
              billed={kpiTotals.billed}
              unbilled={kpiTotals.unbilled}
              totalBaselineSo={allOrders.length}
              monthlyMetrics={monthlyMetrics}
              selectedMonth={filter.month}
              onSelectMonth={(month) => setFilter((p) => ({ ...p, month }))}
              sourceFilter={filter.source}
              selectedModas={filter.modas}
              hasTrpData={hasTrpData}
              hasVliData={hasVliData}
              modaSummary={modaSummary}
              customerSummary={customerSummary}
              topRoutes={topRoutes}
              invoiceStatuses={invoiceStatuses}
              onSelectCustomer={(customer) => setSelectedCustomer(customer)}
              onSelectRoute={handleSelectRoute}
              onNavigateTab={(tab) => navigateMainTab(tab)}
            />
          )}

          {activeSection === 'tendays' && (
            <TenDaysReportView
              orders={filteredOrders}
              availableMonths={monthOptions}
              selectedMonths={filter.month}
              sourceFilter={filter.source}
              selectedModas={filter.modas}
              onSelectCustomer={(customer) => setSelectedCustomer(customer)}
            />
          )}

          {activeSection === 'marketing' && (
            <MarketingView
              orders={filteredOrders}
              modaSummary={modaSummary}
              monthlyModaMetrics={monthlyModaMetrics}
              customerSummary={customerSummary}
              selectedMonth={filter.month}
              onSelectMonth={(month) => setFilter((p) => ({ ...p, month }))}
              onSelectCustomer={(customer) => setSelectedCustomer(customer)}
              darkMode={darkMode}
              mapsApiKey={mapsApiKey}
              mapsConfigLoading={mapsConfigLoading}
              selectedMapRoute={selectedMapRoute}
              onSelectMapRoute={setSelectedMapRoute}
              routeJumpTrigger={routeJumpTrigger}
            />
          )}

          {activeSection === 'finance' && (
            <FinanceView
              orders={filteredOrders}
              refDate={maxDate}
              revenue={kpiTotals.revenue}
              billed={kpiTotals.billed}
              unbilled={kpiTotals.unbilled}
              agingBuckets={agingData.buckets}
              toInvoiceVal={agingData.toInvoiceVal}
              nothingToInvoiceVal={agingData.nothingToInvoiceVal}
              invoiceStatuses={invoiceStatuses}
              categorySummary={categorySummary}
              customerPics={customerPics}
              onSelectCustomer={(customer) => setSelectedCustomer(customer)}
            />
          )}

          {activeSection === 'operation' && (
            <OperationView
              analytics={operationAnalytics}
              soCount={kpiTotals.soCount}
              onSelectCustomer={(customer) => setSelectedCustomer(customer)}
              onSelectRoute={handleSelectRoute}
              onOpenSources={() => setActiveSection('sources')}
            />
          )}

          {activeSection === 'sources' && (
            <DataSourcesView
              sources={sources}
              activeSourceFilter={filter.source}
              onUpdateSource={handleUpdateSource}
              onResetSource={handleResetSource}
              onBack={() => setActiveSection(lastMainTab)}
              onOpenOperation={() => navigateMainTab('operation')}
              customerNames={customerOptions}
              customCustomerAliases={customCustomerAliases}
              onUpdateCustomAliases={setCustomCustomerAliases}
              customerPics={customerPics}
              onUpdateCustomerPics={setCustomerPics}
              includeManualApril={includeManualApril}
              onToggleManualApril={setIncludeManualApril}
              aprilBreakdown={aprilBreakdown}
            />
          )}
        </div>

      </main>

      {/* Customer Drill-Down Modal */}
      <CustomerDetailModal
        customer={selectedCustomer}
        orders={filteredOrders}
        onClose={() => setSelectedCustomer(null)}
      />

      {/* AI Assistant Chat & Excel Export Drawer */}
      <AiAssistantDrawer allOrders={allOrders} minDate={minDate} maxDate={maxDate} />
    </div>
  );
}
