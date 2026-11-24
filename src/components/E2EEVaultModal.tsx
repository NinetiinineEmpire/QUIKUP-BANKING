import { useState, type FormEvent } from 'react';
import { KeyRound, Lock, X } from 'lucide-react';
import { deriveE2EEKey } from '../lib/crypto.ts';

interface E2EEVaultModalProps {
  isOpen: boolean;
  saltBase64: string;
  expectedFingerprint: string;
  onUnlock: (key: CryptoKey, fingerprint: string) => void;
  onClose: () => void;
}

export function E2EEVaultModal({
  isOpen,
  saltBase64,
  expectedFingerprint,
  onUnlock,
  onClose,
}: E2EEVaultModalProps) {
  const [passphrase, setPassphrase] = useState('');
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (passphrase.length < 6) {
      setError('Vault passphrase must be at least 6 characters.');
      return;
    }
    setDeriving(true);
    setError(null);
    try {
      const { key, fingerprint } = await deriveE2EEKey(passphrase, saltBase64);
      if (expectedFingerprint && expectedFingerprint !== fingerprint) {
        setError('Passphrase does not match your registered E2EE key fingerprint.');
        setDeriving(false);
        return;
      }
      setPassphrase('');
      onUnlock(key, fingerprint);
    } catch {
      setError('Unable to derive AES-256-GCM encryption key.');
    } finally {
      setDeriving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="e2ee-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="e2ee-modal-title"
                className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                {expectedFingerprint ? 'Unlock E2EE Privacy Key' : 'Create E2EE Privacy Key'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                AES-256-GCM · Key stays strictly in browser memory
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close E2EE key modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Private transfer memos and beneficiary notes are encrypted locally with Web Crypto
            PBKDF2 + AES-256-GCM before reaching QUIKUP servers.
          </p>

          {expectedFingerprint && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950">
              <span className="text-slate-500 dark:text-slate-400">Expected Fingerprint: </span>
              <span className="font-mono font-medium text-slate-900 dark:text-slate-200">
                {expectedFingerprint}
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Encryption Passphrase
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter 6+ character vault passphrase"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              autoFocus
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={deriving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0B2545] px-4 py-2 text-sm font-semibold text-white hover:bg-[#133866] disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <KeyRound className="h-4 w-4" />
              {deriving ? 'Deriving Key...' : expectedFingerprint ? 'Unlock Vault' : 'Activate Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
