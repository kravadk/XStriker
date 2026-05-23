/**
 * Deploy the bonded-oracle stack (HARDENING-PLAN Phase 6) to X Layer mainnet.
 *
 * USER-GATED. This sends three real OKB-spending transactions. It is never run
 * autonomously — only by an operator who has reviewed HARDENING-PLAN.md and confirmed
 * the bond economics and the arbiter panel.
 *
 * Deploy order (breaks the oracle <-> arbiter circular dependency):
 *   1. ArbiterMultisig(signers, threshold)         — deployed first
 *   2. CupOracleV3(..., arbiter = ArbiterMultisig)  — needs the arbiter address
 *   3. ArbiterMultisig.setOracle(CupOracleV3)       — closes the wiring (once-only)
 *
 * After it prints the addresses, redeploy ParimutuelMarket against the new oracle
 * (deploy-parimutuel-market.ts with CUP_ORACLE_V2_ADDRESS pointed at CupOracleV3 —
 * getMatch is V2-compatible) and update server/.env + docs/xcup/CONTRACTS.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { JsonRpcProvider, Wallet, ContractFactory, isAddress } from 'ethers';
import 'dotenv/config';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'contracts', 'artifacts');

const rpcUrl = process.env.X_LAYER_RPC_URL ?? 'https://rpc.xlayer.tech';
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

// Bond economics — confirmed in HARDENING-PLAN.md Розділ 5.
const bondToken = (process.env.CUP_ORACLE_BOND_TOKEN || process.env.PARIMUTUEL_TOKEN_ADDRESS || '').trim();
const bondAmount = (process.env.CUP_ORACLE_BOND_AMOUNT ?? '50000000').trim(); // 50 USDT (6 decimals)
const challengeWindow = Number(process.env.CUP_ORACLE_CHALLENGE_WINDOW ?? 3600);
const protocolFeeBps = Number(process.env.CUP_ORACLE_PROTOCOL_FEE_BPS ?? 0);
const safetyPeriod = Number(process.env.CUP_ORACLE_SAFETY_PERIOD ?? 3600);
const treasury = (process.env.CUP_ORACLE_TREASURY || process.env.PARIMUTUEL_TREASURY || process.env.AGENTIC_WALLET_ADDRESS || '').trim();

// Arbiter panel — comma-separated signer addresses (e.g. a 2-of-3).
const arbiterSigners = (process.env.CUP_ARBITER_SIGNERS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
const arbiterThreshold = Number(process.env.CUP_ARBITER_THRESHOLD ?? 2);

if (!privateKey) throw new Error('DEPLOYER_PRIVATE_KEY is required');
if (!isAddress(bondToken)) throw new Error('CUP_ORACLE_BOND_TOKEN (or PARIMUTUEL_TOKEN_ADDRESS) must be a valid address');
if (!/^\d+$/.test(bondAmount) || BigInt(bondAmount) <= 0n) throw new Error('CUP_ORACLE_BOND_AMOUNT must be a positive integer in base units');
if (!Number.isFinite(challengeWindow) || challengeWindow <= 0) throw new Error('CUP_ORACLE_CHALLENGE_WINDOW must be a positive number');
if (!Number.isFinite(protocolFeeBps) || protocolFeeBps < 0 || protocolFeeBps > 5000) throw new Error('CUP_ORACLE_PROTOCOL_FEE_BPS must be 0..5000');
if (!Number.isFinite(safetyPeriod) || safetyPeriod <= 0) throw new Error('CUP_ORACLE_SAFETY_PERIOD must be a positive number');
if (!isAddress(treasury)) throw new Error('CUP_ORACLE_TREASURY must resolve to a valid address');
if (arbiterSigners.length === 0) throw new Error('CUP_ARBITER_SIGNERS must list at least one signer address');
for (const s of arbiterSigners) {
  if (!isAddress(s)) throw new Error(`CUP_ARBITER_SIGNERS contains an invalid address: ${s}`);
}
if (new Set(arbiterSigners.map((s) => s.toLowerCase())).size !== arbiterSigners.length) {
  throw new Error('CUP_ARBITER_SIGNERS contains a duplicate address');
}
if (!Number.isInteger(arbiterThreshold) || arbiterThreshold <= 0 || arbiterThreshold > arbiterSigners.length) {
  throw new Error('CUP_ARBITER_THRESHOLD must be 1..signerCount');
}

function readContract(name: string): string {
  return fs.readFileSync(path.join(ROOT, 'contracts', `${name}.sol`), 'utf8');
}

const input = {
  language: 'Solidity',
  sources: {
    'ArbiterMultisig.sol': { content: readContract('ArbiterMultisig') },
    'CupOracleV3.sol': { content: readContract('CupOracleV3') },
  },
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
  const stream = err.severity === 'error' ? process.stderr : process.stdout;
  stream.write(`${err.formattedMessage}\n`);
}
if ((output.errors ?? []).some((err) => err.severity === 'error')) {
  throw new Error('Solidity compilation failed');
}

const multisigArtifact = output.contracts['ArbiterMultisig.sol']?.ArbiterMultisig;
const oracleArtifact = output.contracts['CupOracleV3.sol']?.CupOracleV3;
if (!multisigArtifact || !oracleArtifact) {
  throw new Error('ArbiterMultisig / CupOracleV3 artifact not found in solc output');
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  path.join(OUT_DIR, 'ArbiterMultisig.json'),
  JSON.stringify({ abi: multisigArtifact.abi, bytecode: multisigArtifact.evm.bytecode.object }, null, 2),
);
fs.writeFileSync(
  path.join(OUT_DIR, 'CupOracleV3.json'),
  JSON.stringify({ abi: oracleArtifact.abi, bytecode: oracleArtifact.evm.bytecode.object }, null, 2),
);

const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);
const network = await provider.getNetwork();

console.log(`[cup-oracle-v3] deploying from ${wallet.address}`);
console.log(`[cup-oracle-v3] rpc=${rpcUrl} chainId=${network.chainId}`);
console.log(`[cup-oracle-v3] bondToken=${bondToken} bondAmount=${bondAmount}`);
console.log(`[cup-oracle-v3] challengeWindow=${challengeWindow}s protocolFeeBps=${protocolFeeBps} safetyPeriod=${safetyPeriod}s`);
console.log(`[cup-oracle-v3] treasury=${treasury}`);
console.log(`[cup-oracle-v3] arbiter=${arbiterThreshold}-of-${arbiterSigners.length} signers=${arbiterSigners.join(',')}`);

// 1. ArbiterMultisig — deployed first so the oracle constructor can take its address.
const multisigFactory = new ContractFactory(multisigArtifact.abi, multisigArtifact.evm.bytecode.object, wallet);
const multisig = await multisigFactory.deploy(arbiterSigners, arbiterThreshold);
console.log(`[cup-oracle-v3] arbiter tx=${multisig.deploymentTransaction()?.hash ?? 'pending'}`);
await multisig.waitForDeployment();
const multisigAddress = await multisig.getAddress();
console.log(`[cup-oracle-v3] ArbiterMultisig deployed=${multisigAddress}`);

// 2. CupOracleV3 — arbiter = the multisig just deployed.
const oracleFactory = new ContractFactory(oracleArtifact.abi, oracleArtifact.evm.bytecode.object, wallet);
const oracle = await oracleFactory.deploy(
  bondToken,
  BigInt(bondAmount),
  challengeWindow,
  protocolFeeBps,
  safetyPeriod,
  treasury,
  multisigAddress,
);
console.log(`[cup-oracle-v3] oracle tx=${oracle.deploymentTransaction()?.hash ?? 'pending'}`);
await oracle.waitForDeployment();
const oracleAddress = await oracle.getAddress();
console.log(`[cup-oracle-v3] CupOracleV3 deployed=${oracleAddress}`);

// 3. Close the wiring — ArbiterMultisig.setOracle (once-only, deployer-gated).
const setOracleTx = await (multisig as unknown as { setOracle: (a: string) => Promise<{ hash: string; wait: () => Promise<unknown> }> }).setOracle(oracleAddress);
console.log(`[cup-oracle-v3] setOracle tx=${setOracleTx.hash}`);
await setOracleTx.wait();

console.log('[cup-oracle-v3] --- done. Update server/.env: ---');
console.log(`[cup-oracle-v3] CUP_ORACLE_V3_ADDRESS=${oracleAddress}`);
console.log(`[cup-oracle-v3] CUP_ARBITER_ADDRESS=${multisigAddress}`);
console.log('[cup-oracle-v3] Then redeploy ParimutuelMarket against the new oracle and update docs/xcup/CONTRACTS.md.');
