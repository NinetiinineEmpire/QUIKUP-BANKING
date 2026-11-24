import { useState } from 'react';
import { Fingerprint, ShieldCheck, X } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { signBiometricChallenge } from '../lib/crypto.ts';
import type { BiometricCredentialRecord } from '../types/banking.ts';

interface BiometricModalProps {
  isOpen: boolean;
  actionLabel: string;
  credentials: BiometricCredentialRecord[];
  sessionToken: string;
  onSuccess: (biometricToken: string) => void;
  onCancel: () => void;
}

export function BiometricModal({
  isOpen,
  actionLabel,
  credentials,
  sessionToken,
  onSuccess,
  onCancel,
}: BiometricModalProps) {
  const [selectedCredId, setSelectedCredId] = useState<string>(
    credentials[0]?.credentialId || ''
  );
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const activeCred =
    credentials.find((c) => c.credentialId === selectedCredId) || credentials[0];

  const handleVerify = async () => {
    if (!activeCred) {
      setError('No enrolled biometric passkey found on this account.');
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const challengeResp = await apiRequest<{ challengeId: string; challenge: string }>(
        '/api/auth/biometric/challenge',
        {
          method: 'POST',
          token: sessionToken,
          body: { purpose: 'stepup' },
        }
      );

      const signed = await signBiometricChallenge(
        activeCred.credentialId,
        activeCred.method,
        challengeResp.challenge
      );

      const verifyResp = await apiRequest<{ biometricToken: string }>(
        '/api/auth/biometric/verify',
        {
          method: 'POST',
          token: sessionToken,
          body: {
            challengeId: challengeResp.challengeId,
            credentialId: signed.credentialId,
            signature: signed.signature,
            clientDataJSON: signed.clientDataJSON,
          },
        }
      );
      onSuccess(verifyResp.biometricToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Biometric verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="biometric-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300">
              <Fingerprint className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="biometric-modal-title"
                className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                Biometric Verification Required
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Confirm identity before continuing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close biometric prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Action requested: <span className="font-semibold text-slate-900 dark:text-white">{actionLabel}</span>
          </p>

          {credentials.length > 1 && (
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Select Enrolled Passkey
              </label>
              <select
                value={activeCred?.credentialId || ''}
                onChange={(e) => setSelectedCredId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {credentials.map((cred) => (
                  <option key={cred.id} value={cred.credentialId}>
                    {cred.label} ({cred.method === 'webauthn' ? 'Platform Biometric' : 'Device ECDSA Key'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeCred && (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-950">
              <span className="text-slate-600 dark:text-slate-400">
                Key: <strong className="text-slate-900 dark:text-slate-200">{activeCred.label}</strong>
              </span>
              <span className="font-mono text-teal-700 dark:text-teal-400">
                {activeCred.method === 'webauthn' ? 'WebAuthn' : 'ECDSA P-256'}
              </span>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleVerify}
            disabled={verifying}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0B2545] px-4 py-2 text-sm font-semibold text-white hover:bg-[#133866] disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <ShieldCheck className="h-4 w-4" />
            {verifying ? 'Verifying...' : 'Verify Biometrics'}
          </button>
        </div>
      </div>
    </div>
  );
}
