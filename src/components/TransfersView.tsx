import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  KeyRound,
  Lock,
  Receipt,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { encryptMemoAES } from '../lib/crypto.ts';
import { convertCurrency, formatMoney, getCrossRate, SUPPORTED_CURRENCIES } from '../lib/currency.ts';
import type {
  BankAccount,
  CurrencyCode,
  EncryptedBlob,
  FxRateMap,
  SavedBeneficiary,
  TransactionCategory,
} from '../types/banking.ts';

interface TransfersViewProps {
  accounts: BankAccount[];
  beneficiaries: SavedBeneficiary[];
  fxRates: FxRateMap;
  e2eeKey: CryptoKey | null;
  e2eeFingerprint: string;
  highValueThresholdUsd: number;
  onRequestUnlockE2EE: () => void;
  onSubmitTransfer: (payload: {
    mode: 'internal' | 'external' | 'bill_pay';
    fromAccountId: string;
    toAccountId?: string;
    recipientName?: string;
    recipientTarget?: string;
    targetCurrency: CurrencyCode;
    category?: TransactionCategory;
    amount: number;
    plainMemo?: string;
    encryptedMemo?: EncryptedBlob | null;
  }) => Promise<{ fraudFlagged: boolean }>;
}

const BILL_CATEGORIES: TransactionCategory[] = [
  'Housing',
  'Utilities',
  'Software & Cloud',
  'Dining & Groceries',
  'Travel & FX',
  'Shopping',
];

export function TransfersView({
  accounts,
  beneficiaries,
  fxRates,
  e2eeKey,
  e2eeFingerprint,
  highValueThresholdUsd,
  onRequestUnlockE2EE,
  onSubmitTransfer,
}: TransfersViewProps) {
  const [mode, setMode] = useState<'external' | 'internal' | 'bill_pay'>('external');
  const [fromAccountId, setFromAccountId] = useState<string>(accounts[0]?.id || '');
  const [toAccountId, setToAccountId] = useState<string>(accounts[1]?.id || accounts[0]?.id || '');
  const [recipientName, setRecipientName] = useState('');
  const [recipientTarget, setRecipientTarget] = useState('');
  const [targetCurrency, setTargetCurrency] = useState<CurrencyCode>('USD');
  const [billCategory, setBillCategory] = useState<TransactionCategory>('Utilities');
  const [amountStr, setAmountStr] = useState('250');
  const [memo, setMemo] = useState('');
  const [encryptMemo, setEncryptMemo] = useState(Boolean(e2eeKey));
  const [cipherPreview, setCipherPreview] = useState<EncryptedBlob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptMsg, setReceiptMsg] = useState<{ text: string; flagged: boolean } | null>(null);

  const fromAccount = accounts.find((a) => a.id === fromAccountId) || accounts[0];
  const toAccount = accounts.find((a) => a.id === toAccountId) || accounts[1] || accounts[0];
  const numericAmount = Number(amountStr) || 0;

  const destinationCurrency: CurrencyCode =
    mode === 'internal' && toAccount ? toAccount.currency : targetCurrency;

  const crossRate = fromAccount
    ? getCrossRate(fromAccount.currency, destinationCurrency, fxRates)
    : 1;
  const convertedPreview = fromAccount
    ? convertCurrency(numericAmount, fromAccount.currency, destinationCurrency, fxRates)
    : numericAmount;

  const usdEquivalent = fromAccount
    ? convertCurrency(numericAmount, fromAccount.currency, 'USD', fxRates)
    : numericAmount;

  // Live preview of AES-256-GCM ciphertext when E2EE key is unlocked
  useEffect(() => {
    let active = true;
    if (encryptMemo && e2eeKey && memo.trim()) {
      encryptMemoAES(memo.trim(), e2eeKey, e2eeFingerprint)
        .then((blob) => {
          if (active) setCipherPreview(blob);
        })
        .catch(() => {
          if (active) setCipherPreview(null);
        });
    } else {
      setCipherPreview(null);
    }
    return () => {
      active = false;
    };
  }, [memo, encryptMemo, e2eeKey, e2eeFingerprint]);

  const handleSelectBeneficiary = (b: SavedBeneficiary) => {
    setMode('external');
    setRecipientName(b.name);
    setRecipientTarget(b.handleOrIban);
    setTargetCurrency(b.currency);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fromAccount) return;
    setSubmitting(true);
    setError(null);
    setReceiptMsg(null);

    try {
      let encryptedMemo: EncryptedBlob | null = null;
      let plainMemo: string | undefined;

      if (memo.trim()) {
        if (encryptMemo) {
          if (!e2eeKey) {
            onRequestUnlockE2EE();
            setSubmitting(false);
            return;
          }
          encryptedMemo = await encryptMemoAES(memo.trim(), e2eeKey, e2eeFingerprint);
        } else {
          plainMemo = memo.trim();
        }
      }

      const res = await onSubmitTransfer({
        mode,
        fromAccountId: fromAccount.id,
        toAccountId: mode === 'internal' ? toAccount?.id : undefined,
        recipientName: mode !== 'internal' ? recipientName : undefined,
        recipientTarget: mode !== 'internal' ? recipientTarget : undefined,
        targetCurrency: destinationCurrency,
        category: mode === 'bill_pay' ? billCategory : 'Transfers',
        amount: numericAmount,
        plainMemo,
        encryptedMemo,
      });

      setReceiptMsg({
        flagged: res.fraudFlagged,
        text: res.fraudFlagged
          ? 'Transfer created and flagged by Real-Time Fraud Defense for verification.'
          : 'Transfer settled and ledger updated.',
      });
      setMemo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer could not be completed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <section className="rounded-xl border border-slate-200 bg-white p-6 xl:col-span-8 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Move & Convert Funds
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Multi-currency wires, instant FX conversion, and scheduled bill settlement
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setMode('external')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                mode === 'external'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send Money</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('internal')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                mode === 'internal'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span>FX Convert</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('bill_pay')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                mode === 'bill_pay'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              <span>Bill Pay</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Source Account
              </label>
              <select
                value={fromAccount?.id || ''}
                onChange={(e) => setFromAccountId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({formatMoney(acc.balance, acc.currency)})
                  </option>
                ))}
              </select>
            </div>

            {mode === 'internal' ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Destination Account
                </label>
                <select
                  value={toAccount?.id || ''}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency} · {formatMoney(acc.balance, acc.currency)})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Settlement Currency
                </label>
                <select
                  value={targetCurrency}
                  onChange={(e) => setTargetCurrency(e.target.value as CurrencyCode)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {mode !== 'internal' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {mode === 'bill_pay' ? 'Biller / Merchant Name' : 'Recipient Full Name or Entity'}
                </label>
                <input
                  type="text"
                  required
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder={mode === 'bill_pay' ? 'Pacific Grid & Fiber' : 'Elena Rostova Studio'}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {mode === 'bill_pay' ? 'Account / Invoice Number' : 'IBAN, Routing & Account, or Email'}
                </label>
                <input
                  type="text"
                  required
                  value={recipientTarget}
                  onChange={(e) => setRecipientTarget(e.target.value)}
                  placeholder={mode === 'bill_pay' ? 'INV-2026-8831' : 'DE44 5001 0517 5407 3249 31'}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>
          )}

          {mode === 'bill_pay' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Budget Category
              </label>
              <select
                value={billCategory}
                onChange={(e) => setBillCategory(e.target.value as TransactionCategory)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {BILL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Amount ({fromAccount?.currency || 'USD'})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-base font-semibold text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-col justify-end rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Recipient / Target Receives (1 {fromAccount?.currency} = {crossRate.toFixed(4)}{' '}
                {destinationCurrency})
              </span>
              <span className="mt-0.5 font-mono text-base font-semibold text-slate-900 tabular-nums dark:text-white">
                {formatMoney(convertedPreview, destinationCurrency)}
              </span>
            </div>
          </div>

          {/* E2EE Encrypted Memo Section */}
          <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Transfer Memo / Private Note
              </label>
              <div className="flex items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={encryptMemo}
                    onChange={(e) => setEncryptMemo(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                  <Lock className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                  <span>End-to-End Encrypt (AES-256-GCM)</span>
                </label>
                {encryptMemo && !e2eeKey && (
                  <button
                    type="button"
                    onClick={onRequestUnlockE2EE}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>Unlock E2EE Key</span>
                  </button>
                )}
              </div>
            </div>

            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={200}
              placeholder="Optional reference note (encrypted locally before transmission)"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />

            {cipherPreview && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <span className="font-semibold text-teal-700 dark:text-teal-400">
                  AES-256-GCM Ciphertext Sent to Server:{' '}
                </span>
                <span className="break-all">{cipherPreview.ciphertext.slice(0, 72)}...</span>
              </div>
            )}
          </div>

          {usdEquivalent >= highValueThresholdUsd && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                High-value transfer ({formatMoney(usdEquivalent, 'USD')} equivalent). Real-time fraud
                scoring and biometric confirmation (when locked) apply automatically.
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          {receiptMsg && (
            <div
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
                receiptMsg.flagged
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
              }`}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{receiptMsg.text}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0B2545] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#133866] disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Send className="h-4 w-4" />
              <span>
                {submitting
                  ? 'Processing...'
                  : mode === 'internal'
                    ? 'Convert & Settle'
                    : mode === 'bill_pay'
                      ? 'Submit Bill Payment'
                      : 'Dispatch Transfer'}
              </span>
            </button>
          </div>
        </form>
      </section>

      {/* Right Rail: Quick Beneficiaries & Live FX Desk */}
      <aside className="space-y-6 xl:col-span-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Saved Verified Recipients
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Click to prefill verified payment details
          </p>

          {beneficiaries.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              New recipients you transfer to can be inspected in your ledger.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {beneficiaries.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleSelectBeneficiary(b)}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {b.name}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {b.bankName} · {b.country}
                    </p>
                  </div>
                  <span className="font-mono text-xs font-semibold text-teal-700 shrink-0 dark:text-teal-400">
                    {b.currency}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            QUIKUP FX Mid-Market Desk
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Reference rates against 1.00 USD
          </p>
          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {SUPPORTED_CURRENCIES.filter((c) => c.code !== 'USD').map((c) => (
              <div key={c.code} className="flex items-center justify-between py-2.5 text-xs">
                <span className="text-slate-700 dark:text-slate-300">
                  <strong className="font-mono">{c.code}</strong> · {c.name}
                </span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                  {fxRates[c.code].toFixed(c.code === 'JPY' ? 2 : 4)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
