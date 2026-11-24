export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'CHF';

export type AccountType = 'checking' | 'savings' | 'multi-currency' | 'vault';

export type TransactionType = 'transfer_out' | 'transfer_in' | 'fx_convert' | 'card_purchase' | 'bill_pay' | 'deposit';

export type TransactionStatus = 'completed' | 'pending' | 'flagged' | 'blocked';

export type TransactionCategory =
  | 'Housing'
  | 'Dining & Groceries'
  | 'Travel & FX'
  | 'Software & Cloud'
  | 'Shopping'
  | 'Utilities'
  | 'Salary & Income'
  | 'Savings & Vault'
  | 'Transfers';

export interface EncryptedBlob {
  alg: 'AES-256-GCM';
  iv: string;
  ciphertext: string;
  keyFingerprint: string;
}

export interface BankAccount {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  balance: number;
  ibanOrAccountNo: string;
  routingOrBic: string;
  frozen: boolean;
  apy?: number;
  createdAt: string;
}

export interface TransactionRecord {
  id: string;
  userId: string;
  accountId: string;
  type: TransactionType;
  category: TransactionCategory;
  merchantOrRecipient: string;
  recipientBankOrHandle?: string;
  amount: number; // positive for credit, negative for debit
  currency: CurrencyCode;
  convertedAmount?: number;
  convertedCurrency?: CurrencyCode;
  fxRate?: number;
  status: TransactionStatus;
  reference: string;
  location: string;
  riskScore: number;
  encryptedMemo?: EncryptedBlob | null;
  plainMemo?: string;
  createdAt: string;
}

export interface BudgetLimit {
  id: string;
  userId: string;
  category: TransactionCategory;
  monthlyLimit: number;
  currency: CurrencyCode;
}

export interface SavingsGoal {
  id: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currency: CurrencyCode;
  targetDate: string;
}

export interface FraudAlert {
  id: string;
  userId: string;
  transactionId: string;
  accountId: string;
  severity: 'high' | 'medium';
  title: string;
  description: string;
  merchant: string;
  amount: number;
  currency: CurrencyCode;
  location: string;
  deviceInfo: string;
  status: 'open' | 'approved' | 'blocked';
  createdAt: string;
}

export interface BankCard {
  id: string;
  userId: string;
  accountId: string;
  label: string;
  kind: 'physical' | 'virtual';
  network: 'Visa Infinite' | 'Mastercard World';
  last4: string;
  fullMaskedPreview: string;
  expiry: string;
  cvvPreview: string;
  frozen: boolean;
  monthlyLimit: number;
  monthlySpent: number;
  currency: CurrencyCode;
  contactlessEnabled: boolean;
  onlineEnabled: boolean;
  internationalEnabled: boolean;
}

export interface PaymentReminder {
  id: string;
  userId: string;
  title: string;
  payee: string;
  accountId: string;
  amount: number;
  currency: CurrencyCode;
  dueDate: string;
  recurrence: 'monthly' | 'quarterly' | 'once';
  autoPay: boolean;
  paidThisCycle: boolean;
  category: TransactionCategory;
}

export interface NotificationItem {
  id: string;
  userId: string;
  kind: 'transaction' | 'fraud' | 'reminder' | 'security';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface BiometricCredentialRecord {
  id: string;
  label: string;
  method: 'webauthn' | 'device-ecdsa';
  credentialId: string;
  publicKeySpki?: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface SecuritySettings {
  biometricLoginEnabled: boolean;
  biometricActionLockEnabled: boolean;
  e2eeEnabled: boolean;
  e2eeSalt: string;
  e2eeKeyFingerprint: string;
  pushTransactionsEnabled: boolean;
  pushRemindersEnabled: boolean;
  pushFraudEnabled: boolean;
  highValueThresholdUsd: number;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  role?: 'customer' | 'admin';
  preferredCurrency: CurrencyCode;
  tier: 'Countree Private' | 'Countree Global';
  createdAt: string;
  security: SecuritySettings;
  biometrics: BiometricCredentialRecord[];
}

export interface SavedBeneficiary {
  id: string;
  name: string;
  bankName: string;
  handleOrIban: string;
  currency: CurrencyCode;
  country: string;
}

export type FxRateMap = Record<CurrencyCode, number>;

export interface BankingBootstrapPayload {
  user: UserProfile;
  accounts: BankAccount[];
  transactions: TransactionRecord[];
  budgets: BudgetLimit[];
  savingsGoals: SavingsGoal[];
  fraudAlerts: FraudAlert[];
  cards: BankCard[];
  reminders: PaymentReminder[];
  notifications: NotificationItem[];
  beneficiaries: SavedBeneficiary[];
  fxRates: FxRateMap;
}

export interface AdminUserSummary {
  id: string;
  fullName: string;
  email: string;
  role: 'customer' | 'admin';
  preferredCurrency: CurrencyCode;
  tier: string;
  createdAt: string;
  totalBalanceUsd: number;
  accounts: BankAccount[];
  transactionCount: number;
  openFraudAlertsCount: number;
  cardsCount: number;
}

export interface AdminTransactionItem extends TransactionRecord {
  userFullName: string;
  userEmail: string;
  accountName: string;
}

export interface AdminFraudAlertItem extends FraudAlert {
  userFullName: string;
  userEmail: string;
}

export interface AdminCardItem extends BankCard {
  userFullName: string;
  userEmail: string;
}

export interface AdminReminderItem extends PaymentReminder {
  userFullName: string;
  userEmail: string;
}

export interface AdminAuditLogItem {
  id: string;
  adminActor: string;
  action: string;
  targetUserUid: string;
  targetUserFullName: string;
  targetUserEmail: string;
  targetAccountId?: string;
  amount?: number;
  currency?: CurrencyCode;
  reason: string;
  createdAt: string;
}

export interface AdminOverviewPayload {
  metrics: {
    totalCustomers: number;
    totalAccounts: number;
    frozenAccounts: number;
    totalCustodyUsd: number;
    totalTransactions: number;
    volume24hUsd: number;
    openFraudAlerts: number;
    activeCards: number;
  };
  users: AdminUserSummary[];
  transactions: AdminTransactionItem[];
  fraudAlerts: AdminFraudAlertItem[];
  cards: AdminCardItem[];
  reminders: AdminReminderItem[];
  auditLogs: AdminAuditLogItem[];
  fxRates: FxRateMap;
}
