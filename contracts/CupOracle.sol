// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title XSight CupOracle
/// @notice Minimal optimistic settlement registry for World Cup apps on X Layer.
/// @dev The contract stores hashes and outcomes. Off-chain adapters keep full source receipts.
contract CupOracle {
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

    struct MatchRecord {
        bytes32 matchId;
        bytes32 rulesHash;
        bytes32 sourceHash;
        Outcome proposedOutcome;
        Outcome finalOutcome;
        SettlementState state;
        address proposer;
        address challenger;
        uint64 challengeEndsAt;
        uint64 updatedAt;
    }

    address public owner;
    uint64 public immutable challengeWindow;

    mapping(bytes32 => MatchRecord) private records;

    event MatchRegistered(bytes32 indexed matchId, bytes32 rulesHash, bytes32 sourceHash);
    event ResultProposed(bytes32 indexed matchId, Outcome outcome, address indexed proposer, uint64 challengeEndsAt);
    event ResultChallenged(bytes32 indexed matchId, address indexed challenger);
    event ResultFinalized(bytes32 indexed matchId, Outcome outcome);
    event SourceHashUpdated(bytes32 indexed matchId, bytes32 sourceHash);
    event OwnerChanged(address indexed previousOwner, address indexed nextOwner);

    error OnlyOwner();
    error MatchNotFound();
    error MatchAlreadyExists();
    error InvalidOutcome();
    error InvalidState();
    error ChallengeWindowOpen();
    error ChallengeWindowClosed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(uint64 challengeWindowSeconds) {
        owner = msg.sender;
        challengeWindow = challengeWindowSeconds;
        emit OwnerChanged(address(0), msg.sender);
    }

    function transferOwner(address nextOwner) external onlyOwner {
        require(nextOwner != address(0), "owner=0");
        emit OwnerChanged(owner, nextOwner);
        owner = nextOwner;
    }

    function registerMatch(bytes32 matchId, bytes32 rulesHash, bytes32 sourceHash) external onlyOwner {
        MatchRecord storage record = records[matchId];
        if (record.matchId != bytes32(0)) revert MatchAlreadyExists();

        records[matchId] = MatchRecord({
            matchId: matchId,
            rulesHash: rulesHash,
            sourceHash: sourceHash,
            proposedOutcome: Outcome.Unknown,
            finalOutcome: Outcome.Unknown,
            state: SettlementState.Open,
            proposer: address(0),
            challenger: address(0),
            challengeEndsAt: 0,
            updatedAt: uint64(block.timestamp)
        });

        emit MatchRegistered(matchId, rulesHash, sourceHash);
    }

    function updateSourceHash(bytes32 matchId, bytes32 sourceHash) external onlyOwner {
        MatchRecord storage record = mustGet(matchId);
        if (record.state == SettlementState.Finalized) revert InvalidState();
        record.sourceHash = sourceHash;
        record.updatedAt = uint64(block.timestamp);
        emit SourceHashUpdated(matchId, sourceHash);
    }

    function proposeResult(bytes32 matchId, Outcome outcome) external {
        if (outcome == Outcome.Unknown) revert InvalidOutcome();
        MatchRecord storage record = mustGet(matchId);
        if (record.state != SettlementState.Open && record.state != SettlementState.Challenged) {
            revert InvalidState();
        }

        uint64 challengeEndsAt = uint64(block.timestamp) + challengeWindow;
        record.proposedOutcome = outcome;
        record.proposer = msg.sender;
        record.challenger = address(0);
        record.challengeEndsAt = challengeEndsAt;
        record.state = SettlementState.Proposed;
        record.updatedAt = uint64(block.timestamp);

        emit ResultProposed(matchId, outcome, msg.sender, challengeEndsAt);
    }

    function challengeResult(bytes32 matchId) external {
        MatchRecord storage record = mustGet(matchId);
        if (record.state != SettlementState.Proposed) revert InvalidState();
        if (block.timestamp > record.challengeEndsAt) revert ChallengeWindowClosed();

        record.challenger = msg.sender;
        record.state = SettlementState.Challenged;
        record.updatedAt = uint64(block.timestamp);

        emit ResultChallenged(matchId, msg.sender);
    }

    function finalizeResult(bytes32 matchId) external {
        MatchRecord storage record = mustGet(matchId);
        if (record.state != SettlementState.Proposed) revert InvalidState();
        if (block.timestamp <= record.challengeEndsAt) revert ChallengeWindowOpen();

        record.finalOutcome = record.proposedOutcome;
        record.state = SettlementState.Finalized;
        record.updatedAt = uint64(block.timestamp);

        emit ResultFinalized(matchId, record.finalOutcome);
    }

    function forceFinalize(bytes32 matchId, Outcome outcome) external onlyOwner {
        if (outcome == Outcome.Unknown) revert InvalidOutcome();
        MatchRecord storage record = mustGet(matchId);
        record.proposedOutcome = outcome;
        record.finalOutcome = outcome;
        record.state = SettlementState.Finalized;
        record.updatedAt = uint64(block.timestamp);
        emit ResultFinalized(matchId, outcome);
    }

    function getMatch(bytes32 matchId) external view returns (MatchRecord memory) {
        return mustGetView(matchId);
    }

    function mustGet(bytes32 matchId) private view returns (MatchRecord storage record) {
        record = records[matchId];
        if (record.matchId == bytes32(0)) revert MatchNotFound();
    }

    function mustGetView(bytes32 matchId) private view returns (MatchRecord storage record) {
        record = records[matchId];
        if (record.matchId == bytes32(0)) revert MatchNotFound();
    }
}
