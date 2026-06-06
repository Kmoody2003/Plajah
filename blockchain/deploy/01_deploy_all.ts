/**
 * Plajah Smart Contract Deployment Script
 *
 * Deploys all contracts in the correct order.
 * Run on testnet first, verify, then mainnet.
 *
 * Usage:
 *   npx hardhat run deploy/01_deploy_all.ts --network mumbai
 *
 * After deployment, copy contract addresses to your .env:
 *   VITE_CONTRACT_PLAJ_TOKEN=0x...
 *   VITE_CONTRACT_MUSIC_NFT=0x...
 *   VITE_CONTRACT_LICENSE_REGISTRY=0x...
 *   VITE_CONTRACT_FRACTIONAL_SHARES=0x...
 *   VITE_CONTRACT_ROYALTY_DISTRIBUTOR=0x...
 */

import { ethers, run } from "hardhat";

const USDC_POLYGON       = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const USDC_MUMBAI        = "0xe6b8a5CF854791412c1f6EFC7CAf629f5Df1c747";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const isMainnet = network.chainId === 137n;

  const usdcAddress = isMainnet ? USDC_POLYGON : USDC_MUMBAI;
  const treasury = process.env.PLAJAH_TREASURY_ADDRESS ?? deployer.address;

  console.log(`\n🚀 Deploying Plajah contracts`);
  console.log(`   Network:   ${isMainnet ? "Polygon Mainnet" : "Mumbai Testnet"}`);
  console.log(`   Deployer:  ${deployer.address}`);
  console.log(`   Treasury:  ${treasury}`);
  console.log(`   USDC:      ${usdcAddress}\n`);

  // 1. PLAJ Token
  console.log("Deploying PLAJToken...");
  const PLAJToken = await ethers.getContractFactory("PLAJToken");
  const plajToken = await PLAJToken.deploy(deployer.address);
  await plajToken.waitForDeployment();
  const plajAddr = await plajToken.getAddress();
  console.log(`  ✓ PLAJToken:            ${plajAddr}`);

  // 2. Music NFT
  console.log("Deploying PlajahMusicNFT...");
  const MusicNFT = await ethers.getContractFactory("PlajahMusicNFT");
  const musicNft = await MusicNFT.deploy(deployer.address, treasury);
  await musicNft.waitForDeployment();
  const musicNftAddr = await musicNft.getAddress();
  console.log(`  ✓ PlajahMusicNFT:       ${musicNftAddr}`);

  // 3. License Registry
  console.log("Deploying PlajahLicenseRegistry...");
  const LicenseRegistry = await ethers.getContractFactory("PlajahLicenseRegistry");
  const licenseRegistry = await LicenseRegistry.deploy(deployer.address, treasury, usdcAddress);
  await licenseRegistry.waitForDeployment();
  const licenseAddr = await licenseRegistry.getAddress();
  console.log(`  ✓ PlajahLicenseRegistry: ${licenseAddr}`);

  // 4. Fractional Shares
  console.log("Deploying PlajahFractionalShares...");
  const FractionalShares = await ethers.getContractFactory("PlajahFractionalShares");
  const fractionalShares = await FractionalShares.deploy(deployer.address, treasury, usdcAddress);
  await fractionalShares.waitForDeployment();
  const fractionalAddr = await fractionalShares.getAddress();
  console.log(`  ✓ PlajahFractionalShares: ${fractionalAddr}`);

  // 5. Royalty Distributor
  console.log("Deploying PlajahRoyaltyDistributor...");
  const RoyaltyDistributor = await ethers.getContractFactory("PlajahRoyaltyDistributor");
  const royaltyDistributor = await RoyaltyDistributor.deploy(deployer.address, treasury, usdcAddress);
  await royaltyDistributor.waitForDeployment();
  const royaltyAddr = await royaltyDistributor.getAddress();
  console.log(`  ✓ PlajahRoyaltyDistributor: ${royaltyAddr}`);

  console.log("\n✅ All contracts deployed!\n");
  console.log("Add these to your .env:\n");
  console.log(`VITE_CONTRACT_PLAJ_TOKEN=${plajAddr}`);
  console.log(`VITE_CONTRACT_MUSIC_NFT=${musicNftAddr}`);
  console.log(`VITE_CONTRACT_LICENSE_REGISTRY=${licenseAddr}`);
  console.log(`VITE_CONTRACT_FRACTIONAL_SHARES=${fractionalAddr}`);
  console.log(`VITE_CONTRACT_ROYALTY_DISTRIBUTOR=${royaltyAddr}`);
  console.log(`VITE_PLAJAH_TREASURY_ADDRESS=${treasury}`);

  // Verify on Polygonscan (optional, requires POLYGONSCAN_API_KEY)
  if (process.env.POLYGONSCAN_API_KEY && !isMainnet) {
    console.log("\n📋 Verifying contracts on Polygonscan...");
    await verify(plajAddr, [deployer.address]);
    await verify(musicNftAddr, [deployer.address, treasury]);
    await verify(licenseAddr, [deployer.address, treasury, usdcAddress]);
    await verify(fractionalAddr, [deployer.address, treasury, usdcAddress]);
    await verify(royaltyAddr, [deployer.address, treasury, usdcAddress]);
  }
}

async function verify(address: string, args: unknown[]) {
  try {
    await run("verify:verify", { address, constructorArguments: args });
    console.log(`  ✓ Verified: ${address}`);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("already verified")) {
      console.log(`  ~ Already verified: ${address}`);
    } else {
      console.log(`  ✗ Verification failed: ${address}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
