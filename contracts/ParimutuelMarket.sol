// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Read interface for the already-deployed CupOracleV2.
/// finalOutcome: 0 Unknown,1 Home,2 Draw,3 Away. state: 0 Open,1 Proposed,2 Challenged,3 Finalized.
interface ICupOracle {
    struct MatchRecord {
        bytes32 matchId;
        bytes32 rulesHash;
        bytes32 sourceHash;
        bytes32 evidenceHash;
        string evidenceUri;
        uint8 sourceCount;
        uint8 proposedOutcome;
        uint8 finalOutcome;
        uint8 state;
        address proposer;
        address challenger;
        uint64 challengeEndsAt;
        uint64 updatedAt;
    }
    function getMatch(bytes32 matchId) external view returns (MatchRecord memory);
}

/// @title ParimutuelMarket
/// @notice Pari-mutuel football prediction pools on X Layer, settled by CupOracleV2.
///         No order book, no AMM, no house. Winners split the pool pro-rata.
contract ParimutuelMarket {
    uint8 internal constant OUTCOME_HOME = 1;
    uint8 internal constant OUTCOME_AWAY = 3;
    uint8 internal constant ORACLE_FINALIZED = 3;
    uint16 internal constant MAX_FEE_BPS = 1000; // 10% cap

    address public owner;
    address public operator;
    address public treasury;
    uint16 public feeBps;
    /// @notice Minimum stake per `stake()` call — an anti-dust-spam floor. 0 disables it.
    uint256 public minStake;
    /// @notice The ERC20 the market settles in — USDT or USDC on X Layer. Token-agnostic
    ///         on purpose: handles both standard (bool-returning) and non-standard
    ///         (void-returning, e.g. USDT) ERC20s via the low-level helpers below.
    address public immutable token;
    ICupOracle public immutable oracle;

    uint256 private _entered;

    struct Market {
        bytes32 matchId;
        uint64 closeTime;
        bool exists;
        bool settled;
        bool refundMode; // void OR no-winners -> refund every staker
        uint8 winningOutcome;
        uint256 totalPool;
        uint256 payoutPool; // totalPool minus fee, fixed at settle
        uint256[4] pool; // indexed by outcome 1/2/3; index 0 unused
        uint32[4] stakerCount; // distinct stakers per outcome — for dust absorption
        uint32 claimedWinners; // winners who have claimed (non-refund path)
        uint256 distributed; // running total paid out — for dust absorption
    }

    mapping(bytes32 => Market) private _markets;
    mapping(bytes32 => mapping(address => uint256[4])) private _stake;
    mapping(bytes32 => mapping(address => bool)) public claimed;

    event MarketCreated(bytes32 indexed marketId, bytes32 indexed matchId, uint64 closeTime);
    event Staked(bytes32 indexed marketId, address indexed user, uint8 outcome, uint256 amount);
    event Settled(bytes32 indexed marketId, uint8 winningOutcome, uint256 totalPool, uint256 payoutPool, bool refundMode);
    event MarketVoided(bytes32 indexed marketId);
    event Claimed(bytes32 indexed marketId, address indexed user, uint256 amount);
    event OperatorChanged(address indexed operator);
    event TreasuryChanged(address indexed treasury);
    event FeeChanged(uint16 feeBps);
    event MinStakeChanged(uint256 minStake);
    event DustSwept(bytes32 indexed marketId, address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }
    modifier onlyOperator() {
        require(msg.sender == operator, "not operator");
        _;
    }
    modifier nonReentrant() {
        require(_entered == 0, "reentrant");
        _entered = 1;
        _;
        _entered = 0;
    }

    constructor(
        address token_,
        address oracle_,
        address operator_,
        address treasury_,
        uint16 feeBps_,
        uint256 minStake_
    ) {
        require(token_ != address(0) && oracle_ != address(0), "zero addr");
        require(operator_ != address(0) && treasury_ != address(0), "zero addr");
        require(feeBps_ <= MAX_FEE_BPS, "fee too high");
        owner = msg.sender;
        token = token_;
        oracle = ICupOracle(oracle_);
        operator = operator_;
        treasury = treasury_;
        feeBps = feeBps_;
        minStake = minStake_;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ---- admin ----
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero addr");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setOperator(address a) external onlyOwner {
        require(a != address(0), "zero addr");
        operator = a;
        emit OperatorChanged(a);
    }

    function setTreasury(address a) external onlyOwner {
        require(a != address(0), "zero addr");
        treasury = a;
        emit TreasuryChanged(a);
    }

    function setFeeBps(uint16 v) external onlyOwner {
        require(v <= MAX_FEE_BPS, "fee too high");
        feeBps = v;
        emit FeeChanged(v);
    }

    /// @notice Set the anti-dust-spam minimum stake. Only affects future stakes.
    function setMinStake(uint256 v) external onlyOwner {
        minStake = v;
        emit MinStakeChanged(v);
    }

    // ---- market lifecycle ----
    function createMarket(bytes32 marketId, bytes32 matchId, uint64 closeTime) external onlyOperator {
        require(marketId != bytes32(0) && matchId != bytes32(0), "bad id");
        require(!_markets[marketId].exists, "market exists");
        require(closeTime > block.timestamp, "close in past");
        Market storage m = _markets[marketId];
        m.matchId = matchId;
        m.closeTime = closeTime;
        m.exists = true;
        emit MarketCreated(marketId, matchId, closeTime);
    }

    function stake(bytes32 marketId, uint8 outcome, uint256 amount) external nonReentrant {
        Market storage m = _markets[marketId];
        require(m.exists, "no market");
        require(!m.settled, "settled");
        require(block.timestamp < m.closeTime, "closed");
        require(outcome >= OUTCOME_HOME && outcome <= OUTCOME_AWAY, "bad outcome");
        require(amount > 0, "zero amount");
        require(amount >= minStake, "below min stake");
        _pullToken(msg.sender, amount);
        m.pool[outcome] += amount;
        m.totalPool += amount;
        // count each distinct staker per outcome once — the winning outcome's count
        // tells claim() which winner is last, so it can absorb the rounding dust.
        if (_stake[marketId][msg.sender][outcome] == 0) m.stakerCount[outcome] += 1;
        _stake[marketId][msg.sender][outcome] += amount;
        emit Staked(marketId, msg.sender, outcome, amount);
    }

    /// @notice Permissionless — anyone can settle once the oracle has finalized.
    function settle(bytes32 marketId) external nonReentrant {
        Market storage m = _markets[marketId];
        require(m.exists, "no market");
        require(!m.settled, "settled");
        require(block.timestamp >= m.closeTime, "not closed");
        ICupOracle.MatchRecord memory rec = oracle.getMatch(m.matchId);
        require(rec.state == ORACLE_FINALIZED, "oracle not finalized");
        uint8 fo = rec.finalOutcome;
        require(fo >= OUTCOME_HOME && fo <= OUTCOME_AWAY, "bad final outcome");
        m.settled = true;
        m.winningOutcome = fo;
        if (m.pool[fo] == 0) {
            m.refundMode = true; // nobody won -> refund everyone
            m.payoutPool = m.totalPool;
        } else {
            uint256 fee = (m.totalPool * feeBps) / 10000;
            m.payoutPool = m.totalPool - fee;
            if (fee > 0) _pushToken(treasury, fee);
        }
        emit Settled(marketId, fo, m.totalPool, m.payoutPool, m.refundMode);
    }

    /// @notice Operator-only escape hatch for cancelled/abandoned matches -> refund mode.
    function voidMarket(bytes32 marketId) external onlyOperator {
        Market storage m = _markets[marketId];
        require(m.exists, "no market");
        require(!m.settled, "settled");
        m.settled = true;
        m.refundMode = true;
        m.payoutPool = m.totalPool;
        emit MarketVoided(marketId);
    }

    function claim(bytes32 marketId) external nonReentrant {
        Market storage m = _markets[marketId];
        require(m.exists, "no market");
        require(m.settled, "not settled");
        require(!claimed[marketId][msg.sender], "claimed");
        claimed[marketId][msg.sender] = true; // effects before interaction

        uint256[4] storage s = _stake[marketId][msg.sender];
        uint256 payout;
        if (m.refundMode) {
            payout = s[1] + s[2] + s[3];
        } else {
            uint256 won = s[m.winningOutcome];
            if (won > 0) {
                payout = (won * m.payoutPool) / m.pool[m.winningOutcome];
                m.claimedWinners += 1;
                m.distributed += payout;
                // the last winning staker to claim absorbs the integer-division dust,
                // so the whole payout pool leaves the contract and nothing is stranded.
                if (m.claimedWinners == m.stakerCount[m.winningOutcome]) {
                    uint256 dust = m.payoutPool - m.distributed;
                    if (dust > 0) {
                        payout += dust;
                        m.distributed += dust;
                        emit DustSwept(marketId, msg.sender, dust);
                    }
                }
            }
        }
        require(payout > 0, "nothing to claim");
        _pushToken(msg.sender, payout);
        emit Claimed(marketId, msg.sender, payout);
    }

    // ---- views ----
    function getMarket(bytes32 marketId)
        external
        view
        returns (
            bytes32 matchId,
            uint64 closeTime,
            bool exists,
            bool settled,
            bool refundMode,
            uint8 winningOutcome,
            uint256 totalPool,
            uint256 payoutPool,
            uint256 poolHome,
            uint256 poolDraw,
            uint256 poolAway
        )
    {
        Market storage m = _markets[marketId];
        return (
            m.matchId,
            m.closeTime,
            m.exists,
            m.settled,
            m.refundMode,
            m.winningOutcome,
            m.totalPool,
            m.payoutPool,
            m.pool[1],
            m.pool[2],
            m.pool[3]
        );
    }

    function stakeOf(bytes32 marketId, address user)
        external
        view
        returns (uint256 home, uint256 draw, uint256 away)
    {
        uint256[4] storage s = _stake[marketId][user];
        return (s[1], s[2], s[3]);
    }

    // ---- internal token transfer (handles standard + non-standard ERC20 like USDT) ----
    function _pullToken(address from, uint256 amount) private {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(0x23b872dd, from, address(this), amount)); // transferFrom
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "token transferFrom failed");
    }

    function _pushToken(address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount)); // transfer
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "token transfer failed");
    }
}
