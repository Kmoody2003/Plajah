/**
 * Plajah Smart Contract Service
 *
 * Interaction layer for all deployed Polygon smart contracts.
 * Handles: NFT minting, licensing execution, fractional share sales,
 * royalty distribution triggers, and collaborative contract deployment.
 *
 * All user-facing amounts are in USD (string). This service converts to/from
 * USDC (6 decimals) internally. Users never see USDC or wei.
 *
 * Contract addresses are set per environment via .env:
 *   VITE_CONTRACT_MUSIC_NFT
 *   VITE_CONTRACT_CONTENT_NFT
 *   VITE_CONTRACT_FRACTIONAL_SHARES
 *   VITE_CONTRACT_LICENSE_REGISTRY
 *   VITE_CONTRACT_ROYALTY_DISTRIBUTOR
 *   VITE_CONTRACT_COLLAB_OWNERSHIP
 *   VITE_CONTRACT_PLAJ_TOKEN
 *
 * Dependencies (install when activating):
 *   npm install ethers@6
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ContentVertical = 'MUSIC' | 'FILM' | 'TV' | 'BOOKS' | 'LOREA' | 'JOURNALISM' | 'IPWORLDS' | 'TALEO';

export type LicenseType =
  | 'SYNC_30_DAY'
  | 'SYNC_90_DAY'
  | 'SYNC_PERPETUAL'
  | 'BROADCAST_1_YEAR'
  | 'STREAMING_PLATFORM'
  | 'TRANSLATION'
  | 'ADAPTATION'
  | 'AUDIOBOOK'
  | 'MERCHANDISE'
  | 'GAME_LICENSE'
  | 'EDUCATIONAL';

export interface MintResult {
  tokenId: string;
  txHash: string;
  contractAddress: string;
  ipfsCid?: string;
  explorerUrl: string;
}

export interface LicenseResult {
  licenseId: string;
  txHash: string;
  licensee: string;
  licensor: string;
  contentId: string;
  licenseType: LicenseType;
  amountUsd: string;
  platformCutUsd: string;
  creatorCutUsd: string;
  expiresAt: Date | null;
  explorerUrl: string;
}

export interface FractionalShareSale {
  contentId: string;
  tokenId: string;
  totalShares: number;
  pricePerShareUsd: string;
  creatorRetainedPercent: number;
  txHash: string;
  explorerUrl: string;
}

export interface CollabContract {
  contractAddress: string;
  participants: { userId: string; address: string; sharePercent: number }[];
  contentId: string;
  txHash: string;
  explorerUrl: string;
}

// ─── Contract Addresses (from env) ────────────────────────────────────────────

const CONTRACTS = {
  MUSIC_NFT:          () => process.env.VITE_CONTRACT_MUSIC_NFT ?? '',
  CONTENT_NFT:        () => process.env.VITE_CONTRACT_CONTENT_NFT ?? '',
  FRACTIONAL_SHARES:  () => process.env.VITE_CONTRACT_FRACTIONAL_SHARES ?? '',
  LICENSE_REGISTRY:   () => process.env.VITE_CONTRACT_LICENSE_REGISTRY ?? '',
  ROYALTY_DISTRIBUTOR:() => process.env.VITE_CONTRACT_ROYALTY_DISTRIBUTOR ?? '',
  COLLAB_OWNERSHIP:   () => process.env.VITE_CONTRACT_COLLAB_OWNERSHIP ?? '',
  PLAJ_TOKEN:         () => process.env.VITE_CONTRACT_PLAJ_TOKEN ?? '',
};

const POLYGON_RPC = process.env.NODE_ENV === 'production'
  ? (process.env.VITE_POLYGON_RPC_URL ?? 'https://polygon-rpc.com')
  : 'https://rpc-mumbai.maticvigil.com';

const EXPLORER_BASE = process.env.NODE_ENV === 'production'
  ? 'https://polygonscan.com/tx/'
  : 'https://mumbai.polygonscan.com/tx/';

const PLATFORM_FEE_BPS = 1000; // 10% = 1000 basis points

// ─── NFT Minting ──────────────────────────────────────────────────────────────

/**
 * Mint a Music NFT on Polygon.
 * Called when a track is uploaded and WEB3_MUSIC_NFTS flag is active.
 * The artist's custodial wallet (or connected wallet) receives the token.
 */
export async function mintMusicNFT(params: {
  creatorAddress: string;
  contentId: string;        // Plajah track ID
  ipfsCid: string;          // Audio file CID on IPFS
  metadataCid: string;      // JSON metadata CID (title, artist, cover)
  royaltyBps: number;       // e.g. 1000 = 10% royalty on secondary sales
  platformSignerKey: string; // Plajah platform wallet private key (server-side)
}): Promise<MintResult> {
  const { JsonRpcProvider, Wallet, Contract } = await import('ethers');
  const provider = new JsonRpcProvider(POLYGON_RPC);
  const signer = new Wallet(params.platformSignerKey, provider);

  const contract = new Contract(
    CONTRACTS.MUSIC_NFT(),
    MUSIC_NFT_ABI,
    signer,
  );

  const tx = await contract.mintTrack(
    params.creatorAddress,
    params.ipfsCid,
    params.metadataCid,
    params.royaltyBps,
    params.contentId,
  );
  const receipt = await tx.wait();
  const tokenId = receipt.logs[0]?.topics[3] ?? '0';

  return {
    tokenId: BigInt(tokenId).toString(),
    txHash: tx.hash,
    contractAddress: CONTRACTS.MUSIC_NFT(),
    ipfsCid: params.ipfsCid,
    explorerUrl: EXPLORER_BASE + tx.hash,
  };
}

/**
 * Mint a Content NFT for non-music verticals (Film, Book, IP World, etc.)
 */
export async function mintContentNFT(params: {
  creatorAddress: string;
  contentId: string;
  vertical: ContentVertical;
  ipfsCid: string;
  metadataCid: string;
  royaltyBps: number;
  platformSignerKey: string;
}): Promise<MintResult> {
  const { JsonRpcProvider, Wallet, Contract } = await import('ethers');
  const provider = new JsonRpcProvider(POLYGON_RPC);
  const signer = new Wallet(params.platformSignerKey, provider);

  const contract = new Contract(CONTRACTS.CONTENT_NFT(), CONTENT_NFT_ABI, signer);

  const tx = await contract.mintContent(
    params.creatorAddress,
    params.vertical,
    params.ipfsCid,
    params.metadataCid,
    params.royaltyBps,
    params.contentId,
  );
  const receipt = await tx.wait();
  const tokenId = receipt.logs[0]?.topics[3] ?? '0';

  return {
    tokenId: BigInt(tokenId).toString(),
    txHash: tx.hash,
    contractAddress: CONTRACTS.CONTENT_NFT(),
    explorerUrl: EXPLORER_BASE + tx.hash,
  };
}

// ─── Licensing ─────────────────────────────────────────────────────────────────

/**
 * Execute an on-chain license purchase.
 * Called after fiat payment is confirmed and converted to USDC.
 */
export async function executeLicense(params: {
  tokenId: string;
  licenseType: LicenseType;
  amountUsd: string;
  licenseeAddress: string;
  platformSignerKey: string;
  contentId: string;
}): Promise<LicenseResult> {
  const { JsonRpcProvider, Wallet, Contract, parseUnits } = await import('ethers');
  const provider = new JsonRpcProvider(POLYGON_RPC);
  const signer = new Wallet(params.platformSignerKey, provider);

  const contract = new Contract(CONTRACTS.LICENSE_REGISTRY(), LICENSE_REGISTRY_ABI, signer);

  const amountUsdc = parseUnits(params.amountUsd, 6); // USDC = 6 decimals

  const tx = await contract.purchaseLicense(
    params.tokenId,
    params.licenseType,
    amountUsdc,
    params.licenseeAddress,
  );
  await tx.wait();

  const platformCut = (parseFloat(params.amountUsd) * PLATFORM_FEE_BPS / 10000).toFixed(2);
  const creatorCut = (parseFloat(params.amountUsd) - parseFloat(platformCut)).toFixed(2);

  return {
    licenseId: tx.hash.slice(0, 16),
    txHash: tx.hash,
    licensee: params.licenseeAddress,
    licensor: '',
    contentId: params.contentId,
    licenseType: params.licenseType,
    amountUsd: params.amountUsd,
    platformCutUsd: platformCut,
    creatorCutUsd: creatorCut,
    expiresAt: getLicenseExpiry(params.licenseType),
    explorerUrl: EXPLORER_BASE + tx.hash,
  };
}

// ─── Fractional Shares ─────────────────────────────────────────────────────────

/**
 * Create a fractional share offering for a piece of content.
 * Creator retains a percentage; the rest is available for fan investment.
 */
export async function createFractionalOffering(params: {
  tokenId: string;
  totalShares: number;
  pricePerShareUsd: string;
  creatorRetainedPercent: number; // 0–100
  contentId: string;
  platformSignerKey: string;
}): Promise<FractionalShareSale> {
  const { JsonRpcProvider, Wallet, Contract, parseUnits } = await import('ethers');
  const provider = new JsonRpcProvider(POLYGON_RPC);
  const signer = new Wallet(params.platformSignerKey, provider);

  const contract = new Contract(CONTRACTS.FRACTIONAL_SHARES(), FRACTIONAL_SHARES_ABI, signer);

  const priceUsdc = parseUnits(params.pricePerShareUsd, 6);
  const tx = await contract.createOffering(
    params.tokenId,
    params.totalShares,
    priceUsdc,
    params.creatorRetainedPercent * 100, // contract expects basis points
  );
  await tx.wait();

  return {
    contentId: params.contentId,
    tokenId: params.tokenId,
    totalShares: params.totalShares,
    pricePerShareUsd: params.pricePerShareUsd,
    creatorRetainedPercent: params.creatorRetainedPercent,
    txHash: tx.hash,
    explorerUrl: EXPLORER_BASE + tx.hash,
  };
}

// ─── Collaborative Contracts ───────────────────────────────────────────────────

/**
 * Deploy a multi-creator revenue split contract.
 * Each participant's percentage is locked in immutably at creation.
 */
export async function deployCollaborativeContract(params: {
  participants: { address: string; sharePercent: number }[];
  contentId: string;
  platformSignerKey: string;
}): Promise<CollabContract> {
  const total = params.participants.reduce((s, p) => s + p.sharePercent, 0);
  if (Math.abs(total - 100) > 0.01) throw new Error('Participant shares must total 100%');

  const { JsonRpcProvider, Wallet, ContractFactory } = await import('ethers');
  const provider = new JsonRpcProvider(POLYGON_RPC);
  const signer = new Wallet(params.platformSignerKey, provider);

  const addresses = params.participants.map(p => p.address);
  const shares = params.participants.map(p => Math.round(p.sharePercent * 100)); // basis points

  const factory = new ContractFactory(COLLAB_OWNERSHIP_ABI, COLLAB_OWNERSHIP_BYTECODE, signer);
  const contract = await factory.deploy(addresses, shares, params.contentId);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();

  return {
    contractAddress: address,
    participants: params.participants.map((p, i) => ({ userId: '', address: p.address, sharePercent: p.sharePercent })),
    contentId: params.contentId,
    txHash: deployTx?.hash ?? '',
    explorerUrl: EXPLORER_BASE + deployTx?.hash,
  };
}

// ─── Royalty Distribution ──────────────────────────────────────────────────────

/**
 * Trigger automatic royalty distribution for a token.
 * Called by the backend when earnings threshold is reached.
 */
export async function distributeRoyalties(params: {
  tokenId: string;
  amountUsd: string;
  platformSignerKey: string;
}): Promise<{ txHash: string }> {
  const { JsonRpcProvider, Wallet, Contract, parseUnits } = await import('ethers');
  const provider = new JsonRpcProvider(POLYGON_RPC);
  const signer = new Wallet(params.platformSignerKey, provider);
  const contract = new Contract(CONTRACTS.ROYALTY_DISTRIBUTOR(), ROYALTY_DISTRIBUTOR_ABI, signer);

  const amountUsdc = parseUnits(params.amountUsd, 6);
  const tx = await contract.distribute(params.tokenId, { value: amountUsdc });
  await tx.wait();

  return { txHash: tx.hash };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getLicenseExpiry(type: LicenseType): Date | null {
  const map: Partial<Record<LicenseType, number>> = {
    SYNC_30_DAY:    30,
    SYNC_90_DAY:    90,
    BROADCAST_1_YEAR: 365,
  };
  const days = map[type];
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// ─── Minimal ABIs (only what Plajah calls) ────────────────────────────────────

const MUSIC_NFT_ABI = [
  'function mintTrack(address to, string ipfsCid, string metadataCid, uint256 royaltyBps, string contentId) returns (uint256)',
  'event TrackMinted(uint256 indexed tokenId, address indexed artist, string ipfsCid)',
];

const CONTENT_NFT_ABI = [
  'function mintContent(address to, string vertical, string ipfsCid, string metadataCid, uint256 royaltyBps, string contentId) returns (uint256)',
  'event ContentMinted(uint256 indexed tokenId, address indexed creator, string vertical)',
];

const LICENSE_REGISTRY_ABI = [
  'function purchaseLicense(uint256 tokenId, string licenseType, uint256 amountUsdc, address licensee) returns (bytes32 licenseId)',
  'event LicensePurchased(bytes32 indexed licenseId, uint256 tokenId, address licensee, uint256 amount)',
];

const FRACTIONAL_SHARES_ABI = [
  'function createOffering(uint256 tokenId, uint256 totalShares, uint256 pricePerShare, uint256 creatorRetainedBps)',
  'function purchaseShares(uint256 tokenId, uint256 quantity)',
];

const ROYALTY_DISTRIBUTOR_ABI = [
  'function distribute(uint256 tokenId) payable',
];

const COLLAB_OWNERSHIP_ABI = [
  'constructor(address[] participants, uint256[] sharesBps, string contentId)',
  'function distributeRevenue() payable',
];

const COLLAB_OWNERSHIP_BYTECODE = '0x'; // Populated after contract compilation with Hardhat
