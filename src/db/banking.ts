import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  accounts,
  adminAuditLogs,
  adminCredentials,
  budgets,
  cards,
  fraudAlerts,
  notifications,
  reminders,
  savingsGoals,
  transactions,
  users,
} from './schema.ts';
import type {
  AccountType,
  AdminAuditLogItem,
  AdminCardItem,
  AdminFraudAlertItem,
  AdminOverviewPayload,
  AdminReminderItem,
  AdminTransactionItem,
  AdminUserSummary,
  BankAccount,
  BankCard,
  BankingBootstrapPayload,
  BiometricCredentialRecord,
  BudgetLimit,
  CurrencyCode,
  EncryptedBlob,
  FraudAlert,
  FxRateMap,
  NotificationItem,
  PaymentReminder,
  SavedBeneficiary,
  SavingsGoal,
  SecuritySettings,
  TransactionCategory,
  TransactionRecord,
  TransactionStatus,
  TransactionType,
  UserProfile,
} from '../types/banking.ts';

export const INITIAL_ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL || 'lakheelklaleel999@gmail.com'
)
  .trim()
  .toLowerCase();

export function isInitialAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === INITIAL_ADMIN_EMAIL);
}

export const FX_RATES: FxRateMap = {
  USD: 1,
  EUR: 0.9215,
  GBP: 0.786,
  JPY: 151.4,
  CAD: 1.385,
  CHF: 0.882,
};

export const VALID_CURRENCIES: CurrencyCode[] = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'CHF'];
export const VALID_CATEGORIES: TransactionCategory[] = [
  'Housing',
  'Dining & Groceries',
  'Travel & FX',
  'Software & Cloud',
  'Shopping',
  'Utilities',
  'Salary & Income',
  'Savings & Vault',
  'Transfers',
];

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function toUsd(amount: number, currency: CurrencyCode): number {
  return amount / FX_RATES[currency];
}

export function convertAmount(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount;
  const usd = amount / FX_RATES[from];
  const raw = usd * FX_RATES[to];
  const precision = to === 'JPY' ? 1 : 100;
  return Math.round(raw * precision) / precision;
}

type UserRow = typeof users.$inferSelect;
type AccountRow = typeof accounts.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;
type BudgetRow = typeof budgets.$inferSelect;
type SavingsGoalRow = typeof savingsGoals.$inferSelect;
type FraudAlertRow = typeof fraudAlerts.$inferSelect;
type CardRow = typeof cards.$inferSelect;
type ReminderRow = typeof reminders.$inferSelect;
type NotificationRow = typeof notifications.$inferSelect;

export function mapUser(row: UserRow): UserProfile {
  return {
    id: row.uid,
    fullName: row.fullName,
    email: row.email,
    role: row.role === 'admin' ? 'admin' : 'customer',
    preferredCurrency: (VALID_CURRENCIES.includes(row.preferredCurrency as CurrencyCode)
      ? row.preferredCurrency
      : 'USD') as CurrencyCode,
    tier: row.tier === 'Countree Global' ? 'Countree Global' : 'Countree Private',
    createdAt: row.createdAt.toISOString(),
    security: row.security,
    biometrics: row.biometrics || [],
  };
}

export function mapAccount(row: AccountRow): BankAccount {
  return {
    id: row.id,
    userId: row.userUid,
    name: row.name,
    type: row.type as AccountType,
    currency: row.currency as CurrencyCode,
    balance: row.balance,
    ibanOrAccountNo: row.ibanOrAccountNo,
    routingOrBic: row.routingOrBic,
    frozen: row.frozen,
    apy: row.apy ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapTransaction(row: TransactionRow): TransactionRecord {
  return {
    id: row.id,
    userId: row.userUid,
    accountId: row.accountId,
    type: row.type as TransactionType,
    category: row.category as TransactionCategory,
    merchantOrRecipient: row.merchantOrRecipient,
    recipientBankOrHandle: row.recipientBankOrHandle ?? undefined,
    amount: row.amount,
    currency: row.currency as CurrencyCode,
    convertedAmount: row.convertedAmount ?? undefined,
    convertedCurrency: (row.convertedCurrency as CurrencyCode | null) ?? undefined,
    fxRate: row.fxRate ?? undefined,
    status: row.status as TransactionStatus,
    reference: row.reference,
    location: row.location,
    riskScore: row.riskScore,
    encryptedMemo: row.encryptedMemo ?? null,
    plainMemo: row.plainMemo ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapBudget(row: BudgetRow): BudgetLimit {
  return {
    id: row.id,
    userId: row.userUid,
    category: row.category as TransactionCategory,
    monthlyLimit: row.monthlyLimit,
    currency: row.currency as CurrencyCode,
  };
}

export function mapGoal(row: SavingsGoalRow): SavingsGoal {
  return {
    id: row.id,
    userId: row.userUid,
    name: row.name,
    targetAmount: row.targetAmount,
    currentAmount: row.currentAmount,
    currency: row.currency as CurrencyCode,
    targetDate: row.targetDate,
  };
}

export function mapFraudAlert(row: FraudAlertRow): FraudAlert {
  return {
    id: row.id,
    userId: row.userUid,
    transactionId: row.transactionId,
    accountId: row.accountId,
    severity: row.severity === 'medium' ? 'medium' : 'high',
    title: row.title,
    description: row.description,
    merchant: row.merchant,
    amount: row.amount,
    currency: row.currency as CurrencyCode,
    location: row.location,
    deviceInfo: row.deviceInfo,
    status: row.status as FraudAlert['status'],
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapCard(row: CardRow): BankCard {
  return {
    id: row.id,
    userId: row.userUid,
    accountId: row.accountId,
    label: row.label,
    kind: row.kind === 'virtual' ? 'virtual' : 'physical',
    network: row.network === 'Mastercard World' ? 'Mastercard World' : 'Visa Infinite',
    last4: row.last4,
    fullMaskedPreview: row.fullMaskedPreview,
    expiry: row.expiry,
    cvvPreview: row.cvvPreview,
    frozen: row.frozen,
    monthlyLimit: row.monthlyLimit,
    monthlySpent: row.monthlySpent,
    currency: row.currency as CurrencyCode,
    contactlessEnabled: row.contactlessEnabled,
    onlineEnabled: row.onlineEnabled,
    internationalEnabled: row.internationalEnabled,
  };
}

export function mapReminder(row: ReminderRow): PaymentReminder {
  return {
    id: row.id,
    userId: row.userUid,
    title: row.title,
    payee: row.payee,
    accountId: row.accountId,
    amount: row.amount,
    currency: row.currency as CurrencyCode,
    dueDate: row.dueDate,
    recurrence: row.recurrence as PaymentReminder['recurrence'],
    autoPay: row.autoPay,
    paidThisCycle: row.paidThisCycle,
    category: row.category as TransactionCategory,
  };
}

export function mapNotification(row: NotificationRow): NotificationItem {
  return {
    id: row.id,
    userId: row.userUid,
    kind: row.kind as NotificationItem['kind'],
    title: row.title,
    message: row.message,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
}

function createDefaultSecurity(): SecuritySettings {
  return {
    biometricLoginEnabled: false,
    biometricActionLockEnabled: false,
    e2eeEnabled: true,
    e2eeSalt: crypto.randomBytes(16).toString('base64'),
    e2eeKeyFingerprint: '',
    pushTransactionsEnabled: true,
    pushRemindersEnabled: true,
    pushFraudEnabled: true,
    highValueThresholdUsd: 3500,
  };
}

function createDefaultBeneficiaries(): SavedBeneficiary[] {
  return [
    {
      id: generateId('ben'),
      name: 'Elena Rostova Studio',
      bankName: 'Deutsche Bank AG',
      handleOrIban: 'DE44 5001 0517 5407 3249 31',
      currency: 'EUR',
      country: 'Germany',
    },
    {
      id: generateId('ben'),
      name: 'Marcus Vance Architecture',
      bankName: 'Chase Private Client',
      handleOrIban: '021000021 · 993847102',
      currency: 'USD',
      country: 'United States',
    },
    {
      id: generateId('ben'),
      name: 'Kenji Takahashi Design',
      bankName: 'MUFG Bank Tokyo',
      handleOrIban: 'JP82 BOTK 0010 9921 440',
      currency: 'JPY',
      country: 'Japan',
    },
    {
      id: generateId('ben'),
      name: 'Claire Kensington',
      bankName: 'Barclays UK',
      handleOrIban: 'GB82 WEST 1234 5698 7654 32',
      currency: 'GBP',
      country: 'United Kingdom',
    },
  ];
}

export async function getOrCreateUserAndPortfolio(
  uid: string,
  email: string,
  displayName?: string,
  isEmailVerified = false
): Promise<UserRow> {
  try {
    const cleanEmail = (email || `${uid}@quikup.client`).trim().toLowerCase();
    const cleanName =
      displayName && displayName.trim().length >= 2
        ? displayName.trim().slice(0, 80)
        : cleanEmail.split('@')[0] || 'QUIKUP Client';
    const shouldPromoteInitialAdmin = isEmailVerified && isInitialAdminEmail(cleanEmail);

    const [userRow] = await db
      .insert(users)
      .values({
        uid,
        email: cleanEmail,
        fullName: cleanName,
        role: shouldPromoteInitialAdmin ? 'admin' : 'customer',
        preferredCurrency: 'USD',
        tier: 'Countree Private',
        security: createDefaultSecurity(),
        biometrics: [],
        beneficiaries: createDefaultBeneficiaries(),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: cleanEmail,
          fullName: cleanName,
          ...(shouldPromoteInitialAdmin ? { role: 'admin' } : {}),
        },
      })
      .returning();

    // Check if the user already has banking accounts; if not, seed starter multi-currency portfolio
    const existingAccounts = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userUid, uid))
      .limit(1);

    if (existingAccounts.length === 0) {
      await db.transaction(async (tx) => {
        await seedStarterPortfolioOnTx(tx, uid, cleanName);
      });
    }

    return userRow;
  } catch (error) {
    console.error('Database operation failed in getOrCreateUserAndPortfolio:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function registerPasswordUser(input: {
  fullName: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  preferredCurrency: CurrencyCode;
  includeSamplePortfolio: boolean;
}): Promise<{
  errorStatus?: number;
  errorMessage?: string;
  user?: UserProfile;
}> {
  try {
    const cleanEmail = input.email.trim().toLowerCase();
    const cleanName = input.fullName.trim().slice(0, 80);

    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, cleanEmail))
        .limit(1);

      if (existing) {
        return {
          errorStatus: 409,
          errorMessage: 'An account with this email already exists.',
        };
      }

      const uid = generateId('usr');
      const [created] = await tx
        .insert(users)
        .values({
          uid,
          email: cleanEmail,
          fullName: cleanName,
          passwordSalt: input.passwordSalt,
          passwordHash: input.passwordHash,
          preferredCurrency: input.preferredCurrency,
          tier: 'Countree Private',
          security: createDefaultSecurity(),
          biometrics: [],
          beneficiaries: input.includeSamplePortfolio ? createDefaultBeneficiaries() : [],
        })
        .returning();

      if (input.includeSamplePortfolio) {
        await seedStarterPortfolioOnTx(tx, uid, cleanName);
      } else {
        await tx.insert(accounts).values({
          id: generateId('acc'),
          userUid: uid,
          name: `Primary ${input.preferredCurrency} Checking`,
          type: 'checking',
          currency: input.preferredCurrency,
          balance: 5000,
          ibanOrAccountNo: `4490-${Math.floor(1000 + Math.random() * 9000)}-1001`,
          routingOrBic:
            input.preferredCurrency === 'USD'
              ? '021000021'
              : `QKUP${input.preferredCurrency}XXX`,
          frozen: false,
        });

        await tx.insert(notifications).values({
          id: generateId('ntf'),
          userUid: uid,
          kind: 'security',
          title: 'Welcome to QUIKUP',
          message:
            'Your account is active with $5,000.00 opening balance and E2EE vault readiness.',
          read: false,
        });
      }

      return { user: mapUser(created) };
    });
  } catch (error) {
    console.error('Database operation failed in registerPasswordUser:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const [row] = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    return row ?? null;
  } catch (error) {
    console.error('Database operation failed in findUserByEmail:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function seedStarterPortfolioOnTx(
  tx: DbTx,
  userUid: string,
  fullName: string
): Promise<void> {
  const now = new Date();
  const daysAgo = (days: number, hours = 10): Date => {
    const d = new Date(now.getTime() - days * 86400_000);
    d.setHours(hours, 15, 0, 0);
    return d;
  };
  const daysAhead = (days: number): string => {
    const d = new Date(now.getTime() + days * 86400_000);
    return d.toISOString().slice(0, 10);
  };

  const accUsdId = generateId('acc');
  const accEurId = generateId('acc');
  const accGbpId = generateId('acc');
  const accJpyId = generateId('acc');
  const accSavId = generateId('acc');

    await tx.insert(accounts).values([
      {
        id: accUsdId,
        userUid,
        name: 'Primary USD Checking',
        type: 'checking',
        currency: 'USD',
        balance: 24850.4,
        ibanOrAccountNo: `4490-${Math.floor(1000 + Math.random() * 9000)}-8821`,
        routingOrBic: '021000021',
        frozen: false,
        createdAt: daysAgo(180),
      },
      {
        id: accSavId,
        userUid,
        name: 'High-Yield Reserve',
        type: 'savings',
        currency: 'USD',
        balance: 42500.0,
        ibanOrAccountNo: `8820-${Math.floor(1000 + Math.random() * 9000)}-1904`,
        routingOrBic: '021000021',
        frozen: false,
        apy: 4.65,
        createdAt: daysAgo(180),
      },
      {
        id: accEurId,
        userUid,
        name: 'Euro Global Account',
        type: 'multi-currency',
        currency: 'EUR',
        balance: 8420.15,
        ibanOrAccountNo: 'DE89 3704 0044 0532 0130 00',
        routingOrBic: 'CTRBDEFFXXX',
        frozen: false,
        createdAt: daysAgo(150),
      },
      {
        id: accGbpId,
        userUid,
        name: 'London GBP Account',
        type: 'multi-currency',
        currency: 'GBP',
        balance: 4190.0,
        ibanOrAccountNo: 'GB29 CTRB 6016 1331 9268 19',
        routingOrBic: 'CTRBGB2LXXX',
        frozen: false,
        createdAt: daysAgo(120),
      },
      {
        id: accJpyId,
        userUid,
        name: 'Tokyo Travel Wallet',
        type: 'vault',
        currency: 'JPY',
        balance: 285000,
        ibanOrAccountNo: 'JP18 CTRB 0019 4820 112',
        routingOrBic: 'CTRBJPJTXXX',
        frozen: false,
        createdAt: daysAgo(90),
      },
    ]);

    const flaggedTxId = generateId('tx');
    const flaggedCreatedAt = daysAgo(1, 3);

    const txRows: (typeof transactions.$inferInsert)[] = [
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'deposit',
        category: 'Salary & Income',
        merchantOrRecipient: 'Northstar Systems Payroll',
        amount: 7450.0,
        currency: 'USD',
        status: 'completed',
        reference: 'PAY-2026-1115',
        location: 'San Francisco, US',
        riskScore: 4,
        plainMemo: 'Bi-weekly executive payroll direct deposit',
        createdAt: daysAgo(2, 9),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'card_purchase',
        category: 'Dining & Groceries',
        merchantOrRecipient: 'Whole Foods Market',
        amount: -164.85,
        currency: 'USD',
        status: 'completed',
        reference: 'POS-883412',
        location: 'San Francisco, US',
        riskScore: 8,
        createdAt: daysAgo(3, 18),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'bill_pay',
        category: 'Housing',
        merchantOrRecipient: 'Bayside Residential Trust',
        amount: -2650.0,
        currency: 'USD',
        status: 'completed',
        reference: 'ACH-992104',
        location: 'San Francisco, US',
        riskScore: 5,
        createdAt: daysAgo(5, 8),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accEurId,
        type: 'card_purchase',
        category: 'Travel & FX',
        merchantOrRecipient: 'Lufthansa Regional Air',
        amount: -482.5,
        currency: 'EUR',
        status: 'completed',
        reference: 'POS-EUR-2091',
        location: 'Frankfurt, DE',
        riskScore: 14,
        createdAt: daysAgo(6, 14),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'card_purchase',
        category: 'Software & Cloud',
        merchantOrRecipient: 'CloudScale Infrastructure',
        amount: -189.0,
        currency: 'USD',
        status: 'completed',
        reference: 'SUB-441022',
        location: 'Seattle, US',
        riskScore: 7,
        createdAt: daysAgo(8, 11),
      },
      {
        id: flaggedTxId,
        userUid,
        accountId: accUsdId,
        type: 'card_purchase',
        category: 'Shopping',
        merchantOrRecipient: 'Atelier Nord Electronics',
        amount: -1490.0,
        currency: 'USD',
        status: 'flagged',
        reference: 'FRD-774109',
        location: 'Bucharest, RO',
        riskScore: 88,
        plainMemo: 'Unrecognized overseas card-not-present attempt',
        createdAt: flaggedCreatedAt,
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'bill_pay',
        category: 'Utilities',
        merchantOrRecipient: 'Pacific Grid & Fiber',
        amount: -218.4,
        currency: 'USD',
        status: 'completed',
        reference: 'UTL-332190',
        location: 'San Francisco, US',
        riskScore: 3,
        createdAt: daysAgo(11, 10),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accGbpId,
        type: 'card_purchase',
        category: 'Dining & Groceries',
        merchantOrRecipient: 'Waitrose & Partners',
        amount: -94.2,
        currency: 'GBP',
        status: 'completed',
        reference: 'POS-GBP-1192',
        location: 'London, UK',
        riskScore: 10,
        createdAt: daysAgo(14, 17),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'deposit',
        category: 'Salary & Income',
        merchantOrRecipient: 'Northstar Systems Payroll',
        amount: 7450.0,
        currency: 'USD',
        status: 'completed',
        reference: 'PAY-2026-1101',
        location: 'San Francisco, US',
        riskScore: 4,
        createdAt: daysAgo(16, 9),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'deposit',
        category: 'Salary & Income',
        merchantOrRecipient: 'Northstar Systems Payroll',
        amount: 14200.0,
        currency: 'USD',
        status: 'completed',
        reference: 'PAY-2026-10',
        location: 'San Francisco, US',
        riskScore: 4,
        createdAt: daysAgo(35, 9),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'bill_pay',
        category: 'Housing',
        merchantOrRecipient: 'Bayside Residential Trust',
        amount: -2650.0,
        currency: 'USD',
        status: 'completed',
        reference: 'ACH-10-01',
        location: 'San Francisco, US',
        riskScore: 5,
        createdAt: daysAgo(36, 9),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'card_purchase',
        category: 'Dining & Groceries',
        merchantOrRecipient: 'Whole Foods & Dining',
        amount: -890.0,
        currency: 'USD',
        status: 'completed',
        reference: 'POS-10-02',
        location: 'San Francisco, US',
        riskScore: 5,
        createdAt: daysAgo(40, 12),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'deposit',
        category: 'Salary & Income',
        merchantOrRecipient: 'Northstar Systems Payroll',
        amount: 13800.0,
        currency: 'USD',
        status: 'completed',
        reference: 'PAY-2026-09',
        location: 'San Francisco, US',
        riskScore: 4,
        createdAt: daysAgo(65, 9),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'bill_pay',
        category: 'Housing',
        merchantOrRecipient: 'Bayside Residential Trust',
        amount: -2650.0,
        currency: 'USD',
        status: 'completed',
        reference: 'ACH-09-01',
        location: 'San Francisco, US',
        riskScore: 5,
        createdAt: daysAgo(67, 9),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'card_purchase',
        category: 'Travel & FX',
        merchantOrRecipient: 'Eurostar & Boutique Hotel',
        amount: -1620.0,
        currency: 'USD',
        status: 'completed',
        reference: 'POS-09-02',
        location: 'Paris, FR',
        riskScore: 12,
        createdAt: daysAgo(70, 15),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'deposit',
        category: 'Salary & Income',
        merchantOrRecipient: 'Northstar Systems Payroll',
        amount: 13800.0,
        currency: 'USD',
        status: 'completed',
        reference: 'PAY-2026-08',
        location: 'San Francisco, US',
        riskScore: 4,
        createdAt: daysAgo(95, 9),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'bill_pay',
        category: 'Housing',
        merchantOrRecipient: 'Bayside Residential Trust',
        amount: -2650.0,
        currency: 'USD',
        status: 'completed',
        reference: 'ACH-08-01',
        location: 'San Francisco, US',
        riskScore: 5,
        createdAt: daysAgo(97, 9),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'card_purchase',
        category: 'Shopping',
        merchantOrRecipient: 'Nordstrom & Home Studio',
        amount: -1140.0,
        currency: 'USD',
        status: 'completed',
        reference: 'POS-08-02',
        location: 'San Francisco, US',
        riskScore: 6,
        createdAt: daysAgo(102, 16),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'deposit',
        category: 'Salary & Income',
        merchantOrRecipient: 'Northstar Systems Payroll',
        amount: 13400.0,
        currency: 'USD',
        status: 'completed',
        reference: 'PAY-2026-07',
        location: 'San Francisco, US',
        riskScore: 4,
        createdAt: daysAgo(125, 9),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'bill_pay',
        category: 'Housing',
        merchantOrRecipient: 'Bayside Residential Trust',
        amount: -2650.0,
        currency: 'USD',
        status: 'completed',
        reference: 'ACH-07-01',
        location: 'San Francisco, US',
        riskScore: 5,
        createdAt: daysAgo(127, 9),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'deposit',
        category: 'Salary & Income',
        merchantOrRecipient: 'Northstar Systems Payroll',
        amount: 13400.0,
        currency: 'USD',
        status: 'completed',
        reference: 'PAY-2026-06',
        location: 'San Francisco, US',
        riskScore: 4,
        createdAt: daysAgo(155, 9),
      },
      {
        id: generateId('tx'),
        userUid,
        accountId: accUsdId,
        type: 'bill_pay',
        category: 'Housing',
        merchantOrRecipient: 'Bayside Residential Trust',
        amount: -2650.0,
        currency: 'USD',
        status: 'completed',
        reference: 'ACH-06-01',
        location: 'San Francisco, US',
        riskScore: 5,
        createdAt: daysAgo(157, 9),
      },
    ];

    await tx.insert(transactions).values(txRows);

    await tx.insert(fraudAlerts).values([
      {
        id: generateId('frd'),
        userUid,
        transactionId: flaggedTxId,
        accountId: accUsdId,
        severity: 'high',
        title: 'Unusual International Card-Not-Present Attempt',
        description:
          'A $1,490.00 authorization from Atelier Nord Electronics in Bucharest, RO deviated from your typical travel corridor and device fingerprint.',
        merchant: 'Atelier Nord Electronics',
        amount: 1490.0,
        currency: 'USD',
        location: 'Bucharest, RO',
        deviceInfo: 'Unrecognized Linux Browser · IP 185.44.x.x',
        status: 'open',
        createdAt: flaggedCreatedAt,
      },
    ]);

    await tx.insert(budgets).values([
      { id: generateId('bdg'), userUid, category: 'Housing', monthlyLimit: 2800, currency: 'USD' },
      {
        id: generateId('bdg'),
        userUid,
        category: 'Dining & Groceries',
        monthlyLimit: 950,
        currency: 'USD',
      },
      { id: generateId('bdg'), userUid, category: 'Travel & FX', monthlyLimit: 1200, currency: 'USD' },
      {
        id: generateId('bdg'),
        userUid,
        category: 'Software & Cloud',
        monthlyLimit: 350,
        currency: 'USD',
      },
      { id: generateId('bdg'), userUid, category: 'Shopping', monthlyLimit: 1000, currency: 'USD' },
      { id: generateId('bdg'), userUid, category: 'Utilities', monthlyLimit: 400, currency: 'USD' },
    ]);

    await tx.insert(savingsGoals).values([
      {
        id: generateId('gol'),
        userUid,
        name: 'Emergency Liquidity Reserve',
        targetAmount: 50000,
        currentAmount: 42500,
        currency: 'USD',
        targetDate: daysAhead(120),
      },
      {
        id: generateId('gol'),
        userUid,
        name: 'Kyoto Autumn Sabbatical',
        targetAmount: 650000,
        currentAmount: 285000,
        currency: 'JPY',
        targetDate: daysAhead(240),
      },
      {
        id: generateId('gol'),
        userUid,
        name: 'European Property Deposit',
        targetAmount: 25000,
        currentAmount: 8420,
        currency: 'EUR',
        targetDate: daysAhead(360),
      },
    ]);

    await tx.insert(cards).values([
      {
        id: generateId('crd'),
        userUid,
        accountId: accUsdId,
        label: `${fullName.split(' ')[0]} · Titanium Metal`,
        kind: 'physical',
        network: 'Visa Infinite',
        last4: '4829',
        fullMaskedPreview: '4532 8910 3304 4829',
        expiry: '09/29',
        cvvPreview: '842',
        frozen: false,
        monthlyLimit: 10000,
        monthlySpent: 2043.85,
        currency: 'USD',
        contactlessEnabled: true,
        onlineEnabled: true,
        internationalEnabled: true,
      },
      {
        id: generateId('crd'),
        userUid,
        accountId: accEurId,
        label: 'Global FX Virtual Card',
        kind: 'virtual',
        network: 'Mastercard World',
        last4: '9104',
        fullMaskedPreview: '5412 7590 1128 9104',
        expiry: '11/28',
        cvvPreview: '319',
        frozen: false,
        monthlyLimit: 5000,
        monthlySpent: 482.5,
        currency: 'EUR',
        contactlessEnabled: false,
        onlineEnabled: true,
        internationalEnabled: true,
      },
    ]);

    await tx.insert(reminders).values([
      {
        id: generateId('rem'),
        userUid,
        title: 'Bayside Residential Mortgage / Lease',
        payee: 'Bayside Residential Trust',
        accountId: accUsdId,
        amount: 2650.0,
        currency: 'USD',
        dueDate: daysAhead(3),
        recurrence: 'monthly',
        autoPay: true,
        paidThisCycle: false,
        category: 'Housing',
      },
      {
        id: generateId('rem'),
        userUid,
        title: 'Pacific Grid & Fiber Internet',
        payee: 'Pacific Grid & Fiber',
        accountId: accUsdId,
        amount: 218.4,
        currency: 'USD',
        dueDate: daysAhead(5),
        recurrence: 'monthly',
        autoPay: false,
        paidThisCycle: false,
        category: 'Utilities',
      },
      {
        id: generateId('rem'),
        userUid,
        title: 'CloudScale Hosting Invoice',
        payee: 'CloudScale Infrastructure',
        accountId: accUsdId,
        amount: 189.0,
        currency: 'USD',
        dueDate: daysAhead(9),
        recurrence: 'monthly',
        autoPay: true,
        paidThisCycle: false,
        category: 'Software & Cloud',
      },
      {
        id: generateId('rem'),
        userUid,
        title: 'Zurich Health & Travel Policy',
        payee: 'Helvetia Assurance AG',
        accountId: accEurId,
        amount: 310.0,
        currency: 'EUR',
        dueDate: daysAhead(12),
        recurrence: 'monthly',
        autoPay: false,
        paidThisCycle: false,
        category: 'Travel & FX',
      },
    ]);

    await tx.insert(notifications).values([
      {
        id: generateId('ntf'),
        userUid,
        kind: 'fraud',
        title: 'Security Action Needed: $1,490.00 Charge Flagged',
        message:
          'Atelier Nord Electronics (Bucharest, RO) was held for verification. Review in Real-Time Fraud Alerts.',
        read: false,
        createdAt: flaggedCreatedAt,
      },
      {
        id: generateId('ntf'),
        userUid,
        kind: 'reminder',
        title: 'Upcoming Payment Due in 3 Days',
        message: 'Bayside Residential Trust ($2,650.00) is scheduled for settlement soon.',
        read: false,
        createdAt: daysAgo(0, 8),
      },
      {
        id: generateId('ntf'),
        userUid,
        kind: 'transaction',
        title: 'Direct Deposit Received (+$7,450.00)',
        message: 'Northstar Systems Payroll settled into Primary USD Checking.',
        read: true,
        createdAt: daysAgo(2, 9),
      },
    ]);
}

export async function getBankingBootstrap(
  uid: string,
  email: string,
  displayName?: string,
  isEmailVerified = false
): Promise<BankingBootstrapPayload> {
  try {
    const userRow = await getOrCreateUserAndPortfolio(uid, email, displayName, isEmailVerified);
    const [
      accRows,
      txRows,
      budgetRows,
      goalRows,
      alertRows,
      cardRows,
      reminderRows,
      notifRows,
    ] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.userUid, uid)),
      db
        .select()
        .from(transactions)
        .where(eq(transactions.userUid, uid))
        .orderBy(desc(transactions.createdAt)),
      db.select().from(budgets).where(eq(budgets.userUid, uid)),
      db.select().from(savingsGoals).where(eq(savingsGoals.userUid, uid)),
      db
        .select()
        .from(fraudAlerts)
        .where(eq(fraudAlerts.userUid, uid))
        .orderBy(desc(fraudAlerts.createdAt)),
      db.select().from(cards).where(eq(cards.userUid, uid)),
      db.select().from(reminders).where(eq(reminders.userUid, uid)),
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userUid, uid))
        .orderBy(desc(notifications.createdAt)),
    ]);

    return {
      user: mapUser(userRow),
      accounts: accRows.map(mapAccount),
      transactions: txRows.map(mapTransaction),
      budgets: budgetRows.map(mapBudget),
      savingsGoals: goalRows.map(mapGoal),
      fraudAlerts: alertRows.map(mapFraudAlert),
      cards: cardRows.map(mapCard),
      reminders: reminderRows
        .map(mapReminder)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      notifications: notifRows.map(mapNotification),
      beneficiaries: userRow.beneficiaries || [],
      fxRates: FX_RATES,
    };
  } catch (error) {
    console.error('Database operation failed in getBankingBootstrap:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function getUserRecord(uid: string): Promise<UserRow | null> {
  try {
    const [row] = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return row ?? null;
  } catch (error) {
    console.error('Database operation failed in getUserRecord:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function createBankAccount(
  uid: string,
  input: { name: string; currency: CurrencyCode; type: AccountType }
): Promise<BankAccount> {
  try {
    const ibanOrAccountNo =
      input.currency === 'EUR'
        ? `DE${Math.floor(10 + Math.random() * 89)} 3704 0044 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} 00`
        : input.currency === 'GBP'
          ? `GB${Math.floor(10 + Math.random() * 89)} CTRB 6016 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`
          : `${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const [created] = await db
      .insert(accounts)
      .values({
        id: generateId('acc'),
        userUid: uid,
        name: input.name,
        type: input.type,
        currency: input.currency,
        balance: 0,
        ibanOrAccountNo,
        routingOrBic: input.currency === 'USD' ? '021000021' : `CTRB${input.currency}XXX`,
        frozen: false,
        apy: input.type === 'savings' ? 4.65 : null,
      })
      .returning();

    return mapAccount(created);
  } catch (error) {
    console.error('Database operation failed in createBankAccount:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function updateBankAccount(
  uid: string,
  accountId: string,
  patch: { frozen?: boolean; name?: string }
): Promise<BankAccount | null> {
  try {
    const updateData: Partial<typeof accounts.$inferInsert> = {};
    if (typeof patch.frozen === 'boolean') updateData.frozen = patch.frozen;
    if (typeof patch.name === 'string') updateData.name = patch.name;

    if (Object.keys(updateData).length === 0) {
      const [existing] = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, accountId), eq(accounts.userUid, uid)))
        .limit(1);
      return existing ? mapAccount(existing) : null;
    }

    const [updated] = await db
      .update(accounts)
      .set(updateData)
      .where(and(eq(accounts.id, accountId), eq(accounts.userUid, uid)))
      .returning();

    return updated ? mapAccount(updated) : null;
  } catch (error) {
    console.error('Database operation failed in updateBankAccount:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function executeTransfer(params: {
  user: UserRow;
  mode: 'internal' | 'external' | 'bill_pay';
  fromAccountId: string;
  toAccountId?: string;
  recipientName: string;
  recipientTarget: string;
  targetCurrency: CurrencyCode;
  category: TransactionCategory;
  amount: number;
  plainMemo?: string;
  encryptedMemo: EncryptedBlob | null;
}): Promise<{
  errorStatus?: number;
  errorMessage?: string;
  transactions?: TransactionRecord[];
  fraudFlagged?: boolean;
  fraudAlert?: FraudAlert | null;
  notification?: NotificationItem | null;
  accounts?: BankAccount[];
}> {
  try {
    return await db.transaction(async (tx) => {
      const [fromAccount] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, params.fromAccountId), eq(accounts.userUid, params.user.uid)))
        .limit(1);

      if (!fromAccount) {
        return { errorStatus: 404, errorMessage: 'Source account not found.' };
      }
      if (fromAccount.frozen) {
        return { errorStatus: 400, errorMessage: 'Source account is currently frozen.' };
      }
      if (fromAccount.balance < params.amount) {
        return { errorStatus: 400, errorMessage: 'Insufficient balance in source account.' };
      }

      const fromCurrency = fromAccount.currency as CurrencyCode;
      const usdValue = toUsd(params.amount, fromCurrency);
      const now = new Date();
      const createdTransactions: TransactionRecord[] = [];
      let createdAlert: FraudAlert | null = null;
      let createdNotification: NotificationItem | null = null;

      if (params.mode === 'internal') {
        const [toAccount] = await tx
          .select()
          .from(accounts)
          .where(
            and(eq(accounts.id, params.toAccountId || ''), eq(accounts.userUid, params.user.uid))
          )
          .limit(1);

        if (!toAccount) {
          return { errorStatus: 404, errorMessage: 'Destination account not found.' };
        }
        if (toAccount.id === fromAccount.id) {
          return {
            errorStatus: 400,
            errorMessage: 'Source and destination accounts must be different.',
          };
        }
        if (toAccount.frozen) {
          return { errorStatus: 400, errorMessage: 'Destination account is frozen.' };
        }

        const toCurrency = toAccount.currency as CurrencyCode;
        const converted = convertAmount(params.amount, fromCurrency, toCurrency);
        const rate = Math.round((FX_RATES[toCurrency] / FX_RATES[fromCurrency]) * 10000) / 10000;

        await tx
          .update(accounts)
          .set({ balance: Math.round((fromAccount.balance - params.amount) * 100) / 100 })
          .where(eq(accounts.id, fromAccount.id));

        await tx
          .update(accounts)
          .set({ balance: Math.round((toAccount.balance + converted) * 100) / 100 })
          .where(eq(accounts.id, toAccount.id));

        const ref = `FX-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const [debitRow, creditRow] = await tx
          .insert(transactions)
          .values([
            {
              id: generateId('tx'),
              userUid: params.user.uid,
              accountId: fromAccount.id,
              type: 'fx_convert',
              category: 'Travel & FX',
              merchantOrRecipient: `To ${toAccount.name}`,
              amount: -params.amount,
              currency: fromCurrency,
              convertedAmount: converted,
              convertedCurrency: toCurrency,
              fxRate: rate,
              status: 'completed',
              reference: ref,
              location: 'QUIKUP FX Desk',
              riskScore: 4,
              encryptedMemo: params.encryptedMemo,
              plainMemo: params.encryptedMemo ? null : params.plainMemo ?? null,
              createdAt: now,
            },
            {
              id: generateId('tx'),
              userUid: params.user.uid,
              accountId: toAccount.id,
              type: 'fx_convert',
              category: 'Transfers',
              merchantOrRecipient: `From ${fromAccount.name}`,
              amount: converted,
              currency: toCurrency,
              convertedAmount: params.amount,
              convertedCurrency: fromCurrency,
              fxRate: rate,
              status: 'completed',
              reference: ref,
              location: 'QUIKUP FX Desk',
              riskScore: 4,
              encryptedMemo: params.encryptedMemo,
              plainMemo: params.encryptedMemo ? null : params.plainMemo ?? null,
              createdAt: now,
            },
          ])
          .returning();

        createdTransactions.push(mapTransaction(debitRow), mapTransaction(creditRow));

        const [notifRow] = await tx
          .insert(notifications)
          .values({
            id: generateId('ntf'),
            userUid: params.user.uid,
            kind: 'transaction',
            title: `FX Conversion Completed (${fromCurrency} → ${toCurrency})`,
            message: `Converted ${params.amount.toLocaleString()} ${fromCurrency} into ${converted.toLocaleString()} ${toCurrency} at ${rate}.`,
            read: false,
            createdAt: now,
          })
          .returning();
        createdNotification = mapNotification(notifRow);
      } else {
        // Real-Time Fraud Detection Engine
        let riskScore = 10;
        const riskReasons: string[] = [];
        const savedList = params.user.beneficiaries || [];
        const isKnownBeneficiary = savedList.some(
          (b) =>
            b.name.toLowerCase() === params.recipientName.toLowerCase() ||
            b.handleOrIban.toLowerCase() === params.recipientTarget.toLowerCase()
        );

        if (usdValue >= 5000 && !isKnownBeneficiary) {
          riskScore += 65;
          riskReasons.push('high-value transfer to a new recipient');
        } else if (usdValue >= 8000) {
          riskScore += 55;
          riskReasons.push('large single-transaction volume');
        }
        if (params.targetCurrency !== fromCurrency && !isKnownBeneficiary) {
          riskScore += 20;
          riskReasons.push(`cross-currency corridor (${fromCurrency} → ${params.targetCurrency})`);
        }

        const recentRows = await tx
          .select({ createdAt: transactions.createdAt, amount: transactions.amount })
          .from(transactions)
          .where(eq(transactions.userUid, params.user.uid));
        const recentTxCount = recentRows.filter(
          (t) => t.amount < 0 && Date.now() - t.createdAt.getTime() < 90_000
        ).length;
        if (recentTxCount >= 3) {
          riskScore += 30;
          riskReasons.push('rapid consecutive transfer velocity');
        }

        const isFlagged = riskScore >= 70;
        await tx
          .update(accounts)
          .set({ balance: Math.round((fromAccount.balance - params.amount) * 100) / 100 })
          .where(eq(accounts.id, fromAccount.id));

        const convertedTarget = convertAmount(params.amount, fromCurrency, params.targetCurrency);
        const [txRow] = await tx
          .insert(transactions)
          .values({
            id: generateId('tx'),
            userUid: params.user.uid,
            accountId: fromAccount.id,
            type: params.mode === 'bill_pay' ? 'bill_pay' : 'transfer_out',
            category: params.mode === 'bill_pay' ? params.category : 'Transfers',
            merchantOrRecipient: params.recipientName,
            recipientBankOrHandle: params.recipientTarget,
            amount: -params.amount,
            currency: fromCurrency,
            convertedAmount: params.targetCurrency !== fromCurrency ? convertedTarget : null,
            convertedCurrency:
              params.targetCurrency !== fromCurrency ? params.targetCurrency : null,
            status: isFlagged ? 'flagged' : 'completed',
            reference: `CTB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
            location: isFlagged ? 'Cross-Border Wire Clearing' : 'Domestic ACH / Instant Rail',
            riskScore,
            encryptedMemo: params.encryptedMemo,
            plainMemo: params.encryptedMemo ? null : params.plainMemo ?? null,
            createdAt: now,
          })
          .returning();

        createdTransactions.push(mapTransaction(txRow));

        if (isFlagged) {
          const [alertRow] = await tx
            .insert(fraudAlerts)
            .values({
              id: generateId('frd'),
              userUid: params.user.uid,
              transactionId: txRow.id,
              accountId: fromAccount.id,
              severity: 'high',
              title: `Transfer Held for Verification (${params.recipientName})`,
              description: `Flagged due to ${riskReasons.join(' and ')}. Funds are temporarily held until you confirm.`,
              merchant: params.recipientName,
              amount: params.amount,
              currency: fromCurrency,
              location: 'Real-Time Clearing Engine',
              deviceInfo: 'Current Authenticated Session',
              status: 'open',
              createdAt: now,
            })
            .returning();
          createdAlert = mapFraudAlert(alertRow);

          const [notifRow] = await tx
            .insert(notifications)
            .values({
              id: generateId('ntf'),
              userUid: params.user.uid,
              kind: 'fraud',
              title: `Real-Time Fraud Alert: ${params.recipientName}`,
              message: `Transfer of ${params.amount.toLocaleString()} ${fromCurrency} is held for confirmation.`,
              read: false,
              createdAt: now,
            })
            .returning();
          createdNotification = mapNotification(notifRow);
        } else {
          const [notifRow] = await tx
            .insert(notifications)
            .values({
              id: generateId('ntf'),
              userUid: params.user.uid,
              kind: 'transaction',
              title: `Transfer Sent to ${params.recipientName}`,
              message: `${params.amount.toLocaleString()} ${fromCurrency} dispatched from ${fromAccount.name}.`,
              read: false,
              createdAt: now,
            })
            .returning();
          createdNotification = mapNotification(notifRow);
        }
      }

      const allAccounts = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.userUid, params.user.uid));

      return {
        transactions: createdTransactions,
        fraudFlagged: Boolean(createdAlert),
        fraudAlert: createdAlert,
        notification: createdNotification,
        accounts: allAccounts.map(mapAccount),
      };
    });
  } catch (error) {
    console.error('Database operation failed in executeTransfer:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function disputeTransaction(uid: string, txId: string) {
  try {
    return await db.transaction(async (tx) => {
      const [txRow] = await tx
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, txId), eq(transactions.userUid, uid)))
        .limit(1);

      if (!txRow) return null;

      const [existingAlert] = await tx
        .select()
        .from(fraudAlerts)
        .where(and(eq(fraudAlerts.transactionId, txRow.id), eq(fraudAlerts.userUid, uid)))
        .limit(1);

      if (existingAlert) {
        return {
          existing: true,
          fraudAlert: mapFraudAlert(existingAlert),
          transaction: mapTransaction(txRow),
        };
      }

      const [updatedTx] = await tx
        .update(transactions)
        .set({
          status: 'flagged',
          riskScore: Math.max(txRow.riskScore, 85),
        })
        .where(eq(transactions.id, txRow.id))
        .returning();

      const now = new Date();
      const [alertRow] = await tx
        .insert(fraudAlerts)
        .values({
          id: generateId('frd'),
          userUid: uid,
          transactionId: txRow.id,
          accountId: txRow.accountId,
          severity: 'high',
          title: `Customer Dispute: ${txRow.merchantOrRecipient}`,
          description:
            'You flagged this transaction as unrecognized. Review to block merchant and secure card.',
          merchant: txRow.merchantOrRecipient,
          amount: Math.abs(txRow.amount),
          currency: txRow.currency,
          location: txRow.location,
          deviceInfo: 'Reported by Account Holder',
          status: 'open',
          createdAt: now,
        })
        .returning();

      const [notifRow] = await tx
        .insert(notifications)
        .values({
          id: generateId('ntf'),
          userUid: uid,
          kind: 'fraud',
          title: `Dispute Opened: ${txRow.merchantOrRecipient}`,
          message: `Case opened for ${Math.abs(txRow.amount).toLocaleString()} ${txRow.currency}.`,
          read: false,
          createdAt: now,
        })
        .returning();

      return {
        existing: false,
        fraudAlert: mapFraudAlert(alertRow),
        transaction: mapTransaction(updatedTx),
        notification: mapNotification(notifRow),
      };
    });
  } catch (error) {
    console.error('Database operation failed in disputeTransaction:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function resolveFraudAlert(
  uid: string,
  alertId: string,
  decision: 'approve' | 'block'
) {
  try {
    return await db.transaction(async (tx) => {
      const [alertRow] = await tx
        .select()
        .from(fraudAlerts)
        .where(and(eq(fraudAlerts.id, alertId), eq(fraudAlerts.userUid, uid)))
        .limit(1);

      if (!alertRow) return null;

      const [updatedAlert] = await tx
        .update(fraudAlerts)
        .set({ status: decision === 'approve' ? 'approved' : 'blocked' })
        .where(eq(fraudAlerts.id, alertRow.id))
        .returning();

      const [txRow] = await tx
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, alertRow.transactionId), eq(transactions.userUid, uid)))
        .limit(1);

      let updatedTx: TransactionRow | undefined = txRow;
      if (txRow) {
        const [nextTx] = await tx
          .update(transactions)
          .set({ status: decision === 'approve' ? 'completed' : 'blocked' })
          .where(eq(transactions.id, txRow.id))
          .returning();
        updatedTx = nextTx;
      }

      const [accountRow] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, alertRow.accountId), eq(accounts.userUid, uid)))
        .limit(1);

      if (decision === 'block' && accountRow && txRow && txRow.amount < 0) {
        await tx
          .update(accounts)
          .set({
            balance: Math.round((accountRow.balance + Math.abs(txRow.amount)) * 100) / 100,
          })
          .where(eq(accounts.id, accountRow.id));

        if (txRow.type === 'card_purchase') {
          await tx
            .update(cards)
            .set({ frozen: true })
            .where(and(eq(cards.accountId, accountRow.id), eq(cards.userUid, uid)));
        }
      }

      const [notifRow] = await tx
        .insert(notifications)
        .values({
          id: generateId('ntf'),
          userUid: uid,
          kind: 'security',
          title:
            decision === 'approve'
              ? `Transaction Verified: ${alertRow.merchant}`
              : `Blocked & Refunded: ${alertRow.merchant}`,
          message:
            decision === 'approve'
              ? `You confirmed ${alertRow.amount.toLocaleString()} ${alertRow.currency} at ${alertRow.merchant}.`
              : `Unauthorized charge blocked and ${alertRow.amount.toLocaleString()} ${alertRow.currency} restored to your account.`,
          read: false,
        })
        .returning();

      const [allAccounts, allCards] = await Promise.all([
        tx.select().from(accounts).where(eq(accounts.userUid, uid)),
        tx.select().from(cards).where(eq(cards.userUid, uid)),
      ]);

      return {
        alert: mapFraudAlert(updatedAlert),
        transaction: updatedTx ? mapTransaction(updatedTx) : undefined,
        accounts: allAccounts.map(mapAccount),
        cards: allCards.map(mapCard),
        notification: mapNotification(notifRow),
      };
    });
  } catch (error) {
    console.error('Database operation failed in resolveFraudAlert:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function simulateFraudAlert(uid: string) {
  try {
    return await db.transaction(async (tx) => {
      const userAccounts = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.userUid, uid));

      const account = userAccounts.find((a) => a.currency === 'USD') || userAccounts[0];
      if (!account) return null;

      const amount = 945.0;
      const [updatedAccount] = await tx
        .update(accounts)
        .set({
          balance: Math.max(0, Math.round((account.balance - amount) * 100) / 100),
        })
        .where(eq(accounts.id, account.id))
        .returning();

      const now = new Date();
      const [txRow] = await tx
        .insert(transactions)
        .values({
          id: generateId('tx'),
          userUid: uid,
          accountId: account.id,
          type: 'card_purchase',
          category: 'Shopping',
          merchantOrRecipient: 'Apex Luxury Watches Zurich',
          amount: -amount,
          currency: account.currency,
          status: 'flagged',
          reference: `FRD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          location: 'Zurich, CH',
          riskScore: 91,
          createdAt: now,
        })
        .returning();

      const [alertRow] = await tx
        .insert(fraudAlerts)
        .values({
          id: generateId('frd'),
          userUid: uid,
          transactionId: txRow.id,
          accountId: account.id,
          severity: 'high',
          title: 'Suspicious Overseas Luxury Merchant Attempt',
          description:
            'Flagged real-time authorization of 945.00 in Zurich, CH from an unrecognized IP address.',
          merchant: txRow.merchantOrRecipient,
          amount,
          currency: account.currency,
          location: 'Zurich, CH',
          deviceInfo: 'Unknown Mobile Device · IP 91.198.x.x',
          status: 'open',
          createdAt: now,
        })
        .returning();

      const [notifRow] = await tx
        .insert(notifications)
        .values({
          id: generateId('ntf'),
          userUid: uid,
          kind: 'fraud',
          title: 'Real-Time Fraud Alert: Apex Luxury Watches Zurich',
          message: `${amount.toFixed(2)} ${account.currency} held pending your approval.`,
          read: false,
          createdAt: now,
        })
        .returning();

      return {
        transaction: mapTransaction(txRow),
        alert: mapFraudAlert(alertRow),
        notification: mapNotification(notifRow),
        account: mapAccount(updatedAccount),
      };
    });
  } catch (error) {
    console.error('Database operation failed in simulateFraudAlert:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function updateBudgetLimit(
  uid: string,
  budgetId: string,
  monthlyLimit: number
): Promise<BudgetLimit | null> {
  try {
    const [updated] = await db
      .update(budgets)
      .set({ monthlyLimit: Math.round(monthlyLimit * 100) / 100 })
      .where(and(eq(budgets.id, budgetId), eq(budgets.userUid, uid)))
      .returning();
    return updated ? mapBudget(updated) : null;
  } catch (error) {
    console.error('Database operation failed in updateBudgetLimit:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function upsertBudget(
  uid: string,
  category: TransactionCategory,
  monthlyLimit: number
): Promise<{ created: boolean; budget: BudgetLimit }> {
  try {
    const [existing] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.userUid, uid), eq(budgets.category, category)))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(budgets)
        .set({ monthlyLimit: Math.round(monthlyLimit * 100) / 100 })
        .where(eq(budgets.id, existing.id))
        .returning();
      return { created: false, budget: mapBudget(updated) };
    }

    const [inserted] = await db
      .insert(budgets)
      .values({
        id: generateId('bdg'),
        userUid: uid,
        category,
        monthlyLimit: Math.round(monthlyLimit * 100) / 100,
        currency: 'USD',
      })
      .returning();

    return { created: true, budget: mapBudget(inserted) };
  } catch (error) {
    console.error('Database operation failed in upsertBudget:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function createSavingsGoal(
  uid: string,
  input: { name: string; targetAmount: number; currency: CurrencyCode; targetDate: string }
): Promise<SavingsGoal> {
  try {
    const [created] = await db
      .insert(savingsGoals)
      .values({
        id: generateId('gol'),
        userUid: uid,
        name: input.name,
        targetAmount: input.targetAmount,
        currentAmount: 0,
        currency: input.currency,
        targetDate: input.targetDate,
      })
      .returning();
    return mapGoal(created);
  } catch (error) {
    console.error('Database operation failed in createSavingsGoal:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function contributeToSavingsGoal(
  uid: string,
  goalId: string,
  accountId: string,
  amount: number
) {
  try {
    return await db.transaction(async (tx) => {
      const [goal] = await tx
        .select()
        .from(savingsGoals)
        .where(and(eq(savingsGoals.id, goalId), eq(savingsGoals.userUid, uid)))
        .limit(1);
      if (!goal) return { errorStatus: 404, errorMessage: 'Savings goal not found.' };

      const [account] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, accountId), eq(accounts.userUid, uid)))
        .limit(1);
      if (!account || account.frozen) {
        return { errorStatus: 400, errorMessage: 'Active funding account required.' };
      }
      if (account.balance < amount) {
        return { errorStatus: 400, errorMessage: 'Valid amount within account balance is required.' };
      }

      const creditAmount = convertAmount(
        amount,
        account.currency as CurrencyCode,
        goal.currency as CurrencyCode
      );

      const [updatedAccount] = await tx
        .update(accounts)
        .set({ balance: Math.round((account.balance - amount) * 100) / 100 })
        .where(eq(accounts.id, account.id))
        .returning();

      const [updatedGoal] = await tx
        .update(savingsGoals)
        .set({ currentAmount: Math.round((goal.currentAmount + creditAmount) * 100) / 100 })
        .where(eq(savingsGoals.id, goal.id))
        .returning();

      const [txRow] = await tx
        .insert(transactions)
        .values({
          id: generateId('tx'),
          userUid: uid,
          accountId: account.id,
          type: 'transfer_out',
          category: 'Savings & Vault',
          merchantOrRecipient: `Goal: ${goal.name}`,
          amount: -amount,
          currency: account.currency,
          status: 'completed',
          reference: `GOL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          location: 'QUIKUP Savings Vault',
          riskScore: 1,
        })
        .returning();

      return {
        goal: mapGoal(updatedGoal),
        account: mapAccount(updatedAccount),
        transaction: mapTransaction(txRow),
      };
    });
  } catch (error) {
    console.error('Database operation failed in contributeToSavingsGoal:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function updateBankCard(
  uid: string,
  cardId: string,
  patch: Partial<{
    frozen: boolean;
    contactlessEnabled: boolean;
    onlineEnabled: boolean;
    internationalEnabled: boolean;
    monthlyLimit: number;
  }>
): Promise<BankCard | null> {
  try {
    const updateData: Partial<typeof cards.$inferInsert> = {};
    if (typeof patch.frozen === 'boolean') updateData.frozen = patch.frozen;
    if (typeof patch.contactlessEnabled === 'boolean')
      updateData.contactlessEnabled = patch.contactlessEnabled;
    if (typeof patch.onlineEnabled === 'boolean') updateData.onlineEnabled = patch.onlineEnabled;
    if (typeof patch.internationalEnabled === 'boolean')
      updateData.internationalEnabled = patch.internationalEnabled;
    if (typeof patch.monthlyLimit === 'number') updateData.monthlyLimit = patch.monthlyLimit;

    if (Object.keys(updateData).length === 0) {
      const [existing] = await db
        .select()
        .from(cards)
        .where(and(eq(cards.id, cardId), eq(cards.userUid, uid)))
        .limit(1);
      return existing ? mapCard(existing) : null;
    }

    const [updated] = await db
      .update(cards)
      .set(updateData)
      .where(and(eq(cards.id, cardId), eq(cards.userUid, uid)))
      .returning();

    return updated ? mapCard(updated) : null;
  } catch (error) {
    console.error('Database operation failed in updateBankCard:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function createPaymentReminder(
  uid: string,
  input: {
    title: string;
    payee: string;
    accountId: string;
    amount: number;
    dueDate: string;
    recurrence: 'monthly' | 'once';
    autoPay: boolean;
    category: TransactionCategory;
  }
): Promise<PaymentReminder | null> {
  try {
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, input.accountId), eq(accounts.userUid, uid)))
      .limit(1);

    if (!account) return null;

    const [created] = await db
      .insert(reminders)
      .values({
        id: generateId('rem'),
        userUid: uid,
        title: input.title,
        payee: input.payee,
        accountId: account.id,
        amount: input.amount,
        currency: account.currency,
        dueDate: input.dueDate,
        recurrence: input.recurrence,
        autoPay: input.autoPay,
        paidThisCycle: false,
        category: input.category,
      })
      .returning();

    return mapReminder(created);
  } catch (error) {
    console.error('Database operation failed in createPaymentReminder:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function payPaymentReminder(uid: string, reminderId: string) {
  try {
    return await db.transaction(async (tx) => {
      const [reminder] = await tx
        .select()
        .from(reminders)
        .where(and(eq(reminders.id, reminderId), eq(reminders.userUid, uid)))
        .limit(1);

      if (!reminder) return { errorStatus: 404, errorMessage: 'Reminder not found.' };

      const [account] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, reminder.accountId), eq(accounts.userUid, uid)))
        .limit(1);

      if (!account || account.frozen || account.balance < reminder.amount) {
        return { errorStatus: 400, errorMessage: 'Insufficient balance or frozen account.' };
      }

      const [updatedAccount] = await tx
        .update(accounts)
        .set({ balance: Math.round((account.balance - reminder.amount) * 100) / 100 })
        .where(eq(accounts.id, account.id))
        .returning();

      const [updatedReminder] = await tx
        .update(reminders)
        .set({ paidThisCycle: true })
        .where(eq(reminders.id, reminder.id))
        .returning();

      const now = new Date();
      const [txRow] = await tx
        .insert(transactions)
        .values({
          id: generateId('tx'),
          userUid: uid,
          accountId: account.id,
          type: 'bill_pay',
          category: reminder.category,
          merchantOrRecipient: reminder.payee,
          amount: -reminder.amount,
          currency: reminder.currency,
          status: 'completed',
          reference: `BIL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          location: 'Scheduled Bill Settlement',
          riskScore: 2,
          createdAt: now,
        })
        .returning();

      const [notifRow] = await tx
        .insert(notifications)
        .values({
          id: generateId('ntf'),
          userUid: uid,
          kind: 'reminder',
          title: `Payment Settled: ${reminder.payee}`,
          message: `${reminder.amount.toLocaleString()} ${reminder.currency} paid from ${account.name}.`,
          read: false,
          createdAt: now,
        })
        .returning();

      return {
        reminder: mapReminder(updatedReminder),
        account: mapAccount(updatedAccount),
        transaction: mapTransaction(txRow),
        notification: mapNotification(notifRow),
      };
    });
  } catch (error) {
    console.error('Database operation failed in payPaymentReminder:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function markNotificationsRead(uid: string, id: string | null): Promise<void> {
  try {
    if (id) {
      await db
        .update(notifications)
        .set({ read: true })
        .where(and(eq(notifications.userUid, uid), eq(notifications.id, id)));
    } else {
      await db.update(notifications).set({ read: true }).where(eq(notifications.userUid, uid));
    }
  } catch (error) {
    console.error('Database operation failed in markNotificationsRead:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function enrollBiometricCredential(
  user: UserRow,
  record: BiometricCredentialRecord
): Promise<UserProfile> {
  try {
    const nextBiometrics = [...(user.biometrics || []), record];
    const nextSecurity: SecuritySettings = {
      ...user.security,
      biometricLoginEnabled: true,
      biometricActionLockEnabled: true,
    };

    const updated = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(users)
        .set({
          biometrics: nextBiometrics,
          security: nextSecurity,
        })
        .where(eq(users.uid, user.uid))
        .returning();

      await tx.insert(notifications).values({
        id: generateId('ntf'),
        userUid: user.uid,
        kind: 'security',
        title: 'Biometric Passkey Enrolled',
        message: `${record.label} is now protecting sensitive account modifications.`,
        read: false,
      });

      return u;
    });

    return mapUser(updated);
  } catch (error) {
    console.error('Database operation failed in enrollBiometricCredential:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function touchBiometricLastUsed(user: UserRow, credentialId: string): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const nextBiometrics = (user.biometrics || []).map((b) =>
      b.credentialId === credentialId ? { ...b, lastUsedAt: nowIso } : b
    );
    await db
      .update(users)
      .set({ biometrics: nextBiometrics })
      .where(eq(users.uid, user.uid));
  } catch (error) {
    console.error('Database operation failed in touchBiometricLastUsed:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function removeBiometricCredential(
  user: UserRow,
  credId: string
): Promise<UserProfile> {
  try {
    const nextBiometrics = (user.biometrics || []).filter((b) => b.id !== credId);
    const nextSecurity: SecuritySettings = {
      ...user.security,
      biometricLoginEnabled:
        nextBiometrics.length === 0 ? false : user.security.biometricLoginEnabled,
      biometricActionLockEnabled:
        nextBiometrics.length === 0 ? false : user.security.biometricActionLockEnabled,
    };

    const [updated] = await db
      .update(users)
      .set({
        biometrics: nextBiometrics,
        security: nextSecurity,
      })
      .where(eq(users.uid, user.uid))
      .returning();

    return mapUser(updated);
  } catch (error) {
    console.error('Database operation failed in removeBiometricCredential:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function updateUserSecuritySettings(
  user: UserRow,
  nextSecurity: SecuritySettings,
  preferredCurrency: CurrencyCode
): Promise<UserProfile> {
  try {
    const [updated] = await db
      .update(users)
      .set({
        security: nextSecurity,
        preferredCurrency,
      })
      .where(eq(users.uid, user.uid))
      .returning();

    return mapUser(updated);
  } catch (error) {
    console.error('Database operation failed in updateUserSecuritySettings:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function rotateE2eeKeys(
  user: UserRow,
  newFingerprint: string,
  updatedMemos: { transactionId: string; encryptedMemo: EncryptedBlob }[]
): Promise<UserProfile> {
  try {
    const updatedUser = await db.transaction(async (tx) => {
      for (const item of updatedMemos) {
        await tx
          .update(transactions)
          .set({ encryptedMemo: item.encryptedMemo })
          .where(and(eq(transactions.id, item.transactionId), eq(transactions.userUid, user.uid)));
      }

      const nextSecurity: SecuritySettings = newFingerprint
        ? { ...user.security, e2eeKeyFingerprint: newFingerprint }
        : user.security;

      const [u] = await tx
        .update(users)
        .set({ security: nextSecurity })
        .where(eq(users.uid, user.uid))
        .returning();

      return u;
    });

    return mapUser(updatedUser);
  } catch (error) {
    console.error('Database operation failed in rotateE2eeKeys:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function getAdminClaimStatus(): Promise<{ claimed: boolean; envManaged: boolean }> {
  try {
    const envManaged = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
    const [row] = await db
      .select({ id: adminCredentials.id })
      .from(adminCredentials)
      .where(eq(adminCredentials.id, 'primary'))
      .limit(1);
    return { claimed: Boolean(row), envManaged };
  } catch (error) {
    console.error('Database operation failed in getAdminClaimStatus:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function claimAdminPassword(
  passwordSalt: string,
  passwordHash: string
): Promise<{ ok?: boolean; errorStatus?: number; errorMessage?: string }> {
  try {
    if (process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0) {
      return {
        errorStatus: 409,
        errorMessage: 'Admin passcode is already managed via environment configuration.',
      };
    }

    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: adminCredentials.id })
        .from(adminCredentials)
        .where(eq(adminCredentials.id, 'primary'))
        .limit(1);

      if (existing) {
        return {
          errorStatus: 409,
          errorMessage: 'Admin console password has already been claimed. Please log in.',
        };
      }

      await tx.insert(adminCredentials).values({
        id: 'primary',
        passwordSalt,
        passwordHash,
      });

      return { ok: true };
    });
  } catch (error) {
    console.error('Database operation failed in claimAdminPassword:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function getAdminCredentialRecord(): Promise<{
  passwordSalt: string;
  passwordHash: string;
} | null> {
  try {
    const [row] = await db
      .select({
        passwordSalt: adminCredentials.passwordSalt,
        passwordHash: adminCredentials.passwordHash,
      })
      .from(adminCredentials)
      .where(eq(adminCredentials.id, 'primary'))
      .limit(1);
    return row ?? null;
  } catch (error) {
    console.error('Database operation failed in getAdminCredentialRecord:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function getAdminOverview(): Promise<AdminOverviewPayload> {
  try {
    const [userRows, accountRows, txRows, alertRows, cardRows, reminderRows, auditRows] =
      await Promise.all([
        db.select().from(users).orderBy(desc(users.createdAt)),
        db.select().from(accounts),
        db.select().from(transactions).orderBy(desc(transactions.createdAt)),
        db.select().from(fraudAlerts).orderBy(desc(fraudAlerts.createdAt)),
        db.select().from(cards),
        db.select().from(reminders),
        db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)),
      ]);

    const userMap = new Map(userRows.map((u) => [u.uid, u]));
    const accountMap = new Map(accountRows.map((a) => [a.id, a]));

    const accountsByUser = new Map<string, BankAccount[]>();
    for (const acc of accountRows) {
      const mapped = mapAccount(acc);
      const list = accountsByUser.get(acc.userUid) || [];
      list.push(mapped);
      accountsByUser.set(acc.userUid, list);
    }

    const txCountByUser = new Map<string, number>();
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
    let volume24hUsd = 0;

    for (const tx of txRows) {
      txCountByUser.set(tx.userUid, (txCountByUser.get(tx.userUid) || 0) + 1);
      if (tx.createdAt.getTime() >= cutoff24h) {
        volume24hUsd += toUsd(Math.abs(tx.amount), tx.currency as CurrencyCode);
      }
    }

    const openAlertsByUser = new Map<string, number>();
    let openFraudAlerts = 0;
    for (const al of alertRows) {
      if (al.status === 'open') {
        openFraudAlerts += 1;
        openAlertsByUser.set(al.userUid, (openAlertsByUser.get(al.userUid) || 0) + 1);
      }
    }

    const cardsByUser = new Map<string, number>();
    let activeCards = 0;
    for (const c of cardRows) {
      cardsByUser.set(c.userUid, (cardsByUser.get(c.userUid) || 0) + 1);
      if (!c.frozen) activeCards += 1;
    }

    let totalCustodyUsd = 0;
    let frozenAccounts = 0;
    for (const acc of accountRows) {
      totalCustodyUsd += toUsd(acc.balance, acc.currency as CurrencyCode);
      if (acc.frozen) frozenAccounts += 1;
    }

    const userSummaries: AdminUserSummary[] = userRows
      .filter((u) => u.role !== 'admin' || (accountsByUser.get(u.uid)?.length || 0) > 0)
      .map((u) => {
        const uAccounts = accountsByUser.get(u.uid) || [];
        const totalBalanceUsd = uAccounts.reduce(
          (sum, acc) => sum + toUsd(acc.balance, acc.currency),
          0
        );
        return {
          id: u.uid,
          fullName: u.fullName,
          email: u.email,
          role: u.role === 'admin' ? 'admin' : 'customer',
          preferredCurrency: (VALID_CURRENCIES.includes(u.preferredCurrency as CurrencyCode)
            ? u.preferredCurrency
            : 'USD') as CurrencyCode,
          tier: u.tier,
          createdAt: u.createdAt.toISOString(),
          totalBalanceUsd: Math.round(totalBalanceUsd * 100) / 100,
          accounts: uAccounts,
          transactionCount: txCountByUser.get(u.uid) || 0,
          openFraudAlertsCount: openAlertsByUser.get(u.uid) || 0,
          cardsCount: cardsByUser.get(u.uid) || 0,
        };
      });

    const mappedTransactions: AdminTransactionItem[] = txRows.map((t) => {
      const owner = userMap.get(t.userUid);
      const acc = accountMap.get(t.accountId);
      return {
        ...mapTransaction(t),
        userFullName: owner?.fullName || 'Unknown User',
        userEmail: owner?.email || '',
        accountName: acc?.name || 'Account',
      };
    });

    const mappedAlerts: AdminFraudAlertItem[] = alertRows.map((a) => {
      const owner = userMap.get(a.userUid);
      return {
        ...mapFraudAlert(a),
        userFullName: owner?.fullName || 'Unknown User',
        userEmail: owner?.email || '',
      };
    });

    const mappedCards: AdminCardItem[] = cardRows.map((c) => {
      const owner = userMap.get(c.userUid);
      return {
        ...mapCard(c),
        userFullName: owner?.fullName || 'Unknown User',
        userEmail: owner?.email || '',
      };
    });

    const mappedReminders: AdminReminderItem[] = reminderRows.map((r) => {
      const owner = userMap.get(r.userUid);
      return {
        ...mapReminder(r),
        userFullName: owner?.fullName || 'Unknown User',
        userEmail: owner?.email || '',
      };
    });

    const mappedAuditLogs: AdminAuditLogItem[] = auditRows.map((log) => {
      const targetUser = userMap.get(log.targetUserUid);
      return {
        id: log.id,
        adminActor: log.adminActor,
        action: log.action,
        targetUserUid: log.targetUserUid,
        targetUserFullName: targetUser?.fullName || 'Unknown User',
        targetUserEmail: targetUser?.email || '',
        targetAccountId: log.targetAccountId ?? undefined,
        amount: log.amount ?? undefined,
        currency: (log.currency as CurrencyCode | null) ?? undefined,
        reason: log.reason,
        createdAt: log.createdAt.toISOString(),
      };
    });

    return {
      metrics: {
        totalCustomers: userSummaries.length,
        totalAccounts: accountRows.length,
        frozenAccounts,
        totalCustodyUsd: Math.round(totalCustodyUsd * 100) / 100,
        totalTransactions: txRows.length,
        volume24hUsd: Math.round(volume24hUsd * 100) / 100,
        openFraudAlerts,
        activeCards,
      },
      users: userSummaries,
      transactions: mappedTransactions,
      fraudAlerts: mappedAlerts,
      cards: mappedCards,
      reminders: mappedReminders,
      auditLogs: mappedAuditLogs,
      fxRates: FX_RATES,
    };
  } catch (error) {
    console.error('Database operation failed in getAdminOverview:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function adminAdjustAccountBalance(input: {
  adminActor: string;
  accountId: string;
  direction?: 'credit' | 'debit';
  mode?: 'credit' | 'debit' | 'set';
  amount: number;
  reason: string;
  category?: TransactionCategory;
}): Promise<{
  errorStatus?: number;
  errorMessage?: string;
  account?: BankAccount;
  transaction?: TransactionRecord;
}> {
  try {
    const effectiveMode: 'credit' | 'debit' | 'set' =
      input.mode === 'set' || input.mode === 'debit' || input.mode === 'credit'
        ? input.mode
        : input.direction === 'debit'
          ? 'debit'
          : 'credit';

    return await db.transaction(async (tx) => {
      const [acc] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, input.accountId))
        .limit(1);

      if (!acc) {
        return { errorStatus: 404, errorMessage: 'Target bank account not found.' };
      }

      const precision = acc.currency === 'JPY' ? 1 : 100;
      const roundedAmount = Math.round(input.amount * precision) / precision;

      if (effectiveMode === 'set') {
        if (!Number.isFinite(roundedAmount) || roundedAmount < 0) {
          return { errorStatus: 400, errorMessage: 'Target balance must be zero or greater.' };
        }
      } else if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
        return { errorStatus: 400, errorMessage: 'Adjustment amount must be greater than zero.' };
      }

      if (effectiveMode === 'debit' && acc.balance < roundedAmount) {
        return {
          errorStatus: 400,
          errorMessage: `Insufficient balance (${acc.balance.toFixed(2)} ${acc.currency} available).`,
        };
      }

      const delta =
        effectiveMode === 'set'
          ? Math.round((roundedAmount - acc.balance) * precision) / precision
          : effectiveMode === 'credit'
            ? roundedAmount
            : -roundedAmount;

      if (effectiveMode === 'set' && delta === 0) {
        return {
          errorStatus: 400,
          errorMessage: 'New balance is already equal to the current balance.',
        };
      }

      const nextBalance =
        effectiveMode === 'set'
          ? roundedAmount
          : Math.round((acc.balance + delta) * precision) / precision;

      const [updatedAccount] = await tx
        .update(accounts)
        .set({ balance: nextBalance })
        .where(eq(accounts.id, acc.id))
        .returning();

      const txCategory: TransactionCategory =
        input.category && VALID_CATEGORIES.includes(input.category)
          ? input.category
          : delta >= 0
            ? 'Salary & Income'
            : 'Transfers';

      const cleanReason =
        input.reason.trim().slice(0, 140) ||
        (effectiveMode === 'set'
          ? 'QUIKUP Balance Adjustment'
          : delta >= 0
            ? 'QUIKUP Treasury Credit'
            : 'QUIKUP Account Debit');
      const reference = `ADM-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      const [createdTx] = await tx
        .insert(transactions)
        .values({
          id: generateId('tx'),
          userUid: acc.userUid,
          accountId: acc.id,
          type: delta >= 0 ? 'deposit' : 'transfer_out',
          category: txCategory,
          merchantOrRecipient: cleanReason,
          recipientBankOrHandle: 'QUIKUP Operations Desk',
          amount: delta,
          currency: acc.currency,
          status: 'completed',
          reference,
          location: 'QUIKUP Treasury Desk',
          riskScore: 0,
          plainMemo: cleanReason,
        })
        .returning();

      const formatAmt = (val: number) =>
        acc.currency === 'JPY'
          ? Math.round(val).toLocaleString('en-US')
          : val.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });

      const formattedDelta = formatAmt(Math.abs(delta));
      const formattedNext = formatAmt(nextBalance);

      await tx.insert(notifications).values({
        id: generateId('ntf'),
        userUid: acc.userUid,
        kind: 'transaction',
        title:
          effectiveMode === 'set'
            ? `Account Balance Updated (${formattedNext} ${acc.currency})`
            : delta >= 0
              ? `Account Credited (+${formattedDelta} ${acc.currency})`
              : `Account Debited (-${formattedDelta} ${acc.currency})`,
        message: `${acc.name}: ${cleanReason} (Ref ${reference})`,
        read: false,
      });

      await tx.insert(adminAuditLogs).values({
        id: generateId('aud'),
        adminActor: input.adminActor,
        action:
          effectiveMode === 'set'
            ? 'EDIT_BALANCE'
            : delta >= 0
              ? 'CREDIT_BALANCE'
              : 'DEBIT_BALANCE',
        targetUserUid: acc.userUid,
        targetAccountId: acc.id,
        amount: Math.abs(delta),
        currency: acc.currency,
        reason: `${cleanReason} (New balance: ${formattedNext} ${acc.currency})`,
      });

      return {
        account: mapAccount(updatedAccount),
        transaction: mapTransaction(createdTx),
      };
    });
  } catch (error) {
    console.error('Database operation failed in adminAdjustAccountBalance:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function adminSetAccountFrozen(input: {
  adminActor: string;
  accountId: string;
  frozen: boolean;
  reason?: string;
}): Promise<{ account?: BankAccount; errorStatus?: number; errorMessage?: string }> {
  try {
    return await db.transaction(async (tx) => {
      const [acc] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, input.accountId))
        .limit(1);

      if (!acc) {
        return { errorStatus: 404, errorMessage: 'Account not found.' };
      }

      const [updated] = await tx
        .update(accounts)
        .set({ frozen: input.frozen })
        .where(eq(accounts.id, acc.id))
        .returning();

      const reasonText =
        input.reason?.trim().slice(0, 140) ||
        (input.frozen ? 'Frozen by QUIKUP Operations' : 'Reactivated by QUIKUP Operations');

      await tx.insert(notifications).values({
        id: generateId('ntf'),
        userUid: acc.userUid,
        kind: 'security',
        title: input.frozen ? `Account Frozen: ${acc.name}` : `Account Reactivated: ${acc.name}`,
        message: reasonText,
        read: false,
      });

      await tx.insert(adminAuditLogs).values({
        id: generateId('aud'),
        adminActor: input.adminActor,
        action: input.frozen ? 'FREEZE_ACCOUNT' : 'UNFREEZE_ACCOUNT',
        targetUserUid: acc.userUid,
        targetAccountId: acc.id,
        reason: reasonText,
      });

      return { account: mapAccount(updated) };
    });
  } catch (error) {
    console.error('Database operation failed in adminSetAccountFrozen:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function adminResolveFraudAlert(input: {
  adminActor: string;
  alertId: string;
  decision: 'approve' | 'block';
}) {
  try {
    const [alertRow] = await db
      .select()
      .from(fraudAlerts)
      .where(eq(fraudAlerts.id, input.alertId))
      .limit(1);

    if (!alertRow) return null;

    const result = await resolveFraudAlert(alertRow.userUid, input.alertId, input.decision);
    if (!result) return null;

    await db.insert(adminAuditLogs).values({
      id: generateId('aud'),
      adminActor: input.adminActor,
      action: input.decision === 'approve' ? 'APPROVE_FRAUD_ALERT' : 'BLOCK_FRAUD_ALERT',
      targetUserUid: alertRow.userUid,
      targetAccountId: alertRow.accountId,
      amount: alertRow.amount,
      currency: alertRow.currency,
      reason: `${input.decision === 'approve' ? 'Approved' : 'Blocked'} alert for ${alertRow.merchant}`,
    });

    return result;
  } catch (error) {
    console.error('Database operation failed in adminResolveFraudAlert:', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}
