import { useState, type FormEvent } from 'react';
import { CalendarClock, CheckCircle2, Plus } from 'lucide-react';
import { formatMoney } from '../lib/currency.ts';
import type { BankAccount, PaymentReminder } from '../types/banking.ts';

interface PaymentsViewProps {
  accounts: BankAccount[];
  reminders: PaymentReminder[];
  onAddReminder: (payload: {
    title: string;
    payee: string;
    accountId: string;
    amount: number;
    dueDate: string;
    autoPay: boolean;
  }) => Promise<void>;
  onPayReminder: (reminderId: string) => Promise<void>;
}

export function PaymentsView({
  accounts,
  reminders,
  onAddReminder,
  onPayReminder,
}: PaymentsViewProps) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [payee, setPayee] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [amount, setAmount] = useState('150');
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10)
  );
  const [autoPay, setAutoPay] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !payee.trim()) return;
    await onAddReminder({
      title: title.trim(),
      payee: payee.trim(),
      accountId,
      amount: Number(amount),
      dueDate,
      autoPay,
    });
    setTitle('');
    setPayee('');
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-[#0B2545] dark:text-white">
            Bills & Payment Reminders
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Track upcoming invoices, manage auto-pay, and settle due bills in one click
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B2545] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#133866] whitespace-nowrap dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          <span>Schedule Payment</span>
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Payment title"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 sm:col-span-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
          <input
            type="text"
            required
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            placeholder="Payee name"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
          <input
            type="number"
            required
            min="1"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
          <button
            type="submit"
            className="rounded-lg bg-[#0B2545] px-4 py-2 text-xs font-semibold text-white hover:bg-[#133866] dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            Save Reminder
          </button>

          <div className="flex flex-wrap items-center gap-3 sm:col-span-5">
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={autoPay}
                onChange={(e) => setAutoPay(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-[#0B2545]"
              />
              <span>Enable Auto-Pay</span>
            </label>
          </div>
        </form>
      )}

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {reminders.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No scheduled bills or payment reminders yet.
          </div>
        ) : (
          reminders.map((rem) => (
            <div
              key={rem.id}
              className="flex flex-col justify-between gap-4 px-6 py-4 sm:flex-row sm:items-center"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0B2545] dark:bg-blue-950/60 dark:text-blue-300">
                  <CalendarClock className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0B2545] dark:text-white">
                    {rem.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {rem.payee} · Due {rem.dueDate} · {rem.autoPay ? 'Auto-Pay Active' : 'Manual Approval'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="font-mono text-sm font-bold text-[#0B2545] tabular-nums dark:text-white">
                  {formatMoney(rem.amount, rem.currency)}
                </span>
                {rem.paidThisCycle ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Paid</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onPayReminder(rem.id)}
                    className="rounded-lg bg-[#0B2545] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#133866] whitespace-nowrap dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    Pay Now
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
