import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onIdTokenChanged, signOut } from 'firebase/auth';
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  CalendarClock,
  CreditCard,
  Home,
  Landmark,
  LayoutGrid,
  ListOrdered,
  LogOut,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { AccountsView } from './components/AccountsView.tsx';
import { AdminDashboardView } from './components/AdminDashboardView.tsx';
import { AnalyticsView } from './components/AnalyticsView.tsx';
import { AuthPortal, QuikupLogo } from './components/AuthPortal.tsx';
import { BiometricModal } from './components/BiometricModal.tsx';
import { CardsView } from './components/CardsView.tsx';
import { E2EEVaultModal } from './components/E2EEVaultModal.tsx';
import { OverviewView } from './components/OverviewView.tsx';
import { PaymentsView } from './components/PaymentsView.tsx';
import { SecurityCenterView } from './components/SecurityCenterView.tsx';
import { TransactionsView } from './components/TransactionsView.tsx';
import { TransfersView } from './components/TransfersView.tsx';
import { ApiError, apiRequest } from './lib/api.ts';
import {
  decryptMemoAES,
  deriveE2EEKey,
  encryptMemoAES,
  enrollBiometricPasskey,
} from './lib/crypto.ts';
import { auth } from './lib/firebase.ts';
import {
  getPushPermission,
  requestPushPermission,
  triggerBrowserPush,
  type PushPermissionState,
} from './lib/notifications.ts';
import type {
  AccountType,
  BankAccount,
  BankingBootstrapPayload,
  CurrencyCode,
  EncryptedBlob,
  NotificationItem,
  SecuritySettings,
} from './types/banking.ts';
import accountHolderAvatarImg from './assets/images/avatar_account_holder_1795466382163.jpg';

type NavTab =
  | 'overview'
  | 'accounts'
  | 'transfers'
  | 'payments'
  | 'cards'
  | 'analytics'
  | 'security'
  | 'transactions';

const TAB_LABELS: Record<NavTab, string> = {
  overview: 'Dashboard',
  accounts: 'Accounts',
  transfers: 'Transfers',
  payments: 'Payments',
  cards: 'Cards',
  analytics: 'Investments & Budgets',
  security: 'Security & Support',
  transactions: 'Transactions',
};

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(false);

  // Session tokens strictly in React memory
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [adminSessionToken, setAdminSessionToken] = useState<string | null>(null);
  const [viewingAdminConsole, setViewingAdminConsole] = useState(false);
  const [bankingData, setBankingData] = useState<BankingBootstrapPayload | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(false);

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>('USD');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // E2EE key strictly in React memory
  const [e2eeKey, setE2eeKey] = useState<CryptoKey | null>(null);
  const [e2eeFingerprint, setE2eeFingerprint] = useState<string>('');
  const [e2eeModalOpen, setE2eeModalOpen] = useState(false);
  const [decryptedMemos, setDecryptedMemos] = useState<Record<string, string>>({});

  // Biometric Step-Up Modal state
  const [biometricToken, setBiometricToken] = useState<string | null>(null);
  const [pendingStepUp, setPendingStepUp] = useState<{
    actionLabel: string;
    retry: (token: string) => Promise<void>;
  } | null>(null);

  const [pushPermission, setPushPermission] = useState<PushPermissionState>(() =>
    getPushPermission()
  );
  const [toast, setToast] = useState<{ kind: 'info' | 'alert'; text: string } | null>(null);

  const [authInitializing, setAuthInitializing] = useState(true);
  const loadedUidRef = useRef<string | null>(null);
  const authProviderRef = useRef<'firebase' | 'password' | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const showToast = useCallback((text: string, kind: 'info' | 'alert' = 'info') => {
    setToast({ text, kind });
    setTimeout(() => {
      setToast((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  }, []);

  const loadBootstrap = useCallback(
    async (
      token?: string,
      options?: { silent?: boolean }
    ): Promise<BankingBootstrapPayload | undefined> => {
      if (!options?.silent) {
        setLoadingBootstrap(true);
      }
      try {
        const activeToken =
          token ||
          (authProviderRef.current === 'firebase' ? await auth.currentUser?.getIdToken() : null) ||
          sessionToken;
        if (!activeToken) return undefined;
        setSessionToken(activeToken);
        const data = await apiRequest<BankingBootstrapPayload>('/api/banking/bootstrap', {
          token: activeToken,
        });
        setBankingData(data);
        if (!options?.silent) {
          setDisplayCurrency(data.user.preferredCurrency);
        }
        return data;
      } finally {
        if (!options?.silent) {
          setLoadingBootstrap(false);
        }
      }
    },
    [sessionToken]
  );

  // Silent background refresh so admin balance adjustments or freezes appear live in the user dashboard
  useEffect(() => {
    if (!sessionToken || !bankingData || viewingAdminConsole) return;
    const syncSilently = () => {
      if (document.visibilityState === 'visible') {
        loadBootstrap(sessionToken, { silent: true }).catch(() => {});
      }
    };
    const intervalId = window.setInterval(syncSilently, 5000);
    window.addEventListener('focus', syncSilently);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', syncSilently);
    };
  }, [sessionToken, bankingData, viewingAdminConsole, loadBootstrap]);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        if (authProviderRef.current !== 'password') {
          authProviderRef.current = 'firebase';
          try {
            const token = await firebaseUser.getIdToken();
            setSessionToken(token);
            if (loadedUidRef.current !== firebaseUser.uid) {
              loadedUidRef.current = firebaseUser.uid;
              const data = await loadBootstrap(token);
              if (data?.user.role === 'admin') {
                setViewingAdminConsole(true);
              }
            }
          } catch (err) {
            loadedUidRef.current = null;
            showToast(
              err instanceof Error ? err.message : 'Unable to load your banking session.',
              'alert'
            );
          }
        }
      } else if (authProviderRef.current !== 'password') {
        authProviderRef.current = null;
        loadedUidRef.current = null;
        setSessionToken(null);
        setViewingAdminConsole(false);
        setBankingData(null);
        setE2eeKey(null);
        setE2eeFingerprint('');
        setBiometricToken(null);
        setDecryptedMemos({});
      }
      setAuthInitializing(false);
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Decrypt E2EE memos whenever e2eeKey or transactions update
  useEffect(() => {
    if (!e2eeKey || !bankingData) {
      setDecryptedMemos({});
      return;
    }
    let active = true;
    const run = async () => {
      const entries: Record<string, string> = {};
      for (const tx of bankingData.transactions) {
        if (tx.encryptedMemo) {
          try {
            entries[tx.id] = await decryptMemoAES(tx.encryptedMemo, e2eeKey);
          } catch {
            entries[tx.id] = 'Encrypted with a previous key';
          }
        }
      }
      if (active) setDecryptedMemos(entries);
    };
    run();
    return () => {
      active = false;
    };
  }, [e2eeKey, bankingData]);

  const handleAuthenticated = async (
    token: string,
    preferredCurrency?: CurrencyCode,
    provider: 'firebase' | 'password' = 'firebase'
  ) => {
    authProviderRef.current = provider;
    setSessionToken(token);
    if (provider === 'firebase' && auth.currentUser) {
      loadedUidRef.current = auth.currentUser.uid;
    } else {
      loadedUidRef.current = 'password_session';
    }
    if (preferredCurrency && preferredCurrency !== 'USD') {
      await apiRequest('/api/security/settings', {
        method: 'PATCH',
        token,
        body: { preferredCurrency },
      }).catch(() => {});
    }
    const data = await loadBootstrap(token);
    if (data?.user.role === 'admin') {
      setViewingAdminConsole(true);
    }
  };

  const handleSignOut = async () => {
    authProviderRef.current = null;
    loadedUidRef.current = null;
    await signOut(auth).catch(() => {});
    setAdminSessionToken(null);
    setViewingAdminConsole(false);
    setSessionToken(null);
    setBankingData(null);
    setE2eeKey(null);
    setE2eeFingerprint('');
    setBiometricToken(null);
    setDecryptedMemos({});
    setActiveTab('overview');
  };

  const runWithStepUp = useCallback(
    async (actionLabel: string, fn: (bioTok?: string | null) => Promise<void>) => {
      try {
        await fn(biometricToken);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'BIOMETRIC_STEPUP_REQUIRED') {
          setPendingStepUp({
            actionLabel,
            retry: async (freshBioToken: string) => {
              setBiometricToken(freshBioToken);
              await fn(freshBioToken);
            },
          });
        } else {
          showToast(err instanceof Error ? err.message : 'Action failed.', 'alert');
          throw err;
        }
      }
    },
    [biometricToken, showToast]
  );

  const dispatchNotificationSideEffects = useCallback(
    (notif: NotificationItem | null | undefined) => {
      if (!notif || !bankingData) return;
      const sec = bankingData.user.security;
      const allowed =
        (notif.kind === 'fraud' && sec.pushFraudEnabled) ||
        (notif.kind === 'reminder' && sec.pushRemindersEnabled) ||
        (notif.kind === 'transaction' && sec.pushTransactionsEnabled) ||
        notif.kind === 'security';

      if (allowed && pushPermission === 'granted') {
        triggerBrowserPush(notif.title, notif.message);
      }
    },
    [bankingData, pushPermission]
  );

  const openAlertsCount = useMemo(
    () => bankingData?.fraudAlerts.filter((a) => a.status === 'open').length || 0,
    [bankingData]
  );
  const unreadNotifsCount = useMemo(
    () => bankingData?.notifications.filter((n) => !n.read).length || 0,
    [bankingData]
  );

  if (adminSessionToken) {
    return (
      <AdminDashboardView
        adminToken={adminSessionToken}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
        onSignOut={() => {
          setAdminSessionToken(null);
          setViewingAdminConsole(false);
        }}
        canSwitchToPersonal={Boolean(sessionToken && bankingData)}
        onSwitchToPersonal={() => setViewingAdminConsole(false)}
      />
    );
  }

  if (viewingAdminConsole && sessionToken && bankingData?.user.role === 'admin') {
    return (
      <AdminDashboardView
        adminToken={sessionToken}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
        onSignOut={handleSignOut}
        canSwitchToPersonal
        onSwitchToPersonal={() => setViewingAdminConsole(false)}
      />
    );
  }

  if (!sessionToken || !bankingData) {
    if (authInitializing || (sessionToken && loadingBootstrap)) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] text-sm text-[#0B2545] dark:bg-[#071224] dark:text-slate-200">
          Loading QUIKUP workspace...
        </div>
      );
    }
    return (
      <AuthPortal
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
        onAuthenticated={handleAuthenticated}
        onAdminAuthenticated={(token) => {
          setAdminSessionToken(token);
          setViewingAdminConsole(true);
        }}
      />
    );
  }

  const {
    user,
    accounts,
    transactions,
    budgets,
    savingsGoals,
    fraudAlerts,
    cards,
    reminders,
    notifications,
    beneficiaries,
    fxRates,
  } = bankingData;

  const firstName = user.fullName.split(' ')[0] || 'Client';

  const sidebarItems: { id: NavTab; label: string; icon: typeof Home }[] = [
    { id: 'overview', label: 'Dashboard', icon: Home },
    { id: 'accounts', label: 'Accounts', icon: Landmark },
    { id: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
    { id: 'payments', label: 'Payments', icon: CalendarClock },
    { id: 'cards', label: 'Cards', icon: CreditCard },
    { id: 'analytics', label: 'Investments & Budgets', icon: BarChart3 },
    { id: 'transactions', label: 'Transactions', icon: ListOrdered },
    { id: 'security', label: 'Security & Settings', icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-[#0B2545] dark:bg-[#071224] dark:text-slate-100">
      <div className="flex min-h-screen">
        {/* Deep Navy Left Sidebar matching Reference Image */}
        <aside className="hidden w-64 shrink-0 flex-col justify-between bg-[#0B2545] p-5 text-white lg:flex dark:bg-[#050D1A]">
          <div>
            <div className="flex items-center px-2 py-2">
              <QuikupLogo onDark size="lg" />
            </div>

            <nav className="mt-7 space-y-1" aria-label="Dashboard navigation">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white/15 text-white shadow-xs'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="inline-flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {item.id === 'security' && openAlertsCount > 0 && (
                      <span className="rounded bg-red-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                        {openAlertsCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="space-y-1 border-t border-white/10 pt-4">
            {user.role === 'admin' && (
              <button
                type="button"
                onClick={() => setViewingAdminConsole(true)}
                className="flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium text-blue-300 hover:bg-white/10 hover:text-white whitespace-nowrap"
              >
                <Activity className="h-4 w-4 shrink-0" />
                <span>Admin Operations</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              <span>Log Out</span>
            </button>
          </div>
        </aside>

        {/* Main Workspace */}
        <div className="flex min-w-0 flex-1 flex-col pb-20 lg:pb-0">
          {/* Clean Top Bar matching Reference Dashboard Header */}
          <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-4 py-3.5 backdrop-blur-xs sm:px-8 dark:border-slate-800 dark:bg-[#0A192F]/95">
            <div className="flex min-w-0 items-center gap-3">
              <div className="lg:hidden">
                <QuikupLogo size="sm" />
              </div>
              <h1 className="truncate font-display text-lg font-bold text-[#0B2545] dark:text-white">
                {TAB_LABELS[activeTab]}
              </h1>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('transactions')}
                className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#0B2545] sm:inline-flex dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Search transactions"
              >
                <Search className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setNotificationsOpen(true)}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-[#0B2545] dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Open notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadNotifsCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[10px] font-bold text-white">
                    {unreadNotifsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setDarkMode((d) => !d)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-[#0B2545] dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Toggle dark mode"
              >
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className="flex items-center gap-2.5 rounded-lg py-1 pr-2 pl-1 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {!avatarError ? (
                  <img
                    src={accountHolderAvatarImg}
                    alt={user.fullName}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0B2545] text-xs font-semibold text-white">
                    {firstName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="hidden text-xs font-semibold text-[#0B2545] sm:inline dark:text-slate-100">
                  Hello, {firstName}
                </span>
              </button>
            </div>
          </header>

          {/* Main Dashboard Content */}
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-8">
            {activeTab === 'overview' && (
              <OverviewView
                userName={user.fullName}
                accounts={accounts}
                transactions={transactions}
                fraudAlerts={fraudAlerts}
                beneficiaries={beneficiaries}
                fxRates={fxRates}
                displayCurrency={displayCurrency}
                onChangeDisplayCurrency={async (currency) => {
                  setDisplayCurrency(currency);
                  await apiRequest('/api/security/settings', {
                    method: 'PATCH',
                    token: sessionToken,
                    body: { preferredCurrency: currency },
                  }).catch(() => {});
                }}
                onQuickTransfer={async (payload) => {
                  await runWithStepUp(
                    `Confirm quick transfer of ${payload.amount} ${payload.targetCurrency}`,
                    async (bioTok) => {
                      const res = await apiRequest<{
                        fraudFlagged: boolean;
                        notification?: NotificationItem;
                      }>('/api/transfers', {
                        method: 'POST',
                        token: sessionToken,
                        biometricToken: bioTok,
                        body: {
                          mode: 'external',
                          ...payload,
                        },
                      });
                      await loadBootstrap(sessionToken);
                      dispatchNotificationSideEffects(res.notification);
                      showToast(
                        res.fraudFlagged
                          ? 'Real-time fraud alert triggered. Please verify this transfer.'
                          : `Transferred to ${payload.recipientName}.`,
                        res.fraudFlagged ? 'alert' : 'info'
                      );
                    }
                  );
                }}
                onResolveFraud={async (alertId, decision) => {
                  const res = await apiRequest<{ notification?: NotificationItem }>(
                    `/api/fraud-alerts/${alertId}/resolve`,
                    {
                      method: 'POST',
                      token: sessionToken,
                      body: { decision },
                    }
                  );
                  await loadBootstrap(sessionToken);
                  dispatchNotificationSideEffects(res.notification);
                  showToast(
                    decision === 'approve'
                      ? 'Transaction verified and released.'
                      : 'Charge blocked and funds restored.',
                    decision === 'block' ? 'alert' : 'info'
                  );
                }}
                onNavigate={setActiveTab}
                decryptedMemos={decryptedMemos}
              />
            )}

            {activeTab === 'accounts' && (
              <AccountsView
                accounts={accounts}
                fxRates={fxRates}
                displayCurrency={displayCurrency}
                onOpenAccount={async (payload: {
                  name: string;
                  currency: CurrencyCode;
                  type: AccountType;
                }) => {
                  await apiRequest('/api/accounts', {
                    method: 'POST',
                    token: sessionToken,
                    body: payload,
                  });
                  await loadBootstrap(sessionToken);
                  showToast(`${payload.name} (${payload.currency}) opened.`);
                }}
                onToggleFreezeAccount={async (acc: BankAccount) => {
                  await runWithStepUp(
                    `${acc.frozen ? 'Unfreeze' : 'Freeze'} ${acc.name}`,
                    async (bioTok) => {
                      await apiRequest(`/api/accounts/${acc.id}`, {
                        method: 'PATCH',
                        token: sessionToken,
                        biometricToken: bioTok,
                        body: { frozen: !acc.frozen },
                      });
                      await loadBootstrap(sessionToken);
                      showToast(`${acc.name} ${acc.frozen ? 'unfrozen' : 'frozen'}.`);
                    }
                  );
                }}
              />
            )}

            {activeTab === 'transfers' && (
              <TransfersView
                accounts={accounts}
                beneficiaries={beneficiaries}
                fxRates={fxRates}
                e2eeKey={e2eeKey}
                e2eeFingerprint={e2eeFingerprint}
                highValueThresholdUsd={user.security.highValueThresholdUsd}
                onRequestUnlockE2EE={() => setE2eeModalOpen(true)}
                onSubmitTransfer={async (payload) => {
                  let result = { fraudFlagged: false };
                  await runWithStepUp(
                    `Confirm transfer of ${payload.amount} ${payload.targetCurrency}`,
                    async (bioTok) => {
                      const res = await apiRequest<{
                        fraudFlagged: boolean;
                        notification?: NotificationItem;
                      }>('/api/transfers', {
                        method: 'POST',
                        token: sessionToken,
                        biometricToken: bioTok,
                        body: payload,
                      });
                      result = { fraudFlagged: res.fraudFlagged };
                      await loadBootstrap(sessionToken);
                      dispatchNotificationSideEffects(res.notification);
                      if (res.fraudFlagged) {
                        showToast(
                          'Real-time fraud alert triggered. Please verify this transfer.',
                          'alert'
                        );
                      } else {
                        showToast('Transfer settled.');
                      }
                    }
                  );
                  return result;
                }}
              />
            )}

            {activeTab === 'payments' && (
              <PaymentsView
                accounts={accounts}
                reminders={reminders}
                onAddReminder={async (payload) => {
                  await apiRequest('/api/reminders', {
                    method: 'POST',
                    token: sessionToken,
                    body: payload,
                  });
                  await loadBootstrap(sessionToken);
                  showToast('Payment reminder scheduled.');
                }}
                onPayReminder={async (reminderId) => {
                  const res = await apiRequest<{ notification?: NotificationItem }>(
                    `/api/reminders/${reminderId}/pay`,
                    { method: 'POST', token: sessionToken }
                  );
                  await loadBootstrap(sessionToken);
                  dispatchNotificationSideEffects(res.notification);
                  showToast('Scheduled payment settled.');
                }}
              />
            )}

            {activeTab === 'transactions' && (
              <TransactionsView
                transactions={transactions}
                accounts={accounts}
                decryptedMemos={decryptedMemos}
                onRequestUnlockE2EE={() => setE2eeModalOpen(true)}
                onDisputeTransaction={async (txId) => {
                  const res = await apiRequest<{ notification?: NotificationItem }>(
                    `/api/transactions/${txId}/dispute`,
                    { method: 'POST', token: sessionToken }
                  );
                  await loadBootstrap(sessionToken);
                  dispatchNotificationSideEffects(res.notification);
                  showToast('Fraud dispute opened for this transaction.', 'alert');
                }}
              />
            )}

            {activeTab === 'analytics' && (
              <AnalyticsView
                transactions={transactions}
                budgets={budgets}
                savingsGoals={savingsGoals}
                accounts={accounts}
                fxRates={fxRates}
                displayCurrency={displayCurrency}
                onUpdateBudget={async (budgetId, monthlyLimit) => {
                  await apiRequest(`/api/budgets/${budgetId}`, {
                    method: 'PATCH',
                    token: sessionToken,
                    body: { monthlyLimit },
                  });
                  await loadBootstrap(sessionToken);
                  showToast('Monthly budget cap updated.');
                }}
                onCreateGoal={async (payload) => {
                  await apiRequest('/api/savings-goals', {
                    method: 'POST',
                    token: sessionToken,
                    body: payload,
                  });
                  await loadBootstrap(sessionToken);
                  showToast('Savings goal created.');
                }}
                onContributeGoal={async (goalId, accountId, amount) => {
                  await apiRequest(`/api/savings-goals/${goalId}/contribute`, {
                    method: 'POST',
                    token: sessionToken,
                    body: { accountId, amount },
                  });
                  await loadBootstrap(sessionToken);
                  showToast('Contribution added to savings goal.');
                }}
              />
            )}

            {activeTab === 'cards' && (
              <CardsView
                cards={cards}
                accounts={accounts}
                onUpdateCard={async (cardId, patch) => {
                  await runWithStepUp('Modify card security controls', async (bioTok) => {
                    await apiRequest(`/api/cards/${cardId}`, {
                      method: 'PATCH',
                      token: sessionToken,
                      biometricToken: bioTok,
                      body: patch,
                    });
                    await loadBootstrap(sessionToken);
                    showToast('Card settings updated.');
                  });
                }}
              />
            )}

            {activeTab === 'security' && (
              <SecurityCenterView
                user={user}
                accounts={accounts}
                fraudAlerts={fraudAlerts}
                reminders={reminders}
                e2eeUnlocked={Boolean(e2eeKey)}
                e2eeFingerprint={e2eeFingerprint}
                pushPermission={pushPermission}
                onResolveFraud={async (alertId, decision) => {
                  const res = await apiRequest<{ notification?: NotificationItem }>(
                    `/api/fraud-alerts/${alertId}/resolve`,
                    {
                      method: 'POST',
                      token: sessionToken,
                      body: { decision },
                    }
                  );
                  await loadBootstrap(sessionToken);
                  dispatchNotificationSideEffects(res.notification);
                  showToast(
                    decision === 'approve'
                      ? 'Alert cleared & transaction approved.'
                      : 'Card frozen, charge blocked & funds restored.',
                    decision === 'block' ? 'alert' : 'info'
                  );
                }}
                onSimulateFraud={async () => {
                  const res = await apiRequest<{ notification?: NotificationItem }>(
                    '/api/fraud-alerts/simulate',
                    { method: 'POST', token: sessionToken }
                  );
                  await loadBootstrap(sessionToken);
                  dispatchNotificationSideEffects(res.notification);
                  showToast('Simulated high-risk transaction flagged.', 'alert');
                }}
                onEnrollBiometric={async (label) => {
                  const challengeResp = await apiRequest<{ challengeId: string; challenge: string }>(
                    '/api/auth/biometric/challenge',
                    {
                      method: 'POST',
                      token: sessionToken,
                      body: { purpose: 'enroll' },
                    }
                  );
                  const enrolled = await enrollBiometricPasskey(
                    user.id,
                    user.email,
                    user.fullName,
                    challengeResp.challenge,
                    label
                  );
                  await apiRequest('/api/security/biometrics/enroll', {
                    method: 'POST',
                    token: sessionToken,
                    body: enrolled,
                  });
                  await loadBootstrap(sessionToken);
                  showToast(`Biometric passkey "${label}" enrolled.`);
                }}
                onRemoveBiometric={async (credId) => {
                  await runWithStepUp('Remove enrolled biometric passkey', async (bioTok) => {
                    await apiRequest(`/api/security/biometrics/${credId}`, {
                      method: 'DELETE',
                      token: sessionToken,
                      biometricToken: bioTok,
                    });
                    await loadBootstrap(sessionToken);
                    showToast('Passkey removed.');
                  });
                }}
                onUpdateSecurity={async (patch: Partial<SecuritySettings>) => {
                  await runWithStepUp('Modify security policy settings', async (bioTok) => {
                    await apiRequest('/api/security/settings', {
                      method: 'PATCH',
                      token: sessionToken,
                      biometricToken: bioTok,
                      body: patch,
                    });
                    await loadBootstrap(sessionToken);
                    showToast('Security preferences saved.');
                  });
                }}
                onOpenE2EEUnlock={() => setE2eeModalOpen(true)}
                onRotateE2EEKey={async (newPassphrase) => {
                  if (!e2eeKey) return;
                  const { key: nextKey, fingerprint: nextFp } = await deriveE2EEKey(
                    newPassphrase,
                    user.security.e2eeSalt
                  );
                  const updatedMemos: { transactionId: string; encryptedMemo: EncryptedBlob }[] = [];
                  for (const tx of transactions) {
                    if (tx.encryptedMemo) {
                      const plain = decryptedMemos[tx.id];
                      if (plain) {
                        const reEncrypted = await encryptMemoAES(plain, nextKey, nextFp);
                        updatedMemos.push({ transactionId: tx.id, encryptedMemo: reEncrypted });
                      }
                    }
                  }
                  await apiRequest('/api/security/e2ee/rotate', {
                    method: 'POST',
                    token: sessionToken,
                    body: { newFingerprint: nextFp, updatedMemos },
                  });
                  setE2eeKey(nextKey);
                  setE2eeFingerprint(nextFp);
                  await loadBootstrap(sessionToken);
                  showToast('E2EE encryption key rotated and memos re-encrypted.');
                }}
                onRequestPushPermission={async () => {
                  const res = await requestPushPermission();
                  setPushPermission(res);
                  if (res === 'granted') {
                    triggerBrowserPush(
                      'QUIKUP Alerts Active',
                      'You will receive real-time transaction, fraud, and bill reminders.'
                    );
                  }
                }}
                onTestPushNotification={() => {
                  const sent = triggerBrowserPush(
                    'QUIKUP · Payment Reminder',
                    'Your scheduled payment reminder channel is active and verified.'
                  );
                  showToast(
                    sent
                      ? 'Browser push notification dispatched.'
                      : 'In-app alert sent (enable browser permission for OS notifications).'
                  );
                }}
                onAddReminder={async (payload) => {
                  await apiRequest('/api/reminders', {
                    method: 'POST',
                    token: sessionToken,
                    body: payload,
                  });
                  await loadBootstrap(sessionToken);
                  showToast('Payment reminder scheduled.');
                }}
                onPayReminder={async (reminderId) => {
                  const res = await apiRequest<{ notification?: NotificationItem }>(
                    `/api/reminders/${reminderId}/pay`,
                    { method: 'POST', token: sessionToken }
                  );
                  await loadBootstrap(sessionToken);
                  dispatchNotificationSideEffects(res.notification);
                  showToast('Payment settled.');
                }}
              />
            )}
          </main>
        </div>
      </div>

      {/* Mobile 4-Tab Bottom Navigation matching Reference Mobile UI */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white px-2 py-1.5 lg:hidden dark:border-slate-800 dark:bg-[#0A192F]"
      >
        <button
          type="button"
          onClick={() => {
            setActiveTab('overview');
            setMoreDrawerOpen(false);
          }}
          className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            activeTab === 'overview'
              ? 'text-[#0B2545] font-semibold dark:text-blue-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Home className="h-4 w-4" />
          <span>Home</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('transfers');
            setMoreDrawerOpen(false);
          }}
          className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            activeTab === 'transfers'
              ? 'text-[#0B2545] font-semibold dark:text-blue-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <ArrowLeftRight className="h-4 w-4" />
          <span>Transfer</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('payments');
            setMoreDrawerOpen(false);
          }}
          className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            activeTab === 'payments'
              ? 'text-[#0B2545] font-semibold dark:text-blue-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <CalendarClock className="h-4 w-4" />
          <span>Payments</span>
        </button>

        <button
          type="button"
          onClick={() => setMoreDrawerOpen((v) => !v)}
          className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            moreDrawerOpen
              ? 'text-[#0B2545] font-semibold dark:text-blue-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <LayoutGrid className="h-4 w-4" />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile More Menu Drawer */}
      {moreDrawerOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-slate-950/50 lg:hidden"
          onClick={() => setMoreDrawerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-2xl border-t border-slate-200 bg-white p-5 pb-20 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-sm font-bold text-[#0B2545] dark:text-white">
                Banking Tools
              </span>
              <button
                type="button"
                onClick={() => setMoreDrawerOpen(false)}
                className="p-1 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  { id: 'accounts', label: 'Accounts', icon: Landmark },
                  { id: 'transactions', label: 'Transactions', icon: ListOrdered },
                  { id: 'analytics', label: 'Budgets & Analytics', icon: BarChart3 },
                  { id: 'cards', label: 'Cards', icon: CreditCard },
                  { id: 'security', label: 'Security & Fraud', icon: ShieldCheck },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMoreDrawerOpen(false);
                    }}
                    className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3.5 py-3 text-left text-xs font-semibold text-[#0B2545] dark:border-slate-800 dark:text-slate-100"
                  >
                    <Icon className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              {user.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => {
                    setViewingAdminConsole(true);
                    setMoreDrawerOpen(false);
                  }}
                  className="flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-left text-xs font-semibold text-[#0B2545] dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300"
                >
                  <Activity className="h-4 w-4" />
                  <span>Admin Operations</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-left text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
              >
                <LogOut className="h-4 w-4" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Center Drawer */}
      {notificationsOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h2 className="font-display text-base font-semibold text-[#0B2545] dark:text-white">
                  Alerts & Notifications
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Real-time fraud alerts, transfers, and due reminders
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unreadNotifsCount > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest('/api/notifications/read', {
                        method: 'POST',
                        token: sessionToken,
                        body: {},
                      });
                      await loadBootstrap(sessionToken);
                    }}
                    className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(false)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Close notifications"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-4 flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {notifications.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No notifications yet.
                </p>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className={`py-3.5 ${n.read ? 'opacity-70' : ''}`}>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span
                        className={`font-semibold uppercase ${
                          n.kind === 'fraud'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-blue-700 dark:text-blue-400'
                        }`}
                      >
                        {n.kind}
                      </span>
                      <span>{new Date(n.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[#0B2545] dark:text-white">
                      {n.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                      {n.message}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Biometric Step-Up Modal */}
      {pendingStepUp && (
        <BiometricModal
          isOpen
          actionLabel={pendingStepUp.actionLabel}
          credentials={user.biometrics}
          sessionToken={sessionToken}
          onSuccess={async (freshToken) => {
            const retryFn = pendingStepUp.retry;
            setPendingStepUp(null);
            await retryFn(freshToken);
          }}
          onCancel={() => setPendingStepUp(null)}
        />
      )}

      {/* E2EE Key Unlock Modal */}
      <E2EEVaultModal
        isOpen={e2eeModalOpen}
        saltBase64={user.security.e2eeSalt}
        expectedFingerprint={user.security.e2eeKeyFingerprint}
        onUnlock={async (key, fingerprint) => {
          setE2eeKey(key);
          setE2eeFingerprint(fingerprint);
          setE2eeModalOpen(false);
          if (!user.security.e2eeKeyFingerprint) {
            await apiRequest('/api/security/settings', {
              method: 'PATCH',
              token: sessionToken,
              body: { e2eeKeyFingerprint: fingerprint },
            });
            await loadBootstrap(sessionToken);
          }
          showToast('E2EE AES-256-GCM privacy key unlocked in memory.');
        }}
        onClose={() => setE2eeModalOpen(false)}
      />

      {/* Toast Feedback */}
      {toast && (
        <div
          role="status"
          className={`fixed right-4 bottom-20 z-50 flex max-w-sm items-center gap-3 rounded-xl border px-4 py-3 text-xs font-medium shadow-lg lg:bottom-6 ${
            toast.kind === 'alert'
              ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
              : 'border-slate-200 bg-white text-[#0B2545] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
          }`}
        >
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
            aria-label="Dismiss message"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
