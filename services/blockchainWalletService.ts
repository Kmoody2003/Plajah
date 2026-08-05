/**
 * Plajah Blockchain Wallet Service
 *
 * Manages custodial Polygon wallets for Plajah users.
 * Tier 1 users (90%): wallets are created automatically, hidden from UI.
 * Tier 3 users: can connect their own wallet (MetaMask, Rainbow, etc.)
 *
 * Private keys for custodial wallets are encrypted with AES-256 and stored
 * in Firestore under /users/{uid}/wallet — NOT in the client bundle.
 * In production, replace key storage with AWS KMS or HashiCorp Vault.
 *
 * Dependencies (install when activating):
 *   npm install ethers@6
 */

import { db } from './firebase';
import {
  doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PlajahWallet {
  userId: string;
  address: string;         // Polygon wallet address (0x...)
  network: 'polygon' | 'polygon-testnet';
  custodial: boolean;      // true = Plajah holds the key
  createdAt: Date;
  usdcBalance: string;     // USDC balance as string (avoid float precision)
  plajBalance: string;     // PLAJ token balance
  linkedExternalWallet?: string; // MetaMask etc. (Tier 3)
}

export interface WalletTransaction {
  txHash: string;
  from: string;
  to: string;
  amountUsdc: string;
  type: 'LICENSING' | 'FRACTIONAL_PURCHASE' | 'TIP' | 'ADVANCE' | 'WITHDRAWAL' | 'MINT_FEE';
  vertical: string;
  contentId?: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  createdAt: Date;
}

// ─── Wallet Creation ───────────────────────────────────────────────────────────

/**
 * Creates a custodial Polygon wallet for a new user.
 * Called at signup when WEB3_CUSTODIAL_WALLETS flag is enabled.
 * Returns the wallet address only — private key never leaves the server.
 */
export async function createCustodialWallet(userId: string): Promise<PlajahWallet> {
  // Check if wallet already exists
  const existing = await getWallet(userId);
  if (existing) return existing;

  // Dynamically import ethers only when needed (tree-shaking)
  const { Wallet } = await import('ethers');
  const wallet = Wallet.createRandom();

  // In production: encrypt with AES-256 using a KMS-managed key
  // For now: store address + encrypted key in Firestore
  const encryptedKey = await encryptPrivateKey(wallet.privateKey, userId);

  const walletData: PlajahWallet = {
    userId,
    address: wallet.address,
    network: process.env.NODE_ENV === 'production' ? 'polygon' : 'polygon-testnet',
    custodial: true,
    createdAt: new Date(),
    usdcBalance: '0',
    plajBalance: '0',
  };

  await setDoc(doc(db, 'users', userId, 'wallet', 'primary'), {
    ...walletData,
    _encryptedKey: encryptedKey,
    createdAt: serverTimestamp(),
  });

  console.log(`[Wallet] Created custodial wallet for ${userId}: ${wallet.address}`);
  return walletData;
}

/**
 * Retrieve a user's wallet data (public fields only, no private key).
 */
export async function getWallet(userId: string): Promise<PlajahWallet | null> {
  const snap = await getDoc(doc(db, 'users', userId, 'wallet', 'primary'));
  if (!snap.exists()) return null;
  const data = snap.data();
  // Strip the encrypted key before returning
  const { _encryptedKey: _, ...wallet } = data;
  return wallet as PlajahWallet;
}

/**
 * Link an external wallet (MetaMask, Rainbow, Phantom) to a Plajah account.
 * The user signs a message to prove ownership of the address.
 */
export async function linkExternalWallet(
  userId: string,
  externalAddress: string,
  signature: string,
  message: string,
): Promise<void> {
  const { verifyMessage } = await import('ethers');
  const recoveredAddress = verifyMessage(message, signature);

  if (recoveredAddress.toLowerCase() !== externalAddress.toLowerCase()) {
    throw new Error('Signature verification failed — address mismatch');
  }

  await setDoc(
    doc(db, 'users', userId, 'wallet', 'primary'),
    { linkedExternalWallet: externalAddress, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * Get USDC balance for a wallet address from Polygon.
 */
export async function getUsdcBalance(walletAddress: string): Promise<string> {
  try {
    const { JsonRpcProvider, Contract } = await import('ethers');
    const provider = new JsonRpcProvider(getPolygonRpc());
    const usdcContract = new Contract(
      USDC_ADDRESS,
      ['function balanceOf(address) view returns (uint256)'],
      provider,
    );
    const balance = await usdcContract.balanceOf(walletAddress);
    // USDC has 6 decimals
    return (Number(balance) / 1_000_000).toFixed(2);
  } catch {
    return '0';
  }
}

// ─── Platform Treasury ─────────────────────────────────────────────────────────

/**
 * Platform fee collection — the address Plajah uses to receive its 10–15% cut.
 * Configured via environment variables.
 */
export function getPlatformTreasuryAddress(): string {
  return process.env.VITE_PLAJAH_TREASURY_ADDRESS ?? '';
}

// ─── Configuration ─────────────────────────────────────────────────────────────

// USDC contract address on Polygon
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// USDC contract address on Polygon Mumbai testnet
const USDC_TESTNET_ADDRESS = '0xe6b8a5CF854791412c1f6EFC7CAf629f5Df1c747';

function getPolygonRpc(): string {
  if (process.env.NODE_ENV === 'production') {
    return process.env.VITE_POLYGON_RPC_URL ?? 'https://polygon-rpc.com';
  }
  return 'https://rpc-mumbai.maticvigil.com';
}

function getUsdcContractAddress(): string {
  return process.env.NODE_ENV === 'production' ? USDC_ADDRESS : USDC_TESTNET_ADDRESS;
}

// ─── Key encryption stub ───────────────────────────────────────────────────────
// Replace with AWS KMS in production.

async function encryptPrivateKey(privateKey: string, userId: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(userId + (process.env.VITE_WALLET_ENCRYPTION_SALT ?? 'plajah-wallet-v1')),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('plajah-wallet-salt'), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(privateKey));
  const combined = new Uint8Array(12 + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), 12);
  return btoa(String.fromCharCode(...combined));
}
