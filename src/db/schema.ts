import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type {
  BiometricCredentialRecord,
  EncryptedBlob,
  SavedBeneficiary,
  SecuritySettings,
} from '../types/banking.ts';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  passwordSalt: text('password_salt'),
  passwordHash: text('password_hash'),
  preferredCurrency: text('preferred_currency').notNull().default('USD'),
  tier: text('tier').notNull().default('Countree Private'),
  security: jsonb('security').$type<SecuritySettings>().notNull(),
  biometrics: jsonb('biometrics').$type<BiometricCredentialRecord[]>().notNull().default([]),
  beneficiaries: jsonb('beneficiaries').$type<SavedBeneficiary[]>().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  currency: text('currency').notNull(),
  balance: doublePrecision('balance').notNull().default(0),
  ibanOrAccountNo: text('iban_or_account_no').notNull(),
  routingOrBic: text('routing_or_bic').notNull(),
  frozen: boolean('frozen').notNull().default(false),
  apy: doublePrecision('apy'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  category: text('category').notNull(),
  merchantOrRecipient: text('merchant_or_recipient').notNull(),
  recipientBankOrHandle: text('recipient_bank_or_handle'),
  amount: doublePrecision('amount').notNull(),
  currency: text('currency').notNull(),
  convertedAmount: doublePrecision('converted_amount'),
  convertedCurrency: text('converted_currency'),
  fxRate: doublePrecision('fx_rate'),
  status: text('status').notNull(),
  reference: text('reference').notNull(),
  location: text('location').notNull(),
  riskScore: integer('risk_score').notNull().default(0),
  encryptedMemo: jsonb('encrypted_memo').$type<EncryptedBlob | null>(),
  plainMemo: text('plain_memo'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const budgets = pgTable('budgets', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  monthlyLimit: doublePrecision('monthly_limit').notNull(),
  currency: text('currency').notNull().default('USD'),
});

export const savingsGoals = pgTable('savings_goals', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  targetAmount: doublePrecision('target_amount').notNull(),
  currentAmount: doublePrecision('current_amount').notNull().default(0),
  currency: text('currency').notNull(),
  targetDate: text('target_date').notNull(),
});

export const fraudAlerts = pgTable('fraud_alerts', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  transactionId: text('transaction_id').notNull(),
  accountId: text('account_id').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  merchant: text('merchant').notNull(),
  amount: doublePrecision('amount').notNull(),
  currency: text('currency').notNull(),
  location: text('location').notNull(),
  deviceInfo: text('device_info').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const cards = pgTable('cards', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  kind: text('kind').notNull(),
  network: text('network').notNull(),
  last4: text('last4').notNull(),
  fullMaskedPreview: text('full_masked_preview').notNull(),
  expiry: text('expiry').notNull(),
  cvvPreview: text('cvv_preview').notNull(),
  frozen: boolean('frozen').notNull().default(false),
  monthlyLimit: integer('monthly_limit').notNull(),
  monthlySpent: doublePrecision('monthly_spent').notNull().default(0),
  currency: text('currency').notNull(),
  contactlessEnabled: boolean('contactless_enabled').notNull().default(true),
  onlineEnabled: boolean('online_enabled').notNull().default(true),
  internationalEnabled: boolean('international_enabled').notNull().default(true),
});

export const reminders = pgTable('reminders', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  payee: text('payee').notNull(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  amount: doublePrecision('amount').notNull(),
  currency: text('currency').notNull(),
  dueDate: text('due_date').notNull(),
  recurrence: text('recurrence').notNull(),
  autoPay: boolean('auto_pay').notNull().default(false),
  paidThisCycle: boolean('paid_this_cycle').notNull().default(false),
  category: text('category').notNull(),
});

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  transactions: many(transactions),
  budgets: many(budgets),
  savingsGoals: many(savingsGoals),
  fraudAlerts: many(fraudAlerts),
  cards: many(cards),
  reminders: many(reminders),
  notifications: many(notifications),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  owner: one(users, {
    fields: [accounts.userUid],
    references: [users.uid],
  }),
  transactions: many(transactions),
}));
