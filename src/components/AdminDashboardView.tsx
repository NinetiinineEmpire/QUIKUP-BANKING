import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  Download,
  Landmark,
  Lock,
  LogOut,
  MinusCircle,
  Moon,
  Pencil,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Sun,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api.ts';
import { formatMoney } from '../lib/currency.ts';
import { QuikupLogo } from './AuthPortal.tsx';
import type {
  AdminOverviewPayload,
  AdminUserSummary,
  BankAccount,
  CurrencyCode,
  TransactionCategory,
} from '../types/banking.ts';

type AdminTab = 'overview' | 'customers' | 'transactions' | 'fraud' | 'audit';

const ADMIN_TAB_LABELS: Record<AdminTab, string> = {
  overview: 'Bank Overview & Live Feed',
  customers: 'Customers & Balances',
  transactions: 'All Transactions Ledger',
  fraud: 'Fraud, Cards & Alerts',
  audit: 'Admin Audit Trail',
};

const ADJUSTMENT_CATEGORIES: TransactionCategory[] = [
  'Salary & Income',
  'Transfers',
  'Savings & Vault',
  'Housing',
  'Utilities',
  'Shopping',
  'Travel & FX',
];

interface AdminDashboardViewProps {
  adminToken: string;
  darkMode: boolean;
  onToggleDark: () => void;
  onSignOut: () => void;
  canSwitchToPersonal?: boolean;
  onSwitchToPersonal?: () => void;
}

export function AdminDashboardView({
  adminToken,
  darkMode,
  onToggleDark,
  onSignOut,
  canSwitchToPersonal = false,
  onSwitchToPersonal,
}: AdminDashboardViewProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [data, setData] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Selected customer & account adjustment state
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [adjustMode, setAdjustMode] = useState<'credit' | 'debit' | 'set'>('credit');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustCategory, setAdjustCategory] = useState<TransactionCategory>('Salary & Income');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);

  // Filters
  const [customerSearch, setCustomerSearch] = useState('');
  const [txSearch, setTxSearch] = useState('');
  const [txStatusFilter, setTxStatusFilter] = useState<'all' | 'completed' | 'flagged' | 'blocked'>(
    'all'
  );
  const [txTypeFilter, setTxTypeFilter] = useState<string>('all');

  const [toast, setToast] = useState<{ kind: 'info' | 'alert'; text: string } | null>(null);

  const showToast = useCallback((text: string, kind: 'info' | 'alert' = 'info') => {
    setToast({ text, kind });
    setTimeout(() => {
      setToast((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  }, []);

  const fetchOverview = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        const res = await apiRequest<AdminOverviewPayload>('/api/admin/overview', {
          token: adminToken,
        });
        setData(res);
        setLoadError(null);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          onSignOut();
          return;
        }
        setLoadError(err instanceof Error ? err.message : 'Unable to load admin monitoring data.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [adminToken, onSignOut]
  );

  useEffect(() => {
    fetchOverview(false);
  }, [fetchOverview]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchOverview(true);
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [autoRefresh, fetchOverview]);

  // Keep selected customer & account synced when data loads
  useEffect(() => {
    if (!data || data.users.length === 0) return;
    const activeUser =
      data.users.find((u) => u.id === selectedUserId) || data.users[0];
    if (activeUser && activeUser.id !== selectedUserId) {
      setSelectedUserId(activeUser.id);
    }
    if (activeUser && activeUser.accounts.length > 0) {
      const accountExists = activeUser.accounts.some((a) => a.id === selectedAccountId);
      if (!accountExists) {
        setSelectedAccountId(activeUser.accounts[0].id);
      }
    }
  }, [data, selectedUserId, selectedAccountId]);

  const selectedCustomer: AdminUserSummary | null = useMemo(() => {
    if (!data || data.users.length === 0) return null;
    return data.users.find((u) => u.id === selectedUserId) || data.users[0];
  }, [data, selectedUserId]);

  const selectedAccount: BankAccount | null = useMemo(() => {
    if (!selectedCustomer || selectedCustomer.accounts.length === 0) return null;
    return (
      selectedCustomer.accounts.find((a) => a.id === selectedAccountId) ||
      selectedCustomer.accounts[0]
    );
  }, [selectedCustomer, selectedAccountId]);

  const filteredUsers = useMemo(() => {
    if (!data) return [];
    const q = customerSearch.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q) ||
        u.accounts.some((a) => a.ibanOrAccountNo.toLowerCase().includes(q))
    );
  }, [data, customerSearch]);

  const filteredTransactions = useMemo(() => {
    if (!data) return [];
    const q = txSearch.trim().toLowerCase();
    return data.transactions.filter((tx) => {
      if (txStatusFilter !== 'all' && tx.status !== txStatusFilter) return false;
      if (txTypeFilter !== 'all' && tx.type !== txTypeFilter) return false;
      if (!q) return true;
      return (
        tx.userFullName.toLowerCase().includes(q) ||
        tx.userEmail.toLowerCase().includes(q) ||
        tx.merchantOrRecipient.toLowerCase().includes(q) ||
        tx.reference.toLowerCase().includes(q) ||
        tx.accountName.toLowerCase().includes(q) ||
        (tx.plainMemo || '').toLowerCase().includes(q)
      );
    });
  }, [data, txSearch, txStatusFilter, txTypeFilter]);

  const selectAdjustMode = (nextMode: 'credit' | 'debit' | 'set') => {
    setAdjustMode(nextMode);
    if (nextMode === 'credit') {
      setAdjustCategory('Salary & Income');
      if (selectedAccount && adjustAmount === String(selectedAccount.balance)) {
        setAdjustAmount('');
      }
    } else if (nextMode === 'debit') {
      setAdjustCategory('Transfers');
      if (selectedAccount && adjustAmount === String(selectedAccount.balance)) {
        setAdjustAmount('');
      }
    } else if (selectedAccount) {
      setAdjustAmount(String(selectedAccount.balance));
    }
  };

  const projectedBalance = useMemo(() => {
    if (!selectedAccount) return null;
    const val = Number(adjustAmount);
    if (!Number.isFinite(val)) return selectedAccount.balance;
    if (adjustMode === 'set') return Math.max(0, val);
    if (adjustMode === 'credit') return selectedAccount.balance + Math.max(0, val);
    return selectedAccount.balance - Math.max(0, val);
  }, [selectedAccount, adjustAmount, adjustMode]);

  const handleAdjustBalance = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) {
      showToast('Select a customer account first.', 'alert');
      return;
    }

    const numericAmount = Number(adjustAmount);
    if (adjustMode === 'set') {
      if (!Number.isFinite(numericAmount) || numericAmount < 0) {
        showToast('Enter a valid target balance (0 or greater).', 'alert');
        return;
      }
    } else if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      showToast('Enter a valid positive amount.', 'alert');
      return;
    }

    const reasonText =
      adjustReason.trim() ||
      (adjustMode === 'set'
        ? 'QUIKUP Balance Adjustment'
        : adjustMode === 'credit'
          ? 'QUIKUP Treasury Credit'
          : 'QUIKUP Account Debit');

    setAdjustSubmitting(true);
    try {
      const res = await apiRequest<{ account: BankAccount }>(
        `/api/admin/accounts/${selectedAccount.id}/adjust`,
        {
          method: 'POST',
          token: adminToken,
          body: {
            mode: adjustMode,
            amount: numericAmount,
            reason: reasonText,
            category: adjustCategory,
          },
        }
      );
      setAdjustAmount(adjustMode === 'set' ? String(res.account.balance) : '');
      setAdjustReason('');
      await fetchOverview(true);
      showToast(
        adjustMode === 'set'
          ? `Updated ${selectedCustomer?.fullName} (${res.account.name}) balance to ${formatMoney(
              res.account.balance,
              res.account.currency
            )}.`
          : `${adjustMode === 'credit' ? 'Added' : 'Subtracted'} ${formatMoney(
              numericAmount,
              selectedAccount.currency
            )} ${adjustMode === 'credit' ? 'to' : 'from'} ${selectedCustomer?.fullName} (${
              res.account.name
            }).`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Balance adjustment failed.', 'alert');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleToggleFreeze = async (acc: BankAccount, ownerName: string) => {
    try {
      await apiRequest(`/api/admin/accounts/${acc.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          frozen: !acc.frozen,
          reason: !acc.frozen
            ? 'Account frozen by QUIKUP Operations'
            : 'Account reactivated by QUIKUP Operations',
        },
      });
      await fetchOverview(true);
      showToast(`${ownerName} · ${acc.name} ${acc.frozen ? 'unfrozen' : 'frozen'}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to update account status.', 'alert');
    }
  };

  const handleResolveFraud = async (alertId: string, decision: 'approve' | 'block') => {
    try {
      await apiRequest(`/api/admin/fraud-alerts/${alertId}/resolve`, {
        method: 'POST',
        token: adminToken,
        body: { decision },
      });
      await fetchOverview(true);
      showToast(
        decision === 'approve'
          ? 'Fraud alert approved and transaction released.'
          : 'Transaction blocked and account frozen.',
        decision === 'block' ? 'alert' : 'info'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to resolve alert.', 'alert');
    }
  };

  const handleExportCsv = () => {
    if (!filteredTransactions.length) return;
    const headers = [
      'Timestamp',
      'Customer Name',
      'Customer Email',
      'Account',
      'Type',
      'Category',
      'Description',
      'Reference',
      'Status',
      'Amount',
      'Currency',
    ];
    const escapeCell = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
    const rows = filteredTransactions.map((t) =>
      [
        t.createdAt,
        t.userFullName,
        t.userEmail,
        t.accountName,
        t.type,
        t.category,
        t.merchantOrRecipient,
        t.reference,
        t.status,
        t.amount,
        t.currency,
      ]
        .map(escapeCell)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quikup-admin-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const navItems: { id: AdminTab; label: string; icon: typeof Activity }[] = [
    { id: 'overview', label: 'Overview & Live Feed', icon: Activity },
    { id: 'customers', label: 'Customers & Balances', icon: Users },
    { id: 'transactions', label: 'All Transactions', icon: Landmark },
    { id: 'fraud', label: 'Fraud & Cards', icon: ShieldAlert },
    { id: 'audit', label: 'Audit Trail', icon: ClipboardList },
  ];

  const renderStatusLabel = (status: string) => {
    if (status === 'completed' || status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span className="capitalize">{status}</span>
        </span>
      );
    }
    if (status === 'flagged' || status === 'open') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="capitalize">{status}</span>
        </span>
      );
    }
    if (status === 'blocked') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
          <Ban className="h-3.5 w-3.5 shrink-0" />
          <span className="capitalize">{status}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span className="capitalize">{status}</span>
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-[#0B2545] dark:bg-[#071224] dark:text-slate-100">
      <div className="flex min-h-screen">
        {/* Enterprise Admin Left Sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col justify-between bg-[#0B2545] p-5 text-white lg:flex dark:bg-[#050D1A]">
          <div>
            <div className="px-2 py-2">
              <QuikupLogo onDark size="lg" />
              <p className="mt-2 text-xs font-medium text-slate-300">
                Bank Operations Console
              </p>
            </div>

            <nav className="mt-6 space-y-1" aria-label="Admin navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white/15 text-white'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="inline-flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {item.id === 'fraud' && (data?.metrics.openFraudAlerts || 0) > 0 && (
                      <span className="rounded bg-red-600 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                        {data?.metrics.openFraudAlerts}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="space-y-2 border-t border-white/10 pt-4">
            {canSwitchToPersonal && onSwitchToPersonal && (
              <button
                type="button"
                onClick={onSwitchToPersonal}
                className="flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white whitespace-nowrap"
              >
                <Landmark className="h-4 w-4 shrink-0" />
                <span>Personal Banking</span>
              </button>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white whitespace-nowrap"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Log Out Admin</span>
            </button>
          </div>
        </aside>

        {/* Main Workspace */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top Header */}
          <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3.5 sm:px-8 dark:border-slate-800 dark:bg-[#0A192F]">
            <div className="flex min-w-0 items-center gap-3">
              <div className="lg:hidden">
                <QuikupLogo size="sm" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  QUIKUP Operations / {ADMIN_TAB_LABELS[activeTab]}
                </p>
                <h1 className="truncate font-display text-lg font-bold text-[#0B2545] dark:text-white">
                  {ADMIN_TAB_LABELS[activeTab]}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setAutoRefresh((v) => !v)}
                className={`hidden rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap sm:inline-flex ${
                  autoRefresh
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {autoRefresh ? 'Live Sync: On (5s)' : 'Live Sync: Paused'}
              </button>

              <button
                type="button"
                onClick={() => fetchOverview(false)}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#0B2545] hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                type="button"
                onClick={onToggleDark}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Toggle dark mode"
              >
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B2545] px-3 py-2 text-xs font-semibold text-white hover:bg-[#133866] lg:hidden whitespace-nowrap dark:bg-blue-600"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          </header>

          {/* Mobile Tab Bar */}
          <div className="flex gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden dark:border-slate-800 dark:bg-slate-900">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                  activeTab === item.id
                    ? 'bg-[#0B2545] text-white dark:bg-blue-600'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 sm:p-8">
            {loading && !data ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[1, 2, 3, 4].map((idx) => (
                  <div
                    key={idx}
                    className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                  />
                ))}
              </div>
            ) : loadError && !data ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                <p className="font-semibold">Unable to load admin operations data</p>
                <p className="mt-1 text-xs">{loadError}</p>
                <button
                  type="button"
                  onClick={() => fetchOverview(false)}
                  className="mt-4 rounded-lg bg-[#0B2545] px-4 py-2 text-xs font-semibold text-white"
                >
                  Retry
                </button>
              </div>
            ) : data ? (
              <>
                {/* OVERVIEW & LIVE FEED */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* 4-Column Bankwide KPI Strip */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Total Bank Custody (USD Eq.)
                        </p>
                        <p className="mt-2 font-mono text-2xl font-bold text-[#0B2545] tabular-nums dark:text-white">
                          {formatMoney(data.metrics.totalCustodyUsd, 'USD')}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Across {data.metrics.totalAccounts} accounts · {data.metrics.frozenAccounts}{' '}
                          frozen
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Registered Users
                        </p>
                        <p className="mt-2 font-mono text-2xl font-bold text-[#0B2545] tabular-nums dark:text-white">
                          {data.metrics.totalCustomers}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {data.metrics.activeCards} active cards issued
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Total Ledger Transactions
                        </p>
                        <p className="mt-2 font-mono text-2xl font-bold text-[#0B2545] tabular-nums dark:text-white">
                          {data.metrics.totalTransactions}
                        </p>
                        <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                          24h Vol: {formatMoney(data.metrics.volume24hUsd, 'USD')}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Open Fraud Alerts
                        </p>
                        <p
                          className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                            data.metrics.openFraudAlerts > 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {data.metrics.openFraudAlerts}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {data.metrics.openFraudAlerts > 0
                            ? 'Requires operator review'
                            : 'No pending fraud escalations'}
                        </p>
                      </div>
                    </div>

                    {/* Split Workspace: Direct Balance Control + Live Transaction Monitor */}
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                      {/* Balance Adjustment Tool */}
                      <section className="rounded-xl border border-slate-200 bg-white p-6 xl:col-span-5 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h2 className="font-display text-base font-bold text-[#0B2545] dark:text-white">
                              Adjust Customer Balance
                            </h2>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Credit or debit any customer account immediately. Updates reflect live
                              on the customer dashboard.
                            </p>
                          </div>
                        </div>

                        {data.users.length === 0 ? (
                          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                            No customer accounts registered yet. New signups will appear here
                            automatically.
                          </div>
                        ) : (
                          <form onSubmit={handleAdjustBalance} className="mt-5 space-y-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                Select Customer
                              </label>
                              <select
                                value={selectedCustomer?.id || ''}
                                onChange={(e) => {
                                  const nextUser = data.users.find((u) => u.id === e.target.value);
                                  setSelectedUserId(e.target.value);
                                  setSelectedAccountId(nextUser?.accounts[0]?.id || '');
                                }}
                                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0B2545] focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                              >
                                {data.users.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.fullName} ({u.email}) — {formatMoney(u.totalBalanceUsd, 'USD')}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {selectedCustomer && (
                              <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                  Target Bank Account
                                </label>
                                <select
                                  value={selectedAccount?.id || ''}
                                  onChange={(e) => setSelectedAccountId(e.target.value)}
                                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0B2545] focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                >
                                  {selectedCustomer.accounts.map((acc) => (
                                    <option key={acc.id} value={acc.id}>
                                      {acc.name} ({acc.currency}) · Balance:{' '}
                                      {formatMoney(acc.balance, acc.currency)}
                                      {acc.frozen ? ' [FROZEN]' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div>
                              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                Balance Operation
                              </label>
                              <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
                                <button
                                  type="button"
                                  onClick={() => selectAdjustMode('credit')}
                                  className={`flex items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-semibold transition-colors ${
                                    adjustMode === 'credit'
                                      ? 'bg-emerald-600 text-white shadow-xs'
                                      : 'text-slate-600 hover:text-[#0B2545] dark:text-slate-400'
                                  }`}
                                >
                                  <PlusCircle className="h-3.5 w-3.5 shrink-0" />
                                  <span>Add</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => selectAdjustMode('debit')}
                                  className={`flex items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-semibold transition-colors ${
                                    adjustMode === 'debit'
                                      ? 'bg-red-600 text-white shadow-xs'
                                      : 'text-slate-600 hover:text-[#0B2545] dark:text-slate-400'
                                  }`}
                                >
                                  <MinusCircle className="h-3.5 w-3.5 shrink-0" />
                                  <span>Subtract</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => selectAdjustMode('set')}
                                  className={`flex items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-semibold transition-colors ${
                                    adjustMode === 'set'
                                      ? 'bg-[#0B2545] text-white shadow-xs dark:bg-blue-600'
                                      : 'text-slate-600 hover:text-[#0B2545] dark:text-slate-400'
                                  }`}
                                >
                                  <Pencil className="h-3.5 w-3.5 shrink-0" />
                                  <span>Edit</span>
                                </button>
                              </div>
                            </div>

                            {selectedAccount && (
                              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950">
                                <span className="text-slate-500 dark:text-slate-400">
                                  Current:{' '}
                                  <strong className="font-mono text-[#0B2545] tabular-nums dark:text-white">
                                    {formatMoney(selectedAccount.balance, selectedAccount.currency)}
                                  </strong>
                                </span>
                                {projectedBalance !== null && (
                                  <span className="text-slate-500 dark:text-slate-400">
                                    New:{' '}
                                    <strong className="font-mono text-blue-700 tabular-nums dark:text-blue-400">
                                      {formatMoney(projectedBalance, selectedAccount.currency)}
                                    </strong>
                                  </span>
                                )}
                              </div>
                            )}

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                  {adjustMode === 'set'
                                    ? `New Balance (${selectedAccount?.currency || 'USD'})`
                                    : `Amount (${selectedAccount?.currency || 'USD'})`}
                                </label>
                                <input
                                  type="number"
                                  step={selectedAccount?.currency === 'JPY' ? '1' : '0.01'}
                                  min={adjustMode === 'set' ? '0' : '0.01'}
                                  required
                                  value={adjustAmount}
                                  onChange={(e) => setAdjustAmount(e.target.value)}
                                  placeholder="0.00"
                                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm font-semibold text-[#0B2545] tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                  Ledger Category
                                </label>
                                <select
                                  value={adjustCategory}
                                  onChange={(e) =>
                                    setAdjustCategory(e.target.value as TransactionCategory)
                                  }
                                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0B2545] focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                >
                                  {ADJUSTMENT_CATEGORIES.map((cat) => (
                                    <option key={cat} value={cat}>
                                      {cat}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                Description / Reason (Optional)
                              </label>
                              <input
                                type="text"
                                maxLength={140}
                                value={adjustReason}
                                onChange={(e) => setAdjustReason(e.target.value)}
                                placeholder={
                                  adjustMode === 'set'
                                    ? 'e.g. Direct Balance Correction'
                                    : adjustMode === 'credit'
                                      ? 'e.g. Wire Settlement Credit'
                                      : 'e.g. Compliance Holdback / Fee Debit'
                                }
                                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0B2545] placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                              />
                            </div>

                            <button
                              type="submit"
                              disabled={adjustSubmitting || !selectedAccount}
                              className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 ${
                                adjustMode === 'debit'
                                  ? 'bg-red-700 hover:bg-red-600'
                                  : adjustMode === 'credit'
                                    ? 'bg-emerald-700 hover:bg-emerald-600'
                                    : 'bg-[#0B2545] hover:bg-[#133866] dark:bg-blue-600 dark:hover:bg-blue-500'
                              }`}
                            >
                              {adjustMode === 'credit' ? (
                                <PlusCircle className="h-4 w-4" />
                              ) : adjustMode === 'debit' ? (
                                <MinusCircle className="h-4 w-4" />
                              ) : (
                                <Pencil className="h-4 w-4" />
                              )}
                              <span>
                                {adjustSubmitting
                                  ? 'Updating Ledger...'
                                  : adjustMode === 'set'
                                    ? 'Save Edited Balance'
                                    : adjustMode === 'credit'
                                      ? 'Add Funds to Balance'
                                      : 'Subtract Funds from Balance'}
                              </span>
                            </button>
                          </form>
                        )}
                      </section>

                      {/* Live Recent Transactions Across All Users */}
                      <section className="rounded-xl border border-slate-200 bg-white p-6 xl:col-span-7 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <h2 className="font-display text-base font-bold text-[#0B2545] dark:text-white">
                              Live Bank Transaction Stream
                            </h2>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Latest activity across all customer accounts
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab('transactions')}
                            className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap dark:text-blue-400"
                          >
                            View All ({data.transactions.length})
                          </button>
                        </div>

                        {data.transactions.length === 0 ? (
                          <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                            No transactions recorded yet.
                          </p>
                        ) : (
                          <div className="mt-4 overflow-x-auto">
                            <table className="w-full border-collapse text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                  <th className="py-2.5 pr-3 font-medium">Customer</th>
                                  <th className="py-2.5 pr-3 font-medium">Description</th>
                                  <th className="py-2.5 pr-3 font-medium">Status</th>
                                  <th className="py-2.5 text-right font-medium">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {data.transactions.slice(0, 10).map((tx) => (
                                  <tr
                                    key={tx.id}
                                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                                  >
                                    <td className="py-3 pr-3">
                                      <p className="font-semibold text-[#0B2545] dark:text-white">
                                        {tx.userFullName}
                                      </p>
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        {tx.accountName}
                                      </p>
                                    </td>
                                    <td className="py-3 pr-3">
                                      <p className="font-medium text-slate-800 dark:text-slate-200">
                                        {tx.merchantOrRecipient}
                                      </p>
                                      <p className="font-mono text-[11px] text-slate-400">
                                        {tx.reference} · {new Date(tx.createdAt).toLocaleString()}
                                      </p>
                                    </td>
                                    <td className="py-3 pr-3 whitespace-nowrap">
                                      {renderStatusLabel(tx.status)}
                                    </td>
                                    <td
                                      className={`py-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                                        tx.amount >= 0
                                          ? 'text-emerald-700 dark:text-emerald-400'
                                          : 'text-[#0B2545] dark:text-slate-100'
                                      }`}
                                    >
                                      {tx.amount >= 0 ? '+' : '-'}
                                      {formatMoney(Math.abs(tx.amount), tx.currency)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </section>
                    </div>
                  </div>
                )}

                {/* CUSTOMERS & BALANCES */}
                {activeTab === 'customers' && (
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                    {/* Customer Directory */}
                    <section className="rounded-xl border border-slate-200 bg-white p-6 xl:col-span-7 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="font-display text-base font-bold text-[#0B2545] dark:text-white">
                            Customer Directory ({filteredUsers.length})
                          </h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Select any customer to inspect accounts, freeze/unfreeze, or adjust
                            funds
                          </p>
                        </div>

                        <div className="relative w-full sm:w-64">
                          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          <input
                            type="search"
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            placeholder="Search name, email, IBAN..."
                            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-8 text-xs text-[#0B2545] focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </div>
                      </div>

                      {filteredUsers.length === 0 ? (
                        <p className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                          No matching customers found.
                        </p>
                      ) : (
                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full border-collapse text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                <th className="py-2.5 pr-3 font-medium">Customer</th>
                                <th className="py-2.5 pr-3 font-medium">Accounts</th>
                                <th className="py-2.5 pr-3 font-medium">Activity</th>
                                <th className="py-2.5 text-right font-medium">Total (USD Eq.)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {filteredUsers.map((u) => {
                                const isSelected = selectedCustomer?.id === u.id;
                                return (
                                  <tr
                                    key={u.id}
                                    onClick={() => {
                                      setSelectedUserId(u.id);
                                      setSelectedAccountId(u.accounts[0]?.id || '');
                                    }}
                                    className={`cursor-pointer transition-colors ${
                                      isSelected
                                        ? 'bg-blue-50/70 dark:bg-blue-950/30'
                                        : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                                    }`}
                                  >
                                    <td className="py-3 pr-3">
                                      <p className="font-semibold text-[#0B2545] dark:text-white">
                                        {u.fullName}
                                        {u.role === 'admin' ? ' · Admin' : ''}
                                      </p>
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        {u.email}
                                      </p>
                                    </td>
                                    <td className="py-3 pr-3 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                                      {u.accounts.length} accts ·{' '}
                                      {u.accounts.filter((a) => a.frozen).length} frozen
                                    </td>
                                    <td className="py-3 pr-3 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                                      {u.transactionCount} tx · {u.openFraudAlertsCount} alerts
                                    </td>
                                    <td className="py-3 text-right font-mono font-bold text-[#0B2545] tabular-nums whitespace-nowrap dark:text-white">
                                      {formatMoney(u.totalBalanceUsd, 'USD')}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>

                    {/* Selected Customer Inspector & Account Controls */}
                    <section className="rounded-xl border border-slate-200 bg-white p-6 xl:col-span-5 dark:border-slate-800 dark:bg-slate-900">
                      {!selectedCustomer ? (
                        <p className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                          Select a customer to view their accounts and adjust balances.
                        </p>
                      ) : (
                        <div className="space-y-5">
                          <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Customer ID: <span className="font-mono">{selectedCustomer.id}</span>
                            </p>
                            <h3 className="mt-1 font-display text-lg font-bold text-[#0B2545] dark:text-white">
                              {selectedCustomer.fullName}
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              {selectedCustomer.email} · Joined{' '}
                              {new Date(selectedCustomer.createdAt).toLocaleDateString()}
                            </p>
                          </div>

                          {/* Accounts List */}
                          <div className="space-y-2.5">
                            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                              Customer Bank Accounts
                            </h4>
                            {selectedCustomer.accounts.map((acc) => {
                              const active = selectedAccount?.id === acc.id;
                              return (
                                <div
                                  key={acc.id}
                                  onClick={() => setSelectedAccountId(acc.id)}
                                  className={`cursor-pointer rounded-lg border p-3.5 transition-colors ${
                                    active
                                      ? 'border-[#0B2545] bg-slate-50 dark:border-blue-500 dark:bg-slate-950'
                                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-800'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-semibold text-[#0B2545] dark:text-white">
                                        {acc.name}
                                      </p>
                                      <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                        {acc.ibanOrAccountNo} · {acc.currency}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-mono text-sm font-bold text-[#0B2545] tabular-nums dark:text-white">
                                        {formatMoney(acc.balance, acc.currency)}
                                      </p>
                                      <p
                                        className={`text-[11px] font-medium ${
                                          acc.frozen
                                            ? 'text-red-600 dark:text-red-400'
                                            : 'text-emerald-700 dark:text-emerald-400'
                                        }`}
                                      >
                                        {acc.frozen ? 'Frozen' : 'Active'}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleFreeze(acc, selectedCustomer.fullName);
                                      }}
                                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                    >
                                      {acc.frozen ? (
                                        <>
                                          <Unlock className="h-3 w-3" />
                                          <span>Unfreeze</span>
                                        </>
                                      ) : (
                                        <>
                                          <Snowflake className="h-3 w-3" />
                                          <span>Freeze Account</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Inline Edit / Add / Subtract Form for Selected Account */}
                          {selectedAccount && (
                            <form
                              onSubmit={handleAdjustBalance}
                              className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="text-xs font-semibold text-[#0B2545] dark:text-white">
                                  Edit / Adjust: {selectedAccount.name} ({selectedAccount.currency})
                                </h4>
                                <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums dark:text-slate-400">
                                  {formatMoney(selectedAccount.balance, selectedAccount.currency)}
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
                                <button
                                  type="button"
                                  onClick={() => selectAdjustMode('credit')}
                                  className={`rounded-md py-1.5 text-xs font-semibold ${
                                    adjustMode === 'credit'
                                      ? 'bg-emerald-600 text-white'
                                      : 'text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  + Add
                                </button>
                                <button
                                  type="button"
                                  onClick={() => selectAdjustMode('debit')}
                                  className={`rounded-md py-1.5 text-xs font-semibold ${
                                    adjustMode === 'debit'
                                      ? 'bg-red-600 text-white'
                                      : 'text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  - Subtract
                                </button>
                                <button
                                  type="button"
                                  onClick={() => selectAdjustMode('set')}
                                  className={`rounded-md py-1.5 text-xs font-semibold ${
                                    adjustMode === 'set'
                                      ? 'bg-[#0B2545] text-white dark:bg-blue-600'
                                      : 'text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  Edit Balance
                                </button>
                              </div>

                              <div className="grid grid-cols-2 gap-2.5">
                                <input
                                  type="number"
                                  step={selectedAccount.currency === 'JPY' ? '1' : '0.01'}
                                  min={adjustMode === 'set' ? '0' : '0.01'}
                                  required
                                  value={adjustAmount}
                                  onChange={(e) => setAdjustAmount(e.target.value)}
                                  placeholder={
                                    adjustMode === 'set'
                                      ? `New balance (${selectedAccount.currency})`
                                      : `Amount (${selectedAccount.currency})`
                                  }
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-semibold text-[#0B2545] tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                />
                                <input
                                  type="text"
                                  maxLength={140}
                                  value={adjustReason}
                                  onChange={(e) => setAdjustReason(e.target.value)}
                                  placeholder="Reason (optional)"
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-[#0B2545] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                />
                              </div>

                              <button
                                type="submit"
                                disabled={adjustSubmitting}
                                className={`w-full rounded-lg py-2.5 text-xs font-semibold text-white disabled:opacity-60 ${
                                  adjustMode === 'debit'
                                    ? 'bg-red-700 hover:bg-red-600'
                                    : adjustMode === 'credit'
                                      ? 'bg-emerald-700 hover:bg-emerald-600'
                                      : 'bg-[#0B2545] hover:bg-[#133866] dark:bg-blue-600'
                                }`}
                              >
                                {adjustSubmitting
                                  ? 'Updating Balance...'
                                  : adjustMode === 'set'
                                    ? `Save Edited ${selectedAccount.currency} Balance`
                                    : adjustMode === 'credit'
                                      ? `Add ${selectedAccount.currency} Funds`
                                      : `Subtract ${selectedAccount.currency} Funds`}
                              </button>
                            </form>
                          )}
                        </div>
                      )}
                    </section>
                  </div>
                )}

                {/* ALL TRANSACTIONS LEDGER */}
                {activeTab === 'transactions' && (
                  <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h2 className="font-display text-base font-bold text-[#0B2545] dark:text-white">
                          Bankwide Transaction Ledger ({filteredTransactions.length})
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Every deposit, transfer, card purchase, FX conversion, and admin balance
                          adjustment
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="relative">
                          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          <input
                            type="search"
                            value={txSearch}
                            onChange={(e) => setTxSearch(e.target.value)}
                            placeholder="Search user, merchant, ref..."
                            className="w-56 rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-8 text-xs text-[#0B2545] focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </div>

                        <select
                          value={txTypeFilter}
                          onChange={(e) => setTxTypeFilter(e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-[#0B2545] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        >
                          <option value="all">All Types</option>
                          <option value="deposit">Deposits & Credits</option>
                          <option value="transfer_out">Outgoing Transfers & Debits</option>
                          <option value="transfer_in">Incoming Transfers</option>
                          <option value="fx_convert">FX Conversions</option>
                          <option value="card_purchase">Card Purchases</option>
                          <option value="bill_pay">Bill Payments</option>
                        </select>

                        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
                          {(['all', 'completed', 'flagged', 'blocked'] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setTxStatusFilter(st)}
                              className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${
                                txStatusFilter === st
                                  ? 'bg-white text-[#0B2545] shadow-xs dark:bg-slate-800 dark:text-white'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={handleExportCsv}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#0B2545] hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Export CSV</span>
                        </button>
                      </div>
                    </div>

                    {filteredTransactions.length === 0 ? (
                      <p className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                        No transactions match the current filter criteria.
                      </p>
                    ) : (
                      <div className="mt-5 overflow-x-auto">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                              <th className="py-3 pr-3 font-medium">Timestamp</th>
                              <th className="py-3 pr-3 font-medium">Customer</th>
                              <th className="py-3 pr-3 font-medium">Account</th>
                              <th className="py-3 pr-3 font-medium">Merchant / Memo</th>
                              <th className="py-3 pr-3 font-medium">Reference</th>
                              <th className="py-3 pr-3 font-medium">Status</th>
                              <th className="py-3 text-right font-medium">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredTransactions.map((tx) => (
                              <tr
                                key={tx.id}
                                className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                              >
                                <td className="py-3 pr-3 font-mono text-[11px] text-slate-500 whitespace-nowrap dark:text-slate-400">
                                  {new Date(tx.createdAt).toLocaleString()}
                                </td>
                                <td className="py-3 pr-3">
                                  <p className="font-semibold text-[#0B2545] dark:text-white">
                                    {tx.userFullName}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {tx.userEmail}
                                  </p>
                                </td>
                                <td className="py-3 pr-3">
                                  <p className="text-slate-700 dark:text-slate-300">
                                    {tx.accountName}
                                  </p>
                                  <p className="text-[11px] text-slate-400">
                                    {tx.type} · {tx.category}
                                  </p>
                                </td>
                                <td className="py-3 pr-3">
                                  <p className="font-medium text-slate-800 dark:text-slate-200">
                                    {tx.merchantOrRecipient}
                                  </p>
                                  {tx.plainMemo && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                      {tx.plainMemo}
                                    </p>
                                  )}
                                  {tx.encryptedMemo && (
                                    <p className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                                      <Lock className="h-3 w-3" />
                                      <span>E2EE Protected Memo</span>
                                    </p>
                                  )}
                                </td>
                                <td className="py-3 pr-3 font-mono text-[11px] text-slate-500 whitespace-nowrap dark:text-slate-400">
                                  {tx.reference}
                                </td>
                                <td className="py-3 pr-3 whitespace-nowrap">
                                  {renderStatusLabel(tx.status)}
                                </td>
                                <td
                                  className={`py-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                                    tx.amount >= 0
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-[#0B2545] dark:text-slate-100'
                                  }`}
                                >
                                  {tx.amount >= 0 ? (
                                    <span className="inline-flex items-center gap-1">
                                      <ArrowDownLeft className="h-3.5 w-3.5" />
                                      +{formatMoney(tx.amount, tx.currency)}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1">
                                      <ArrowUpRight className="h-3.5 w-3.5" />
                                      -{formatMoney(Math.abs(tx.amount), tx.currency)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                )}

                {/* FRAUD & CARDS MONITOR */}
                {activeTab === 'fraud' && (
                  <div className="space-y-6">
                    <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                      <h2 className="font-display text-base font-bold text-[#0B2545] dark:text-white">
                        Real-Time Fraud Alerts ({data.fraudAlerts.length})
                      </h2>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Review flagged transactions across all customers and approve or block funds
                      </p>

                      {data.fraudAlerts.length === 0 ? (
                        <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                          No fraud alerts on record.
                        </p>
                      ) : (
                        <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                          {data.fraudAlerts.map((alert) => (
                            <div
                              key={alert.id}
                              className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center"
                            >
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  {renderStatusLabel(alert.status)}
                                  <span aria-hidden="true" className="text-slate-400">
                                    ·
                                  </span>
                                  <span className="font-semibold text-[#0B2545] dark:text-white">
                                    {alert.userFullName} ({alert.userEmail})
                                  </span>
                                  <span aria-hidden="true" className="text-slate-400">
                                    ·
                                  </span>
                                  <span className="font-mono text-slate-500 dark:text-slate-400">
                                    {new Date(alert.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                <p className="text-sm font-semibold text-[#0B2545] dark:text-white">
                                  {alert.title} — {formatMoney(alert.amount, alert.currency as CurrencyCode)}
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-400">
                                  {alert.description}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {alert.merchant} · {alert.location} · {alert.deviceInfo}
                                </p>
                              </div>

                              {alert.status === 'open' && (
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleResolveFraud(alert.id, 'approve')}
                                    className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 whitespace-nowrap"
                                  >
                                    Approve Charge
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleResolveFraud(alert.id, 'block')}
                                    className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-500 whitespace-nowrap"
                                  >
                                    Block & Freeze
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                      <h2 className="font-display text-base font-bold text-[#0B2545] dark:text-white">
                        Issued Cards Overview ({data.cards.length})
                      </h2>
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                              <th className="py-2.5 pr-3 font-medium">Cardholder</th>
                              <th className="py-2.5 pr-3 font-medium">Card</th>
                              <th className="py-2.5 pr-3 font-medium">Network & Number</th>
                              <th className="py-2.5 pr-3 font-medium">Status</th>
                              <th className="py-2.5 text-right font-medium">Monthly Spend / Limit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {data.cards.map((card) => (
                              <tr key={card.id}>
                                <td className="py-3 pr-3">
                                  <p className="font-semibold text-[#0B2545] dark:text-white">
                                    {card.userFullName}
                                  </p>
                                  <p className="text-[11px] text-slate-500">{card.userEmail}</p>
                                </td>
                                <td className="py-3 pr-3 text-slate-700 dark:text-slate-300">
                                  <span className="inline-flex items-center gap-1.5">
                                    <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                                    {card.label} ({card.kind})
                                  </span>
                                </td>
                                <td className="py-3 pr-3 font-mono text-slate-600 dark:text-slate-400">
                                  {card.network} ·••• {card.last4}
                                </td>
                                <td className="py-3 pr-3">
                                  {card.frozen ? (
                                    <span className="font-medium text-red-600 dark:text-red-400">
                                      Frozen
                                    </span>
                                  ) : (
                                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                      Active
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 text-right font-mono tabular-nums text-[#0B2545] dark:text-white">
                                  {formatMoney(card.monthlySpent, card.currency)} /{' '}
                                  {formatMoney(card.monthlyLimit, card.currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                )}

                {/* AUDIT TRAIL */}
                {activeTab === 'audit' && (
                  <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="font-display text-base font-bold text-[#0B2545] dark:text-white">
                          Admin Operations Audit Trail ({data.auditLogs.length})
                        </h2>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Immutable Cloud SQL log of every admin balance credit, debit, account
                          freeze, and fraud resolution
                        </p>
                      </div>
                      <ShieldCheck className="h-5 w-5 text-[#0B2545] dark:text-blue-400" />
                    </div>

                    {data.auditLogs.length === 0 ? (
                      <p className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                        No admin actions logged yet. Any balance adjustment or freeze action will
                        appear here.
                      </p>
                    ) : (
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                              <th className="py-3 pr-3 font-medium">Timestamp</th>
                              <th className="py-3 pr-3 font-medium">Operator</th>
                              <th className="py-3 pr-3 font-medium">Action</th>
                              <th className="py-3 pr-3 font-medium">Target Customer</th>
                              <th className="py-3 pr-3 font-medium">Reason</th>
                              <th className="py-3 text-right font-medium">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {data.auditLogs.map((log) => (
                              <tr key={log.id}>
                                <td className="py-3 pr-3 font-mono text-[11px] text-slate-500 whitespace-nowrap dark:text-slate-400">
                                  {new Date(log.createdAt).toLocaleString()}
                                </td>
                                <td className="py-3 pr-3 text-slate-700 dark:text-slate-300">
                                  {log.adminActor}
                                </td>
                                <td className="py-3 pr-3 font-mono text-[11px] font-semibold text-[#0B2545] dark:text-blue-400">
                                  {log.action}
                                </td>
                                <td className="py-3 pr-3">
                                  <p className="font-semibold text-[#0B2545] dark:text-white">
                                    {log.targetUserFullName}
                                  </p>
                                  <p className="text-[11px] text-slate-500">{log.targetUserEmail}</p>
                                </td>
                                <td className="py-3 pr-3 text-slate-600 dark:text-slate-300">
                                  {log.reason}
                                </td>
                                <td className="py-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap text-[#0B2545] dark:text-white">
                                  {typeof log.amount === 'number' && log.currency
                                    ? formatMoney(log.amount, log.currency)
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                )}
              </>
            ) : null}
          </main>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed right-4 bottom-4 z-50 flex max-w-sm items-center gap-3 rounded-xl border px-4 py-3 text-xs font-medium shadow-lg ${
            toast.kind === 'alert'
              ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
              : 'border-slate-200 bg-white text-[#0B2545] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
          }`}
        >
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
            aria-label="Dismiss message"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
