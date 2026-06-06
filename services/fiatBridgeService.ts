/**
 * Plajah Fiat Bridge Service
 *
 * Converts USD (and global currencies) to USDC for smart contract execution,
 * and converts USDC earnings back to USD for creator bank withdrawals.
 *
 * Provider hierarchy:
 *   US users:          Stripe (credit card) → Coinbase Commerce (crypto settle)
 *   Global users:      Transak SDK (150+ countries, local payment methods)
 *   Enterprise:        Wire + monthly invoice, Plajah executes on-chain
 *
 * KYC/AML is handled entirely by Transak and Stripe.
 * Plajah never touches raw financial credentials.
 *
 * Earnings under $600/year: no KYC required.
 * Earnings $600–$10,000: basic KYC via on-ramp provider.
 * Earnings over $10,000: enhanced KYC, ID verification.
 *
 * Dependencies (install when activating):
 *   npm install @transak/transak-sdk  (for web/Electron)
 *   npm install stripe                (for server-side card processing)
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SupportedFiatCurrency =
  | 'USD' | 'EUR' | 'GBP' | 'NGN' | 'BRL' | 'INR' | 'MXN' | 'CAD' | 'AUD' | 'JPY';

export interface OnRampQuote {
  fiatCurrency: SupportedFiatCurrency;
  fiatAmount: number;
  usdcAmount: number;         // How much USDC the user receives
  platformFeeUsd: number;     // Plajah's conversion spread (0.5–1.5%)
  providerFeeUsd: number;     // Transak/Stripe fee
  exchangeRate: number;       // 1 USD = X USDC (should be ~1 for stablecoin)
  estimatedTimeMinutes: number;
  provider: 'TRANSAK' | 'STRIPE' | 'ENTERPRISE';
}

export interface OnRampSession {
  sessionId: string;
  userId: string;
  purpose: 'LICENSING' | 'FRACTIONAL_PURCHASE' | 'MINT_FEE' | 'TIP';
  contentId?: string;
  fiatAmountUsd: number;
  usdcTargetAmount: number;
  destinationAddress: string; // User's Plajah wallet or direct contract
  status: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
  transakOrderId?: string;
  txHash?: string;           // Polygon txHash when USDC arrives
  createdAt: Date;
}

export interface OffRampRequest {
  userId: string;
  walletAddress: string;
  usdcAmount: string;         // Amount in USDC to convert
  targetCurrency: SupportedFiatCurrency;
  bankDetails?: {
    accountNumber: string;
    routingNumber?: string;   // US ACH
    iban?: string;            // EU SEPA
    sortCode?: string;        // UK
  };
  mobileMoneyNumber?: string; // M-Pesa, etc.
  estimatedFiatAmount: string;
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED';
}

// ─── On-Ramp: Fiat → USDC ─────────────────────────────────────────────────────

/**
 * Get a quote for converting fiat to USDC.
 * Called before showing the user a payment UI.
 */
export async function getOnRampQuote(params: {
  fiatCurrency: SupportedFiatCurrency;
  fiatAmount: number;
  userId: string;
}): Promise<OnRampQuote> {
  const exchangeRate = await fetchExchangeRate(params.fiatCurrency, 'USD');
  const usdAmount = params.fiatAmount / exchangeRate;

  const providerFeeUsd = usdAmount * 0.015; // Transak charges ~1.5%
  const platformFeeUsd = usdAmount * 0.01;  // Plajah takes 1%
  const usdcAmount = usdAmount - providerFeeUsd - platformFeeUsd;

  return {
    fiatCurrency: params.fiatCurrency,
    fiatAmount: params.fiatAmount,
    usdcAmount: Math.floor(usdcAmount * 1_000_000) / 1_000_000, // 6 decimal precision
    platformFeeUsd: parseFloat(platformFeeUsd.toFixed(4)),
    providerFeeUsd: parseFloat(providerFeeUsd.toFixed(4)),
    exchangeRate,
    estimatedTimeMinutes: 2,
    provider: getProviderForCurrency(params.fiatCurrency),
  };
}

/**
 * Create a Transak on-ramp session.
 * Returns a URL that opens the Transak payment widget.
 * When payment completes, Transak sends USDC directly to destinationAddress.
 */
export async function createTransakSession(params: {
  userId: string;
  fiatCurrency: SupportedFiatCurrency;
  fiatAmount: number;
  destinationAddress: string;
  purpose: OnRampSession['purpose'];
  contentId?: string;
}): Promise<{ sessionUrl: string; sessionId: string }> {
  const sessionId = `plajah_${params.userId}_${Date.now()}`;

  // Transak URL parameters
  const transakParams = new URLSearchParams({
    apiKey: process.env.VITE_TRANSAK_API_KEY ?? '',
    environment: process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'STAGING',
    defaultCryptoCurrency: 'USDC',
    network: 'polygon',
    walletAddress: params.destinationAddress,
    fiatCurrency: params.fiatCurrency,
    fiatAmount: params.fiatAmount.toString(),
    disableWalletAddressForm: 'true',
    partnerOrderId: sessionId,
    partnerCustomerId: params.userId,
    redirectURL: `${process.env.VITE_APP_URL ?? ''}/payment/complete?session=${sessionId}`,
  });

  const sessionUrl = `https://global.transak.com/?${transakParams.toString()}`;

  // Store session in Firestore for webhook reconciliation
  const { db } = await import('./firebase');
  const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  await setDoc(doc(db, 'fiatSessions', sessionId), {
    sessionId,
    userId: params.userId,
    purpose: params.purpose,
    contentId: params.contentId ?? null,
    fiatAmount: params.fiatAmount,
    fiatCurrency: params.fiatCurrency,
    destinationAddress: params.destinationAddress,
    status: 'PENDING',
    createdAt: serverTimestamp(),
  });

  return { sessionUrl, sessionId };
}

/**
 * Webhook handler for Transak payment events.
 * Called by your Express server at POST /api/webhooks/transak
 */
export async function handleTransakWebhook(payload: {
  partnerOrderId: string;
  status: 'AWAITING_PAYMENT_FROM_USER' | 'PAYMENT_DONE_MARKED_BY_USER' | 'COMPLETED' | 'FAILED';
  cryptoAmount: number;
  transactionHash?: string;
}): Promise<void> {
  const { db } = await import('./firebase');
  const { doc, updateDoc, getDoc } = await import('firebase/firestore');

  const sessionRef = doc(db, 'fiatSessions', payload.partnerOrderId);
  const session = (await getDoc(sessionRef)).data() as OnRampSession | undefined;
  if (!session) return;

  if (payload.status === 'COMPLETED' && payload.transactionHash) {
    await updateDoc(sessionRef, {
      status: 'COMPLETE',
      txHash: payload.transactionHash,
      usdcReceived: payload.cryptoAmount,
    });

    // Trigger the intended blockchain action now that funds have arrived
    await dispatchPostFundingAction(session, payload.cryptoAmount);
  } else if (payload.status === 'FAILED') {
    await updateDoc(sessionRef, { status: 'FAILED' });
  }
}

// ─── Off-Ramp: USDC → Fiat ────────────────────────────────────────────────────

/**
 * Request a USDC → fiat withdrawal for a creator.
 * Minimum withdrawal: $5.00 (to cover transfer fees).
 */
export async function requestWithdrawal(params: {
  userId: string;
  walletAddress: string;
  usdcAmount: string;
  targetCurrency: SupportedFiatCurrency;
}): Promise<OffRampRequest> {
  const usdcFloat = parseFloat(params.usdcAmount);
  if (usdcFloat < 5) throw new Error('Minimum withdrawal is $5.00');

  // Exchange rate for target currency
  const rate = await fetchExchangeRate('USD', params.targetCurrency);
  const providerFee = usdcFloat * 0.015;
  const platformFee = usdcFloat * 0.005;
  const estimatedFiat = ((usdcFloat - providerFee - platformFee) * rate).toFixed(2);

  const request: OffRampRequest = {
    userId: params.userId,
    walletAddress: params.walletAddress,
    usdcAmount: params.usdcAmount,
    targetCurrency: params.targetCurrency,
    estimatedFiatAmount: estimatedFiat,
    status: 'PENDING',
  };

  // Queue withdrawal in Firestore — processed by backend worker
  const { db } = await import('./firebase');
  const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
  await addDoc(collection(db, 'withdrawalRequests'), {
    ...request,
    createdAt: serverTimestamp(),
  });

  return request;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

async function fetchExchangeRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;
  try {
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`);
    const data = await res.json();
    return data.rates[to] ?? 1;
  } catch {
    return 1; // Fallback: assume 1:1 (only accurate for USD→USDC)
  }
}

function getProviderForCurrency(currency: SupportedFiatCurrency): 'TRANSAK' | 'STRIPE' {
  // Stripe handles US cards natively; Transak covers global + local payment methods
  return currency === 'USD' ? 'STRIPE' : 'TRANSAK';
}

async function dispatchPostFundingAction(session: OnRampSession, usdcAmount: number): Promise<void> {
  // After USDC arrives, trigger the originally intended action
  // The blockchainContractService handles the actual contract call
  console.log(`[FiatBridge] Funds arrived for session ${session.sessionId}. Dispatching ${session.purpose}...`);
  // Implementation: import contractService and call the appropriate function
  // based on session.purpose and session.contentId
}
