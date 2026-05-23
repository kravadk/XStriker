/**
 * CupOracleV3 + ArbiterMultisig — real-chain test suite (forked X Layer mainnet, 196).
 *
 * NO MOCKS. The bond token is the REAL X Layer USDT (0x1E4a5963…); every propose,
 * challenge, finalize and slash moves real USDT through the token's real bytecode.
 * CupOracleV3, ArbiterMultisig and ParimutuelMarket are freshly deployed on the fork —
 * V3 is not on mainnet yet (deploy is the user-gated Phase 6 step).
 *
 * Test accounts are funded by writing the real token's `balanceOf` storage slot on the
 * fork (storage-slot `deal` — the slot is discovered by probing, not hard-coded).
 *
 * Run: `npm run contracts:test` (sets FORK=1; needs X_LAYER_RPC_URL or the public RPC).
 * If the process is not forked, the whole suite skips rather than failing.
 */
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// --- real X Layer mainnet addresses (chain 196) ---
const USDT = "0x1E4a5963aBFD975d8c9021ce480b42188849D41d"; // real bond token

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function approve(address,uint256) returns (bool)",
];

// CupOracleV3.Outcome / SettlementState
const HOME = 1, DRAW = 2, AWAY = 3;
const ST_OPEN = 0, ST_PROPOSED = 1, ST_CHALLENGED = 2, ST_FINALIZED = 3;
const UNIT = 1_000_000n; // USDT is 6-decimal on X Layer
const amt = (n) => BigInt(n) * UNIT;
const BOND = amt(50); // 50 USDT — the confirmed hackathon bond size
const CHALLENGE_WINDOW = 3600;
const SAFETY_PERIOD = 3600;
const coder = ethers.AbiCoder.defaultAbiCoder();

const randomId = () => ethers.hexlify(ethers.randomBytes(32));
const evid = (id) => ethers.keccak256(ethers.toUtf8Bytes(`xsight-v3-evidence-${id}`));

async function isForked() {
  return (await ethers.provider.getCode(USDT)) !== "0x";
}

async function warp(seconds) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine", []);
}

// --- storage-slot `deal`: locate the ERC20 balanceOf storage slot, then write it. ---
const slotCache = {};
async function balanceSlot(tokenAddr) {
  if (slotCache[tokenAddr] !== undefined) return slotCache[tokenAddr];
  const erc20 = new ethers.Contract(tokenAddr, ERC20_ABI, ethers.provider);
  const probe = "0x0000000000000000000000000000000000001337";
  const sentinel = 7_777_777n;
  for (let s = 0n; s < 40n; s++) {
    const key = ethers.keccak256(coder.encode(["address", "uint256"], [probe, s]));
    const prev = await ethers.provider.getStorage(tokenAddr, key);
    await network.provider.send("hardhat_setStorageAt", [tokenAddr, key, ethers.toBeHex(sentinel, 32)]);
    let hit = false;
    try {
      hit = (await erc20.balanceOf(probe)) === sentinel;
    } catch {
      hit = false;
    }
    await network.provider.send("hardhat_setStorageAt", [tokenAddr, key, prev]);
    if (hit) {
      slotCache[tokenAddr] = s;
      return s;
    }
  }
  throw new Error(`balanceOf storage slot not found for ${tokenAddr}`);
}

async function deal(tokenAddr, account, amount) {
  const s = await balanceSlot(tokenAddr);
  const key = ethers.keccak256(coder.encode(["address", "uint256"], [account, s]));
  await network.provider.send("hardhat_setStorageAt", [tokenAddr, key, ethers.toBeHex(amount, 32)]);
}

// deal `amount` USDT to `signer` and approve `spender` to pull it.
async function fundAndApprove(signer, spender, amount) {
  await deal(USDT, signer.address, amount);
  const erc20 = new ethers.Contract(USDT, ERC20_ABI, signer);
  await (await erc20.approve(spender, amount)).wait();
}

const usdt = () => new ethers.Contract(USDT, ERC20_ABI, ethers.provider);

/**
 * Deploy the full bonded-oracle stack the way Phase 6 will on mainnet:
 *   1. ArbiterMultisig(signers, threshold)  — deployed first
 *   2. CupOracleV3(..., arbiter = multisig) — needs the arbiter address
 *   3. multisig.setOracle(oracle)           — closes the wiring
 */
async function deployStack() {
  const [owner, treasury, , , , , , sigA, sigB, sigC] = await ethers.getSigners();

  const Multisig = await ethers.getContractFactory("ArbiterMultisig");
  const multisig = await Multisig.deploy([sigA.address, sigB.address, sigC.address], 2);
  await multisig.waitForDeployment();

  const Oracle = await ethers.getContractFactory("CupOracleV3");
  const oracle = await Oracle.deploy(
    USDT,
    BOND,
    CHALLENGE_WINDOW,
    0, // protocolFeeBps — 0%, whole loser bond to the winner
    SAFETY_PERIOD,
    treasury.address,
    await multisig.getAddress(),
  );
  await oracle.waitForDeployment();
  await (await multisig.setOracle(await oracle.getAddress())).wait();

  return { oracle, multisig, owner, treasury, signers: [sigA, sigB, sigC] };
}

async function register(oracle, owner) {
  const matchId = randomId();
  const h = evid(matchId);
  await (await oracle.connect(owner).registerMatch(matchId, h, h, h, "ipfs://xsight/v3-fork-test")).wait();
  return { matchId, h };
}

// register + bonded propose by `proposer` (funded with one bond).
async function registerAndPropose(oracle, owner, proposer, outcome) {
  const { matchId, h } = await register(oracle, owner);
  await fundAndApprove(proposer, await oracle.getAddress(), BOND);
  await (await oracle.connect(proposer).proposeResult(matchId, outcome, h, h, "ipfs://xsight/v3-fork-test", 3)).wait();
  return { matchId, h };
}

describe("CupOracleV3 — bonded optimistic oracle (forked X Layer mainnet)", function () {
  this.timeout(240000);

  before(async function () {
    if (!(await isForked())) {
      // eslint-disable-next-line no-console
      console.warn("    [skip] not forked — run with FORK=1 (npm run contracts:test)");
      this.skip();
    }
    // X Layer (196) is not in EDR's hardfork registry; mine one local block so all
    // subsequent execution runs on locally-produced blocks.
    await network.provider.send("hardhat_mine", ["0x1"]);
  });

  it("uses the real USDT contract as the bond token", async () => {
    const { oracle } = await deployStack();
    expect(await oracle.bondToken()).to.equal(USDT);
    expect(await oracle.bondAmount()).to.equal(BOND);
    expect(await usdt().decimals()).to.equal(6n);
  });

  it("registerMatch is onlyOwner", async () => {
    const { oracle, signers } = await deployStack();
    const h = evid("x");
    await expect(
      oracle.connect(signers[0]).registerMatch(randomId(), h, h, h, "ipfs://x"),
    ).to.be.revertedWithCustomError(oracle, "OnlyOwner");
  });

  it("proposeResult pulls the bond and moves the match to Proposed", async () => {
    const { oracle, owner, signers } = await deployStack();
    const proposer = signers[0];
    const { matchId } = await registerAndPropose(oracle, owner, proposer, HOME);

    const rec = await oracle.getMatch(matchId);
    expect(rec.state).to.equal(ST_PROPOSED);
    expect(rec.proposedOutcome).to.equal(HOME);
    expect(rec.proposer).to.equal(proposer.address);
    const bond = await oracle.getBond(matchId);
    expect(bond.proposerBond).to.equal(BOND);
    // the real USDT actually moved into the oracle
    expect(await usdt().balanceOf(await oracle.getAddress())).to.equal(BOND);
  });

  it("proposeResult reverts without an approved bond", async () => {
    const { oracle, owner, signers } = await deployStack();
    const { matchId, h } = await register(oracle, owner);
    // signers[0] has no USDT and no approval
    await expect(
      oracle.connect(signers[0]).proposeResult(matchId, HOME, h, h, "ipfs://x", 3),
    ).to.be.revertedWithCustomError(oracle, "BondTransferFailed");
  });

  it("proposeResult reverts when fewer than 2 sources are attested", async () => {
    const { oracle, owner, signers } = await deployStack();
    const { matchId, h } = await register(oracle, owner);
    await fundAndApprove(signers[0], await oracle.getAddress(), BOND);
    await expect(
      oracle.connect(signers[0]).proposeResult(matchId, HOME, h, h, "ipfs://x", 1),
    ).to.be.revertedWithCustomError(oracle, "EvidenceRequired");
  });

  it("finalizeResult before the window elapses reverts", async () => {
    const { oracle, owner, signers } = await deployStack();
    const { matchId } = await registerAndPropose(oracle, owner, signers[0], HOME);
    await expect(oracle.finalizeResult(matchId)).to.be.revertedWithCustomError(oracle, "ChallengeWindowOpen");
  });

  it("an unchallenged result finalizes and returns the proposer bond in full", async () => {
    const { oracle, owner, signers } = await deployStack();
    const proposer = signers[0];
    const { matchId } = await registerAndPropose(oracle, owner, proposer, AWAY);

    await warp(CHALLENGE_WINDOW + 30);
    await (await oracle.finalizeResult(matchId)).wait();

    const rec = await oracle.getMatch(matchId);
    expect(rec.state).to.equal(ST_FINALIZED);
    expect(rec.finalOutcome).to.equal(AWAY);
    // bond fully returned — no fee on an honest, uncontested proposal
    expect(await usdt().balanceOf(proposer.address)).to.equal(BOND);
    expect(await usdt().balanceOf(await oracle.getAddress())).to.equal(0n);
  });

  it("challengeResult pulls an equal bond and opens an arbiter dispute", async () => {
    const { oracle, multisig, owner, signers } = await deployStack();
    const proposer = signers[0];
    const challenger = signers[1];
    const { matchId } = await registerAndPropose(oracle, owner, proposer, HOME);

    await fundAndApprove(challenger, await oracle.getAddress(), BOND);
    await (await oracle.connect(challenger).challengeResult(matchId, "ipfs://reason")).wait();

    const rec = await oracle.getMatch(matchId);
    expect(rec.state).to.equal(ST_CHALLENGED);
    expect(rec.challenger).to.equal(challenger.address);
    expect(await usdt().balanceOf(await oracle.getAddress())).to.equal(BOND * 2n);
    // the arbiter received the dispute
    const dispute = await multisig.getDispute(1);
    expect(dispute.matchId).to.equal(matchId);
    expect(dispute.proposedOutcome).to.equal(HOME);
  });

  it("challengeResult after the window closes reverts", async () => {
    const { oracle, owner, signers } = await deployStack();
    const { matchId } = await registerAndPropose(oracle, owner, signers[0], HOME);
    await fundAndApprove(signers[1], await oracle.getAddress(), BOND);
    await warp(CHALLENGE_WINDOW + 30);
    await expect(
      oracle.connect(signers[1]).challengeResult(matchId, "ipfs://late"),
    ).to.be.revertedWithCustomError(oracle, "ChallengeWindowClosed");
  });

  it("arbiter rules for the proposer — proposer reclaims both bonds, result stands", async () => {
    const { oracle, multisig, owner, signers } = await deployStack();
    const [sigA, sigB] = signers;
    const proposer = signers[0]; // sigA also proposes — fine, distinct roles tracked by address
    const challenger = owner; // owner acts as challenger here
    const { matchId } = await registerAndPropose(oracle, owner, proposer, HOME);

    await fundAndApprove(challenger, await oracle.getAddress(), BOND);
    await (await oracle.connect(challenger).challengeResult(matchId, "ipfs://reason")).wait();

    const proposerBefore = await usdt().balanceOf(proposer.address);
    // 2-of-3 signers vote HOME (== proposed) -> proposer wins
    await (await multisig.connect(sigA).castVote(1, HOME)).wait();
    await (await multisig.connect(sigB).castVote(1, HOME)).wait();

    const rec = await oracle.getMatch(matchId);
    expect(rec.state).to.equal(ST_FINALIZED);
    expect(rec.finalOutcome).to.equal(HOME);
    // proposer gets own bond + challenger bond (0% protocol fee)
    expect((await usdt().balanceOf(proposer.address)) - proposerBefore).to.equal(BOND * 2n);
    expect(await usdt().balanceOf(await oracle.getAddress())).to.equal(0n);
  });

  it("arbiter rules against the proposer — challenger takes both bonds, ruling stands", async () => {
    const { oracle, multisig, owner, signers } = await deployStack();
    const [sigA, sigB] = signers;
    const proposer = signers[0];
    const challenger = signers[1];
    const { matchId } = await registerAndPropose(oracle, owner, proposer, HOME);

    await fundAndApprove(challenger, await oracle.getAddress(), BOND);
    await (await oracle.connect(challenger).challengeResult(matchId, "ipfs://reason")).wait();

    const challengerBefore = await usdt().balanceOf(challenger.address);
    // 2-of-3 signers rule AWAY (!= proposed HOME) -> challenger wins, AWAY is final
    await (await multisig.connect(sigA).castVote(1, AWAY)).wait();
    await (await multisig.connect(sigB).castVote(1, AWAY)).wait();

    const rec = await oracle.getMatch(matchId);
    expect(rec.state).to.equal(ST_FINALIZED);
    expect(rec.finalOutcome).to.equal(AWAY);
    expect((await usdt().balanceOf(challenger.address)) - challengerBefore).to.equal(BOND * 2n);
  });

  it("resolveChallenge is callable only by the arbiter", async () => {
    const { oracle, owner, signers } = await deployStack();
    const { matchId } = await registerAndPropose(oracle, owner, signers[0], HOME);
    await fundAndApprove(signers[1], await oracle.getAddress(), BOND);
    await (await oracle.connect(signers[1]).challengeResult(matchId, "ipfs://r")).wait();
    await expect(oracle.connect(owner).resolveChallenge(matchId, HOME)).to.be.revertedWithCustomError(
      oracle,
      "OnlyArbiter",
    );
  });

  it("flag + resolveManually is timelocked and returns posted bonds", async () => {
    const { oracle, owner, signers } = await deployStack();
    const proposer = signers[0];
    const { matchId } = await registerAndPropose(oracle, owner, proposer, HOME);

    await (await oracle.connect(owner).flag(matchId)).wait();
    // before the safety period elapses, manual resolution is blocked
    await expect(oracle.connect(owner).resolveManually(matchId, AWAY)).to.be.revertedWithCustomError(
      oracle,
      "TimelockPending",
    );

    await warp(SAFETY_PERIOD + 30);
    await (await oracle.connect(owner).resolveManually(matchId, AWAY)).wait();

    const rec = await oracle.getMatch(matchId);
    expect(rec.state).to.equal(ST_FINALIZED);
    expect(rec.finalOutcome).to.equal(AWAY);
    // manual resolution is not a dispute outcome — the proposer bond is returned, not slashed
    expect(await usdt().balanceOf(proposer.address)).to.equal(BOND);
  });

  it("the arbiter can only be changed through the timelock", async () => {
    const { oracle, owner, signers } = await deployStack();
    await (await oracle.connect(owner).proposeArbiter(signers[2].address)).wait();
    await expect(oracle.connect(owner).commitArbiter()).to.be.revertedWithCustomError(oracle, "TimelockPending");
    await warp(2 * 24 * 3600 + 30);
    await (await oracle.connect(owner).commitArbiter()).wait();
    expect(await oracle.arbiter()).to.equal(signers[2].address);
  });
});

describe("ArbiterMultisig — M-of-N arbiter (forked X Layer mainnet)", function () {
  this.timeout(240000);

  before(async function () {
    if (!(await isForked())) this.skip();
    await network.provider.send("hardhat_mine", ["0x1"]);
  });

  it("requestRuling is callable only by the wired oracle", async () => {
    const { multisig, signers } = await deployStack();
    await expect(
      multisig.connect(signers[0]).requestRuling(randomId(), HOME),
    ).to.be.revertedWithCustomError(multisig, "OnlyOracle");
  });

  it("setOracle cannot be called twice", async () => {
    const { multisig, owner } = await deployStack();
    await expect(multisig.connect(owner).setOracle(owner.address)).to.be.revertedWithCustomError(
      multisig,
      "OracleAlreadySet",
    );
  });

  it("a non-signer cannot cast a vote", async () => {
    const { oracle, multisig, owner, signers } = await deployStack();
    const { matchId } = await registerAndPropose(oracle, owner, signers[0], HOME);
    await fundAndApprove(signers[1], await oracle.getAddress(), BOND);
    await (await oracle.connect(signers[1]).challengeResult(matchId, "ipfs://r")).wait();
    await expect(multisig.connect(owner).castVote(1, HOME)).to.be.revertedWithCustomError(
      multisig,
      "OnlySigner",
    );
  });

  it("a single signer's vote does not reach the 2-of-3 threshold", async () => {
    const { oracle, multisig, owner, signers } = await deployStack();
    const { matchId } = await registerAndPropose(oracle, owner, signers[0], HOME);
    await fundAndApprove(signers[1], await oracle.getAddress(), BOND);
    await (await oracle.connect(signers[1]).challengeResult(matchId, "ipfs://r")).wait();
    await (await multisig.connect(signers[0]).castVote(1, AWAY)).wait();
    // one vote only — match stays Challenged
    expect((await oracle.getMatch(matchId)).state).to.equal(ST_CHALLENGED);
  });
});

describe("ParimutuelMarket settles against CupOracleV3 unchanged (forked X Layer mainnet)", function () {
  this.timeout(240000);

  before(async function () {
    if (!(await isForked())) this.skip();
    await network.provider.send("hardhat_mine", ["0x1"]);
  });

  it("a full stake -> settle -> claim lifecycle resolves against V3's getMatch", async () => {
    const { oracle, owner, treasury, signers } = await deployStack();
    const [operator, alice, bob] = [signers[0], signers[1], signers[2]];

    // market points at the V3 oracle — same ICupOracle interface, no logical change
    const Market = await ethers.getContractFactory("ParimutuelMarket");
    const market = await Market.deploy(USDT, await oracle.getAddress(), operator.address, treasury.address, 0, 0);
    await market.waitForDeployment();

    // proposer = owner (funded for one bond); HOME wins
    await fundAndApprove(owner, await oracle.getAddress(), BOND);
    const { matchId, h } = await register(oracle, owner);
    await (await oracle.connect(owner).proposeResult(matchId, HOME, h, h, "ipfs://x", 3)).wait();

    const marketId = randomId();
    const close = BigInt((await ethers.provider.getBlock("latest")).timestamp) + 3600n;
    await (await market.connect(operator).createMarket(marketId, matchId, close)).wait();

    await fundAndApprove(alice, await market.getAddress(), amt(30)); // winner
    await fundAndApprove(bob, await market.getAddress(), amt(10)); // loser
    await (await market.connect(alice).stake(marketId, HOME, amt(30))).wait();
    await (await market.connect(bob).stake(marketId, AWAY, amt(10))).wait();

    await warp(CHALLENGE_WINDOW + 30);
    await (await oracle.finalizeResult(matchId)).wait();
    await (await market.settle(marketId)).wait();

    const aliceBefore = await usdt().balanceOf(alice.address);
    await (await market.connect(alice).claim(marketId)).wait();
    // sole winner takes the whole 40-USDT pool
    expect((await usdt().balanceOf(alice.address)) - aliceBefore).to.equal(amt(40));
    await expect(market.connect(bob).claim(marketId)).to.be.revertedWith("nothing to claim");
  });
});
