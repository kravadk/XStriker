/**
 * ParimutuelMarket — real-chain test suite (forked X Layer mainnet, chain 196).
 *
 * NO MOCKS. Every dependency is the real deployed thing:
 *   - CupOracleV2 at 0xE4dFef03… — the live settlement oracle, driven by impersonating
 *     its real owner (registerMatch → proposeResult → finalizeResult).
 *   - USDT (0x1E4a5963…) and USDC (0x74b7F163…) — the real X Layer stablecoins. The full
 *     stake → settle → claim lifecycle is exercised against both.
 *
 * Test accounts are funded by writing the real token's `balanceOf` storage slot on the
 * fork (storage-slot `deal` — the slot is discovered by probing, not hard-coded), then
 * every transfer runs through the token's real bytecode.
 *
 * The single crafted contract is `contracts/test/exploit/ReentrancyAttacker.sol`, an
 * exploit harness — see that file's header for why a re-entrancy test cannot use a real
 * token.
 *
 * Run: `npm run contracts:test` (sets FORK=1; needs X_LAYER_RPC_URL or the public RPC).
 * If the process is not forked, the whole suite skips rather than failing.
 */
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// --- real X Layer mainnet addresses (chain 196) ---
const ORACLE = "0xE4dFef03E107225f2239CFfF955a378A9a8158Be"; // deployed CupOracleV2
const TOKENS = {
  USDT: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
  USDC: "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
};

const ORACLE_ABI = [
  "function owner() view returns (address)",
  "function challengeWindow() view returns (uint64)",
  "function registerMatch(bytes32,bytes32,bytes32,bytes32,string)",
  "function proposeResult(bytes32,uint8,bytes32,string,uint8)",
  "function finalizeResult(bytes32)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function approve(address,uint256) returns (bool)",
];

const HOME = 1, DRAW = 2, AWAY = 3;
const UNIT = 1_000_000n; // USDT and USDC are both 6-decimal on X Layer
const amt = (n) => BigInt(n) * UNIT;
const coder = ethers.AbiCoder.defaultAbiCoder();

let challengeWindow; // read once from the real oracle
let WARP;            // seconds to advance past both market close and the challenge window

async function isForked() {
  return (await ethers.provider.getCode(ORACLE)) !== "0x";
}

async function nowTs() {
  return BigInt((await ethers.provider.getBlock("latest")).timestamp);
}

async function warp(seconds) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine", []);
}

async function impersonate(addr) {
  await network.provider.send("hardhat_impersonateAccount", [addr]);
  await network.provider.send("hardhat_setBalance", [addr, "0x3635c9adc5dea00000"]); // 1000 OKB
  return ethers.getSigner(addr);
}

// --- storage-slot `deal`: locate the ERC20 `balanceOf` storage slot, then write it. ---
const slotCache = {};
async function balanceSlot(tokenAddr) {
  if (slotCache[tokenAddr] !== undefined) return slotCache[tokenAddr];
  const erc20 = new ethers.Contract(tokenAddr, ERC20_ABI, ethers.provider);
  const probe = "0x0000000000000000000000000000000000001337";
  const sentinel = 7_777_777n;
  const slots = [];
  for (let i = 0n; i < 40n; i++) slots.push(i); // plain Solidity `mapping(address=>uint256)`
  // OpenZeppelin ERC-7201 namespaced ERC20 storage (balances mapping is the first field).
  const ozBase =
    BigInt(
      ethers.keccak256(
        coder.encode(["uint256"], [
          BigInt(ethers.keccak256(ethers.toUtf8Bytes("openzeppelin.storage.ERC20"))) - 1n,
        ]),
      ),
    ) & ~0xffn;
  slots.push(ozBase);
  for (const s of slots) {
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

// --- real CupOracleV2 helpers (driven by the impersonated real owner) ---
const randomId = () => ethers.hexlify(ethers.randomBytes(32));

async function registerAndPropose(ownerSigner, outcome) {
  const oracle = new ethers.Contract(ORACLE, ORACLE_ABI, ownerSigner);
  const matchId = randomId();
  const h = ethers.keccak256(ethers.toUtf8Bytes(`xsight-fork-evidence-${matchId}`));
  await (await oracle.registerMatch(matchId, h, h, h, "ipfs://xsight/fork-test")).wait();
  // proposeResult is permissionless; sourceCount must be >= 2 (quorum gate).
  await (await oracle.proposeResult(matchId, outcome, h, "ipfs://xsight/fork-test", 3)).wait();
  return matchId;
}

async function finalizeOracle(ownerSigner, matchId) {
  const oracle = new ethers.Contract(ORACLE, ORACLE_ABI, ownerSigner);
  await (await oracle.finalizeResult(matchId)).wait();
}

async function deployMarket(tokenAddr, feeBps, operator, treasury, minStake = 0n) {
  const Factory = await ethers.getContractFactory("ParimutuelMarket");
  const market = await Factory.deploy(tokenAddr, ORACLE, operator.address, treasury.address, feeBps, minStake);
  await market.waitForDeployment();
  return market;
}

async function openMarket(tokenAddr, feeBps, matchId) {
  const [deployer, operator, treasury, alice, bob, carol] = await ethers.getSigners();
  const market = await deployMarket(tokenAddr, feeBps, operator, treasury);
  const marketId = randomId();
  const mid = matchId || randomId();
  const closeTime = (await nowTs()) + 3600n;
  await (await market.connect(operator).createMarket(marketId, mid, closeTime)).wait();
  return { market, marketId, matchId: mid, closeTime, deployer, operator, treasury, alice, bob, carol };
}

// deal `amount` of the real token to `signer` and approve the market to pull it.
async function fund(tokenAddr, market, signer, amount) {
  await deal(tokenAddr, signer.address, amount);
  const erc20 = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
  await (await erc20.approve(await market.getAddress(), amount)).wait();
}

const tokenAt = (tokenAddr) => new ethers.Contract(tokenAddr, ERC20_ABI, ethers.provider);

describe("ParimutuelMarket — forked X Layer mainnet", function () {
  this.timeout(240000);

  let oracleOwner;

  before(async function () {
    if (!(await isForked())) {
      // eslint-disable-next-line no-console
      console.warn("    [skip] not forked — run with FORK=1 (npm run contracts:test) to exercise the real chain");
      this.skip();
    }
    // X Layer (chain 196) is not in EDR's hardfork registry, so EVM execution *at* the
    // historical fork block fails. Mining one local block moves all subsequent execution
    // onto locally-produced blocks, which use the network's configured hardfork.
    await network.provider.send("hardhat_mine", ["0x1"]);
    const oracle = new ethers.Contract(ORACLE, ORACLE_ABI, ethers.provider);
    challengeWindow = Number(await oracle.challengeWindow());
    WARP = Math.max(3601, challengeWindow + 30);
    oracleOwner = await impersonate(await oracle.owner());
  });

  for (const [sym, tokenAddr] of Object.entries(TOKENS)) {
    describe(`settled in real ${sym}`, function () {
      it(`uses the real ${sym} contract (6-decimal ERC20 on the fork)`, async () => {
        const tk = tokenAt(tokenAddr);
        expect(await tk.symbol()).to.equal(sym);
        expect(await tk.decimals()).to.equal(6n);
      });

      it("createMarket: only the operator can open a market", async () => {
        const [deployer, operator, treasury, alice] = await ethers.getSigners();
        const market = await deployMarket(tokenAddr, 0, operator, treasury);
        const close = (await nowTs()) + 3600n;
        await expect(
          market.connect(alice).createMarket(randomId(), randomId(), close),
        ).to.be.revertedWith("not operator");
      });

      it("createMarket: reverts on a past closeTime and on a duplicate id", async () => {
        const [deployer, operator, treasury] = await ethers.getSigners();
        const market = await deployMarket(tokenAddr, 0, operator, treasury);
        const past = (await nowTs()) - 1n;
        await expect(
          market.connect(operator).createMarket(randomId(), randomId(), past),
        ).to.be.revertedWith("close in past");
        const marketId = randomId();
        const close = (await nowTs()) + 3600n;
        await market.connect(operator).createMarket(marketId, randomId(), close);
        await expect(
          market.connect(operator).createMarket(marketId, randomId(), close),
        ).to.be.revertedWith("market exists");
      });

      it("stake: pulls real tokens and updates the pools", async () => {
        const { market, marketId, alice } = await openMarket(tokenAddr, 0);
        await fund(tokenAddr, market, alice, amt(25));
        await market.connect(alice).stake(marketId, HOME, amt(25));

        const m = await market.getMarket(marketId);
        expect(m.totalPool).to.equal(amt(25));
        expect(m.poolHome).to.equal(amt(25));
        const s = await market.stakeOf(marketId, alice.address);
        expect(s.home).to.equal(amt(25));
        // the real token actually moved into the contract
        expect(await tokenAt(tokenAddr).balanceOf(await market.getAddress())).to.equal(amt(25));
      });

      it("stake: reverts on bad outcome, zero amount, and after close", async () => {
        const { market, marketId, alice } = await openMarket(tokenAddr, 0);
        await expect(market.connect(alice).stake(marketId, 0, amt(5))).to.be.revertedWith("bad outcome");
        await expect(market.connect(alice).stake(marketId, HOME, 0)).to.be.revertedWith("zero amount");
        await warp(3601);
        await expect(market.connect(alice).stake(marketId, HOME, amt(5))).to.be.revertedWith("closed");
      });

      it("settle: reverts before close and while the real oracle is not finalized", async () => {
        // before close
        const a = await openMarket(tokenAddr, 0);
        await expect(a.market.settle(a.marketId)).to.be.revertedWith("not closed");

        // closed, but the oracle has only a proposed (not finalized) result
        const matchId = await registerAndPropose(oracleOwner, HOME);
        const b = await openMarket(tokenAddr, 0, matchId);
        await warp(WARP);
        await expect(b.market.settle(b.marketId)).to.be.revertedWith("oracle not finalized");
      });

      it("claim: winners split the pool pro-rata, the loser gets nothing", async () => {
        const matchId = await registerAndPropose(oracleOwner, HOME);
        const { market, marketId, alice, bob, carol } = await openMarket(tokenAddr, 0, matchId);
        await fund(tokenAddr, market, alice, amt(30)); // winner
        await fund(tokenAddr, market, bob, amt(10));   // winner
        await fund(tokenAddr, market, carol, amt(60)); // loser -> total pool 100
        await market.connect(alice).stake(marketId, HOME, amt(30));
        await market.connect(bob).stake(marketId, HOME, amt(10));
        await market.connect(carol).stake(marketId, AWAY, amt(60));

        await warp(WARP);
        await finalizeOracle(oracleOwner, matchId);
        await market.settle(marketId);

        const tk = tokenAt(tokenAddr);
        await market.connect(alice).claim(marketId);
        expect(await tk.balanceOf(alice.address)).to.equal(amt(75)); // 30/40 * 100
        await market.connect(bob).claim(marketId);
        expect(await tk.balanceOf(bob.address)).to.equal(amt(25));   // 10/40 * 100
        await expect(market.connect(carol).claim(marketId)).to.be.revertedWith("nothing to claim");
      });

      it("claim: a result nobody backed refunds every staker", async () => {
        const matchId = await registerAndPropose(oracleOwner, AWAY);
        const { market, marketId, alice, bob } = await openMarket(tokenAddr, 0, matchId);
        await fund(tokenAddr, market, alice, amt(20));
        await fund(tokenAddr, market, bob, amt(20));
        await market.connect(alice).stake(marketId, HOME, amt(20));
        await market.connect(bob).stake(marketId, DRAW, amt(20)); // nobody staked AWAY

        await warp(WARP);
        await finalizeOracle(oracleOwner, matchId);
        await market.settle(marketId);

        const tk = tokenAt(tokenAddr);
        await market.connect(alice).claim(marketId);
        await market.connect(bob).claim(marketId);
        expect(await tk.balanceOf(alice.address)).to.equal(amt(20));
        expect(await tk.balanceOf(bob.address)).to.equal(amt(20));
      });

      it("voidMarket: the operator can void an abandoned market into refund mode", async () => {
        const { market, marketId, operator, alice } = await openMarket(tokenAddr, 0);
        await fund(tokenAddr, market, alice, amt(40));
        await market.connect(alice).stake(marketId, HOME, amt(40));
        await market.connect(operator).voidMarket(marketId);
        await market.connect(alice).claim(marketId);
        expect(await tokenAt(tokenAddr).balanceOf(alice.address)).to.equal(amt(40));
      });

      it("claim: a second claim by the same staker reverts", async () => {
        const matchId = await registerAndPropose(oracleOwner, HOME);
        const { market, marketId, alice } = await openMarket(tokenAddr, 0, matchId);
        await fund(tokenAddr, market, alice, amt(10));
        await market.connect(alice).stake(marketId, HOME, amt(10));
        await warp(WARP);
        await finalizeOracle(oracleOwner, matchId);
        await market.settle(marketId);
        await market.connect(alice).claim(marketId);
        await expect(market.connect(alice).claim(marketId)).to.be.revertedWith("claimed");
      });

      it("fee: feeBps routes the protocol fee to the treasury", async () => {
        const matchId = await registerAndPropose(oracleOwner, HOME);
        const { market, marketId, treasury, alice } = await openMarket(tokenAddr, 200, matchId); // 2%
        await fund(tokenAddr, market, alice, amt(100));
        await market.connect(alice).stake(marketId, HOME, amt(100));

        await warp(WARP);
        await finalizeOracle(oracleOwner, matchId);
        const tk = tokenAt(tokenAddr);
        const treasuryBefore = await tk.balanceOf(treasury.address);
        await market.settle(marketId);
        expect((await tk.balanceOf(treasury.address)) - treasuryBefore).to.equal(amt(2));

        await market.connect(alice).claim(marketId);
        expect(await tk.balanceOf(alice.address)).to.equal(amt(98)); // payoutPool, sole winner
      });
    });
  }

  describe("re-entrancy (exploit harness)", function () {
    it("a malicious settlement token cannot re-enter claim()", async () => {
      const [deployer, operator, treasury, alice] = await ethers.getSigners();
      const attacker = await (await ethers.getContractFactory("ReentrancyAttacker")).deploy();
      await attacker.waitForDeployment();

      const matchId = await registerAndPropose(oracleOwner, HOME);
      const market = await deployMarket(await attacker.getAddress(), 0, operator, treasury);
      const marketId = randomId();
      const close = (await nowTs()) + 3600n;
      await market.connect(operator).createMarket(marketId, matchId, close);

      await attacker.mint(alice.address, amt(50));
      await attacker.connect(alice).approve(await market.getAddress(), amt(50));
      await market.connect(alice).stake(marketId, HOME, amt(50));

      await warp(WARP);
      await finalizeOracle(oracleOwner, matchId);
      await market.settle(marketId);

      // arm the exploit: claim()'s token payout will re-enter claim().
      await attacker.arm(await market.getAddress(), marketId);
      // nonReentrant + the CEI `claimed` flag block the re-entry; the malicious transfer
      // then fails, so the whole outer claim reverts and no double payout escapes.
      await expect(market.connect(alice).claim(marketId)).to.be.reverted;
    });
  });

  describe("Phase 5 — minStake + dust absorption (real USDT)", function () {
    const TKN = TOKENS.USDT;

    it("minStake: stakes below the floor revert, at/above succeed", async () => {
      const [, operator, treasury, alice] = await ethers.getSigners();
      const market = await deployMarket(TKN, 0, operator, treasury, amt(5));
      expect(await market.minStake()).to.equal(amt(5));
      const marketId = randomId();
      await market.connect(operator).createMarket(marketId, randomId(), (await nowTs()) + 3600n);
      await fund(TKN, market, alice, amt(20));
      await expect(market.connect(alice).stake(marketId, HOME, amt(3))).to.be.revertedWith("below min stake");
      await market.connect(alice).stake(marketId, HOME, amt(5)); // exactly the floor
      expect((await market.getMarket(marketId)).poolHome).to.equal(amt(5));
    });

    it("setMinStake: owner-only, takes effect on the next stake", async () => {
      const [deployer, operator, treasury, alice] = await ethers.getSigners();
      const market = await deployMarket(TKN, 0, operator, treasury, 0n);
      await expect(market.connect(alice).setMinStake(amt(10))).to.be.revertedWith("not owner");
      await market.connect(deployer).setMinStake(amt(10));
      expect(await market.minStake()).to.equal(amt(10));
      const marketId = randomId();
      await market.connect(operator).createMarket(marketId, randomId(), (await nowTs()) + 3600n);
      await fund(TKN, market, alice, amt(10));
      await expect(market.connect(alice).stake(marketId, HOME, amt(9))).to.be.revertedWith("below min stake");
    });

    it("dust: the last winner to claim absorbs the rounding remainder, nothing is stranded", async () => {
      const signers = await ethers.getSigners();
      const [, operator, treasury] = signers;
      const [w1, w2, w3, loser] = [signers[3], signers[4], signers[5], signers[6]];

      const matchId = await registerAndPropose(oracleOwner, HOME);
      const market = await deployMarket(TKN, 0, operator, treasury, 0n);
      const marketId = randomId();
      await market.connect(operator).createMarket(marketId, matchId, (await nowTs()) + 3600n);

      // 3 winners stake 10 each (winnerPool 30); 1 loser stakes 5 -> payoutPool 35.
      // floor(10e6 * 35e6 / 30e6) = 11_666_666 -> 2 base units of dust over 3 claims.
      for (const w of [w1, w2, w3]) {
        await fund(TKN, market, w, amt(10));
        await market.connect(w).stake(marketId, HOME, amt(10));
      }
      await fund(TKN, market, loser, amt(5));
      await market.connect(loser).stake(marketId, AWAY, amt(5));

      await warp(WARP);
      await finalizeOracle(oracleOwner, matchId);
      await market.settle(marketId);

      const tk = tokenAt(TKN);
      const base = 11_666_666n;
      const b1 = await tk.balanceOf(w1.address);
      await market.connect(w1).claim(marketId);
      expect((await tk.balanceOf(w1.address)) - b1).to.equal(base);
      const b2 = await tk.balanceOf(w2.address);
      await market.connect(w2).claim(marketId);
      expect((await tk.balanceOf(w2.address)) - b2).to.equal(base);
      const b3 = await tk.balanceOf(w3.address);
      await market.connect(w3).claim(marketId); // last winner — absorbs the 2-unit dust
      expect((await tk.balanceOf(w3.address)) - b3).to.equal(base + 2n);

      // the whole payout pool has left the contract — nothing stranded
      expect(await tk.balanceOf(await market.getAddress())).to.equal(0n);
    });
  });
});
