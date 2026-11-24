import type { EncryptedBlob } from '../types/banking.ts';

function toBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  return toBase64(buffer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return fromBase64(padded);
}

/**
 * Derives an AES-256-GCM CryptoKey and deterministic fingerprint from a user vault passphrase + salt.
 */
export async function deriveE2EEKey(
  passphrase: string,
  saltBase64: string
): Promise<{ key: CryptoKey; fingerprint: string }> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey', 'deriveBits']
  );

  const saltBytes = fromBase64(saltBase64);
  const saltBuffer = new ArrayBuffer(saltBytes.byteLength);
  new Uint8Array(saltBuffer).set(saltBytes);

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const fpBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    128
  );
  const fpDigest = await crypto.subtle.digest('SHA-256', fpBits);
  const fpHex = Array.from(new Uint8Array(fpDigest).slice(0, 6))
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');

  return { key: aesKey, fingerprint: fpHex };
}

export async function encryptMemoAES(
  plaintext: string,
  key: CryptoKey,
  keyFingerprint: string
): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  return {
    alg: 'AES-256-GCM',
    iv: toBase64(iv),
    ciphertext: toBase64(cipherBuffer),
    keyFingerprint,
  };
}

export async function decryptMemoAES(
  blob: EncryptedBlob,
  key: CryptoKey
): Promise<string> {
  const ivBytes = fromBase64(blob.iv);
  const ivBuffer = new ArrayBuffer(ivBytes.byteLength);
  new Uint8Array(ivBuffer).set(ivBytes);

  const ctBytes = fromBase64(blob.ciphertext);
  const ctBuffer = new ArrayBuffer(ctBytes.byteLength);
  new Uint8Array(ctBuffer).set(ctBytes);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    ctBuffer
  );
  return new TextDecoder().decode(plainBuffer);
}

// IndexedDB storage for non-extractable ECDSA P-256 passkey fallback when WebAuthn platform prompts are blocked in sandboxed iframes
const DB_NAME = 'countree_device_vault';
const STORE_NAME = 'device_keys';

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDeviceKeyPair(id: string, pair: CryptoKeyPair): Promise<void> {
  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(pair, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadDeviceKeyPair(id: string): Promise<CryptoKeyPair | null> {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as CryptoKeyPair) || null);
    req.onerror = () => reject(req.error);
  });
}

export interface BiometricEnrollResult {
  method: 'webauthn' | 'device-ecdsa';
  credentialId: string;
  publicKeySpki: string;
  label: string;
}

export async function enrollBiometricPasskey(
  userId: string,
  userEmail: string,
  userName: string,
  challengeB64Url: string,
  label: string
): Promise<BiometricEnrollResult> {
  // Attempt real WebAuthn Platform Authenticator first
  if (typeof window !== 'undefined' && window.PublicKeyCredential && navigator.credentials) {
    try {
      const challengeBytes = fromBase64Url(challengeB64Url);
      const challengeBuf = new ArrayBuffer(challengeBytes.byteLength);
      new Uint8Array(challengeBuf).set(challengeBytes);

      const userIdBytes = new TextEncoder().encode(userId);
      const userIdBuf = new ArrayBuffer(userIdBytes.byteLength);
      new Uint8Array(userIdBuf).set(userIdBytes);

      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: challengeBuf,
          rp: { name: 'QUIKUP', id: window.location.hostname },
          user: {
            id: userIdBuf,
            name: userEmail,
            displayName: userName,
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256
            { type: 'public-key', alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 30000,
        },
      })) as PublicKeyCredential | null;

      if (cred) {
        const resp = cred.response as AuthenticatorAttestationResponse;
        const spki = resp.getPublicKey ? resp.getPublicKey() : null;
        return {
          method: 'webauthn',
          credentialId: cred.id,
          publicKeySpki: spki ? toBase64(spki) : toBase64(resp.attestationObject),
          label,
        };
      }
    } catch {
      // Fall through cleanly to non-extractable Device ECDSA P-256 keypair if iframe/platform blocks WebAuthn
    }
  }

  // Hardware/Browser-bound non-extractable ECDSA P-256 keypair stored in IndexedDB
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify']
  );
  const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const credentialId = `ctk_${toBase64Url(crypto.getRandomValues(new Uint8Array(18)))}`;
  await saveDeviceKeyPair(credentialId, keyPair);

  return {
    method: 'device-ecdsa',
    credentialId,
    publicKeySpki: toBase64(spki),
    label,
  };
}

export async function signBiometricChallenge(
  credentialId: string,
  method: 'webauthn' | 'device-ecdsa',
  challengeB64Url: string
): Promise<{
  credentialId: string;
  method: 'webauthn' | 'device-ecdsa';
  signature: string;
  authenticatorData?: string;
  clientDataJSON?: string;
}> {
  if (method === 'webauthn' && window.PublicKeyCredential && navigator.credentials) {
    const challengeBytes = fromBase64Url(challengeB64Url);
    const challengeBuf = new ArrayBuffer(challengeBytes.byteLength);
    new Uint8Array(challengeBuf).set(challengeBytes);

    const credIdBytes = fromBase64Url(credentialId);
    const credIdBuf = new ArrayBuffer(credIdBytes.byteLength);
    new Uint8Array(credIdBuf).set(credIdBytes);

    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: challengeBuf,
        allowCredentials: [{ id: credIdBuf, type: 'public-key' }],
        userVerification: 'required',
        timeout: 30000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error('Biometric verification cancelled');
    }
    const resp = assertion.response as AuthenticatorAssertionResponse;
    return {
      credentialId: assertion.id,
      method: 'webauthn',
      signature: toBase64(resp.signature),
      authenticatorData: toBase64(resp.authenticatorData),
      clientDataJSON: toBase64(resp.clientDataJSON),
    };
  }

  const pair = await loadDeviceKeyPair(credentialId);
  if (!pair) {
    throw new Error('Device passkey not found on this browser. Please enroll a passkey on this device.');
  }
  const encodedChallenge = new TextEncoder().encode(challengeB64Url);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    encodedChallenge
  );
  return {
    credentialId,
    method: 'device-ecdsa',
    signature: toBase64(sig),
  };
}
