// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Pluggable arbiter interface for challenged results. The oracle calls
///         `requestRuling` when a result is challenged; the arbiter later calls back
///         `resolveChallenge` on the oracle once it has a ruling.
interface ICupArbiter {
    function requestRuling(bytes32 matchId, uint8 proposedOutcome) external returns (uint256 disputeId);
}

/// @title XSight CupOracleV3
/// @notice Bonded optimistic settlement registry for World Cup results on X Layer.
///         A proposer posts a bond with each result; a challenger matches it; the
///         loser's bond is slashed to the winner. This turns the challenge window
///         from a passive timer into an economically-enforced check — the hardening
///         of CupOracleV2 described in docs/xcup/HARDENING-PLAN.md.
/// @dev    `getMatch` returns the exact V2-compatible MatchRecord layout, so the
///         pari-mutuel market reads it through the same ICupOracle interface with no
///         logical change. Bond/dispute data is read separately via `getBond`.
contract CupOracleV3 {
    enum Outcome {
        Unknown,
        Home,
        Draw,
        Away
    }

    enum SettlementState {
        Open,
        Proposed,
        Challenged,
        Finalized
    }

    /// @dev V2-compatible — `getMatch` returns exactly this layout (enums encode as uint8).
    struct MatchRecord {
        bytes32 matchId;
        bytes32 rulesHash;
        bytes32 sourceHash;
        bytes32 evidenceHash;
        string evidenceUri;
        uint8 sourceCount;
        Outcome proposedOutcome;
        Outcome finalOutcome;
        SettlementState state;
        address proposer;
        address challenger;
        uint64 challengeEndsAt;
        uint64 updatedAt;
    }

    /// @dev V3 addition — bond economics and the manual-resolution timelock.
    struct BondInfo {
        uint256 proposerBond;
        uint256 challengerBond;
        uint256 disputeId;
        uint64 manualResolveAt;
    }

    // --- config (immutable except treasury/arbiter/owner) ---
    address public immutable bondToken; // ERC20 the bond is denominated in (USDT on X Layer)
    uint256 public immutable bondAmount; // flat bond per propose / per challenge
    uint64 public immutable challengeWindow; // seconds a proposed result can be challenged
    uint16 public immutable protocolFeeBps; // treasury cut of the slashed bond (0 = all to winner)
    uint64 public immutable safetyPeriod; // timelock between flag() and resolveManually()
    uint16 internal constant MAX_FEE_BPS = 5000; // hard cap — never slash more than 50% to treasury
    uint64 public constant ARBITER_TIMELOCK = 2 days; // delay on changing the arbiter

    address public owner;
    address public treasury;
    address public arbiter;
    address public pendingArbiter;
    uint64 public arbiterEta;

    mapping(bytes32 => MatchRecord) private records;
    mapping(bytes32 => BondInfo) private bonds;

    uint256 private _entered;

    event MatchRegistered(bytes32 indexed matchId, bytes32 rulesHash, bytes32 sourceHash, bytes32 evidenceHash, string evidenceUri);
    event SourceEvidenceUpdated(bytes32 indexed matchId, bytes32 sourceHash, bytes32 evidenceHash, string evidenceUri);
    event ResultProposed(bytes32 indexed matchId, Outcome outcome, address indexed proposer, uint64 challengeEndsAt, bytes32 sourceHash, bytes32 evidenceHash, string evidenceUri, uint8 sourceCount, uint256 bond);
    event ResultChallenged(bytes32 indexed matchId, address indexed challenger, uint256 disputeId, uint256 bond, string reasonUri);
    event ChallengeResolved(bytes32 indexed matchId, Outcome ruling, address indexed winner, uint256 payout, uint256 protocolFee);
    event ResultFinalized(bytes32 indexed matchId, Outcome outcome);
    event BondReturned(bytes32 indexed matchId, address indexed to, uint256 amount);
    event BondSlashed(bytes32 indexed matchId, address indexed from, address indexed to, uint256 amount);
    event MatchFlagged(bytes32 indexed matchId, uint64 manualResolveAt);
    event ResolvedManually(bytes32 indexed matchId, Outcome outcome);
    event ArbiterProposed(address indexed arbiter, uint64 eta);
    event ArbiterChanged(address indexed previousArbiter, address indexed nextArbiter);
    event OwnerChanged(address indexed previousOwner, address indexed nextOwner);
    event TreasuryChanged(address indexed treasury);

    error OnlyOwner();
    error OnlyArbiter();
    error MatchNotFound();
    error MatchAlreadyExists();
    error InvalidOutcome();
    error InvalidState();
    error ChallengeWindowOpen();
    error ChallengeWindowClosed();
    error EvidenceRequired();
    error NoArbiter();
    error TimelockPending();
    error BondTransferFailed();
    error Reentrancy();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyArbiter() {
        if (msg.sender != arbiter) revert OnlyArbiter();
        _;
    }

    modifier nonReentrant() {
        if (_entered != 0) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
    }

    /// @param bondToken_ ERC20 used for bonds (USDT on X Layer — non-standard ERC20 supported).
    /// @param bondAmount_ Flat bond posted on every propose and every challenge.
    /// @param challengeWindowSeconds Length of the optimistic challenge window.
    /// @param protocolFeeBps_ Treasury cut of the slashed (loser) bond, in bps. 0 = all to winner.
    /// @param safetyPeriodSeconds Timelock between flag() and resolveManually().
    /// @param treasury_ Recipient of any protocol fee on a slashed bond.
    /// @param arbiter_ Initial arbiter (ICupArbiter). May be address(0) and set later.
    constructor(
        address bondToken_,
        uint256 bondAmount_,
        uint64 challengeWindowSeconds,
        uint16 protocolFeeBps_,
        uint64 safetyPeriodSeconds,
        address treasury_,
        address arbiter_
    ) {
        require(bondToken_ != address(0) && treasury_ != address(0), "zero addr");
        require(bondAmount_ > 0, "zero bond");
        require(protocolFeeBps_ <= MAX_FEE_BPS, "fee too high");
        owner = msg.sender;
        bondToken = bondToken_;
        bondAmount = bondAmount_;
        challengeWindow = challengeWindowSeconds;
        protocolFeeBps = protocolFeeBps_;
        safetyPeriod = safetyPeriodSeconds;
        treasury = treasury_;
        arbiter = arbiter_;
        emit OwnerChanged(address(0), msg.sender);
        if (arbiter_ != address(0)) emit ArbiterChanged(address(0), arbiter_);
    }

    // --- admin ---

    function transferOwner(address nextOwner) external onlyOwner {
        require(nextOwner != address(0), "owner=0");
        emit OwnerChanged(owner, nextOwner);
        owner = nextOwner;
    }

    function setTreasury(address nextTreasury) external onlyOwner {
        require(nextTreasury != address(0), "treasury=0");
        treasury = nextTreasury;
        emit TreasuryChanged(nextTreasury);
    }

    /// @notice Stage an arbiter change. It only takes effect via `commitArbiter` after
    ///         ARBITER_TIMELOCK — so the arbiter can never be swapped silently.
    function proposeArbiter(address nextArbiter) external onlyOwner {
        require(nextArbiter != address(0), "arbiter=0");
        pendingArbiter = nextArbiter;
        arbiterEta = uint64(block.timestamp) + ARBITER_TIMELOCK;
        emit ArbiterProposed(nextArbiter, arbiterEta);
    }

    function commitArbiter() external onlyOwner {
        address next = pendingArbiter;
        require(next != address(0), "no pending");
        if (block.timestamp < arbiterEta) revert TimelockPending();
        emit ArbiterChanged(arbiter, next);
        arbiter = next;
        pendingArbiter = address(0);
        arbiterEta = 0;
    }

    // --- registration ---

    function registerMatch(
        bytes32 matchId,
        bytes32 rulesHash,
        bytes32 sourceHash,
        bytes32 evidenceHash,
        string calldata evidenceUri
    ) external onlyOwner {
        if (evidenceHash == bytes32(0) || bytes(evidenceUri).length == 0) revert EvidenceRequired();
        MatchRecord storage record = records[matchId];
        if (record.matchId != bytes32(0)) revert MatchAlreadyExists();

        records[matchId] = MatchRecord({
            matchId: matchId,
            rulesHash: rulesHash,
            sourceHash: sourceHash,
            evidenceHash: evidenceHash,
            evidenceUri: evidenceUri,
            sourceCount: 0,
            proposedOutcome: Outcome.Unknown,
            finalOutcome: Outcome.Unknown,
            state: SettlementState.Open,
            proposer: address(0),
            challenger: address(0),
            challengeEndsAt: 0,
            updatedAt: uint64(block.timestamp)
        });

        emit MatchRegistered(matchId, rulesHash, sourceHash, evidenceHash, evidenceUri);
    }

    /// @notice Owner may correct registration evidence, but only before a result is
    ///         proposed — once a bonded proposal exists its evidence is immutable.
    function updateSourceEvidence(
        bytes32 matchId,
        bytes32 sourceHash,
        bytes32 evidenceHash,
        string calldata evidenceUri
    ) external onlyOwner {
        if (evidenceHash == bytes32(0) || bytes(evidenceUri).length == 0) revert EvidenceRequired();
        MatchRecord storage record = mustGet(matchId);
        if (record.state != SettlementState.Open) revert InvalidState();
        record.sourceHash = sourceHash;
        record.evidenceHash = evidenceHash;
        record.evidenceUri = evidenceUri;
        record.updatedAt = uint64(block.timestamp);
        emit SourceEvidenceUpdated(matchId, sourceHash, evidenceHash, evidenceUri);
    }

    // --- optimistic bonded flow ---

    /// @notice Propose a result and post a bond. Permissionless — anyone who posts the
    ///         bond and attests the multi-source evidence may propose. The bond is
    ///         returned in full on an unchallenged finalize, or slashed if a challenge
    ///         finds the proposal wrong.
    function proposeResult(
        bytes32 matchId,
        Outcome outcome,
        bytes32 sourceHash,
        bytes32 evidenceHash,
        string calldata evidenceUri,
        uint8 sourceCount
    ) external nonReentrant {
        if (outcome == Outcome.Unknown) revert InvalidOutcome();
        if (evidenceHash == bytes32(0) || bytes(evidenceUri).length == 0 || sourceCount < 2) revert EvidenceRequired();
        MatchRecord storage record = mustGet(matchId);
        if (record.state != SettlementState.Open) revert InvalidState();

        uint64 challengeEndsAt = uint64(block.timestamp) + challengeWindow;
        record.proposedOutcome = outcome;
        record.proposer = msg.sender;
        record.challenger = address(0);
        record.challengeEndsAt = challengeEndsAt;
        record.state = SettlementState.Proposed;
        record.sourceHash = sourceHash;
        record.evidenceHash = evidenceHash;
        record.evidenceUri = evidenceUri;
        record.sourceCount = sourceCount;
        record.updatedAt = uint64(block.timestamp);

        bonds[matchId].proposerBond = bondAmount;

        _pullBond(msg.sender);
        emit ResultProposed(matchId, outcome, msg.sender, challengeEndsAt, sourceHash, evidenceHash, evidenceUri, sourceCount, bondAmount);
    }

    /// @notice Challenge a proposed result, posting an equal bond. Routes the match to
    ///         the arbiter for a ruling. Allowed only inside the challenge window.
    function challengeResult(bytes32 matchId, string calldata reasonUri) external nonReentrant {
        if (arbiter == address(0)) revert NoArbiter();
        MatchRecord storage record = mustGet(matchId);
        if (record.state != SettlementState.Proposed) revert InvalidState();
        if (block.timestamp > record.challengeEndsAt) revert ChallengeWindowClosed();

        record.challenger = msg.sender;
        record.state = SettlementState.Challenged;
        record.updatedAt = uint64(block.timestamp);
        bonds[matchId].challengerBond = bondAmount;

        _pullBond(msg.sender);
        uint256 disputeId = ICupArbiter(arbiter).requestRuling(matchId, uint8(record.proposedOutcome));
        bonds[matchId].disputeId = disputeId;

        emit ResultChallenged(matchId, msg.sender, disputeId, bondAmount, reasonUri);
    }

    /// @notice Finalize an unchallenged result once the window has elapsed. The
    ///         proposer's bond is returned in full — no fee on an honest, uncontested
    ///         proposal. Permissionless.
    function finalizeResult(bytes32 matchId) external nonReentrant {
        MatchRecord storage record = mustGet(matchId);
        if (record.state != SettlementState.Proposed) revert InvalidState();
        if (block.timestamp <= record.challengeEndsAt) revert ChallengeWindowOpen();

        record.finalOutcome = record.proposedOutcome;
        record.state = SettlementState.Finalized;
        record.updatedAt = uint64(block.timestamp);

        uint256 bond = bonds[matchId].proposerBond;
        bonds[matchId].proposerBond = 0;
        if (bond > 0) {
            _pushToken(record.proposer, bond);
            emit BondReturned(matchId, record.proposer, bond);
        }
        emit ResultFinalized(matchId, record.finalOutcome);
    }

    /// @notice Arbiter ruling on a challenged result. The proposer wins iff the ruling
    ///         equals the proposed outcome; otherwise the challenger wins and the ruling
    ///         becomes the final result. The loser's bond (minus any protocol fee) is
    ///         slashed to the winner.
    function resolveChallenge(bytes32 matchId, Outcome ruling) external onlyArbiter nonReentrant {
        if (ruling == Outcome.Unknown) revert InvalidOutcome();
        MatchRecord storage record = mustGet(matchId);
        if (record.state != SettlementState.Challenged) revert InvalidState();

        BondInfo storage b = bonds[matchId];
        bool proposerWins = (ruling == record.proposedOutcome);
        address winner = proposerWins ? record.proposer : record.challenger;
        address loser = proposerWins ? record.challenger : record.proposer;
        uint256 winnerBond = proposerWins ? b.proposerBond : b.challengerBond;
        uint256 loserBond = proposerWins ? b.challengerBond : b.proposerBond;

        uint256 fee = (loserBond * protocolFeeBps) / 10000;
        uint256 payout = winnerBond + loserBond - fee;

        record.finalOutcome = ruling;
        record.state = SettlementState.Finalized;
        record.updatedAt = uint64(block.timestamp);
        b.proposerBond = 0;
        b.challengerBond = 0;

        if (payout > 0) _pushToken(winner, payout);
        if (fee > 0) _pushToken(treasury, fee);

        emit BondSlashed(matchId, loser, winner, loserBond - fee);
        emit ChallengeResolved(matchId, ruling, winner, payout, fee);
        emit ResultFinalized(matchId, ruling);
    }

    // --- guarded manual fallback (replaces V2's instant emergencyFinalize) ---

    /// @notice Flag a match for manual resolution. Starts the safety timelock — the
    ///         owner cannot resolve manually until `safetyPeriod` has elapsed, so a
    ///         live challenge window can never be silently overridden.
    function flag(bytes32 matchId) external onlyOwner {
        MatchRecord storage record = mustGet(matchId);
        if (record.state == SettlementState.Finalized) revert InvalidState();
        uint64 resolveAt = uint64(block.timestamp) + safetyPeriod;
        bonds[matchId].manualResolveAt = resolveAt;
        emit MatchFlagged(matchId, resolveAt);
    }

    /// @notice Resolve a flagged match after the timelock. Any posted bonds are returned
    ///         to their posters — manual resolution is not a dispute outcome, so no bond
    ///         is slashed.
    function resolveManually(bytes32 matchId, Outcome outcome) external onlyOwner nonReentrant {
        if (outcome == Outcome.Unknown) revert InvalidOutcome();
        MatchRecord storage record = mustGet(matchId);
        if (record.state == SettlementState.Finalized) revert InvalidState();
        BondInfo storage b = bonds[matchId];
        if (b.manualResolveAt == 0 || block.timestamp < b.manualResolveAt) revert TimelockPending();

        record.proposedOutcome = outcome;
        record.finalOutcome = outcome;
        record.state = SettlementState.Finalized;
        record.updatedAt = uint64(block.timestamp);

        uint256 pBond = b.proposerBond;
        uint256 cBond = b.challengerBond;
        b.proposerBond = 0;
        b.challengerBond = 0;
        if (pBond > 0 && record.proposer != address(0)) {
            _pushToken(record.proposer, pBond);
            emit BondReturned(matchId, record.proposer, pBond);
        }
        if (cBond > 0 && record.challenger != address(0)) {
            _pushToken(record.challenger, cBond);
            emit BondReturned(matchId, record.challenger, cBond);
        }

        emit ResolvedManually(matchId, outcome);
        emit ResultFinalized(matchId, outcome);
    }

    // --- views ---

    /// @notice V2-compatible read — the pari-mutuel market consumes this unchanged.
    function getMatch(bytes32 matchId) external view returns (MatchRecord memory) {
        return mustGetView(matchId);
    }

    /// @notice Bond / dispute economics for a match (V3 addition).
    function getBond(bytes32 matchId) external view returns (BondInfo memory) {
        mustGetView(matchId); // revert if the match does not exist
        return bonds[matchId];
    }

    function mustGet(bytes32 matchId) private view returns (MatchRecord storage record) {
        record = records[matchId];
        if (record.matchId == bytes32(0)) revert MatchNotFound();
    }

    function mustGetView(bytes32 matchId) private view returns (MatchRecord storage record) {
        record = records[matchId];
        if (record.matchId == bytes32(0)) revert MatchNotFound();
    }

    // --- internal bond transfers (handle standard + non-standard ERC20 like USDT) ---

    function _pullBond(address from) private {
        (bool ok, bytes memory data) =
            bondToken.call(abi.encodeWithSelector(0x23b872dd, from, address(this), bondAmount)); // transferFrom
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert BondTransferFailed();
    }

    function _pushToken(address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            bondToken.call(abi.encodeWithSelector(0xa9059cbb, to, amount)); // transfer
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert BondTransferFailed();
    }
}
