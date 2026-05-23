import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers';
import 'dotenv/config';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CONTRACT_PATH = path.join(ROOT, 'contracts', 'BracketNFT.sol');
const OUT_DIR = path.join(ROOT, 'contracts', 'artifacts');

const rpcUrl = process.env.X_LAYER_RPC_URL ?? 'https://rpc.xlayer.tech';
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const baseURI = process.env.BRACKET_NFT_BASE_URI ?? 'https://x-sight.vercel.app/bracket/';

if (!privateKey) {
  throw new Error('DEPLOYER_PRIVATE_KEY is required');
}

const source = fs.readFileSync(CONTRACT_PATH, 'utf8');
const input = {
  language: 'Solidity',
  sources: {
    'BracketNFT.sol': { content: source },
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

const compiled = output.contracts['BracketNFT.sol']?.BracketNFT;
if (!compiled) {
  throw new Error('BracketNFT artifact not found in solc output');
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  path.join(OUT_DIR, 'BracketNFT.json'),
  JSON.stringify({ abi: compiled.abi, bytecode: compiled.evm.bytecode.object }, null, 2),
);

const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);
const network = await provider.getNetwork();

console.log(`[bracket-nft] deploying from ${wallet.address}`);
console.log(`[bracket-nft] rpc=${rpcUrl} chainId=${network.chainId} baseURI=${baseURI}`);

const factory = new ContractFactory(compiled.abi, compiled.evm.bytecode.object, wallet);
const contract = await factory.deploy(baseURI);
console.log(`[bracket-nft] tx=${contract.deploymentTransaction()?.hash ?? 'pending'}`);
await contract.waitForDeployment();
const address = await contract.getAddress();

console.log(`[bracket-nft] deployed=${address}`);
console.log(`[bracket-nft] set BRACKET_NFT_ADDRESS=${address}`);
