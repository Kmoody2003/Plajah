import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

/**
 * Plajah Blockchain — Hardhat Configuration
 *
 * Setup:
 *   cd blockchain
 *   npm install
 *   npx hardhat compile
 *   npx hardhat test
 *   npx hardhat run deploy/01_deploy_all.ts --network mumbai    (testnet)
 *   npx hardhat run deploy/01_deploy_all.ts --network polygon   (mainnet — when ready)
 *
 * Required .env variables:
 *   DEPLOYER_PRIVATE_KEY     — Platform wallet private key for deployment
 *   POLYGON_RPC_URL          — e.g. https://polygon-rpc.com
 *   MUMBAI_RPC_URL           — e.g. https://rpc-mumbai.maticvigil.com
 *   POLYGONSCAN_API_KEY      — For contract verification
 *   PLAJAH_TREASURY_ADDRESS  — Platform fee recipient wallet
 */
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Local development
    hardhat: {
      chainId: 31337,
    },
    // Polygon Mumbai testnet — use this first
    mumbai: {
      url: process.env.MUMBAI_RPC_URL ?? "https://rpc-mumbai.maticvigil.com",
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 80001,
      gasPrice: "auto",
    },
    // Polygon mainnet — only when contracts are audited and tested
    polygon: {
      url: process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com",
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 137,
      gasPrice: "auto",
    },
  },
  etherscan: {
    apiKey: {
      polygon:       process.env.POLYGONSCAN_API_KEY ?? "",
      polygonMumbai: process.env.POLYGONSCAN_API_KEY ?? "",
    },
  },
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
