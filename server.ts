import crypto from 'node:crypto';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  createBankAccount,
  createPaymentReminder,
  createSavingsGoal,
  contributeToSavingsGoal,
  disputeTransaction,
  enrollBiometricCredential,
  executeTransfer,
  findUserByEmail,
  generateId,
  getBankingBootstrap,
  getOrCreateUserAndPortfolio,
  getUserRecord,
  mapUser,
  markNotificationsRead,
  payPaymentReminder,
  registerPasswordUser,
  removeBiometricCredential,
  resolveFraudAlert,
  rotateE2eeKeys,
  simulateFraudAlert,
  toUsd,
  touchBiometricLastUsed,
  updateBankAccount,
  updateBankCard,
  updateBudgetLimit,
  updateUserSecuritySettings,
  upsertBudget,
  VALID_CATEGORIES,
  VALID_CURRENCIES,
} from './src/db/banking.ts';
import {
  hashPassword,
  signToken,
  verifyPassword,
  verifySignedToken,
} from './src/lib/session-token.ts';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import type {
  AccountType,
  BiometricCredentialRecord,
  CurrencyCode,
  EncryptedBlob,
  SecuritySettings,
  TransactionCategory,
} from './src/types/banking.ts';

dotenv.config();

const PORT = 3000;

interface ChallengeEntry {
  nonce: string;
  userUid: string;
  purpose: 'enroll' | 'stepup';
  expiresAt: number;
}

const activeChallenges = new Map<string, ChallengeEntry>();

function verifyStepUpIfRequired(
  req: AuthRequest,
  userUid: string,
  security: SecuritySettings,
  biometrics: BiometricCredentialRecord[],
  res: Response
): boolean {
  if (!security.biometricActionLockEnabled || biometrics.length === 0) {
    return true;
  }
  const bioHeader = req.headers['x-biometric-token'];
  if (typeof bioHeader !== 'string' || !bioHeader) {
    res.status(403).json({
      error: 'Biometric step-up verification required for this action.',
      code: 'BIOMETRIC_STEPUP_REQUIRED',
    });
    return false;
  }
  const parsed = verifySignedToken(bioHeader);
  if (!parsed || parsed.userUid !== userUid || parsed.purpose !== 'stepup') {
    res.status(403).json({
      error: 'Biometric verification expired or invalid. Please re-verify.',
      code: 'BIOMETRIC_STEPUP_REQUIRED',
    });
    return false;
  }
  return true;
}

function verifyBiometricSignature(
  cred: BiometricCredentialRecord,
  challengeNonce: string,
  signatureB64: string,
  clientDataJSONB64?: string
): boolean {
  if (!signatureB64 || typeof signatureB64 !== 'string') return false;

  if (cred.method === 'device-ecdsa' && cred.publicKeySpki) {
    try {
      const spkiDer = Buffer.from(cred.publicKeySpki, 'base64');
      const publicKey = crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
      const sigBuf = Buffer.from(signatureB64, 'base64');
      return crypto.verify(
        'sha256',
        Buffer.from(challengeNonce, 'utf8'),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        sigBuf
      );
    } catch {
      return false;
    }
  }

  if (cred.method === 'webauthn') {
    if (!clientDataJSONB64 || typeof clientDataJSONB64 !== 'string') return false;
    try {
      const clientData = JSON.parse(
        Buffer.from(clientDataJSONB64, 'base64').toString('utf8')
      ) as { challenge?: string; type?: string };
      return clientData.type === 'webauthn.get' && clientData.challenge === challengeNonce;
    } catch {
      return false;
    }
  }

  return false;
}

function isEncryptedBlob(val: unknown): val is EncryptedBlob {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    obj.alg === 'AES-256-GCM' &&
    typeof obj.iv === 'string' &&
    obj.iv.length <= 64 &&
    typeof obj.ciphertext === 'string' &&
    obj.ciphertext.length <= 4096 &&
    typeof obj.keyFingerprint === 'string' &&
    obj.keyFingerprint.length <= 64
  );
}

async function resolveAuthedUser(req: AuthRequest) {
  const uid = req.user!.uid;
  const existing = await getUserRecord(uid);
  if (existing) return existing;
  return getOrCreateUserAndPortfolio(
    uid,
    req.user!.email || '',
    typeof req.user!.name === 'string' ? req.user!.name : undefined
  );
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'QUIKUP API' });
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const preferredCurrency: CurrencyCode = VALID_CURRENCIES.includes(req.body?.preferredCurrency)
        ? req.body.preferredCurrency
        : 'USD';
      const includeSamplePortfolio = req.body?.includeSamplePortfolio !== false;

      if (fullName.length < 2 || fullName.length > 80) {
        res.status(400).json({ error: 'Please enter your full name (2 to 80 characters).' });
        return;
      }

      if (email.length < 5 || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }

      if (password.length < 8 || password.length > 128) {
        res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
        return;
      }

      const { salt, hash } = hashPassword(password);
      const result = await registerPasswordUser({
        fullName,
        email,
        passwordSalt: salt,
        passwordHash: hash,
        preferredCurrency,
        includeSamplePortfolio,
      });

      if (result.errorStatus || !result.user) {
        res.status(result.errorStatus || 400).json({
          error: result.errorMessage || 'Unable to register account.',
        });
        return;
      }

      const token = signToken(
        {
          uid: result.user.id,
          email: result.user.email,
          name: result.user.fullName,
          purpose: 'session',
        },
        60 * 60 * 24
      );

      res.status(201).json({ token, user: result.user });
    } catch {
      res.status(500).json({ error: 'Unable to create account right now.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!email || email.length > 120 || !password || password.length > 128) {
        res.status(400).json({ error: 'Please enter both your email and password.' });
        return;
      }

      const user = await findUserByEmail(email);
      if (
        !user ||
        !user.passwordSalt ||
        !user.passwordHash ||
        !verifyPassword(password, user.passwordSalt, user.passwordHash)
      ) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const mapped = mapUser(user);
      const token = signToken(
        {
          uid: mapped.id,
          email: mapped.email,
          name: mapped.fullName,
          purpose: 'session',
        },
        60 * 60 * 24
      );

      res.json({ token, user: mapped });
    } catch {
      res.status(500).json({ error: 'Unable to sign in right now.' });
    }
  });

  app.post('/api/auth/biometric/challenge', requireAuth, (req: AuthRequest, res) => {
    const purpose = req.body?.purpose === 'enroll' ? 'enroll' : 'stepup';
    const challengeId = generateId('chg');
    const nonce = crypto.randomBytes(32).toString('base64url');
    activeChallenges.set(challengeId, {
      nonce,
      userUid: req.user!.uid,
      purpose,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    res.json({ challengeId, challenge: nonce });
  });

  app.post('/api/auth/biometric/verify', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await resolveAuthedUser(req);
      const challengeId = typeof req.body?.challengeId === 'string' ? req.body.challengeId : '';
      const credentialId = typeof req.body?.credentialId === 'string' ? req.body.credentialId : '';
      const signature = typeof req.body?.signature === 'string' ? req.body.signature : '';
      const clientDataJSON =
        typeof req.body?.clientDataJSON === 'string' ? req.body.clientDataJSON : undefined;

      const challengeEntry = activeChallenges.get(challengeId);
      activeChallenges.delete(challengeId);

      if (
        !challengeEntry ||
        challengeEntry.expiresAt < Date.now() ||
        challengeEntry.userUid !== user.uid ||
        challengeEntry.purpose !== 'stepup'
      ) {
        res.status(401).json({ error: 'Biometric verification challenge expired.' });
        return;
      }

      const cred = (user.biometrics || []).find((b) => b.credentialId === credentialId);
      if (
        !cred ||
        !verifyBiometricSignature(cred, challengeEntry.nonce, signature, clientDataJSON)
      ) {
        res.status(401).json({ error: 'Biometric verification failed.' });
        return;
      }

      await touchBiometricLastUsed(user, cred.credentialId);
      const biometricToken = signToken({ userUid: user.uid, purpose: 'stepup' }, 5 * 60);
      res.json({ biometricToken, expiresInSeconds: 300 });
    } catch {
      res.status(500).json({ error: 'Unable to verify biometric credential.' });
    }
  });

  app.get('/api/banking/bootstrap', requireAuth, async (req: AuthRequest, res) => {
    try {
      const payload = await getBankingBootstrap(
        req.user!.uid,
        req.user!.email || '',
        typeof req.user!.name === 'string' ? req.user!.name : undefined
      );
      res.json(payload);
    } catch {
      res.status(500).json({ error: 'Unable to load banking portfolio.' });
    }
  });

  app.post('/api/accounts', requireAuth, async (req: AuthRequest, res) => {
    try {
      await resolveAuthedUser(req);
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const currency: CurrencyCode = VALID_CURRENCIES.includes(req.body?.currency)
        ? req.body.currency
        : 'USD';
      const type: AccountType =
        req.body?.type === 'checking' ||
        req.body?.type === 'savings' ||
        req.body?.type === 'multi-currency' ||
        req.body?.type === 'vault'
          ? req.body.type
          : 'multi-currency';

      if (name.length < 2 || name.length > 50) {
        res.status(400).json({ error: 'Account name must be 2 to 50 characters.' });
        return;
      }

      const account = await createBankAccount(req.user!.uid, { name, currency, type });
      res.status(201).json({ account });
    } catch {
      res.status(500).json({ error: 'Unable to open account.' });
    }
  });

  app.patch('/api/accounts/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await resolveAuthedUser(req);
      if (!verifyStepUpIfRequired(req, user.uid, user.security, user.biometrics, res)) return;

      const patch: { frozen?: boolean; name?: string } = {};
      if (typeof req.body?.frozen === 'boolean') patch.frozen = req.body.frozen;
      if (typeof req.body?.name === 'string' && req.body.name.trim().length >= 2) {
        patch.name = req.body.name.trim().slice(0, 50);
      }

      const account = await updateBankAccount(user.uid, req.params.id, patch);
      if (!account) {
        res.status(404).json({ error: 'Account not found.' });
        return;
      }
      res.json({ account });
    } catch {
      res.status(500).json({ error: 'Unable to update account.' });
    }
  });

  app.post('/api/transfers', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await resolveAuthedUser(req);
      const mode =
        req.body?.mode === 'internal' || req.body?.mode === 'bill_pay'
          ? req.body.mode
          : 'external';
      const fromAccountId =
        typeof req.body?.fromAccountId === 'string' ? req.body.fromAccountId : '';
      const toAccountId = typeof req.body?.toAccountId === 'string' ? req.body.toAccountId : '';
      const recipientName =
        typeof req.body?.recipientName === 'string' ? req.body.recipientName.trim() : '';
      const recipientTarget =
        typeof req.body?.recipientTarget === 'string' ? req.body.recipientTarget.trim() : '';
      const targetCurrency: CurrencyCode = VALID_CURRENCIES.includes(req.body?.targetCurrency)
        ? req.body.targetCurrency
        : 'USD';
      const category: TransactionCategory = VALID_CATEGORIES.includes(req.body?.category)
        ? req.body.category
        : 'Transfers';
      const amount = Number(req.body?.amount);
      const plainMemo =
        typeof req.body?.plainMemo === 'string'
          ? req.body.plainMemo.trim().slice(0, 240)
          : undefined;
      const encryptedMemo = isEncryptedBlob(req.body?.encryptedMemo)
        ? req.body.encryptedMemo
        : null;

      if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
        res.status(400).json({ error: 'Enter a valid transfer amount greater than 0.' });
        return;
      }

      if (mode !== 'internal') {
        if (recipientName.length < 2 || recipientName.length > 80) {
          res.status(400).json({ error: 'Recipient name is required.' });
          return;
        }
        if (recipientTarget.length < 3 || recipientTarget.length > 100) {
          res.status(400).json({ error: 'Recipient account, IBAN, or handle is required.' });
          return;
        }
      }

      // Check high-value step-up threshold using target or source currency estimate
      const estimatedUsd = toUsd(amount, targetCurrency);
      if (
        estimatedUsd >= user.security.highValueThresholdUsd &&
        user.security.biometricActionLockEnabled &&
        user.biometrics.length > 0
      ) {
        if (!verifyStepUpIfRequired(req, user.uid, user.security, user.biometrics, res)) return;
      }

      const result = await executeTransfer({
        user,
        mode,
        fromAccountId,
        toAccountId,
        recipientName,
        recipientTarget,
        targetCurrency,
        category,
        amount,
        plainMemo,
        encryptedMemo,
      });

      if (result.errorStatus) {
        res.status(result.errorStatus).json({ error: result.errorMessage });
        return;
      }

      res.status(201).json({
        transactions: result.transactions,
        fraudFlagged: result.fraudFlagged,
        fraudAlert: result.fraudAlert,
        notification: result.notification,
        accounts: result.accounts,
      });
    } catch {
      res.status(500).json({ error: 'Unable to execute transfer.' });
    }
  });

  app.post('/api/transactions/:id/dispute', requireAuth, async (req: AuthRequest, res) => {
    try {
      await resolveAuthedUser(req);
      const result = await disputeTransaction(req.user!.uid, req.params.id);
      if (!result) {
        res.status(404).json({ error: 'Transaction not found.' });
        return;
      }
      if (result.existing) {
        res.json({ fraudAlert: result.fraudAlert, transaction: result.transaction });
        return;
      }
      res.status(201).json({
        fraudAlert: result.fraudAlert,
        transaction: result.transaction,
        notification: result.notification,
      });
    } catch {
      res.status(500).json({ error: 'Unable to open dispute.' });
    }
  });

  app.post('/api/fraud-alerts/:id/resolve', requireAuth, async (req: AuthRequest, res) => {
    try {
      await resolveAuthedUser(req);
      const decision = req.body?.decision === 'approve' ? 'approve' : 'block';
      const result = await resolveFraudAlert(req.user!.uid, req.params.id, decision);
      if (!result) {
        res.status(404).json({ error: 'Fraud alert not found.' });
        return;
      }
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Unable to resolve fraud alert.' });
    }
  });

  app.post('/api/fraud-alerts/simulate', requireAuth, async (req: AuthRequest, res) => {
    try {
      await resolveAuthedUser(req);
      const result = await simulateFraudAlert(req.user!.uid);
      if (!result) {
        res.status(400).json({ error: 'No active account found.' });
        return;
      }
      res.status(201).json(result);
    } catch {
      res.status(500).json({ error: 'Unable to simulate fraud alert.' });
    }
  });

  app.patch('/api/budgets/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const monthlyLimit = Number(req.body?.monthlyLimit);
      if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0 || monthlyLimit > 1_000_000) {
        res.status(400).json({ error: 'Invalid monthly budget limit.' });
        return;
      }
      const budget = await updateBudgetLimit(req.user!.uid, req.params.id, monthlyLimit);
      if (!budget) {
        res.status(404).json({ error: 'Budget not found.' });
        return;
      }
      res.json({ budget });
    } catch {
      res.status(500).json({ error: 'Unable to update budget.' });
    }
  });

  app.post('/api/budgets', requireAuth, async (req: AuthRequest, res) => {
    try {
      const category: TransactionCategory = VALID_CATEGORIES.includes(req.body?.category)
        ? req.body.category
        : 'Shopping';
      const monthlyLimit = Number(req.body?.monthlyLimit);
      if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0) {
        res.status(400).json({ error: 'Valid monthly limit is required.' });
        return;
      }
      const { created, budget } = await upsertBudget(req.user!.uid, category, monthlyLimit);
      res.status(created ? 201 : 200).json({ budget });
    } catch {
      res.status(500).json({ error: 'Unable to save budget.' });
    }
  });

  app.post('/api/savings-goals', requireAuth, async (req: AuthRequest, res) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const targetAmount = Number(req.body?.targetAmount);
      const currency: CurrencyCode = VALID_CURRENCIES.includes(req.body?.currency)
        ? req.body.currency
        : 'USD';
      const targetDate =
        typeof req.body?.targetDate === 'string' ? req.body.targetDate.slice(0, 10) : '2027-06-01';

      if (
        name.length < 2 ||
        name.length > 60 ||
        !Number.isFinite(targetAmount) ||
        targetAmount <= 0
      ) {
        res.status(400).json({ error: 'Valid goal name and target amount required.' });
        return;
      }

      const goal = await createSavingsGoal(req.user!.uid, {
        name,
        targetAmount,
        currency,
        targetDate,
      });
      res.status(201).json({ goal });
    } catch {
      res.status(500).json({ error: 'Unable to create savings goal.' });
    }
  });

  app.post('/api/savings-goals/:id/contribute', requireAuth, async (req: AuthRequest, res) => {
    try {
      const accountId = typeof req.body?.accountId === 'string' ? req.body.accountId : '';
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ error: 'Valid contribution amount is required.' });
        return;
      }

      const result = await contributeToSavingsGoal(
        req.user!.uid,
        req.params.id,
        accountId,
        amount
      );
      if (result.errorStatus) {
        res.status(result.errorStatus).json({ error: result.errorMessage });
        return;
      }
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Unable to contribute to savings goal.' });
    }
  });

  app.patch('/api/cards/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await resolveAuthedUser(req);
      if (!verifyStepUpIfRequired(req, user.uid, user.security, user.biometrics, res)) return;

      const patch: {
        frozen?: boolean;
        contactlessEnabled?: boolean;
        onlineEnabled?: boolean;
        internationalEnabled?: boolean;
        monthlyLimit?: number;
      } = {};
      if (typeof req.body?.frozen === 'boolean') patch.frozen = req.body.frozen;
      if (typeof req.body?.contactlessEnabled === 'boolean')
        patch.contactlessEnabled = req.body.contactlessEnabled;
      if (typeof req.body?.onlineEnabled === 'boolean')
        patch.onlineEnabled = req.body.onlineEnabled;
      if (typeof req.body?.internationalEnabled === 'boolean')
        patch.internationalEnabled = req.body.internationalEnabled;
      if (
        typeof req.body?.monthlyLimit === 'number' &&
        Number.isFinite(req.body.monthlyLimit) &&
        req.body.monthlyLimit >= 100 &&
        req.body.monthlyLimit <= 100000
      ) {
        patch.monthlyLimit = Math.round(req.body.monthlyLimit);
      }

      const card = await updateBankCard(user.uid, req.params.id, patch);
      if (!card) {
        res.status(404).json({ error: 'Card not found.' });
        return;
      }
      res.json({ card });
    } catch {
      res.status(500).json({ error: 'Unable to update card settings.' });
    }
  });

  app.post('/api/reminders', requireAuth, async (req: AuthRequest, res) => {
    try {
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      const payee = typeof req.body?.payee === 'string' ? req.body.payee.trim() : '';
      const accountId = typeof req.body?.accountId === 'string' ? req.body.accountId : '';
      const amount = Number(req.body?.amount);
      const dueDate = typeof req.body?.dueDate === 'string' ? req.body.dueDate.slice(0, 10) : '';
      const autoPay = Boolean(req.body?.autoPay);

      if (
        title.length < 2 ||
        payee.length < 2 ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !dueDate
      ) {
        res.status(400).json({ error: 'Complete all payment reminder fields.' });
        return;
      }

      const reminder = await createPaymentReminder(req.user!.uid, {
        title,
        payee,
        accountId,
        amount,
        dueDate,
        recurrence: req.body?.recurrence === 'once' ? 'once' : 'monthly',
        autoPay,
        category: VALID_CATEGORIES.includes(req.body?.category) ? req.body.category : 'Utilities',
      });
      if (!reminder) {
        res.status(400).json({ error: 'Valid payment account is required.' });
        return;
      }
      res.status(201).json({ reminder });
    } catch {
      res.status(500).json({ error: 'Unable to schedule reminder.' });
    }
  });

  app.post('/api/reminders/:id/pay', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await payPaymentReminder(req.user!.uid, req.params.id);
      if (result.errorStatus) {
        res.status(result.errorStatus).json({ error: result.errorMessage });
        return;
      }
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Unable to pay scheduled bill.' });
    }
  });

  app.post('/api/notifications/read', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = typeof req.body?.id === 'string' ? req.body.id : null;
      await markNotificationsRead(req.user!.uid, id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Unable to update notifications.' });
    }
  });

  app.post('/api/security/biometrics/enroll', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await resolveAuthedUser(req);
      const method = req.body?.method === 'webauthn' ? 'webauthn' : 'device-ecdsa';
      const credentialId = typeof req.body?.credentialId === 'string' ? req.body.credentialId : '';
      const publicKeySpki =
        typeof req.body?.publicKeySpki === 'string' ? req.body.publicKeySpki : '';
      const label =
        typeof req.body?.label === 'string'
          ? req.body.label.trim().slice(0, 60)
          : 'Device Passkey';

      if (!credentialId || credentialId.length > 512) {
        res.status(400).json({ error: 'Invalid credential payload.' });
        return;
      }

      const record: BiometricCredentialRecord = {
        id: generateId('bio'),
        label: label || 'Device Passkey',
        method,
        credentialId,
        publicKeySpki,
        createdAt: new Date().toISOString(),
      };

      const updatedProfile = await enrollBiometricCredential(user, record);
      res.status(201).json({ credential: record, user: updatedProfile });
    } catch {
      res.status(500).json({ error: 'Unable to enroll biometric passkey.' });
    }
  });

  app.delete('/api/security/biometrics/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await resolveAuthedUser(req);
      if (!verifyStepUpIfRequired(req, user.uid, user.security, user.biometrics, res)) return;
      const updatedProfile = await removeBiometricCredential(user, req.params.id);
      res.json({ user: updatedProfile });
    } catch {
      res.status(500).json({ error: 'Unable to remove biometric passkey.' });
    }
  });

  app.patch('/api/security/settings', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await resolveAuthedUser(req);
      const turningOffBio =
        (req.body?.biometricActionLockEnabled === false &&
          user.security.biometricActionLockEnabled) ||
        (req.body?.biometricLoginEnabled === false && user.security.biometricLoginEnabled);

      if (
        turningOffBio &&
        !verifyStepUpIfRequired(req, user.uid, user.security, user.biometrics, res)
      ) {
        return;
      }

      const nextSecurity: SecuritySettings = { ...user.security };
      if (typeof req.body?.biometricLoginEnabled === 'boolean') {
        nextSecurity.biometricLoginEnabled =
          user.biometrics.length > 0 ? req.body.biometricLoginEnabled : false;
      }
      if (typeof req.body?.biometricActionLockEnabled === 'boolean') {
        nextSecurity.biometricActionLockEnabled =
          user.biometrics.length > 0 ? req.body.biometricActionLockEnabled : false;
      }
      if (typeof req.body?.pushTransactionsEnabled === 'boolean') {
        nextSecurity.pushTransactionsEnabled = req.body.pushTransactionsEnabled;
      }
      if (typeof req.body?.pushRemindersEnabled === 'boolean') {
        nextSecurity.pushRemindersEnabled = req.body.pushRemindersEnabled;
      }
      if (typeof req.body?.pushFraudEnabled === 'boolean') {
        nextSecurity.pushFraudEnabled = req.body.pushFraudEnabled;
      }
      if (typeof req.body?.e2eeKeyFingerprint === 'string') {
        nextSecurity.e2eeKeyFingerprint = req.body.e2eeKeyFingerprint.slice(0, 64);
      }
      if (
        typeof req.body?.highValueThresholdUsd === 'number' &&
        Number.isFinite(req.body.highValueThresholdUsd) &&
        req.body.highValueThresholdUsd >= 100 &&
        req.body.highValueThresholdUsd <= 50000
      ) {
        nextSecurity.highValueThresholdUsd = Math.round(req.body.highValueThresholdUsd);
      }

      const preferredCurrency: CurrencyCode = VALID_CURRENCIES.includes(req.body?.preferredCurrency)
        ? req.body.preferredCurrency
        : (user.preferredCurrency as CurrencyCode);

      const updatedProfile = await updateUserSecuritySettings(
        user,
        nextSecurity,
        preferredCurrency
      );
      res.json({ user: updatedProfile });
    } catch {
      res.status(500).json({ error: 'Unable to update security settings.' });
    }
  });

  app.post('/api/security/e2ee/rotate', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await resolveAuthedUser(req);
      const newFingerprint =
        typeof req.body?.newFingerprint === 'string'
          ? req.body.newFingerprint.slice(0, 64)
          : '';
      const rawMemos = Array.isArray(req.body?.updatedMemos) ? req.body.updatedMemos : [];
      const validMemos: { transactionId: string; encryptedMemo: EncryptedBlob }[] = [];

      for (const item of rawMemos) {
        if (item && typeof item.transactionId === 'string' && isEncryptedBlob(item.encryptedMemo)) {
          validMemos.push({
            transactionId: item.transactionId,
            encryptedMemo: item.encryptedMemo,
          });
        }
      }

      const updatedProfile = await rotateE2eeKeys(user, newFingerprint, validMemos);
      res.json({ user: updatedProfile });
    } catch {
      res.status(500).json({ error: 'Unable to rotate encryption keys.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QUIKUP server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start QUIKUP server:', err);
  process.exit(1);
});
