import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Lock,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { formatMoney } from '../lib/currency.ts';
import type { BankAccount, TransactionRecord } from '../types/banking.ts';

interface TransactionsViewProps {
  transactions: TransactionRecord[];
  accounts: BankAccount[];
  decryptedMemos: Record<string, string>;
  onDisputeTransaction: (txId: string) => Promise<void>;
  onRequestUnlockE2EE: () => void;
}

export function TransactionsView({
  transactions,
  accounts,
  decryptedMemos,
  onDisputeTransaction,
  onRequestUnlockE2EE,
}: TransactionsViewProps) {
  const [search, setSearch] = useState('');
  const [flowFilter, setFlowFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedTx, setSelectedTx] = useState<TransactionRecord | null>(null);
  const [disputing, setDisputing] = useState(false);

  const accountLookup = useMemo(() => {
    const map = new Map<string, BankAccount>();
    for (const a of accounts) map.set(a.id, a);
    return map;
  }, [accounts]);

  const categories = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.category))),
    [transactions]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (flowFilter === 'income' && tx.amount <= 0) return false;
      if (flowFilter === 'expense' && tx.amount >= 0) return false;
      if (accountFilter !== 'all' && tx.accountId !== accountFilter) return false;
      if (statusFilter !== 'all' && tx.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && tx.category !== categoryFilter) return false;
      if (q) {
        const memo = decryptedMemos[tx.id] || tx.plainMemo || '';
        const haystack = `${tx.merchantOrRecipient} ${tx.reference} ${tx.category} ${tx.location} ${memo}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, flowFilter, accountFilter, statusFilter, categoryFilter, search, decryptedMemos]);

  const handleExportCsv = () => {
    const headers = ['Date', 'Reference', 'Merchant/Recipient', 'Category', 'Amount', 'Currency', 'Status', 'Location'];
    const rows = filtered.map((t) => [
      new Date(t.createdAt).toISOString(),
      t.reference,
      `"${t.merchantOrRecipient.replace(/"/g, '""')}"`,
      `"${t.category}"`,
      t.amount.toFixed(2),
      t.currency,
      t.status,
      `"${t.location.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quikup-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDispute = async (tx: TransactionRecord) => {
    setDisputing(true);
    try {
      await onDisputeTransaction(tx.id);
      setSelectedTx({ ...tx, status: 'flagged' });
    } finally {
      setDisputing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#0B2545] dark:text-white">
              Transaction Ledger
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {filtered.length} matching records across {accounts.length} accounts
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
              {(['all', 'income', 'expense'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFlowFilter(tab)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                    flowFilter === tab
                      ? 'bg-white text-[#0B2545] shadow-xs dark:bg-slate-800 dark:text-white'
                      : 'text-slate-600 hover:text-[#0B2545] dark:text-slate-400'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search merchant, reference..."
                className="w-56 rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="all">All Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="flagged">Flagged / Held</option>
              <option value="blocked">Blocked</option>
            </select>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Desktop High-Density Data Table */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-3 pr-4">Date</th>
                <th className="py-3 pr-4">Counterparty & Memo</th>
                <th className="py-3 pr-4">Account</th>
                <th className="py-3 pr-4">Category</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    No transactions match your current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => {
                  const acc = accountLookup.get(tx.accountId);
                  const isCredit = tx.amount > 0;
                  const memo = tx.encryptedMemo
                    ? decryptedMemos[tx.id] || 'Encrypted memo'
                    : tx.plainMemo;
                  return (
                    <tr
                      key={tx.id}
                      onClick={() => setSelectedTx(tx)}
                      className="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 pr-4 font-mono text-xs text-slate-500 whitespace-nowrap dark:text-slate-400">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {tx.merchantOrRecipient}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono">{tx.reference}</span>
                          {memo && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 truncate max-w-[220px]">
                                {tx.encryptedMemo && <Lock className="h-3 w-3 shrink-0" />}
                                <span className="truncate">{memo}</span>
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-xs text-slate-600 whitespace-nowrap dark:text-slate-300">
                        {acc?.name || tx.currency}
                      </td>
                      <td className="py-3 pr-4 text-xs text-slate-600 whitespace-nowrap dark:text-slate-300">
                        {tx.category}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {tx.status === 'completed' && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Settled</span>
                          </span>
                        )}
                        {tx.status === 'flagged' && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>Fraud Hold</span>
                          </span>
                        )}
                        {tx.status === 'blocked' && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            <span>Blocked</span>
                          </span>
                        )}
                      </td>
                      <td
                        className={`py-3 text-right font-mono text-sm font-semibold tabular-nums whitespace-nowrap ${
                          isCredit
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {formatMoney(tx.amount, tx.currency, { signed: true })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Detail & Fraud Dispute Drawer */}
      {selectedTx && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-full w-full max-w-md flex-col justify-between border-l border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-y-auto">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                  <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {selectedTx.reference}
                  </p>
                  <h3 className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-white">
                    {selectedTx.merchantOrRecipient}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Close detail drawer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5">
                <p className="font-display text-3xl font-semibold text-slate-900 tabular-nums dark:text-white">
                  {formatMoney(selectedTx.amount, selectedTx.currency, { signed: true })}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {new Date(selectedTx.createdAt).toLocaleString()} · {selectedTx.location}
                </p>
              </div>

              <dl className="mt-6 divide-y divide-slate-100 border-y border-slate-100 text-xs dark:divide-slate-800 dark:border-slate-800">
                <div className="flex justify-between py-3">
                  <dt className="text-slate-500 dark:text-slate-400">Status</dt>
                  <dd className="font-semibold capitalize text-slate-900 dark:text-slate-100">
                    {selectedTx.status}
                  </dd>
                </div>
                <div className="flex justify-between py-3">
                  <dt className="text-slate-500 dark:text-slate-400">Account</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">
                    {accountLookup.get(selectedTx.accountId)?.name || selectedTx.currency}
                  </dd>
                </div>
                <div className="flex justify-between py-3">
                  <dt className="text-slate-500 dark:text-slate-400">Category</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">
                    {selectedTx.category}
                  </dd>
                </div>
                <div className="flex justify-between py-3">
                  <dt className="text-slate-500 dark:text-slate-400">Fraud Risk Score</dt>
                  <dd className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {selectedTx.riskScore} / 100
                  </dd>
                </div>
                {selectedTx.convertedAmount && selectedTx.convertedCurrency && (
                  <div className="flex justify-between py-3">
                    <dt className="text-slate-500 dark:text-slate-400">FX Equivalent</dt>
                    <dd className="font-mono font-medium text-slate-900 tabular-nums dark:text-slate-100">
                      {formatMoney(selectedTx.convertedAmount, selectedTx.convertedCurrency)}
                    </dd>
                  </div>
                )}
              </dl>

              {selectedTx.encryptedMemo ? (
                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <span className="inline-flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                      <span>End-to-End Encrypted Memo</span>
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">AES-256-GCM</span>
                  </div>
                  {decryptedMemos[selectedTx.id] ? (
                    <p className="mt-2 text-sm text-slate-800 dark:text-slate-200">
                      {decryptedMemos[selectedTx.id]}
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p className="break-all font-mono text-[11px] text-slate-500">
                        {selectedTx.encryptedMemo.ciphertext}
                      </p>
                      <button
                        type="button"
                        onClick={onRequestUnlockE2EE}
                        className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                      >
                        Unlock E2EE Key to Decrypt
                      </button>
                    </div>
                  )}
                </div>
              ) : selectedTx.plainMemo ? (
                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Memo</p>
                  <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">
                    {selectedTx.plainMemo}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
              {selectedTx.status === 'completed' && selectedTx.amount < 0 ? (
                <button
                  type="button"
                  disabled={disputing}
                  onClick={() => handleDispute(selectedTx)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950"
                >
                  <AlertTriangle className="h-4 w-4" />
                  <span>{disputing ? 'Opening Fraud Dispute...' : 'Report Unrecognized / Fraudulent'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
                >
                  Close Receipt
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
