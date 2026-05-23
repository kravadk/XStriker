/**
 * Deploy a new ArbiterMultisig to X Layer mainnet — usually used to upgrade the
 * existing 1-of-1 arbiter to a 2-of-3 (or larger) signer panel.
 *
 * Inputs (env):
 *   - DEPLOYER_PRIVATE_KEY        — signer that pays the deploy gas
 *   - X_LAYER_RPC_URL             — defaults to https://rpc.xlayer.tech
 *   - ARBITER_SIGNERS             — comma-separated 0x… addresses (e.g. 3 signers)
 *   - ARBITER_THRESHOLD           — number of votes required to resolve (e.g. 2)
 *
 * Usage:
 *   ARBITER_SIGNERS=0xAAA…,0xBBB…,0xCCC… ARBITER_THRESHOLD=2 \
 *     npm --prefix server run deploy:arbiter-multisig
 *
 * After deploy:
 *   1. Set `CUP_ARBITER_ADDRESS=<new>` in server/.env and Render env.
 *   2. From the oracle owner key, call CupOracleV3.proposeArbiter(<new>) — this
 *      starts a `safetyPeriod` (~1 h) timelock.
 *   3. After the timelock, call CupOracleV3.commitArbiter() to finalise.
 *   4. Run the new arbiter through one end-to-end fork test (see
 *      contracts/test/CupOracleV3.test.cjs) before pointing production at it.
 */
import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { JsonRpcProvider, Wallet, ContractFactory, getAddress } from 'ethers';
import 'dotenv/config';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CONTRACT_PATH = path.join(ROOT, 'contracts', 'ArbiterMultisig.sol');
const OUT_DIR = path.join(ROOT, 'contracts', 'artifacts');

const rpcUrl = process.env.X_LAYER_RPC_URL ?? 'https://rpc.xlayer.tech';
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const signersRaw = (process.env.ARBITER_SIGNERS ?? '').trim();
const thresholdRaw = (process.env.ARBITER_THRESHOLD ?? '').trim();

if (!privateKey) {
  throw new Error('DEPLOYER_PRIVATE_KEY is required');
}
if (!signersRaw) {
  throw new Error('ARBITER_SIGNERS is required (comma-separated 0x… addresses)');
}
if (!thresholdRaw) {
  throw new Error('ARBITER_THRESHOLD is required (number)');
}

const signers = signersRaw
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => getAddress(s)); // throws if any is invalid
const threshold = Number(thresholdRaw);

if (signers.length === 0) throw new Error('ARBITER_SIGNERS resolved to an empty list');
if (!Number.isInteger(threshold) || threshold < 1 || threshold > signers.length) {
  throw new Error(`ARBITER_THRESHOLD must be an integer in 1..${signers.length}`);
}
const uniqueSigners = new Set(signers.map((s) => s.toLowerCase()));
if (uniqueSigners.size !== signers.length) {
  throw new Error('ARBITER_SIGNERS contains duplicates');
}

const source = fs.readFileSync(CONTRACT_PATH, 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'ArbiterMultisig.sol': { content: source } },
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

const compiled = output.contracts['ArbiterMultisig.sol']?.ArbiterMultisig;
if (!compiled) throw new Error('ArbiterMultisig artifact not found in solc output');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  path.join(OUT_DIR, 'ArbiterMultisig.json'),
  JSON.stringify({ abi: compiled.abi, bytecode: compiled.evm.bytecode.object }, null, 2),
);

const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);
const network = await provider.getNetwork();

console.log(`[arbiter-multisig] deploying from ${wallet.address}`);
console.log(`[arbiter-multisig] rpc=${rpcUrl} chainId=${network.chainId}`);
console.log(`[arbiter-multisig] signers (${signers.length}):`);
for (const s of signers) console.log(`  - ${s}`);
console.log(`[arbiter-multisig] threshold = ${threshold} of ${signers.length}`);

const factory = new ContractFactory(compiled.abi, compiled.evm.bytecode.object, wallet);
const contract = await factory.deploy(signers, threshold);
const txHash = contract.deploymentTransaction()?.hash ?? 'pending';
console.log(`[arbiter-multisig] tx=${txHash}`);
await contract.waitForDeployment();
const address = await contract.getAddress();

console.log(`[arbiter-multisig] deployed=${address}`);
console.log('');
console.log('Next steps:');
console.log(`  1. server/.env + Render env: CUP_ARBITER_ADDRESS=${address}`);
console.log(`  2. From CupOracleV3 owner, call proposeArbiter(${address}) — starts safetyPeriod timelock.`);
console.log('  3. After timelock, call commitArbiter() to finalise.');
console.log('  4. Verify the new ArbiterMultisig on the OKX X Layer explorer (constructor: signers[], threshold).');
