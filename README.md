<div align="center">

# ⚽ X Cup

### The first real-money World Cup prediction market on X Layer

*Pick an outcome · stake a stablecoin · winners split the pool.*
**No house. No order book. No LP risk.**

`5 live contracts` &nbsp;·&nbsp; `3 markets per fixture` &nbsp;·&nbsp; `104 fixtures` &nbsp;·&nbsp; `8 screens` &nbsp;·&nbsp; `45 fork tests` &nbsp;·&nbsp; `0 mocks`

[![X Layer](https://img.shields.io/badge/X_Layer-mainnet_live-2EBD85?style=flat-square)](https://www.okx.com/xlayer)
[![Chain 196](https://img.shields.io/badge/chain-196-4AA8E0?style=flat-square)](https://www.okx.com/xlayer)
[![Contracts](https://img.shields.io/badge/contracts-5_deployed-2EBD85?style=flat-square)](#live-on-x-layer-mainnet)
[![Source verified](https://img.shields.io/badge/source-verified_on--chain-3FB950?style=flat-square)](https://www.okx.com/web3/explorer/xlayer/address/0x19da7aab20Be913fb697ebfef4b8f12Ac463Ebf6)
[![Fork tests](https://img.shields.io/badge/fork_tests-45_passing-3FB950?style=flat-square)](#testing)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?style=flat-square)](contracts/)
[![License](https://img.shields.io/badge/license-MIT-EAB308?style=flat-square)](LICENSE)

**[✨ Highlights](#why-x-cup-stands-out)** &nbsp;·&nbsp; **[🏆 Hackathon fit](#one-product-five-hackathon-tracks)** &nbsp;·&nbsp; **[⛓ Live contracts](#live-on-x-layer-mainnet)** &nbsp;·&nbsp; **[🚀 Run it](#run-it-locally)**

</div>

---

> **Built for the OKX X Layer × X Cup hackathon.** The full contract stack —
> bonded oracle, M-of-N arbiter, pari-mutuel market and soulbound badge — is
> **live on X Layer mainnet (chain 196)**. Every payout is a verifiable on-chain
> transaction, every test runs against real tokens, and nothing in this repo is
> a mock.

---

## Contents

**For judges** — start here:
[What X Cup is](#what-x-cup-is) ·
[Why it stands out](#why-x-cup-stands-out) ·
[Hackathon fit](#one-product-five-hackathon-tracks) ·
[OKX integrations](#okx-ecosystem-integrations) ·
[Live contracts](#live-on-x-layer-mainnet) ·
[The 8 screens](#the-8-screens)

**The deep dive:**
[How X Cup works](#how-x-cup-works) ·
[Architecture](#architecture) ·
[Tech stack](#tech-stack) ·
[Run it locally](#run-it-locally) ·
[Testing](#testing) ·
[Project structure](#project-structure) ·
[Roadmap](#roadmap) ·
[Principles](#principles)

---

## What X Cup is

A fan opens X Cup, picks a World Cup outcome — **who wins**, **how many goals**,
**whether both teams score** — and stakes a stablecoin into a shared
**pari-mutuel pool**. When the result is finalized on-chain, the winning side
splits the *entire* pool pro-rata to stake. No order book, no AMM, no house.

Only one thing has to be trustworthy: *which outcome won*. X Cup secures that
with a **bonded optimistic oracle** — proposing a false result costs a slashable
**50-USDT bond** — backed by a **2-of-3 quorum** over three independent sports
feeds. A wrong result is challengeable, and the liar's bond pays the challenger.

Everything around the money is built like a real product: stake with **any
token**, an autonomous **AI pundit** to play against, a full **free-to-play**
layer that needs no wallet, and an open **x402 + MCP** data layer so other apps
and agents can consume settlement.

```
   ┌──────────┐   stake USDT/USDC/OKB   ┌───────────────┐   2-of-3 feeds agree   ┌───────────────┐
   │   FAN    │ ──────────────────────▶ │  POOL  (open)  │ ─────────────────────▶ │ ORACLE propose │
   └──────────┘                         └───────────────┘                        │   (+50 bond)   │
        ▲                                                                         └──────┬────────┘
        │            pro-rata claim()              ┌───────────────┐   finalized          │
        └───────────────────────────────────────── │ POOL (settled)│ ◀────────────────────┘
              your stake × pool ÷ winning stake     └───────────────┘   challenge window passes
```

---

## Why X Cup stands out

Eight things make X Cup more than a hackathon demo — each is **built and live**,
not promised:

| | Feature | Why it matters |
|---|---|---|
| 🔒 | **Bonded optimistic oracle** | Results are *economically defended* — proposing a false outcome costs a slashable 50-USDT bond, and an honest challenger takes it. Not "trust the feed". |
| 🎰 | **Pari-mutuel — zero house** | Pools fund themselves: no market-maker, no LP capital at risk, no spread. `claim()` is pure on-chain math the operator cannot touch. |
| 💸 | **Stake with any token** | USDT, USDC or OKB — a non-USDT token is swapped to USDT *in your own wallet* via the OKX DEX aggregator. No custody, every step user-signed. |
| 🤖 | **Hermes — autonomous AI pundit** | A Claude-backed agent issues a conviction-weighted pick for every fixture. A real opponent every fan races on the leaderboard. |
| 🛰 | **2-of-3 multi-source quorum** | Three independent sports feeds; a result settles only when two agree. Conflicts are held in an honest state, never guessed. |
| 🎮 | **Full free-to-play layer** | Bracket, leaderboard, private leagues and a soulbound FanPass — the whole product is playable end-to-end with no wallet and no risk. |
| 🔌 | **Open data layer — x402 + MCP** | Settlement data is a public good: pay-per-call x402 endpoints and an MCP server that other apps and AI agents consume directly. |
| ✅ | **Live on mainnet, no mocks** | Four contracts deployed to X Layer; 45 fork tests run against the *real* USDT/USDC contracts. Nothing in the codebase is stubbed. |

---

## One product, five hackathon tracks

X Cup is a single cohesive product — but it lands across **five** eligible
hackathon tracks at once, because each layer is a genuine, working feature:

| Track | How X Cup delivers it |
|---|---|
| 🎯 **Prediction markets** | The core: pari-mutuel World Cup pools, three independent market types per fixture, settled by a bonded optimistic oracle. |
| 🤖 **AI agents** | *Hermes*, an autonomous Claude-backed pundit; an MCP server exposing agent-readable tools; x402 machine-payable data endpoints. |
| 🎟 **NFT** | A collectible **Bracket NFT** of a saved tournament call, and a **soulbound FanPass** on-chain reputation badge (SBT). |
| 👥 **Social** | Private **leagues** with invite codes, a global **leaderboard**, fan-vs-fan and fan-vs-AI competition. |
| 🕹 **GameFi** | A full **free-to-play** layer — predict the whole 104-fixture bracket, score it live against Hermes, climb FanPass reputation tiers. |

---

## OKX ecosystem integrations

X Cup is built natively on the OKX stack — these are not bolt-ons, they are how
the product works:

| OKX surface | How X Cup uses it |
|---|---|
| **X Layer** (chain 196) | The entire contract stack — oracle, arbiter, market, badge — is deployed and **live on X Layer mainnet**. |
| **OKX DEX aggregator** | Powers *stake with any token*: the chosen token is swapped to the settlement USDT in the user's own wallet before staking, over aggregated on-chain liquidity. |
| **OKX Wallet / OKX Connect** | Wallet connection — injected OKX Wallet on desktop, and OKX Connect (QR / deep link) for mobile browsers and Telegram. |
| **x402** | Pay-per-call data endpoints settled in USDT on X Layer — the open-data layer for AI agents and partner apps. |
| **OKB** | A first-class stake token (swapped to USDT for settlement) and the X Layer gas token. |

---

## Live on X Layer mainnet

**This is not a testnet demo.** The full stack is deployed and verifiable on
**X Layer mainnet (chain 196)** — click any address to open it in the explorer:

| Contract | Address | Role |
|---|---|---|
| `CupOracleV3` | [`0x19da7aab20Be913fb697ebfef4b8f12Ac463Ebf6`](https://www.okx.com/web3/explorer/xlayer/address/0x19da7aab20Be913fb697ebfef4b8f12Ac463Ebf6) | Bonded optimistic settlement oracle |
| `ArbiterMultisig` | [`0x792152c274c42C588D5551C9141C21106d3A2Cce`](https://www.okx.com/web3/explorer/xlayer/address/0x792152c274c42C588D5551C9141C21106d3A2Cce) | M-of-N arbiter for challenged results |
| `ParimutuelMarket` | [`0x0431576845B77a743C87be323c04fad02201E08b`](https://www.okx.com/web3/explorer/xlayer/address/0x0431576845B77a743C87be323c04fad02201E08b) | Pari-mutuel pools — settles in USDT, reads `CupOracleV3` |
| `FanPassSBT` | [`0x74F75532428A99E613a865C97D1084b7f38241BD`](https://www.okx.com/web3/explorer/xlayer/address/0x74F75532428A99E613a865C97D1084b7f38241BD) | Soulbound fan-reputation badge |
| `BracketNFT` | [`0x532DdCCB09389A35D353f73a06bE162D123ccD70`](https://www.okx.com/web3/explorer/xlayer/address/0x532DdCCB09389A35D353f73a06bE162D123ccD70) | Collectible bracket NFT — minted from a saved tournament call |

Every stake, bond, settlement and payout is an on-chain transaction a judge can
open and verify directly. The pre-hardening `CupOracleV2` and its market are
superseded.

**Want to run it?** → [Run it locally](#run-it-locally) · **Want the test proof?** → [Testing](#testing)

---

## The 8 screens

The product surface a judge can click through — every screen is real and wired
to the live backend:

| Screen | What you do there |
|---|---|
| **Markets** | Browse every World Cup fixture × 3 market types; filter by status and type; see live pool-implied odds. |
| **Market detail** | One market — the Hermes AI read, outcome buckets with odds, a stake panel (any token), a free no-stake pick, the live oracle state. |
| **My Bets** | Your open and settled positions, claimable estimates, and one-tx Claim on winning bets. |
| **Bracket** | Pick all 104 fixtures, save your bracket, score it against Hermes, and mint a Bracket NFT. |
| **Leaderboard** | Global ranking by pick accuracy — you vs every fan vs the AI — plus private leagues. |
| **AI Pundit** | Every Hermes pick with its confidence and reasoning. |
| **FanPass** | Your on-chain football-IQ score, its five-part breakdown, and the soulbound badge. |
| **Developers** | The deployed contracts, the oracle source adapters, the on-chain settlement log, and the x402 / MCP surface. |

A first-run **walkthrough**, a **demo mode** for visitors with no wallet, a
**Settings** panel and a guided wallet **connect modal** make the product
approachable from the first second.

---

## How X Cup works

The mechanism, end to end — for the technically-minded judge.

### Pari-mutuel pools

Everyone who backs an outcome stakes into a **shared pool**. When the result is
final, the winning side splits the *entire* pool pro-rata to stake:

```
your payout  =  your stake  ×  payout pool  ÷  winning-outcome pool

payout pool  =  total pool  −  protocol fee      (fee is 0% on the live market)
```

**Worked example.** Three fans back **Home** with 10 USDT each; one fan backs
**Away** with 60 USDT. The total pool is **90 USDT**, the Home pool is 30 USDT.
Home wins:

- each Home backer claims `10 × 90 ÷ 30 = 30 USDT` (a 3× return on a 10 stake);
- the Away backer's 60 USDT is distributed to the winners.

**Edge cases are handled, not guessed:**

- **No winners** — if the winning outcome had no stakers, the market enters
  *refund mode* and every staker reclaims their full stake.
- **Voided match** — an abandoned, postponed or cancelled fixture is voided by
  the operator into *refund mode*; nobody loses anything to the protocol.
- **Rounding dust** — integer division leaves a few sub-cent units; the last
  winner to claim absorbs the remainder, so the pool always fully empties.
- **Anti-spam floor** — the market supports an optional `minStake` to keep dust
  bets out of a pool.

There is no fixed-odds book: the *implied odds* are simply each outcome pool's
share of the total, and they move as fans stake.

### The market lifecycle

Each market is a small state machine on `ParimutuelMarket`:

| State | What happens |
|---|---|
| **Created** | The operator opens a market for an upcoming fixture with a close time. |
| **Open** | Anyone stakes on an outcome with USDT/USDC/OKB. Staking is permissionless. |
| **Closed** | Staking closes a short buffer **before kickoff** (not at kickoff), so a bet can't land as the match starts. |
| **Settled** | After the oracle finalizes the result, anyone can call `settle()` — it reads the *finalized* outcome and fixes the payout pool. |
| **Claimed** | Each winner calls `claim()` once for their pro-rata share; settled-but-void markets refund every staker. |

`stake`, `settle` and `claim` are all **permissionless** — no operator is needed
to release winnings — and guarded by `nonReentrant` + checks-effects-interactions.
The market is **token-agnostic**: the live instance settles in USDT, but the
contract handles any standard or non-standard ERC-20.

### Market types

Every World Cup fixture carries **three independent pari-mutuel markets**, each
its own on-chain pool and its own oracle record:

| Market | Outcomes | Resolves on |
|---|---|---|
| **Match Result (1X2)** | Home · Draw · Away | The official final result. |
| **Over / Under 2.5 goals** | Over · Under | Total goals — 3+ = Over, 2 or fewer = Under. |
| **Both Teams To Score** | Yes · No | Whether each side scored at least one goal. |

All three settle from the **same agreed final score**. Knockout fixtures are
handled with care: a knockout match cannot end in a draw, so if the feeds only
carry a level regulation score the resolver **holds** the Match Result market
for operator settlement rather than ever publishing a wrong "Draw". The full
settlement rulebook is committed on-chain as `rulesHash` on every match.

### Stake with any token

A fan should not need the exact settlement token to place a bet:

1. Pick an outcome, an amount, and a token in the stake panel.
2. If the token is **not** the settlement USDT, the backend builds an unsigned
   swap through the **OKX DEX aggregator**: the chosen token is swapped to USDT
   **in your own wallet** (no custody — every step is user-signed).
3. The bet is staked at the swap's slippage-protected minimum, so it can never
   exceed what actually landed; any positive slippage stays with you.
4. The usual `approve` + `stake` follow, and the position appears in **My Bets**.

USDT stakes skip the swap and go straight to `approve` + `stake`.

### The bonded settlement oracle

X Cup settles through **`CupOracleV3`**, a **bonded optimistic oracle**. An
*optimistic* oracle assumes a proposed result is correct unless challenged — so
X Cup makes abuse **expensive** by attaching a slashable bond:

```
registerMatch ─▶ proposeResult ─▶ ┌─ no challenge ─▶ finalizeResult
                  (+ 50 USDT bond) │  (bond returned in full — no fee)
                                   │
                                   └─ challengeResult ─▶ ArbiterMultisig ─▶ resolveChallenge
                                       (+ equal bond)      rules            (loser's bond
                                                                             slashed to winner)
```

1. **Propose.** Anyone posts the result with a **50-USDT bond** and attests the
   multi-source evidence on-chain. A **~1-hour challenge window** opens.
2. **Challenge.** Anyone who believes the result is wrong posts an **equal bond**
   inside the window; the match routes to the arbiter.
3. **Arbitrate.** `ArbiterMultisig` — an M-of-N signer panel — rules. The
   **loser's bond is slashed to the winner**: a false proposal costs the proposer
   50 USDT, an honest challenge is rewarded, and the protocol fee on the slash is
   **0%** — maximum incentive to challenge a wrong result.
4. **Finalize.** Unchallenged after the window — or once arbitrated — the result
   is final and the proposer's bond is returned in full. `ParimutuelMarket` only
   ever reads the *finalized* result.

Additional guarantees: every match commits a `rulesHash`, `sourceHash`,
`evidenceHash` and `evidenceUri` **on-chain**; a guarded `flag()` + safety
**timelock** replaces any one-key emergency override; the arbiter address is
timelock-upgradeable so the signer panel can grow without redeploying the
oracle.

### Multi-source result quorum

The oracle never settles on a single feed. The backend ingests **three
independent sports sources** — ESPN, football-data.org and TheSportsDB —
normalizes them, and a result is only eligible for settlement when **at least 2
of the 3 agree** (`evaluateSettlementQuorum`):

- two or more agree → `settlement_ready`, the resolver may propose it on-chain;
- no two agree → held in `conflicting_sources`, the market **does not settle**;
- too few sources have a result yet → `quorum_unavailable`, the market waits.

Each source contributes a signed receipt (`provider`, `url`, `observedAt`,
`payloadHash`), and the proposer attests the source count on-chain alongside the
bond — so a false multi-source claim is itself slashable.

### Hermes — the AI pundit

**Hermes** is an autonomous, Claude-backed pundit. For every fixture it reads the
context and the multi-source edge signal and issues a **conviction-weighted
pick** — Home, Draw or Away with a confidence score — or **passes** when it sees
no edge. Hermes is an *opponent to beat*, not betting advice: its picks are
scored against real results, head-to-head with every fan on the Leaderboard and
Bracket.

### Free-to-play layer

X Cup is playable end-to-end **without staking a cent** — a zero-risk on-ramp:

- **Bracket** — call the whole tournament: pick the winner of all 104 fixtures,
  save it, and score it against Hermes as results land. Mintable as an NFT.
- **Leaderboard** — a global ranking by free-pick accuracy: you vs every fan vs
  Hermes. Opens at the first settlement.
- **Leagues** — private competitions: create a league, share an invite code,
  rank your friends on their own board.
- **FanPass** — a **soulbound** reputation badge. A football-IQ score is built
  from five inputs — x402 usage, cup interactions, on-chain activity, consistency
  and oracle participation — and unlocks tiers as real activity grows.

### Open settlement layer — x402 & MCP

X Cup's settlement data is a public good other apps and AI agents can consume:

- **x402 paid endpoints.** Monetized routes (`GET /api/v1/cup/ai-edge`,
  `/cup/fixtures`, `/cup/settlement-check`, …) gated by an `X-PAYMENT` header,
  settling pay-per-call in USDT on X Layer. Spec at `GET /api/v1/x402-spec`.
- **MCP server.** Agent-readable tools at `POST /mcp` (JSON-RPC 2.0), discovery
  via `GET /mcp` — an AI agent can query fixtures, the AI edge and oracle state.
- **Direct contract reads.** Finalized results straight from
  `CupOracleV3.getMatch()`, market state from `ParimutuelMarket.getMarket()`.

---

## Architecture

```
Fans (React + OKX Wallet / OKX Connect)      Backend (Node / Express)
  browse markets · stake any token             multi-source ingestion · bonded resolver
  claim winnings · play free-to-play           market service · event indexer · AI pundit
        │                                              │  signed operator txs / chain reads
        ▼                                              ▼
X Layer mainnet (chain 196)  ◀──────────────────  Event indexer (getLogs → cache)
  CupOracleV3 · ArbiterMultisig · ParimutuelMarket · FanPassSBT
  real USDT / USDC / OKB
```

- **Ingestion** — three real sports APIs are fetched, normalized and merged into
  one fixture feed; every match carries per-source receipts and evidence hashes.
- **Bonded resolver** — an autonomous, idempotent loop drives each market through
  `register → propose (+bond) → finalize`, one independently-observable
  transaction per pass, and routes a challenged result to the arbiter.
- **Market service + indexer** — a lightweight RPC log poller mirrors on-chain
  pool state into the cache the frontend reads (the X Layer public RPC caps
  `eth_getLogs` at 100 blocks, so the poller works in 90-block windows). The API
  returns honest `not-deployed` / `awaiting` states, never fabricated data.
- **AI pundit** — the Hermes service calls the Claude API per fixture; an
  optional scheduler can run it autonomously.
- **Frontend** — a React + Vite single-page app: the eight X Cup screens plus an
  XSight copilot surface, sharing the layout chrome and a per-tab error boundary.

---

## Tech stack

- **Contracts** — Solidity `^0.8.24`, Hardhat. Pari-mutuel market, bonded oracle
  and M-of-N arbiter; `nonReentrant` + checks-effects-interactions throughout;
  USDT-safe (non-standard ERC-20) transfers.
- **Backend** — Node + Express + TypeScript, `ethers` v6. Multi-source ingestion,
  bonded quorum resolver, event indexer, x402 middleware, MCP server, deploy
  scripts.
- **Frontend** — React 18 + Vite + TypeScript + Tailwind CSS, `zustand` state,
  `motion` animations; OKX Wallet + OKX Connect.
- **AI** — the Hermes pundit runs on the Anthropic Claude API.
- **Chain** — X Layer mainnet (196); settlement in USDT, staking in USDT/USDC/OKB,
  gas in OKB.

---

## Run it locally

**Prerequisites:** Node 20+, an X Layer RPC URL, and — for write actions — a
funded X Layer wallet key. Sports-feed API keys are read from `server/.env`.

```bash
# 1. install dependencies (root = frontend + contracts, server = backend)
npm install && npm --prefix server install

# 2. configure — copy the template and fill it; never commit the real .env
cp server/.env.example server/.env

# 3. start the backend  → http://localhost:8787
npm run server:dev

# 4. start the frontend → http://localhost:5173  (proxies /api to the backend)
npm run dev
```

The app opens on **Markets**. With no wallet connected every read-only screen
still works and the demo banner explains explore mode; staking, claiming and
bracket-saving prompt a wallet connection.

---

## Testing

```bash
npm run contracts:compile     # Hardhat compile
npm run contracts:test        # 45 fork tests against a forked X Layer mainnet
npm --prefix server run typecheck
npm run build                 # frontend typecheck + production build
```

**No mocks.** Contract tests fork X Layer mainnet and run against the *real* USDT
and USDC contracts — 26 tests for `ParimutuelMarket` (stake → settle → claim,
fees, refunds, re-entrancy, dust) and 19 for `CupOracleV3` / `ArbiterMultisig`
(bonded propose / challenge / slash, the timelocked manual fallback, and a full
lifecycle against the oracle).

Mainnet deploy + verification are **user-gated** steps:
`npm --prefix server run deploy:cup-oracle-v3`, then `deploy:parimutuel`.

---

## Project structure

```
contracts/      CupOracleV3 · ArbiterMultisig · ParimutuelMarket · FanPassSBT · BracketNFT
  test/         fork-based test suites (real X Layer mainnet, no mocks)
server/         Express API — ingestion, bonded resolver, market service + indexer,
                AI pundit, x402 + MCP; deploy scripts under server/scripts/
src/            React + Vite frontend — 8 X Cup screens + XSight copilot surface
```

---

## Roadmap

X Cup is feature-complete and live on mainnet for the hackathon. What is shipped,
and what is next:

- ✅ Bonded optimistic oracle + M-of-N arbiter — live on X Layer
- ✅ Pari-mutuel market, three market types per fixture — live
- ✅ Multi-source quorum resolver + autonomous AI pundit
- ✅ Free-to-play layer — bracket, leaderboard, leagues, FanPass SBT
- ✅ x402 paid endpoints + MCP server for agents
- ✅ Onboarding, demo mode, settings and guided wallet connect
- ✅ All five contracts verified on the OKX X Layer explorer
- ✅ `BracketNFT` deployed to mainnet (`0x532DdCCB…`)
- 🔜 Arbiter raised to a 2-of-3 signer panel via the timelocked `proposeArbiter` / `commitArbiter` flow
- 🔭 Optional fourth on-chain result source added to the quorum

---

## Principles

- **No mocks** — every layer uses real components; un-deployed pieces surface
  honest `not deployed` / `awaiting` states rather than fabricated data.
- **Mainnet-only** — X Layer mainnet (196); de-risked via fork tests and small
  first runs, not a separate testnet code path.
- **Money is un-riggable** — payouts are pure on-chain math; the result is
  defended by slashable bonds.
- **Autonomous on-chain writes are double-gated** and default-off.

## License

[MIT](LICENSE).

<div align="center">

---

**X Cup** — built for the OKX X Layer × X Cup hackathon.
Pari-mutuel World Cup markets · a bonded oracle · an AI pundit · live on chain 196.

</div>
