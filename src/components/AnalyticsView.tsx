import { useMemo, useState, type FormEvent } from 'react';
import { Check, Pencil, PiggyBank, Plus, TrendingUp } from 'lucide-react';
import { convertCurrency, formatMoney } from '../lib/currency.ts';
import type {
  BankAccount,
  BudgetLimit,
  CurrencyCode,
  FxRateMap,
  SavingsGoal,
  TransactionCategory,
  TransactionRecord,
} from '../types/banking.ts';

interface AnalyticsViewProps {
  transactions: TransactionRecord[];
  budgets: BudgetLimit[];
  savingsGoals: SavingsGoal[];
  accounts: BankAccount[];
  fxRates: FxRateMap;
  displayCurrency: CurrencyCode;
  onUpdateBudget: (budgetId: string, monthlyLimit: number) => Promise<void>;
  onCreateGoal: (payload: {
    name: string;
    targetAmount: number;
    currency: CurrencyCode;
    targetDate: string;
  }) => Promise<void>;
  onContributeGoal: (goalId: string, accountId: string, amount: number) => Promise<void>;
}

const CATEGORY_COLORS: Record<string, string> = {
  Housing: '#0F766E',
  'Dining & Groceries': '#0284C7',
  'Travel & FX': '#D97706',
  'Software & Cloud': '#4F46E5',
  Shopping: '#DC2626',
  Utilities: '#64748B',
};

export function AnalyticsView({
  transactions,
  budgets,
  savingsGoals,
  accounts,
  fxRates,
  displayCurrency,
  onUpdateBudget,
  onCreateGoal,
  onContributeGoal,
}: AnalyticsViewProps) {
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editLimitValue, setEditLimitValue] = useState('');
  const [hoveredMonthIdx, setHoveredMonthIdx] = useState<number | null>(null);

  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('5000');
  const [goalCurrency, setGoalCurrency] = useState<CurrencyCode>(displayCurrency);
  const [goalDate, setGoalDate] = useState('2027-06-01');

  const [contributingGoalId, setContributingGoalId] = useState<string | null>(null);
  const [contribAccountId, setContribAccountId] = useState<string>(accounts[0]?.id || '');
  const [contribAmount, setContribAmount] = useState('250');

  // Build 6-month Cash Flow series
  const monthlySeries = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; income: number; spending: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      buckets.push({ key, label, income: 0, spending: 0 });
    }

    for (const tx of transactions) {
      if (tx.status === 'blocked' || tx.type === 'fx_convert') continue;
      const d = new Date(tx.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.find((b) => b.key === key);
      if (!bucket) continue;
      const val = convertCurrency(Math.abs(tx.amount), tx.currency, displayCurrency, fxRates);
      if (tx.amount > 0) bucket.income += val;
      else bucket.spending += val;
    }
    return buckets;
  }, [transactions, displayCurrency, fxRates]);

  const maxBarValue = useMemo(() => {
    let max = 1000;
    for (const m of monthlySeries) {
      if (m.income > max) max = m.income;
      if (m.spending > max) max = m.spending;
    }
    return max;
  }, [monthlySeries]);

  // Current 30-day category spend
  const categorySpendMap = useMemo(() => {
    const map = new Map<TransactionCategory, number>();
    const cutoff = Date.now() - 30 * 86400_000;
    for (const tx of transactions) {
      if (tx.status === 'blocked' || tx.type === 'fx_convert' || tx.amount >= 0) continue;
      if (new Date(tx.createdAt).getTime() < cutoff) continue;
      const val = convertCurrency(Math.abs(tx.amount), tx.currency, displayCurrency, fxRates);
      map.set(tx.category, (map.get(tx.category) || 0) + val);
    }
    return map;
  }, [transactions, displayCurrency, fxRates]);

  const total30dSpend = Array.from(categorySpendMap.values()).reduce((a, b) => a + b, 0);
  const currentMonthIncome = monthlySeries[monthlySeries.length - 1]?.income || 0;
  const currentMonthSpend = monthlySeries[monthlySeries.length - 1]?.spending || 0;
  const savingsRate =
    currentMonthIncome > 0
      ? Math.max(0, Math.round(((currentMonthIncome - currentMonthSpend) / currentMonthIncome) * 100))
      : 0;

  const handleSaveBudget = async (id: string) => {
    const val = Number(editLimitValue);
    if (!Number.isFinite(val) || val <= 0) return;
    await onUpdateBudget(id, val);
    setEditingBudgetId(null);
  };

  const handleCreateGoalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onCreateGoal({
      name: goalName,
      targetAmount: Number(goalTarget),
      currency: goalCurrency,
      targetDate: goalDate,
    });
    setGoalName('');
    setShowGoalForm(false);
  };

  const handleContributeSubmit = async (e: FormEvent, goalId: string) => {
    e.preventDefault();
    await onContributeGoal(goalId, contribAccountId, Number(contribAmount));
    setContributingGoalId(null);
  };

  return (
    <div className="space-y-6">
      {/* Top 3 KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            This Month Income
          </p>
          <p className="mt-2 font-display text-2xl font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
            {formatMoney(currentMonthIncome, displayCurrency)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            This Month Spending
          </p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-900 tabular-nums dark:text-white">
            {formatMoney(currentMonthSpend, displayCurrency)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Net Monthly Savings Rate
          </p>
          <p className="mt-2 font-display text-2xl font-semibold text-teal-700 tabular-nums dark:text-teal-400">
            {savingsRate}%
          </p>
        </div>
      </div>

      {/* 6-Month Cash Flow SVG Chart + Category Breakdown */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-6 xl:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                6-Month Cash Flow
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Monthly inflow vs. categorized expenses ({displayCurrency})
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-teal-700 dark:bg-teal-500" />
                <span>Income</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-slate-400 dark:bg-slate-500" />
                <span>Spending</span>
              </span>
            </div>
          </div>

          <div className="relative mt-6">
            <svg
              viewBox="0 0 600 220"
              className="h-56 w-full overflow-visible"
              role="img"
              aria-label="6-month income and spending chart"
            >
              {[0.25, 0.5, 0.75, 1].map((step) => {
                const y = 180 - step * 150;
                return (
                  <g key={step}>
                    <line
                      x1="0"
                      x2="600"
                      y1={y}
                      y2={y}
                      className="stroke-slate-100 dark:stroke-slate-800"
                      strokeWidth="1"
                    />
                  </g>
                );
              })}

              {monthlySeries.map((m, idx) => {
                const groupX = idx * 96 + 24;
                const incHeight = Math.max(4, (m.income / maxBarValue) * 150);
                const spdHeight = Math.max(4, (m.spending / maxBarValue) * 150);
                return (
                  <g
                    key={m.key}
                    onMouseEnter={() => setHoveredMonthIdx(idx)}
                    onMouseLeave={() => setHoveredMonthIdx(null)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={groupX}
                      y={180 - incHeight}
                      width="24"
                      height={incHeight}
                      rx="4"
                      className="fill-teal-700 transition-opacity hover:opacity-90 dark:fill-teal-500"
                    />
                    <rect
                      x={groupX + 30}
                      y={180 - spdHeight}
                      width="24"
                      height={spdHeight}
                      rx="4"
                      className="fill-slate-400 transition-opacity hover:opacity-90 dark:fill-slate-600"
                    />
                    <text
                      x={groupX + 27}
                      y="204"
                      textAnchor="middle"
                      className="fill-slate-500 text-[12px] dark:fill-slate-400"
                    >
                      {m.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {hoveredMonthIdx !== null && monthlySeries[hoveredMonthIdx] && (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs dark:border-slate-800 dark:bg-slate-950">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {monthlySeries[hoveredMonthIdx].label}
                </span>
                <div className="flex items-center gap-4 font-mono tabular-nums">
                  <span className="text-teal-700 dark:text-teal-400">
                    In: {formatMoney(monthlySeries[hoveredMonthIdx].income, displayCurrency)}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">
                    Out: {formatMoney(monthlySeries[hoveredMonthIdx].spending, displayCurrency)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 30-Day Category Breakdown */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 xl:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            30-Day Category Share
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Total categorized spend: {formatMoney(total30dSpend, displayCurrency)}
          </p>

          <div className="mt-5 space-y-3.5">
            {Array.from(categorySpendMap.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([cat, spent]) => {
                const pct = total30dSpend > 0 ? Math.round((spent / total30dSpend) * 100) : 0;
                const color = CATEGORY_COLORS[cat] || '#0F766E';
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{cat}</span>
                      <span className="font-mono text-slate-700 tabular-nums dark:text-slate-300">
                        {formatMoney(spent, displayCurrency)} ({pct}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            {categorySpendMap.size === 0 && (
              <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No spending recorded in the past 30 days.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Monthly Budgets with Editable Limits */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Monthly Category Budgets
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Adjust category caps anytime to keep monthly cash flow aligned
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {budgets.map((b) => {
            const spent = categorySpendMap.get(b.category) || 0;
            const limitInDisplay = convertCurrency(b.monthlyLimit, b.currency, displayCurrency, fxRates);
            const ratio = limitInDisplay > 0 ? spent / limitInDisplay : 0;
            const pct = Math.min(100, Math.round(ratio * 100));
            const statusText =
              ratio >= 1 ? 'Over Budget' : ratio >= 0.8 ? 'Near Limit' : 'On Track';
            const statusColor =
              ratio >= 1
                ? 'text-red-600 dark:text-red-400'
                : ratio >= 0.8
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-700 dark:text-emerald-400';
            const barColor =
              ratio >= 1
                ? 'bg-red-600'
                : ratio >= 0.8
                  ? 'bg-amber-500'
                  : 'bg-teal-700 dark:bg-teal-500';

            return (
              <div
                key={b.id}
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {b.category}
                  </span>
                  <span className={`text-xs font-semibold ${statusColor}`}>{statusText}</span>
                </div>

                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {formatMoney(spent, displayCurrency)}
                  </span>

                  {editingBudgetId === b.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="10"
                        value={editLimitValue}
                        onChange={(e) => setEditLimitValue(e.target.value)}
                        className="w-24 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveBudget(b.id)}
                        className="rounded bg-teal-700 p-1 text-white hover:bg-teal-800"
                        aria-label="Save budget limit"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBudgetId(b.id);
                        setEditLimitValue(String(b.monthlyLimit));
                      }}
                      className="inline-flex items-center gap-1 font-mono text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    >
                      <span>of {formatMoney(limitInDisplay, displayCurrency)}</span>
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Savings Goals */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-teal-700 dark:text-teal-400" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Savings Goals & Reserves
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Track multi-currency milestones and fund directly from any account
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowGoalForm(!showGoalForm)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Goal</span>
          </button>
        </div>

        {showGoalForm && (
          <form
            onSubmit={handleCreateGoalSubmit}
            className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-950"
          >
            <input
              type="text"
              required
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              placeholder="Goal title"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <input
              type="number"
              required
              min="50"
              value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
              placeholder="Target amount"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <select
              value={goalCurrency}
              onChange={(e) => setGoalCurrency(e.target.value as CurrencyCode)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="JPY">JPY</option>
            </select>
            <div className="flex gap-2">
              <input
                type="date"
                value={goalDate}
                onChange={(e) => setGoalDate(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800"
              >
                Create
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {savingsGoals.map((goal) => {
            const pct = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
            return (
              <div
                key={goal.id}
                className="flex flex-col justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-800"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {goal.name}
                    </h3>
                    <span className="font-mono text-xs font-semibold text-teal-700 tabular-nums dark:text-teal-400">
                      {pct}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Target date {goal.targetDate}
                  </p>
                  <p className="mt-3 font-mono text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {formatMoney(goal.currentAmount, goal.currency)}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      / {formatMoney(goal.targetAmount, goal.currency)}
                    </span>
                  </p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-teal-700 dark:bg-teal-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {contributingGoalId === goal.id ? (
                  <form
                    onSubmit={(e) => handleContributeSubmit(e, goal.id)}
                    className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800"
                  >
                    <select
                      value={contribAccountId}
                      onChange={(e) => setContribAccountId(e.target.value)}
                      className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({formatMoney(a.balance, a.currency)})
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={contribAmount}
                        onChange={(e) => setContribAmount(e.target.value)}
                        className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                      <button
                        type="submit"
                        className="rounded bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                      >
                        Add
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setContributingGoalId(goal.id)}
                    className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span>Contribute Funds</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
