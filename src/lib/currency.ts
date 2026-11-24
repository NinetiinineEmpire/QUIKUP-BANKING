import type { CurrencyCode, FxRateMap } from '../types/banking.ts';

export const SUPPORTED_CURRENCIES: {
  code: CurrencyCode;
  name: string;
  symbol: string;
  locale: string;
}[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', locale: 'en-US' },
  { code: 'EUR', name: 'Euro', symbol: '€', locale: 'de-DE' },
  { code: 'GBP', name: 'British Pound', symbol: '£', locale: 'en-GB' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', locale: 'ja-JP' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', locale: 'en-CA' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF ', locale: 'de-CH' },
];

export const DEFAULT_FX_RATES: FxRateMap = {
  USD: 1,
  EUR: 0.9215,
  GBP: 0.786,
  JPY: 151.4,
  CAD: 1.385,
  CHF: 0.882,
};

export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  options?: { signed?: boolean; compact?: boolean }
): string {
  const decimals = currency === 'JPY' ? 0 : 2;
  const absFormatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: options?.compact ? 0 : decimals,
    maximumFractionDigits: options?.compact ? 1 : decimals,
    notation: options?.compact ? 'compact' : 'standard',
  }).format(Math.abs(amount));

  if (options?.signed) {
    if (amount > 0) return `+${absFormatted}`;
    if (amount < 0) return `-${absFormatted}`;
  } else if (amount < 0) {
    return `-${absFormatted}`;
  }
  return absFormatted;
}

export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: FxRateMap = DEFAULT_FX_RATES
): number {
  if (from === to) return amount;
  const usdAmount = amount / rates[from];
  const converted = usdAmount * rates[to];
  const factor = to === 'JPY' ? 1 : 100;
  return Math.round(converted * factor) / factor;
}

export function getCrossRate(
  from: CurrencyCode,
  to: CurrencyCode,
  rates: FxRateMap = DEFAULT_FX_RATES
): number {
  if (from === to) return 1;
  return rates[to] / rates[from];
}
