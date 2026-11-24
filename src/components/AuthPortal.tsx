import { useState, type FormEvent } from 'react';
import { signInWithPopup } from 'firebase/auth';
import {
  ArrowRight,
  ChevronDown,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  Globe,
  Headphones,
  Landmark,
  Lock,
  Moon,
  PieChart,
  Search,
  ShieldCheck,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import {
  convertCurrency,
  DEFAULT_FX_RATES,
  formatMoney,
  getCrossRate,
  SUPPORTED_CURRENCIES,
} from '../lib/currency.ts';
import type { CurrencyCode, UserProfile } from '../types/banking.ts';
import bankHeroLobbyImg from '../assets/images/bank_hero_lobby_1795541674934.jpg';
import fxFinanceDeskImg from '../assets/images/fx_finance_desk_clean_1795541694673.jpg';
import bankCardTerminalImg from '../assets/images/quikup_bank_card_1795541676674.jpg';
import wealthAdvisorImg from '../assets/images/wealth_advisor_clean_1795541694749.jpg';
import contactlessMobileImg from '../assets/images/contactless_mobile_pay_1795541716670.jpg';

interface AuthPortalProps {
  darkMode: boolean;
  onToggleDark: () => void;
  onAuthenticated: (
    token: string,
    preferredCurrency?: CurrencyCode,
    provider?: 'firebase' | 'password'
  ) => Promise<void> | void;
  onAdminAuthenticated: (adminToken: string) => void;
}

const ACCOUNT_TIERS = [
  {
    name: 'QUIKUP Essential Checking',
    audience: 'For everyday domestic & digital spending',
    apy: '0.50% APY',
    monthlyFee: '$0',
    minimumBalance: '$0',
    fxAllowance: 'Up to $5,000/mo at mid-market rate',
    protection: 'FDIC partner sweep up to $250,000',
  },
  {
    name: 'High-Yield Reserve Vault',
    audience: 'For liquid cash & emergency reserves',
    apy: '4.65% APY',
    monthlyFee: '$0',
    minimumBalance: '$500',
    fxAllowance: 'Unlimited internal USD sweeps',
    protection: 'FDIC partner sweep up to $2,500,000',
  },
  {
    name: 'Global Multi-Currency Account',
    audience: 'For cross-border earners & travelers',
    apy: '2.10% APY (USD)',
    monthlyFee: '$0',
    minimumBalance: '$0',
    fxAllowance: '6 currencies (USD, EUR, GBP, JPY, CAD, CHF)',
    protection: 'Segregated safeguarding + real-time fraud lock',
  },
  {
    name: 'QUIKUP Private Treasury',
    audience: 'For executives & multi-entity portfolios',
    apy: '4.85% APY',
    monthlyFee: '$0 with $50k balance',
    minimumBalance: '$50,000',
    fxAllowance: 'Unlimited zero-markup global wires',
    protection: 'Dedicated desk + hardware passkey enforcement',
  },
];

const BANKING_FAQS = [
  {
    q: 'How are deposits protected at QUIKUP?',
    a: 'Eligible USD checking and High-Yield Reserve balances are swept across a network of regulated partner depository institutions, providing up to $2.5M in FDIC pass-through insurance coverage alongside continuous real-time ledger auditing.',
  },
  {
    q: 'Which currencies can I hold, convert, and wire?',
    a: 'You can hold dedicated local accounts in USD, EUR (IBAN), GBP (Sort Code & Account), JPY, CAD, and CHF. Internal conversions between your accounts settle instantaneously using transparent mid-market reference rates.',
  },
  {
    q: 'How does biometric authentication protect my account?',
    a: 'Once enrolled in Security & Alerts, WebAuthn platform biometrics (Touch ID, Face ID, Windows Hello) or hardware-bound ECDSA P-256 passkeys verify logins and act as a step-up gate before freezing accounts, changing card limits, or dispatching high-value transfers.',
  },
  {
    q: 'What does End-to-End Encryption (E2EE) cover?',
    a: 'Private transfer memos and beneficiary notes are encrypted directly inside your browser using PBKDF2-SHA256 (100,000 iterations) and AES-256-GCM before reaching QUIKUP servers.',
  },
];

export function QuikupLogo({
  onDark = false,
  size = 'md',
}: {
  onDark?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const heightClass = size === 'sm' ? 'h-7' : size === 'lg' ? 'h-10' : 'h-8';
  return (
    <span
      className={`inline-flex items-center shrink-0 ${
        onDark ? '' : 'rounded-lg bg-[#0B2545] px-2.5 py-1 shadow-xs'
      }`}
    >
      <img
        src="/assets/aistudio/quikup_logo_600x225_transparent-1_6cbe6e3e.png"
        alt="QUIKUP — A Banking you can Trust"
        className={`${heightClass} w-auto object-contain select-none`}
      />
    </span>
  );
}

export function AuthPortal({
  darkMode,
  onToggleDark,
  onAuthenticated,
  onAdminAuthenticated,
}: AuthPortalProps) {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [preferredCurrency, setPreferredCurrency] = useState<CurrencyCode>('USD');
  const [includeSamplePortfolio, setIncludeSamplePortfolio] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeNav, setActiveNav] = useState('Personal');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratesTab, setRatesTab] = useState<'accounts' | 'fx'>('accounts');
  const [fxAmount, setFxAmount] = useState('2500');
  const [fxFrom, setFxFrom] = useState<CurrencyCode>('USD');
  const [fxTo, setFxTo] = useState<CurrencyCode>('EUR');
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  const openAuth = (targetMode: 'login' | 'register', currency?: CurrencyCode) => {
    setMode(targetMode);
    setError(null);
    if (currency) setPreferredCurrency(currency);
    setAuthModalOpen(true);
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();

    if (mode === 'register') {
      if (trimmedName.length < 2) {
        setError('Please enter your full name (at least 2 characters).');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        setError('Please enter a valid email address.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
    } else if (!trimmedEmail || !password) {
      setError('Please enter both your email and password.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'register') {
        const res = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/register', {
          method: 'POST',
          body: {
            fullName: trimmedName,
            email: trimmedEmail,
            password,
            preferredCurrency,
            includeSamplePortfolio,
          },
        });
        await onAuthenticated(res.token, undefined, 'password');
      } else {
        const res = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/login', {
          method: 'POST',
          body: {
            email: trimmedEmail,
            password,
          },
        });
        if (res.user.role === 'admin') {
          onAdminAuthenticated(res.token);
          return;
        }
        await onAuthenticated(res.token, undefined, 'password');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const credential = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await credential.user.getIdToken();
      await onAuthenticated(
        idToken,
        mode === 'register' ? preferredCurrency : undefined,
        'firebase'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed.';
      if (message.includes('popup-closed-by-user')) {
        setError('Sign-in popup was closed before completing authentication.');
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const numericFxAmount = Math.max(0, Number(fxAmount) || 0);
  const convertedFxResult = convertCurrency(numericFxAmount, fxFrom, fxTo, DEFAULT_FX_RATES);
  const fxCross = getCrossRate(fxFrom, fxTo, DEFAULT_FX_RATES);

  const navItems = [
    { label: 'Personal', href: '#personal-banking' },
    { label: 'Business', href: '#business-banking' },
    { label: 'Loans', href: '#loans-investments' },
    { label: 'Investments', href: '#rates-and-fx' },
    { label: 'About Us', href: '#security-trust' },
    { label: 'Help', href: '#banking-faq' },
  ];

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-[#0B2545] dark:bg-[#071224] dark:text-slate-100">
      {/* Clean Institutional Header matching Reference Layout */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-xs dark:border-slate-800 dark:bg-[#071224]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <a
            href="#top"
            className="flex items-center shrink-0"
            aria-label="QUIKUP Home"
          >
            <QuikupLogo size="md" />
          </a>

          <nav
            aria-label="Primary Navigation"
            className="hidden items-center gap-7 text-sm font-medium lg:flex"
          >
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setActiveNav(item.label)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors ${
                  activeNav === item.label
                    ? 'font-semibold text-[#0B2545] dark:text-white'
                    : 'text-slate-600 hover:text-[#0B2545] dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {item.label}
                {activeNav === item.label && (
                  <span className="absolute inset-x-0 -bottom-1 h-0.5 bg-[#0B2545] dark:bg-blue-400" />
                )}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen((s) => !s)}
              className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 sm:inline-flex dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Search banking products"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onToggleDark}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => openAuth('login')}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#0B2545] hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => openAuth('register')}
              className="rounded-lg bg-[#0B2545] px-4 py-2 text-xs font-semibold text-white hover:bg-[#133866] whitespace-nowrap shrink-0 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Open Account
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="border-t border-slate-100 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="mx-auto flex max-w-3xl items-center gap-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search savings APY, multi-currency IBANs, FX rates, or biometric security..."
                className="flex-1 bg-transparent text-sm text-slate-900 focus:outline-none dark:text-white"
              />
              {searchQuery && (
                <a
                  href="#rates-and-fx"
                  onClick={() => setSearchOpen(false)}
                  className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  Jump to Rates
                </a>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Hero Section Replicating Reference Composition */}
      <section
        id="top"
        className="relative overflow-hidden bg-gradient-to-b from-white to-[#F4F7FB] pt-10 pb-14 dark:from-[#0A192F] dark:to-[#071224]"
      >
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-6 lg:grid-cols-12">
          {/* Left Hero Copy & 3-Feature Strip */}
          <div className="lg:col-span-6">
            <p className="text-xs font-semibold tracking-wide text-blue-700 dark:text-blue-400">
              Digital Banking, Smarter
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold leading-[1.08] tracking-tight text-[#0B2545] [text-wrap:balance] sm:text-5xl lg:text-[54px] dark:text-white">
              Banking That Works For You
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600 dark:text-slate-300">
              Secure. Simple. Smart. Experience the future of multi-currency banking with QUIKUP.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                onClick={() => openAuth('register')}
                className="rounded-lg bg-[#0B2545] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#133866] whitespace-nowrap dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                Open Account
              </button>
              <a
                href="#personal-banking"
                className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-[#0B2545] hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                Explore Solutions
              </a>
            </div>

            {/* 3-Column Feature Row matching the Reference Hero Bottom */}
            <div className="mt-12 grid grid-cols-1 gap-6 border-t border-slate-200/80 pt-8 sm:grid-cols-3 dark:border-slate-800">
              <div className="space-y-1.5">
                <ShieldCheck className="h-6 w-6 text-[#0B2545] dark:text-blue-400" strokeWidth={1.75} />
                <h2 className="font-display text-sm font-semibold text-[#0B2545] dark:text-white">
                  Bank Securely
                </h2>
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Biometric passkeys and real-time fraud protection
                </p>
              </div>

              <div className="space-y-1.5">
                <Zap className="h-6 w-6 text-[#0B2545] dark:text-blue-400" strokeWidth={1.75} />
                <h2 className="font-display text-sm font-semibold text-[#0B2545] dark:text-white">
                  Transact Instantly
                </h2>
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Fast multi-currency transfers and live FX settlement
                </p>
              </div>

              <div className="space-y-1.5">
                <PieChart className="h-6 w-6 text-[#0B2545] dark:text-blue-400" strokeWidth={1.75} />
                <h2 className="font-display text-sm font-semibold text-[#0B2545] dark:text-white">
                  Track Effortlessly
                </h2>
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Smart monthly budgets and spending insights
                </p>
              </div>
            </div>
          </div>

          {/* Right Hero Visual: Architectural Bank Building + Floating Balance Card */}
          <div className="relative lg:col-span-6">
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-slate-900 shadow-lg dark:border-slate-800">
              <div className="aspect-[4/3] w-full">
                {!imgErrors.hero ? (
                  <img
                    src={bankHeroLobbyImg}
                    alt="Modern QUIKUP private banking lobby and financial advisory center"
                    referrerPolicy="no-referrer"
                    onError={() => setImgErrors((p) => ({ ...p, hero: true }))}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-[#0B2545] text-white/60">
                    <Landmark className="h-16 w-16" />
                  </div>
                )}
              </div>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#0B2545]/45 via-transparent to-transparent" />
            </div>

            {/* Overlapping Welcome to QUIKUP Card */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:absolute sm:right-6 sm:-bottom-6 sm:mt-0 sm:w-72 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Welcome to</p>
                  <p className="font-display text-base font-bold text-[#0B2545] dark:text-white">
                    QUIKUP
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-400">
                  <Landmark className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs text-slate-500 dark:text-slate-400">Total Balance</p>
                <p className="mt-0.5 font-display text-2xl font-bold text-[#0B2545] tabular-nums dark:text-white">
                  $24,780.50
                </p>
              </div>

              <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">Available Balance</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                  $18,430.20
                </p>
              </div>

              <button
                type="button"
                onClick={() => openAuth('login')}
                className="mt-5 w-full rounded-lg bg-[#0B2545] py-2.5 text-xs font-semibold text-white hover:bg-[#133866] dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                View Dashboard
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Personal & Multi-Currency Banking Showcase */}
      <section
        id="personal-banking"
        className="mx-auto max-w-7xl px-6 py-16"
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
              Personal & Global Banking
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0B2545] [text-wrap:balance] dark:text-white">
              Complete banking services designed for everyday life and international mobility
            </h2>
          </div>
          <button
            type="button"
            onClick={() => openAuth('register')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap dark:text-blue-400"
          >
            <span>Compare all accounts</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <article
            id="business-banking"
            className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs lg:col-span-7 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="aspect-[16/9] w-full overflow-hidden bg-slate-200 dark:bg-slate-800">
              {!imgErrors.trade ? (
                <img
                  src={fxFinanceDeskImg}
                  alt="International banking trading desk displaying live foreign exchange currency charts"
                  referrerPolicy="no-referrer"
                  onError={() => setImgErrors((p) => ({ ...p, trade: true }))}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-[#0B2545] text-white/50">
                  <Globe className="h-12 w-12" />
                </div>
              )}
            </div>
            <div className="p-6 sm:p-8">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                01. Multi-Currency Checking & Global Wires · USD, EUR, GBP, JPY, CAD, CHF
              </p>
              <h3 className="mt-2 font-display text-xl font-bold text-[#0B2545] dark:text-white">
                Send, receive, and hold six currencies from one unified ledger
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Open local IBAN and domestic checking accounts in seconds. Convert balances
                between currencies at transparent mid-market rates and protect private wire notes
                with client-side AES-256-GCM encryption.
              </p>
              <button
                type="button"
                onClick={() => openAuth('register', 'EUR')}
                className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B2545] hover:underline dark:text-blue-400"
              >
                <span>Open Multi-Currency Account</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </article>

          <article className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="aspect-[4/3] w-full overflow-hidden bg-slate-900">
              {!imgErrors.card ? (
                <img
                  src={bankCardTerminalImg}
                  alt="Contactless navy EMV chip bank card beside a payment terminal"
                  referrerPolicy="no-referrer"
                  onError={() => setImgErrors((p) => ({ ...p, card: true }))}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-slate-900 text-white/50">
                  <CreditCard className="h-12 w-12" />
                </div>
              )}
            </div>
            <div className="p-6 sm:p-8">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                02. Titanium Metal & Virtual Cards · Instant Freeze & Caps
              </p>
              <h3 className="mt-2 font-display text-xl font-bold text-[#0B2545] dark:text-white">
                Smart card controls built for global travel
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Set per-card monthly limits, toggle international or online spending, and freeze or
                unfreeze any card immediately behind biometric verification.
              </p>
              <button
                type="button"
                onClick={() => openAuth('register', 'USD')}
                className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B2545] hover:underline dark:text-blue-400"
              >
                <span>Get Your QUIKUP Card</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </article>

          <article
            id="loans-investments"
            className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs lg:col-span-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="aspect-[4/3] w-full overflow-hidden bg-slate-200 dark:bg-slate-800">
              {!imgErrors.advisory && (
                <img
                  src={wealthAdvisorImg}
                  alt="Financial wealth advisor and client reviewing investment growth charts"
                  referrerPolicy="no-referrer"
                  onError={() => setImgErrors((p) => ({ ...p, advisory: true }))}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="p-6 sm:p-8">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                03. High-Yield Reserves, Loans & Wealth Planning · 4.65% APY
              </p>
              <h3 className="mt-2 font-display text-xl font-bold text-[#0B2545] dark:text-white">
                Automated savings goals & monthly budget analytics
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Monitor 6-month cash flow, track category budgets against real-time spending, and
                earn up to 4.85% APY on Treasury Reserves with FDIC sweep coverage up to $2.5M.
              </p>
            </div>
          </article>

          <article className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
            <div className="aspect-[16/9] w-full overflow-hidden bg-slate-200 dark:bg-slate-800">
              {!imgErrors.mobile ? (
                <img
                  src={contactlessMobileImg}
                  alt="Customer completing secure contactless mobile banking payment at a terminal"
                  referrerPolicy="no-referrer"
                  onError={() => setImgErrors((p) => ({ ...p, mobile: true }))}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="p-6 sm:p-8">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                04. Real-Time Fraud Defense & Push Reminders · Web + Mobile
              </p>
              <h3 className="mt-2 font-display text-xl font-bold text-[#0B2545] dark:text-white">
                Instant alerts when unusual activity or upcoming bills occur
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Every outbound payment is scored in real time for geolocation and velocity
                anomalies, while scheduled bill reminders keep recurring utilities and leases on
                time across desktop and mobile.
              </p>
            </div>
          </article>
        </div>
      </section>

      {/* Interactive Rates & FX Desk */}
      <section
        id="rates-and-fx"
        className="border-y border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900/60"
      >
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                Rates, Yields & Currency Desk
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0B2545] dark:text-white">
                Transparent account tiers and live exchange rates
              </h2>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => setRatesTab('accounts')}
                className={`rounded-md px-4 py-2 text-xs font-semibold whitespace-nowrap ${
                  ratesTab === 'accounts'
                    ? 'bg-white text-[#0B2545] shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 hover:text-[#0B2545] dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Account Tiers & APY
              </button>
              <button
                type="button"
                onClick={() => setRatesTab('fx')}
                className={`rounded-md px-4 py-2 text-xs font-semibold whitespace-nowrap ${
                  ratesTab === 'fx'
                    ? 'bg-white text-[#0B2545] shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 hover:text-[#0B2545] dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                FX Rate Calculator
              </button>
            </div>
          </div>

          {ratesTab === 'accounts' ? (
            <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-6 py-4">Account Tier</th>
                    <th className="px-6 py-4">Annual Yield</th>
                    <th className="px-6 py-4">Monthly Fee</th>
                    <th className="px-6 py-4">Minimum Opening</th>
                    <th className="px-6 py-4">Coverage & FX</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ACCOUNT_TIERS.map((tier) => (
                    <tr key={tier.name} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-[#0B2545] dark:text-white">{tier.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{tier.audience}</p>
                      </td>
                      <td className="px-6 py-4 font-mono font-semibold text-blue-700 tabular-nums whitespace-nowrap dark:text-blue-400">
                        {tier.apy}
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-700 tabular-nums whitespace-nowrap dark:text-slate-300">
                        {tier.monthlyFee}
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-700 tabular-nums whitespace-nowrap dark:text-slate-300">
                        {tier.minimumBalance}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-300">
                        <p>{tier.fxAllowance}</p>
                        <p className="mt-0.5 text-slate-400">{tier.protection}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openAuth('register')}
                          className="rounded-lg bg-[#0B2545] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#133866] whitespace-nowrap dark:bg-blue-600 dark:hover:bg-blue-500"
                        >
                          Open Account
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-6 rounded-xl border border-slate-200 bg-white p-6 lg:grid-cols-12 dark:border-slate-800 dark:bg-slate-900">
              <div className="space-y-4 lg:col-span-6">
                <h3 className="font-display text-lg font-semibold text-[#0B2545] dark:text-white">
                  Instant Multi-Currency Preview
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Amount
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={fxAmount}
                      onChange={(e) => setFxAmount(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm font-semibold text-[#0B2545] tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      From
                    </label>
                    <select
                      value={fxFrom}
                      onChange={(e) => setFxFrom(e.target.value as CurrencyCode)}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#0B2545] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    >
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      To
                    </label>
                    <select
                      value={fxTo}
                      onChange={(e) => setFxTo(e.target.value as CurrencyCode)}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#0B2545] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    >
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-[#F4F7FB] p-4 dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    1 {fxFrom} = {fxCross.toFixed(4)} {fxTo} · Instant Internal Settlement
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold text-[#0B2545] tabular-nums dark:text-white">
                    {formatMoney(numericFxAmount, fxFrom)} = {formatMoney(convertedFxResult, fxTo)}
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 lg:col-span-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6 dark:border-slate-800">
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Reference Exchange Matrix (Base 1.00 USD)
                </h4>
                <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {SUPPORTED_CURRENCIES.filter((c) => c.code !== 'USD').map((c) => (
                    <div key={c.code} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong className="font-mono">{c.code}</strong> · {c.name}
                      </span>
                      <span className="font-mono font-semibold text-[#0B2545] tabular-nums dark:text-white">
                        {DEFAULT_FX_RATES[c.code].toFixed(c.code === 'JPY' ? 2 : 4)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Trust & Security Strip matching Reference "SECURE. MODERN. USER FRIENDLY." */}
      <section id="security-trust" className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 items-center gap-8 rounded-2xl border border-slate-200 bg-white p-8 lg:grid-cols-12 dark:border-slate-800 dark:bg-slate-900">
          <div className="lg:col-span-5">
            <p className="font-display text-3xl font-bold tracking-tight text-[#0B2545] dark:text-white">
              Secure. Modern.
            </p>
            <p className="font-display text-3xl font-bold tracking-tight text-blue-700 dark:text-blue-400">
              Built For Privacy.
            </p>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              End-to-end encrypted transfer memos, WebAuthn biometrics, and real-time anomaly
              detection work silently behind every transaction.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 lg:col-span-7">
            <div className="space-y-2 border-slate-100 sm:border-r sm:pr-4 dark:border-slate-800">
              <ShieldCheck className="h-6 w-6 text-[#0B2545] dark:text-blue-400" strokeWidth={1.75} />
              <h3 className="font-display text-sm font-semibold text-[#0B2545] dark:text-white">
                Security You Can Trust
              </h3>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Federated OAuth sign-in, hardware passkeys, and AES-256-GCM privacy keys.
              </p>
            </div>
            <div className="space-y-2 border-slate-100 sm:border-r sm:pr-4 dark:border-slate-800">
              <Clock className="h-6 w-6 text-[#0B2545] dark:text-blue-400" strokeWidth={1.75} />
              <h3 className="font-display text-sm font-semibold text-[#0B2545] dark:text-white">
                Bank Anytime Anywhere
              </h3>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Responsive desktop dashboard and mobile touch experience with Dark Mode.
              </p>
            </div>
            <div className="space-y-2">
              <Headphones className="h-6 w-6 text-[#0B2545] dark:text-blue-400" strokeWidth={1.75} />
              <h3 className="font-display text-sm font-semibold text-[#0B2545] dark:text-white">
                24/7 Fraud & Support Desk
              </h3>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Instant card freeze, one-click dispute filing, and push notifications.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Banking FAQ */}
      <section
        id="banking-faq"
        className="border-t border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900/60"
      >
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B2545] sm:text-3xl dark:text-white">
            Frequently Asked Banking Questions
          </h2>
          <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {BANKING_FAQS.map((item, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div key={item.q} className="py-4">
                  <button
                    type="button"
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between gap-4 text-left text-sm font-semibold text-[#0B2545] dark:text-white"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {item.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Institutional Footer */}
      <footer className="border-t border-slate-200 bg-[#0B2545] py-12 text-xs text-slate-300 dark:border-slate-800 dark:bg-[#050D1A]">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <QuikupLogo onDark size="md" />
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span className="font-mono text-slate-400">SWIFT/BIC: QKUPUS33XXX</span>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <a href="#personal-banking" className="hover:text-white">
                Personal
              </a>
              <a href="#business-banking" className="hover:text-white">
                Business
              </a>
              <a href="#rates-and-fx" className="hover:text-white">
                Rates & FX
              </a>
              <a href="#security-trust" className="hover:text-white">
                Security
              </a>
              <a href="#banking-faq" className="hover:text-white">
                Disclosures
              </a>
            </div>
          </div>

          <p className="mt-6 leading-relaxed text-slate-400">
            QUIKUP N.A. · Member FDIC · Equal Housing Lender. Multi-currency foreign exchange
            rates are indicative reference rates. End-to-end encrypted transfer memos are encrypted
            client-side via AES-256-GCM.
          </p>
          <p className="mt-3 text-slate-500">
            © {new Date().getFullYear()} QUIKUP N.A. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Sign In / Open Account Modal */}
      {authModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
        >
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <QuikupLogo size="sm" />
                <div>
                  <h2
                    id="auth-modal-title"
                    className="font-display text-base font-bold text-[#0B2545] dark:text-white"
                  >
                    QUIKUP Online
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Encrypted multi-currency banking portal
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                aria-label="Close portal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === 'register'
                    ? 'bg-white text-[#0B2545] shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 hover:text-[#0B2545] dark:text-slate-400'
                }`}
              >
                Open Account
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === 'login'
                    ? 'bg-white text-[#0B2545] shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 hover:text-[#0B2545] dark:text-slate-400'
                }`}
              >
                Log In
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-3.5">
                  {mode === 'register' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        minLength={2}
                        maxLength={80}
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Jordan Taylor"
                        className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      maxLength={120}
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Password
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={mode === 'register' ? 8 : 1}
                        maxLength={128}
                        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={
                          mode === 'register' ? 'At least 8 characters' : 'Enter your password'
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pr-10 pl-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-2 flex items-center px-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {mode === 'register' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                          Primary Reporting Currency
                        </label>
                        <select
                          value={preferredCurrency}
                          onChange={(e) => setPreferredCurrency(e.target.value as CurrencyCode)}
                          className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        >
                          {SUPPORTED_CURRENCIES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code} — {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={includeSamplePortfolio}
                          onChange={(e) => setIncludeSamplePortfolio(e.target.checked)}
                          className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-[#0B2545] focus:ring-blue-600"
                        />
                        <span>
                          <strong className="block text-[#0B2545] dark:text-white">
                            Pre-load multi-currency portfolio & analytics
                          </strong>
                          Start with USD, EUR, GBP, and JPY accounts, cards, and budgets (or uncheck
                          for a fresh single-currency checking account).
                        </span>
                      </label>
                    </>
                  )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B2545] px-4 py-3 text-sm font-semibold text-white hover:bg-[#133866] disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <span>
                  {submitting
                    ? mode === 'register'
                      ? 'Creating Account...'
                      : 'Authenticating...'
                    : mode === 'register'
                      ? 'Create Account'
                      : 'Log In to QUIKUP'}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <div className="my-4 flex items-center gap-3 text-[11px] font-medium text-slate-400">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              <span>or</span>
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-[#0B2545] hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.2 14.7 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z"
                />
              </svg>
              <span>{mode === 'register' ? 'Continue with Google' : 'Sign In with Google'}</span>
            </button>

            <div className="mt-5 flex items-center justify-center gap-2 border-t border-slate-100 pt-4 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <Lock className="h-3 w-3" />
              <span>Scrypt Hashing · Signed Sessions · AES-256-GCM Privacy Vault</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
