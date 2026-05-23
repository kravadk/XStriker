// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The slice of CupOracleV3 the arbiter calls back into. `resolveChallenge`'s
///         `ruling` is the oracle's Outcome enum, which ABI-encodes as uint8.
interface ICupOracleResolver {
    function resolveChallenge(bytes32 matchId, uint8 ruling) external;
}

/// @title ArbiterMultisig
/// @notice M-of-N arbiter for CupOracleV3 challenged results. Implements the pluggable
///         `ICupArbiter` interface: the oracle opens a dispute via `requestRuling`, the
///         signers vote on the final outcome, and on the first outcome to reach the
///         threshold the multisig calls `resolveChallenge` back on the oracle.
/// @dev    A deliberately small, swappable arbiter for the hackathon — CupOracleV3 can
///         point `arbiter` at a larger arbiter panel later (timelocked) without redeploying.
contract ArbiterMultisig {
    // Ruling values mirror CupOracleV3.Outcome: 1 Home, 2 Draw, 3 Away (0 Unknown is invalid).
    uint8 internal constant RULING_MIN = 1;
    uint8 internal constant RULING_MAX = 3;

    struct Dispute {
        bytes32 matchId;
        uint8 proposedOutcome;
        bool resolved;
    }

    address public immutable deployer; // may set the oracle once, then has no power
    address public oracle; // CupOracleV3 — settable exactly once via setOracle
    uint256 public immutable threshold; // votes needed for the same ruling to resolve

    address[] public signers;
    mapping(address => bool) public isSigner;

    uint256 public disputeCount;
    mapping(uint256 => Dispute) private disputes;
    mapping(uint256 => mapping(address => uint8)) public voteOf; // disputeId => signer => ruling (0 = not voted)
    mapping(uint256 => mapping(uint8 => uint256)) public tally; // disputeId => ruling => vote count

    uint256 private _entered;

    event OracleSet(address indexed oracle);
    event RulingRequested(uint256 indexed disputeId, bytes32 indexed matchId, uint8 proposedOutcome);
    event VoteCast(uint256 indexed disputeId, address indexed signer, uint8 ruling);
    event DisputeResolved(uint256 indexed disputeId, bytes32 indexed matchId, uint8 ruling);

    error OnlyDeployer();
    error OnlySigner();
    error OnlyOracle();
    error OracleAlreadySet();
    error ZeroAddress();
    error BadThreshold();
    error DuplicateSigner();
    error BadRuling();
    error DisputeNotFound();
    error DisputeAlreadyResolved();
    error Reentrancy();

    modifier onlySigner() {
        if (!isSigner[msg.sender]) revert OnlySigner();
        _;
    }

    modifier nonReentrant() {
        if (_entered != 0) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
    }

    /// @param signers_ The arbiter panel (e.g. 3 addresses for a 2-of-3).
    /// @param threshold_ Votes for the same ruling required to resolve (e.g. 2).
    constructor(address[] memory signers_, uint256 threshold_) {
        if (threshold_ == 0 || threshold_ > signers_.length) revert BadThreshold();
        deployer = msg.sender;
        threshold = threshold_;
        for (uint256 i = 0; i < signers_.length; i++) {
            address s = signers_[i];
            if (s == address(0)) revert ZeroAddress();
            if (isSigner[s]) revert DuplicateSigner();
            isSigner[s] = true;
            signers.push(s);
        }
    }

    /// @notice Wire the arbiter to its oracle. Callable once, by the deployer — this
    ///         breaks the deploy-time circular dependency (oracle needs the arbiter
    ///         address in its constructor, so the arbiter is deployed first).
    function setOracle(address oracle_) external {
        if (msg.sender != deployer) revert OnlyDeployer();
        if (oracle != address(0)) revert OracleAlreadySet();
        if (oracle_ == address(0)) revert ZeroAddress();
        oracle = oracle_;
        emit OracleSet(oracle_);
    }

    /// @notice Called by CupOracleV3 when a result is challenged. Opens a dispute the
    ///         signers can vote on.
    function requestRuling(bytes32 matchId, uint8 proposedOutcome) external returns (uint256 disputeId) {
        if (msg.sender != oracle) revert OnlyOracle();
        disputeId = ++disputeCount;
        disputes[disputeId] = Dispute({matchId: matchId, proposedOutcome: proposedOutcome, resolved: false});
        emit RulingRequested(disputeId, matchId, proposedOutcome);
    }

    /// @notice A signer votes for the final outcome of a dispute. A signer may recast;
    ///         the previous vote is rolled back. When any ruling reaches `threshold`
    ///         votes the dispute resolves and the oracle is called immediately.
    function castVote(uint256 disputeId, uint8 ruling) external onlySigner nonReentrant {
        if (ruling < RULING_MIN || ruling > RULING_MAX) revert BadRuling();
        Dispute storage d = disputes[disputeId];
        if (d.matchId == bytes32(0)) revert DisputeNotFound();
        if (d.resolved) revert DisputeAlreadyResolved();

        uint8 prev = voteOf[disputeId][msg.sender];
        if (prev != ruling) {
            if (prev != 0) tally[disputeId][prev] -= 1;
            voteOf[disputeId][msg.sender] = ruling;
            tally[disputeId][ruling] += 1;
            emit VoteCast(disputeId, msg.sender, ruling);
        }

        if (tally[disputeId][ruling] >= threshold) {
            d.resolved = true; // effects before interaction
            ICupOracleResolver(oracle).resolveChallenge(d.matchId, ruling);
            emit DisputeResolved(disputeId, d.matchId, ruling);
        }
    }

    // --- views ---

    function getDispute(uint256 disputeId)
        external
        view
        returns (bytes32 matchId, uint8 proposedOutcome, bool resolved)
    {
        Dispute storage d = disputes[disputeId];
        return (d.matchId, d.proposedOutcome, d.resolved);
    }

    function signerCount() external view returns (uint256) {
        return signers.length;
    }

    function getSigners() external view returns (address[] memory) {
        return signers;
    }
}
