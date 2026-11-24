import { useState, type FormEvent } from 'react';
import { Check, Copy, Landmark, Plus, Snowflake, Unlock } from 'lucide-react';
import { convertCurrency, formatMoney, SUPPORTED_CURRENCIES } from '../lib/currency.ts';
import type { AccountType, BankAccount, CurrencyCode, FxRateMap } from '../types/banking.ts';

interface AccountsViewProps {
  accounts: BankAccount[];
  fxRates: FxRateMap;
  displayCurrency: CurrencyCode;
  onOpenAccount: (payload: { name: string; currency: CurrencyCode; type: AccountType }) => Promise<void>;
  onToggleFreezeAccount: (account: BankAccount) => Promise<void>;
}

export function AccountsView({
  accounts,
  fxRates,
  displayCurrency,
  onOpenAccount,
  onToggleFreezeAccount,
}: AccountsViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('CHF');
  const [type, setType] = useState<AccountType>('multi-currency');
  const [submitting, setSubmitting] = useState(false);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onOpenAccount({ name: name.trim(), currency, type });
      setName('');
      setShowNewModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-[#0B2545] dark:text-white">
            Accounts & Multi-Currency Wallets
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Local IBANs, high-yield savings reserves, and instant freeze controls
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0B2545] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#133866] whitespace-nowrap dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          <span>Open New Account</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((acc) => {
          const converted =
            acc.currency !== displayCurrency
              ? convertCurrency(acc.balance, acc.currency, displayCurrency, fxRates)
              : null;
          return (
            <div
              key={acc.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0B2545] dark:bg-blue-950/60 dark:text-blue-300">
                      <Landmark className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-display text-sm font-semibold text-[#0B2545] dark:text-white">
                        {acc.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {acc.currency} · <span className="capitalize">{acc.type.replace('-', ' ')}</span>
                        {acc.apy ? ` · ${acc.apy}% APY` : ''}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleFreezeAccount(acc)}
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                      acc.frozen
                        ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {acc.frozen ? (
                      <>
                        <Unlock className="h-3.5 w-3.5" />
                        <span>Frozen</span>
                      </>
                    ) : (
                      <>
                        <Snowflake className="h-3.5 w-3.5" />
                        <span>Active</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="mt-5 font-display text-2xl font-bold text-[#0B2545] tabular-nums dark:text-white">
                  {formatMoney(acc.balance, acc.currency)}
                </p>
                {converted !== null && (
                  <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                    ≈ {formatMoney(converted, displayCurrency)}
                  </p>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <span className="truncate font-mono">{acc.ibanOrAccountNo}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(acc.id, acc.ibanOrAccountNo)}
                  className="inline-flex items-center gap-1 font-medium text-[#0B2545] hover:underline whitespace-nowrap dark:text-blue-400"
                >
                  {copiedId === acc.id ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700 dark:text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showNewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-lg font-semibold text-[#0B2545] dark:text-white">
              Open New Currency Account
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Instant local IBAN or account number provisioning with zero monthly fees.
            </p>
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Zurich CHF Treasury"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Type
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as AccountType)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="multi-currency">Multi-Currency</option>
                    <option value="checking">Checking</option>
                    <option value="savings">High-Yield Savings</option>
                    <option value="vault">Travel Vault</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#0B2545] px-4 py-2 text-xs font-semibold text-white hover:bg-[#133866] disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  {submitting ? 'Opening...' : 'Open Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
