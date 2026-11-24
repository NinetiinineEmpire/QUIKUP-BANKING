import { useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Eye,
  EyeOff,
  Landmark,
  Lock,
  PiggyBank,
  ShoppingBag,
  Zap,
} from 'lucide-react';
import { convertCurrency, formatMoney, SUPPORTED_CURRENCIES } from '../lib/currency.ts';
import type {
  BankAccount,
  CurrencyCode,
  FraudAlert,
  FxRateMap,
  SavedBeneficiary,
  TransactionRecord,
} from '../types/banking.ts';

interface OverviewViewProps {
  userName: string;
  accounts: BankAccount[];
  transactions: TransactionRecord[];
  fraudAlerts: FraudAlert[];
  beneficiaries: SavedBeneficiary[];
  fxRates: FxRateMap;
  displayCurrency: CurrencyCode;
  onChangeDisplayCurrency: (currency: CurrencyCode) => void;
  onQuickTransfer: (payload: {
    fromAccountId: string;
    recipientName: string;
    recipientTarget: string;
    targetCurrency: CurrencyCode;
    amount: number;
  }) => Promise<void>;
  onResolveFraud: (alertId: string, decision: 'approve' | 'block') => Promise<void>;
  onNavigate: (
    tab: 'overview' | 'accounts' | 'transfers' | 'payments' | 'cards' | 'analytics' | 'security' | 'transactions'
  ) => void;
  decryptedMemos: Record<string, string>;
}

const DONUT_COLORS = ['#2563EB', '#EF4444', '#F59E0B', '#10B981', '#06B6D4', '#6366F1'];

export function OverviewView({
  userName,
  accounts,
  transactions,
  fraudAlerts,
  beneficiaries,
  fxRates,
  displayCurrency,
  onChangeDisplayCurrency,
  onQuickTransfer,
  onResolveFraud,
  onNavigate,
  decryptedMemos,
}: OverviewViewProps) {
  const [hideBalanceMobile, setHideBalanceMobile] = useState(false);
  const [quickReceiverId, setQuickReceiverId] = useState<string>(beneficiaries[0]?.id || '');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  const totalNetWorth = accounts.reduce(
    (sum, acc) => sum + convertCurrency(acc.balance, acc.currency, displayCurrency, fxRates),
    0
  );

  const openAlerts = fraudAlerts.filter((a) => a.status === 'open');
  const recentTx = transactions.slice(0, 5);

  // 30-day income & expenses in displayCurrency
  const { monthlyInflow, monthlyOutflow, categoryBreakdown } = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 86400_000;
    let inflow = 0;
    let outflow = 0;
    const catMap = new Map<string, number>();

    for (const tx of transactions) {
      if (tx.status === 'blocked' || tx.type === 'fx_convert') continue;
      if (new Date(tx.createdAt).getTime() >= thirtyDaysAgo) {
        const val = convertCurrency(Math.abs(tx.amount), tx.currency, displayCurrency, fxRates);
        if (tx.amount > 0) {
          inflow += val;
        } else {
          outflow += val;
          catMap.set(tx.category, (catMap.get(tx.category) || 0) + val);
        }
      }
    }

    const sortedCats = Array.from(catMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const catSum = sortedCats.reduce((acc, [, v]) => acc + v, 0);

    const breakdown = sortedCats.map(([label, value], idx) => ({
      label,
      value,
      pct: catSum > 0 ? Math.round((value / catSum) * 100) : 0,
      color: DONUT_COLORS[idx % DONUT_COLORS.length],
    }));

    return { monthlyInflow: inflow, monthlyOutflow: outflow, categoryBreakdown: breakdown };
  }, [transactions, displayCurrency, fxRates]);

  // Build SVG Donut arcs
  const donutSegments = useMemo(() => {
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    let cumulative = 0;
    return categoryBreakdown.map((item) => {
      const fraction = item.pct / 100;
      const strokeLength = Math.max(0, fraction * circumference - 2);
      const dashOffset = -cumulative * circumference;
      cumulative += fraction;
      return {
        ...item,
        radius,
        circumference,
        strokeLength,
        dashOffset,
      };
    });
  }, [categoryBreakdown]);

  const handleQuickTransferSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const primaryAcc =
      accounts.find((a) => !a.frozen && a.currency === displayCurrency) ||
      accounts.find((a) => !a.frozen);
    const receiver = beneficiaries.find((b) => b.id === quickReceiverId);
    const amountNum = Number(quickAmount);

    if (!primaryAcc) {
      setQuickError('No active source account available.');
      return;
    }
    if (!receiver) {
      setQuickError('Please select a verified receiver.');
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setQuickError('Enter a valid positive amount.');
      return;
    }

    setQuickSubmitting(true);
    setQuickError(null);
    try {
      await onQuickTransfer({
        fromAccountId: primaryAcc.id,
        recipientName: receiver.name,
        recipientTarget: receiver.handleOrIban,
        targetCurrency: receiver.currency,
        amount: amountNum,
      });
      setQuickAmount('');
    } catch (err) {
      setQuickError(err instanceof Error ? err.message : 'Transfer failed.');
    } finally {
      setQuickSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Real-Time Fraud Alert Banner */}
      {openAlerts.length > 0 && (
        <section
          aria-label="Real-Time Fraud Alert"
          className="rounded-xl border border-red-200 bg-red-50/80 p-4 sm:p-5 dark:border-red-900/70 dark:bg-red-950/35"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-300">
                  <span>Real-Time Fraud Alert</span>
                  <span aria-hidden="true">·</span>
                  <span>{openAlerts[0].location}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {formatMoney(openAlerts[0].amount, openAlerts[0].currency)}
                  </span>
                </div>
                <p className="mt-1 font-display text-sm font-semibold text-[#0B2545] dark:text-white">
                  {openAlerts[0].title}
                </p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                  {openAlerts[0].description}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => onResolveFraud(openAlerts[0].id, 'approve')}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#0B2545] hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                Confirm It Was Me
              </button>
              <button
                type="button"
                onClick={() => onResolveFraud(openAlerts[0].id, 'block')}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 whitespace-nowrap"
              >
                Block & Refund
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Mobile Dark Navy Balance Card (Replicating Mobile Screen 1 from Reference) */}
      <section className="rounded-2xl bg-[#0B2545] p-5 text-white shadow-md md:hidden">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-blue-200">Hello, {userName.split(' ')[0]}</p>
            <p className="text-[11px] text-slate-300">Welcome back</p>
          </div>
          <select
            aria-label="Display currency"
            value={displayCurrency}
            onChange={(e) => onChangeDisplayCurrency(e.target.value as CurrencyCode)}
            className="rounded-md border border-white/20 bg-white/10 px-2 py-1 font-mono text-xs text-white focus:outline-none"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code} className="text-slate-900">
                {c.code}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-blue-200">Total Balance</p>
            <p className="mt-1 font-display text-3xl font-bold tracking-tight tabular-nums">
              {hideBalanceMobile ? '••••••••' : formatMoney(totalNetWorth, displayCurrency)}
            </p>
            <p className="mt-1 text-xs font-medium text-emerald-300">+5.2% from last month</p>
          </div>
          <button
            type="button"
            onClick={() => setHideBalanceMobile((v) => !v)}
            className="rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
            aria-label="Toggle balance visibility"
          >
            {hideBalanceMobile ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </section>

      {/* Desktop Top Row: 3 KPI Sparkline Cards + Quick Transfer Card (Exact Reference Layout) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Card 1: Total Balance + Blue Sparkline */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Balance
              </span>
              <select
                aria-label="Reporting currency"
                value={displayCurrency}
                onChange={(e) => onChangeDisplayCurrency(e.target.value as CurrencyCode)}
                className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1.5 font-display text-2xl font-bold text-[#0B2545] tabular-nums dark:text-white">
              {formatMoney(totalNetWorth, displayCurrency)}
            </p>
            <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              +5.2% <span className="text-slate-400 font-normal">from last month</span>
            </p>
          </div>
          <svg viewBox="0 0 220 56" className="mt-3 h-14 w-full" aria-hidden="true">
            <defs>
              <linearGradient id="gradBalance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M2,44 L34,36 L66,40 L98,28 L130,32 L162,18 L194,20 L218,8 L218,56 L2,56 Z"
              fill="url(#gradBalance)"
            />
            <path
              d="M2,44 L34,36 L66,40 L98,28 L130,32 L162,18 L194,20 L218,8"
              fill="none"
              stroke="#2563EB"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Card 2: Income + Emerald Sparkline */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Income (30d)
            </span>
            <p className="mt-1.5 font-display text-2xl font-bold text-[#0B2545] tabular-nums dark:text-white">
              {formatMoney(monthlyInflow, displayCurrency)}
            </p>
            <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              +3.1% <span className="text-slate-400 font-normal">from last month</span>
            </p>
          </div>
          <svg viewBox="0 0 220 56" className="mt-3 h-14 w-full" aria-hidden="true">
            <defs>
              <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M2,48 L36,38 L68,42 L102,26 L134,30 L168,16 L196,21 L218,6 L218,56 L2,56 Z"
              fill="url(#gradIncome)"
            />
            <path
              d="M2,48 L36,38 L68,42 L102,26 L134,30 L168,16 L196,21 L218,6"
              fill="none"
              stroke="#10B981"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Card 3: Expenses + Coral/Red Sparkline */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Expenses (30d)
            </span>
            <p className="mt-1.5 font-display text-2xl font-bold text-[#0B2545] tabular-nums dark:text-white">
              {formatMoney(monthlyOutflow, displayCurrency)}
            </p>
            <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
              -1.4% <span className="text-slate-400 font-normal">from last month</span>
            </p>
          </div>
          <svg viewBox="0 0 220 56" className="mt-3 h-14 w-full" aria-hidden="true">
            <defs>
              <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#EF4444" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M2,34 L34,42 L66,28 L98,38 L130,30 L162,40 L194,24 L218,32 L218,56 L2,56 Z"
              fill="url(#gradExpense)"
            />
            <path
              d="M2,34 L34,42 L66,28 L98,38 L130,30 L162,40 L194,24 L218,32"
              fill="none"
              stroke="#EF4444"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Card 4: Quick Transfer Card (Interactive) */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-display text-sm font-semibold text-[#0B2545] dark:text-white">
            Quick Transfer
          </h2>
          <form onSubmit={handleQuickTransferSubmit} className="mt-3 space-y-2.5">
            <select
              aria-label="Select Receiver"
              value={quickReceiverId}
              onChange={(e) => setQuickReceiverId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {beneficiaries.length === 0 ? (
                <option value="">No saved recipients</option>
              ) : (
                beneficiaries.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.currency})
                  </option>
                ))
              )}
            </select>

            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder={`Enter Amount (${displayCurrency})`}
              value={quickAmount}
              onChange={(e) => setQuickAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />

            {quickError && (
              <p className="text-[11px] text-red-600 dark:text-red-400">{quickError}</p>
            )}

            <button
              type="submit"
              disabled={quickSubmitting || beneficiaries.length === 0}
              className="w-full rounded-lg bg-[#0B2545] py-2 text-xs font-semibold text-white hover:bg-[#133866] disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {quickSubmitting ? 'Sending...' : 'Transfer Now'}
            </button>
          </form>
        </div>
      </section>

      {/* Bottom Row: Accounts Overview | Recent Transactions | Spending Breakdown Donut */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Column 1: Accounts Overview */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-[#0B2545] dark:text-white">
              Accounts Overview
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('accounts')}
              className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              View All
            </button>
          </div>

          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {accounts.slice(0, 4).map((acc) => {
              const Icon =
                acc.type === 'savings' ? PiggyBank : acc.type === 'vault' ? CreditCard : Landmark;
              const last4 = acc.ibanOrAccountNo.replace(/\s+/g, '').slice(-4);
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => onNavigate('accounts')}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0B2545] dark:bg-blue-950/60 dark:text-blue-300">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-[#0B2545] dark:text-slate-100">
                        {acc.name}
                      </p>
                      <p className="font-mono text-[11px] text-slate-400">
                        •••• {last4} · {acc.currency}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold text-[#0B2545] tabular-nums whitespace-nowrap dark:text-white">
                    {formatMoney(acc.balance, acc.currency)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Column 2: Recent Transactions */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-[#0B2545] dark:text-white">
              Recent Transactions
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              View All
            </button>
          </div>

          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {recentTx.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No recent transactions recorded.
              </p>
            ) : (
              recentTx.map((tx) => {
                const isCredit = tx.amount > 0;
                const memo = tx.encryptedMemo
                  ? decryptedMemos[tx.id] || 'Encrypted memo'
                  : tx.plainMemo;
                const Icon = isCredit
                  ? ArrowDownLeft
                  : tx.category === 'Utilities'
                    ? Zap
                    : tx.category === 'Shopping'
                      ? ShoppingBag
                      : ArrowUpRight;

                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => onNavigate('transactions')}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          tx.status === 'flagged'
                            ? 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400'
                            : isCredit
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : 'bg-slate-100 text-[#0B2545] dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-[#0B2545] dark:text-slate-100">
                          {tx.merchantOrRecipient}
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          <span>{new Date(tx.createdAt).toLocaleDateString()}</span>
                          {memo && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-0.5 truncate max-w-[110px]">
                                {tx.encryptedMemo && <Lock className="h-2.5 w-2.5 shrink-0" />}
                                <span className="truncate">{memo}</span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`font-mono text-xs font-bold tabular-nums whitespace-nowrap ${
                        isCredit
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-[#0B2545] dark:text-slate-100'
                      }`}
                    >
                      {formatMoney(tx.amount, tx.currency, { signed: true })}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Column 3: Spending Breakdown Donut Chart */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-[#0B2545] dark:text-white">
              Spending Breakdown
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              Budgets
            </button>
          </div>

          <div className="my-4 flex items-center justify-center">
            <div className="relative flex h-40 w-40 items-center justify-center">
              <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle
                  cx="70"
                  cy="70"
                  r="52"
                  fill="none"
                  strokeWidth="16"
                  className="stroke-slate-100 dark:stroke-slate-800"
                />
                {donutSegments.map((seg) => (
                  <circle
                    key={seg.label}
                    cx="70"
                    cy="70"
                    r={seg.radius}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="16"
                    strokeDasharray={`${seg.strokeLength} ${seg.circumference}`}
                    strokeDashoffset={seg.dashOffset}
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-display text-base font-bold text-[#0B2545] tabular-nums dark:text-white">
                  {formatMoney(monthlyOutflow, displayCurrency)}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Total Expenses
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {categoryBreakdown.length === 0 ? (
              <p className="text-center text-xs text-slate-400">No spending in last 30 days</p>
            ) : (
              categoryBreakdown.map((item) => (
                <div key={item.label} className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span>{item.label}</span>
                  </span>
                  <span className="font-mono font-semibold text-[#0B2545] tabular-nums dark:text-white">
                    {item.pct}%
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
