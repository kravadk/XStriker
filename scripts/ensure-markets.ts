/**
 * Operator: open ParimutuelMarket markets on-chain for upcoming World Cup fixtures.
 *
 * Sends real createMarket transactions (operator-signed, gas in OKB). Idempotent —
 * existing markets are skipped (checked on-chain). Fixtures are kickoff-sorted, so
 * `ENSURE_LIMIT` opens the soonest N.
 *
 * Run: ENSURE_LIMIT=16 CUP_WRITE_API_ENABLED=true npm --prefix server run ensure:markets
 */
import 'dotenv/config';
import { ensureMarketsForUpcomingFixtures } from '../../../server/src/services/marketService.js';
import { parimutuelMetadata } from '../../../server/src/services/parimutuelContract.js';

const limit = Number(process.env.ENSURE_LIMIT) || 16;
const meta = parimutuelMetadata();
if (!meta.address) {
  console.error('[ensure-markets] ParimutuelMarket not deployed — set PARIMUTUEL_MARKET_ADDRESS');
  process.exit(1);
}

console.log(`[ensure-markets] ParimutuelMarket ${meta.address}`);
console.log(`[ensure-markets] opening up to ${limit} markets for the soonest fixtures...\n`);

const res = await ensureMarketsForUpcomingFixtures(limit);
for (const c of res.created) console.log(`  + ${c.id.padEnd(30)} ${c.txHash}`);
for (const s of res.skipped.filter((x) => x.reason !== 'kickoff not in the future').slice(0, 10)) {
  console.log(`  - ${s.id.padEnd(30)} ${s.reason}`);
}

console.log(`\n[ensure-markets] done — ${res.created.length} created, ${res.skipped.length} skipped.`);
