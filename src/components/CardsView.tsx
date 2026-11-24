import { useState } from 'react';
import { CreditCard, Eye, EyeOff, Globe, Lock, Snowflake, Unlock, Wifi } from 'lucide-react';
import { formatMoney } from '../lib/currency.ts';
import type { BankAccount, BankCard } from '../types/banking.ts';
import bankCardVisualImg from '../assets/images/quikup_bank_card_1795541676674.jpg';

interface CardsViewProps {
  cards: BankCard[];
  accounts: BankAccount[];
  onUpdateCard: (
    cardId: string,
    patch: Partial<
      Pick<
        BankCard,
        'frozen' | 'monthlyLimit' | 'contactlessEnabled' | 'onlineEnabled' | 'internationalEnabled'
      >
    >
  ) => Promise<void>;
}

export function CardsView({ cards, accounts, onUpdateCard }: CardsViewProps) {
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [imgErrorIds, setImgErrorIds] = useState<Record<string, boolean>>({});

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          Physical & Virtual Cards
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Manage spending caps, international rails, and instant freeze controls
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {cards.map((card) => {
          const linkedAccount = accounts.find((a) => a.id === card.accountId);
          const revealed = Boolean(revealedIds[card.id]);
          const spendPct = Math.min(
            100,
            Math.round((card.monthlySpent / card.monthlyLimit) * 100)
          );

          return (
            <section
              key={card.id}
              className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
            >
              {/* Card Visual */}
              <div className="relative aspect-[1.62/1] w-full overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 via-teal-950 to-slate-950 p-6 text-white shadow-sm">
                {!imgErrorIds[card.id] && (
                  <img
                    src={bankCardVisualImg}
                    alt={`${card.label} navy contactless card finish`}
                    referrerPolicy="no-referrer"
                    onError={() => setImgErrorIds((prev) => ({ ...prev, [card.id]: true }))}
                    className="absolute inset-0 h-full w-full object-cover opacity-80"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/30" />

                <div className="relative z-10 flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-display text-sm font-semibold tracking-tight text-white">
                        QUIKUP
                      </p>
                      <p className="text-xs text-slate-300">
                        {card.kind === 'physical' ? 'Titanium Metal' : 'Virtual Multi-Currency'} ·{' '}
                        {card.network}
                      </p>
                    </div>
                    <span className="font-mono text-xs font-semibold text-slate-200">
                      {card.frozen ? 'FROZEN' : card.currency}
                    </span>
                  </div>

                  <div>
                    <p className="font-mono text-lg font-medium tracking-widest text-white sm:text-xl">
                      {revealed ? card.fullMaskedPreview : `••••  ••••  ••••  ${card.last4}`}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-200">
                      <span>{card.label}</span>
                      <div className="flex items-center gap-4 font-mono">
                        <span>EXP {card.expiry}</span>
                        <span>CVV {revealed ? card.cvvPreview : '•••'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Controls */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Linked to{' '}
                  <strong className="text-slate-900 dark:text-slate-200">
                    {linkedAccount?.name || card.currency}
                  </strong>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleReveal(card.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    <span>{revealed ? 'Hide PAN' : 'Reveal PAN'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdateCard(card.id, { frozen: !card.frozen })}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      card.frozen
                        ? 'bg-teal-700 text-white hover:bg-teal-800'
                        : 'border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                    }`}
                  >
                    {card.frozen ? (
                      <>
                        <Unlock className="h-3.5 w-3.5" />
                        <span>Unfreeze Card</span>
                      </>
                    ) : (
                      <>
                        <Snowflake className="h-3.5 w-3.5" />
                        <span>Freeze Card</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Monthly Spending Limit */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Monthly Spending Limit
                  </span>
                  <span className="font-mono text-slate-900 tabular-nums dark:text-slate-100">
                    {formatMoney(card.monthlySpent, card.currency)} /{' '}
                    {formatMoney(card.monthlyLimit, card.currency)} ({spendPct}%)
                  </span>
                </div>
                <input
                  type="range"
                  min={500}
                  max={25000}
                  step={500}
                  value={card.monthlyLimit}
                  onChange={(e) =>
                    onUpdateCard(card.id, { monthlyLimit: Number(e.target.value) })
                  }
                  className="mt-2 w-full accent-teal-700"
                  aria-label="Monthly card spending limit"
                />
              </div>

              {/* Channel Toggles */}
              <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateCard(card.id, { contactlessEnabled: !card.contactlessEnabled })
                  }
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium ${
                    card.contactlessEnabled
                      ? 'border-teal-600/40 bg-teal-50/70 text-teal-900 dark:border-teal-700/60 dark:bg-teal-950/40 dark:text-teal-200'
                      : 'border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Wifi className="h-3.5 w-3.5" />
                    <span>Tap to Pay</span>
                  </span>
                  <span>{card.contactlessEnabled ? 'On' : 'Off'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onUpdateCard(card.id, { onlineEnabled: !card.onlineEnabled })}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium ${
                    card.onlineEnabled
                      ? 'border-teal-600/40 bg-teal-50/70 text-teal-900 dark:border-teal-700/60 dark:bg-teal-950/40 dark:text-teal-200'
                      : 'border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" />
                    <span>Online</span>
                  </span>
                  <span>{card.onlineEnabled ? 'On' : 'Off'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateCard(card.id, { internationalEnabled: !card.internationalEnabled })
                  }
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium ${
                    card.internationalEnabled
                      ? 'border-teal-600/40 bg-teal-50/70 text-teal-900 dark:border-teal-700/60 dark:bg-teal-950/40 dark:text-teal-200'
                      : 'border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    <span>Global</span>
                  </span>
                  <span>{card.internationalEnabled ? 'On' : 'Off'}</span>
                </button>
              </div>

              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <Lock className="h-3 w-3" />
                <span>Card freeze & limit changes honor your Biometric Modification Lock.</span>
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
