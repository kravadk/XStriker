import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { JsonRpcProvider, Wallet, ContractFactory, isAddress } from 'ethers';
import 'dotenv/config';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CONTRACT_PATH = path.join(ROOT, 'contracts', 'ParimutuelMarket.sol');
const OUT_DIR = path.join(ROOT, 'contracts', 'artifacts');

const rpcUrl = process.env.X_LAYER_RPC_URL ?? 'https://rpc.xlayer.tech';
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
// ParimutuelMarket is token-agnostic — it settles in whichever X Layer stablecoin
// PARIMUTUEL_TOKEN_ADDRESS points at (USDT or USDC). See server/.env.example.
const token = process.env.PARIMUTUEL_TOKEN_ADDRESS ?? '';
// Prefer the bonded CupOracleV3 once deployed; fall back to V2. getMatch is identical.
const oracle = (process.env.CUP_ORACLE_V3_ADDRESS || process.env.CUP_ORACLE_V2_ADDRESS || '').trim();
const operator = process.env.AGENTIC_WALLET_ADDRESS ?? '';
const treasury = process.env.PARIMUTUEL_TREASURY || operator;
const feeBps = Number(process.env.PARIMUTUEL_FEE_BPS ?? 0);
// Anti-dust-spam minimum stake, in token base units. 0 disables it.
const minStake = (process.env.PARIMUTUEL_MIN_STAKE ?? '0').trim();

if (!privateKey) throw new Error('DEPLOYER_PRIVATE_KEY is required');
if (!isAddress(token)) throw new Error('PARIMUTUEL_TOKEN_ADDRESS must be a valid address (X Layer USDT or USDC)');
if (!isAddress(oracle)) throw new Error('CUP_ORACLE_V3_ADDRESS or CUP_ORACLE_V2_ADDRESS must be a valid address');
if (!isAddress(operator)) throw new Error('AGENTIC_WALLET_ADDRESS (operator) must be a valid address');
if (!isAddress(treasury)) throw new Error('PARIMUTUEL_TREASURY must be a valid address');
if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1000) {
  throw new Error('PARIMUTUEL_FEE_BPS must be an integer 0..1000');
}
if (!/^\d+$/.test(minStake)) throw new Error('PARIMUTUEL_MIN_STAKE must be a non-negative integer in token base units');

const source = fs.readFileSync(CONTRACT_PATH, 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'ParimutuelMarket.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
  errors?: Array<{ severity: 'error' | 'warning'; formattedMessage: string }>;
  contracts: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string } } }>>;
};

for (const err of output.errors ?? []) {
  (err.severity === 'error' ? process.stderr : process.stdout).write(`${err.formattedMessage}\n`);
}
if ((output.errors ?? []).some((e) => e.severity === 'error')) {
  throw new Error('Solidity compilation failed');
}

const compiled = output.contracts['ParimutuelMarket.sol']?.ParimutuelMarket;
if (!compiled) throw new Error('ParimutuelMarket artifact not found in solc output');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  path.join(OUT_DIR, 'ParimutuelMarket.json'),
  JSON.stringify({ abi: compiled.abi, bytecode: compiled.evm.bytecode.object }, null, 2),
);

const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);
const net = await provider.getNetwork();

console.log(`[parimutuel] deploying from ${wallet.address}`);
console.log(`[parimutuel] rpc=${rpcUrl} chainId=${net.chainId}`);
console.log(`[parimutuel] args token=${token} oracle=${oracle} operator=${operator} treasury=${treasury} feeBps=${feeBps} minStake=${minStake}`);

const factory = new ContractFactory(compiled.abi, compiled.evm.bytecode.object, wallet);
const contract = await factory.deploy(token, oracle, operator, treasury, feeBps, BigInt(minStake));
console.log(`[parimutuel] tx=${contract.deploymentTransaction()?.hash ?? 'pending'}`);
await contract.waitForDeployment();
const address = await contract.getAddress();

console.log(`[parimutuel] deployed=${address}`);
console.log(`[parimutuel] set PARIMUTUEL_MARKET_ADDRESS=${address}`);
