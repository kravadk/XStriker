import { Contract, JsonRpcProvider, Wallet, encodeBytes32String, isAddress } from 'ethers';
import 'dotenv/config';
import { env } from '../../../server/src/config/env.js';
import { listCupMatches } from '../../../server/src/services/cupData.js';
import { CUP_ORACLE_ABI } from '../../../server/src/services/cupOracleContract.js';

if (!isAddress(env.cupOracleV2Address)) {
  throw new Error('CUP_ORACLE_V2_ADDRESS is required and must be a valid deployed address');
}
if (!env.deployerPrivateKey) {
  throw new Error('DEPLOYER_PRIVATE_KEY is required');
}

const provider = new JsonRpcProvider(env.xLayerRpcUrl);
const wallet = new Wallet(env.deployerPrivateKey, provider);
const contract = new Contract(env.cupOracleV2Address, CUP_ORACLE_ABI, wallet);

console.log(`[cup-oracle] registering live source-backed matches on ${env.cupOracleV2Address} from ${wallet.address}`);

for (const match of await listCupMatches()) {
  if (match.sourceMode !== 'live-adapter' || match.receipts.length === 0) {
    console.log(`[cup-oracle] skip ${match.id}: not a live source-backed match`);
    continue;
  }
  const matchId = encodeBytes32String(match.id);
  try {
    const tx = await contract.registerMatch(
      matchId,
      match.settlement.rulesHash,
      match.settlement.sourceHash,
      match.settlement.evidenceHash,
      match.settlement.evidenceUri,
    );
    console.log(`[cup-oracle] register ${match.id}: ${tx.hash}`);
    await tx.wait();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('MatchAlreadyExists') || msg.includes('already exists')) {
      console.log(`[cup-oracle] skip ${match.id}: already registered`);
      continue;
    }
    throw err;
  }
}

console.log('[cup-oracle] live match registration complete');
