require("@nomicfoundation/hardhat-toolbox");
require("dotenv/config");

const RPC = process.env.X_LAYER_RPC_URL || "https://rpc.xlayer.tech";
const KEY = process.env.DEPLOYER_PRIVATE_KEY;
const FORK = process.env.FORK === "1";

/**
 * Mirror-local hardhat config for the X Cup contract layer (kravadk/XCup
 * standalone clone). Mirrors the umbrella's hardhat.config.cjs but uses
 * paths relative to this folder (./contracts instead of ./apps/xcup/contracts).
 *
 * @type {import('hardhat/config').HardhatUserConfig}
 */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: {
    sources: "./contracts",
    tests: "./contracts/test",
    artifacts: "./contracts/artifacts-hh",
    cache: "./contracts/cache-hh",
  },
  networks: {
    // X Layer (chain 196) needs an explicit hardfork hint for fork tests.
    hardhat: FORK
      ? {
          forking: { url: RPC },
          chains: { 196: { hardforkHistory: { cancun: 0 } } },
        }
      : {},
    xlayer: { url: RPC, chainId: 196, accounts: KEY ? [KEY] : [] },
  },
};
