import { useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { formatMoney } from '../lib/currency.ts';
import type { PushPermissionState } from '../lib/notifications.ts';
import type {
  BankAccount,
  FraudAlert,
  PaymentReminder,
  SecuritySettings,
  UserProfile,
} from '../types/banking.ts';

interface SecurityCenterViewProps {
  user: UserProfile;
  accounts: BankAccount[];
  fraudAlerts: FraudAlert[];
  reminders: PaymentReminder[];
  e2eeUnlocked: boolean;
  e2eeFingerprint: string;
  pushPermission: PushPermissionState;
  onResolveFraud: (alertId: string, decision: 'approve' | 'block') => Promise<void>;
  onSimulateFraud: () => Promise<void>;
  onEnrollBiometric: (label: string) => Promise<void>;
  onRemoveBiometric: (credId: string) => Promise<void>;
  onUpdateSecurity: (patch: Partial<SecuritySettings>) => Promise<void>;
  onOpenE2EEUnlock: () => void;
  onRotateE2EEKey: (newPassphrase: string) => Promise<void>;
  onRequestPushPermission: () => Promise<void>;
  onTestPushNotification: () => void;
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

export function SecurityCenterView({
  user,
  accounts,
  fraudAlerts,
  reminders,
  e2eeUnlocked,
  e2eeFingerprint,
  pushPermission,
  onResolveFraud,
  onSimulateFraud,
  onEnrollBiometric,
  onRemoveBiometric,
  onUpdateSecurity,
  onOpenE2EEUnlock,
  onRotateE2EEKey,
  onRequestPushPermission,
  onTestPushNotification,
  onAddReminder,
  onPayReminder,
}: SecurityCenterViewProps) {
  const [passkeyLabel, setPasskeyLabel] = useState('MacBook / Device Biometrics');
  const [enrolling, setEnrolling] = useState(false);
  const [simulatingFraud, setSimulatingFraud] = useState(false);
  const [newRotatePass, setNewRotatePass] = useState('');
  const [rotating, setRotating] = useState(false);

  const [remTitle, setRemTitle] = useState('');
  const [remPayee, setRemPayee] = useState('');
  const [remAccountId, setRemAccountId] = useState(accounts[0]?.id || '');
  const [remAmount, setRemAmount] = useState('150');
  const [remDue, setRemDue] = useState(new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10));
  const [remAutoPay, setRemAutoPay] = useState(false);

  const handleEnroll = async (e: FormEvent) => {
    e.preventDefault();
    setEnrolling(true);
    try {
      await onEnrollBiometric(passkeyLabel);
    } finally {
      setEnrolling(false);
    }
  };

  const handleRotate = async (e: FormEvent) => {
    e.preventDefault();
    if (newRotatePass.length < 6) return;
    setRotating(true);
    try {
      await onRotateE2EEKey(newRotatePass);
      setNewRotatePass('');
    } finally {
      setRotating(false);
    }
  };

  const handleCreateReminder = async (e: FormEvent) => {
    e.preventDefault();
    if (!remTitle.trim() || !remPayee.trim()) return;
    await onAddReminder({
      title: remTitle.trim(),
      payee: remPayee.trim(),
      accountId: remAccountId,
      amount: Number(remAmount),
      dueDate: remDue,
      autoPay: remAutoPay,
    });
    setRemTitle('');
    setRemPayee('');
  };

  return (
    <div className="space-y-6">
      {/* Real-Time Fraud Alerts Queue */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Real-Time Fraud Monitoring
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Continuous velocity, geolocation, and cross-border risk scoring
            </p>
          </div>
          <button
            type="button"
            disabled={simulatingFraud}
            onClick={async () => {
              setSimulatingFraud(true);
              try {
                await onSimulateFraud();
              } finally {
                setSimulatingFraud(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span>{simulatingFraud ? 'Triggering...' : 'Simulate Fraud Alert'}</span>
          </button>
        </div>

        <div className="mt-5 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {fraudAlerts.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Zero suspicious alerts recorded on your portfolio.
            </p>
          ) : (
            fraudAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {alert.status === 'open' ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Action Required</span>
                      </span>
                    ) : alert.status === 'approved' ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Verified by You</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-400">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Blocked & Refunded</span>
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-500 dark:text-slate-400">{alert.location}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                      {formatMoney(alert.amount, alert.currency)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {alert.title}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{alert.description}</p>
                  <p className="font-mono text-[11px] text-slate-400">{alert.deviceInfo}</p>
                </div>

                {alert.status === 'open' && (
                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onResolveFraud(alert.id, 'approve')}
                      className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                    >
                      Approve Charge
                    </button>
                    <button
                      type="button"
                      onClick={() => onResolveFraud(alert.id, 'block')}
                      className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      Block & Refund
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Biometric Auth + End-to-End Encryption Grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Biometric Authentication */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <Fingerprint className="h-5 w-5 text-teal-700 dark:text-teal-400" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Biometric Passkey Security
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                WebAuthn & hardware-bound ECDSA P-256 verification for logins and account edits
              </p>
            </div>
          </div>

          <form onSubmit={handleEnroll} className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              required
              value={passkeyLabel}
              onChange={(e) => setPasskeyLabel(e.target.value)}
              placeholder="Device passkey name"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={enrolling}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60 whitespace-nowrap dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{enrolling ? 'Enrolling...' : 'Enroll Biometric Key'}</span>
            </button>
          </form>

          <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {user.biometrics.length === 0 ? (
              <p className="py-4 text-xs text-slate-500 dark:text-slate-400">
                No passkeys enrolled yet. Enroll a passkey on this device to unlock biometric login
                and step-up action locks.
              </p>
            ) : (
              user.biometrics.map((cred) => (
                <div key={cred.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {cred.label}
                    </p>
                    <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {cred.method === 'webauthn' ? 'WebAuthn Platform' : 'ECDSA P-256 Vault'} ·{' '}
                      Added {new Date(cred.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveBiometric(cred.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    aria-label="Remove passkey"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <label className="flex items-center justify-between gap-4 text-xs">
              <span className="text-slate-700 dark:text-slate-300">
                <strong className="block text-slate-900 dark:text-white">
                  Require Biometrics for Account Modifications
                </strong>
                Protects card freeze, limit edits, account freeze, and high-value wires
              </span>
              <input
                type="checkbox"
                disabled={user.biometrics.length === 0}
                checked={user.security.biometricActionLockEnabled}
                onChange={(e) =>
                  onUpdateSecurity({ biometricActionLockEnabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
            </label>
          </div>
        </section>

        {/* End-to-End Encryption Vault */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Lock className="h-5 w-5 text-teal-700 dark:text-teal-400" />
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  End-to-End Encryption (E2EE)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Client-side Web Crypto AES-256-GCM · PBKDF2-SHA256 (100,000 rounds)
                </p>
              </div>
            </div>

            <span
              className={`font-mono text-xs font-semibold ${
                e2eeUnlocked
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {e2eeUnlocked ? 'Key Unlocked' : 'Locked'}
            </span>
          </div>

          <div className="mt-5 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Active Key Fingerprint</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                {e2eeFingerprint || user.security.e2eeKeyFingerprint || 'Not initialized'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Cipher Suite</span>
              <span className="font-mono text-slate-900 dark:text-slate-100">AES-256-GCM</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Your encryption key is derived purely inside browser memory and is never persisted to
              disk or transmitted to QUIKUP servers.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenE2EEUnlock}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>{e2eeUnlocked ? 'Verify Key' : 'Unlock / Initialize Key'}</span>
            </button>
          </div>

          {e2eeUnlocked && (
            <form
              onSubmit={handleRotate}
              className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800"
            >
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Rotate E2EE Key (Re-encrypts existing private memos)
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  type="password"
                  minLength={6}
                  required
                  value={newRotatePass}
                  onChange={(e) => setNewRotatePass(e.target.value)}
                  placeholder="New 6+ char passphrase"
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={rotating}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>{rotating ? 'Rotating...' : 'Rotate Key'}</span>
                </button>
              </div>
            </form>
          )}
        </section>
      </div>

      {/* Push Notifications & Payment Reminders Manager */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-6 xl:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <Bell className="h-5 w-5 text-teal-700 dark:text-teal-400" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Push Notification Channels
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Browser Permission:{' '}
                <strong className="capitalize text-slate-900 dark:text-slate-200">
                  {pushPermission}
                </strong>
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2.5">
            {pushPermission !== 'granted' && pushPermission !== 'unsupported' && (
              <button
                type="button"
                onClick={onRequestPushPermission}
                className="rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
              >
                Enable Browser Push Alerts
              </button>
            )}
            <button
              type="button"
              onClick={onTestPushNotification}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Send Test Alert
            </button>
          </div>

          <div className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-xs dark:border-slate-800">
            <label className="flex items-center justify-between">
              <span className="text-slate-700 dark:text-slate-300">
                Real-Time Transaction Alerts
              </span>
              <input
                type="checkbox"
                checked={user.security.pushTransactionsEnabled}
                onChange={(e) =>
                  onUpdateSecurity({ pushTransactionsEnabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 text-teal-700"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-slate-700 dark:text-slate-300">
                Payment Due Reminders
              </span>
              <input
                type="checkbox"
                checked={user.security.pushRemindersEnabled}
                onChange={(e) =>
                  onUpdateSecurity({ pushRemindersEnabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 text-teal-700"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-slate-700 dark:text-slate-300">
                Fraud & Security Alerts
              </span>
              <input
                type="checkbox"
                checked={user.security.pushFraudEnabled}
                onChange={(e) => onUpdateSecurity({ pushFraudEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-teal-700"
              />
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 xl:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="h-5 w-5 text-teal-700 dark:text-teal-400" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Scheduled Payment Reminders
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Add recurring invoices to receive timely due-date notifications
              </p>
            </div>
          </div>

          <form
            onSubmit={handleCreateReminder}
            className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-5"
          >
            <input
              type="text"
              required
              value={remTitle}
              onChange={(e) => setRemTitle(e.target.value)}
              placeholder="Bill title"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 sm:col-span-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <input
              type="text"
              required
              value={remPayee}
              onChange={(e) => setRemPayee(e.target.value)}
              placeholder="Payee"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <input
              type="number"
              required
              min="1"
              step="0.01"
              value={remAmount}
              onChange={(e) => setRemAmount(e.target.value)}
              placeholder="Amount"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800"
            >
              Add Reminder
            </button>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-5">
              <select
                value={remAccountId}
                onChange={(e) => setRemAccountId(e.target.value)}
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
                value={remDue}
                onChange={(e) => setRemDue(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={remAutoPay}
                  onChange={(e) => setRemAutoPay(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700"
                />
                <span>Auto-pay enabled</span>
              </label>
            </div>
          </form>

          <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {reminders.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-3 text-xs">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{r.title}</p>
                  <p className="text-slate-500 dark:text-slate-400">
                    {r.payee} · Due {r.dueDate} · {r.autoPay ? 'Auto-Pay' : 'Manual'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {formatMoney(r.amount, r.currency)}
                  </span>
                  {r.paidThisCycle ? (
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      Settled
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPayReminder(r.id)}
                      className="rounded-md border border-slate-200 px-2.5 py-1 font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Pay
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
