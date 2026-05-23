import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers';
import 'dotenv/config';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CONTRACT_PATH = path.join(ROOT, 'contracts', 'CupOracleV2.sol');
const OUT_DIR = path.join(ROOT, 'contracts', 'artifacts');

const rpcUrl = process.env.X_LAYER_RPC_URL ?? 'https://rpc.xlayer.tech';
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const challengeWindowSeconds = Number(process.env.CUP_ORACLE_CHALLENGE_WINDOW ?? 3600);

if (!privateKey) {
  throw new Error('DEPLOYER_PRIVATE_KEY is required');
}
if (!Number.isFinite(challengeWindowSeconds) || challengeWindowSeconds <= 0) {
  throw new Error('CUP_ORACLE_CHALLENGE_WINDOW must be a positive number');
}

const source = fs.readFileSync(CONTRACT_PATH, 'utf8');
const input = {
  language: 'Solidity',
  sources: {
    'CupOracleV2.sol': { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object'],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
  errors?: Array<{ severity: 'error' | 'warning'; formattedMessage: string }>;
  contracts: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string } } }>>;
};

const errors = output.errors ?? [];
for (const err of errors) {
  const stream = err.severity === 'error' ? process.stderr : process.stdout;
  stream.write(`${err.formattedMessage}\n`);
}
if (errors.some((err) => err.severity === 'error')) {
  throw new Error('Solidity compilation failed');
}

const compiled = output.contracts['CupOracleV2.sol']?.CupOracleV2;
if (!compiled) {
  throw new Error('CupOracleV2 artifact not found in solc output');
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  path.join(OUT_DIR, 'CupOracleV2.json'),
  JSON.stringify({ abi: compiled.abi, bytecode: compiled.evm.bytecode.object }, null, 2),
);

const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);
const network = await provider.getNetwork();

console.log(`[cup-oracle] deploying from ${wallet.address}`);
console.log(`[cup-oracle] rpc=${rpcUrl} chainId=${network.chainId}`);
console.log(`[cup-oracle] challengeWindow=${challengeWindowSeconds}s`);

const factory = new ContractFactory(compiled.abi, compiled.evm.bytecode.object, wallet);
const contract = await factory.deploy(challengeWindowSeconds);
console.log(`[cup-oracle] tx=${contract.deploymentTransaction()?.hash ?? 'pending'}`);
await contract.waitForDeployment();
const address = await contract.getAddress();

console.log(`[cup-oracle] deployed=${address}`);
console.log(`[cup-oracle] set CUP_ORACLE_V2_ADDRESS=${address}`);
