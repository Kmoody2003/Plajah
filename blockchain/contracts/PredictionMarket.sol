// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PlajahPredictionMarket
 *
 * @notice PLAJ-token-backed prediction markets resolved by on-chain athlete stats.
 *
 *         CONCEPT
 *         ───────
 *         Fans stake PLAJ tokens on binary outcomes tied to verified stat thresholds.
 *         Examples:
 *           "Will Marcus rush for 1,000 yards this season?"     YES / NO
 *           "Will Lincoln High score 30+ points Friday night?"  YES / NO
 *           "Will #7 score a TD in the first quarter?"         YES / NO
 *
 *         Markets are created by the platform (linked to athlete/game on AthleteRegistry).
 *         They resolve automatically when the stat threshold is crossed — or expire as NO
 *         when the window closes. No oracle needed: Plajah's broadcast IS the oracle.
 *
 *         ECONOMICS
 *         ─────────
 *         • Platform takes 5% of the total pool on resolution
 *         • 95% distributed pro-rata to winning stakers
 *         • Minimum stake: 10 PLAJ
 *         • Markets can be game-level or season-level
 *
 *         STATUS: Not yet activated — On The Horizon (Q4 2026)
 */
contract PlajahPredictionMarket is Ownable, ReentrancyGuard {

    IERC20 public immutable plaj;
    address public platform;

    uint256 public constant MIN_STAKE      = 10 ether;  // 10 PLAJ
    uint256 public constant PLATFORM_FEE   = 500;       // 5% in BPS
    uint256 public constant FEE_DENOM      = 10000;

    // ─── Structs ─────────────────────────────────────────────────────────

    enum Outcome { UNRESOLVED, YES, NO, CANCELLED }

    struct Market {
        bytes32  marketId;
        string   question;         // "Will Marcus rush for 1000 yards?"
        string   athleteUserId;    // Plajah UID
        address  athleteWallet;
        bytes32  gameId;           // 0x0 for season-level
        string   statKey;          // e.g. "RUSHING_YARDS"
        uint32   threshold;        // e.g. 1000
        uint256  windowEnd;        // Deadline timestamp
        uint256  yesPool;          // Total PLAJ staked YES
        uint256  noPool;           // Total PLAJ staked NO
        Outcome  outcome;
        bool     resolved;
        uint256  platformFeeCollected;
    }

    // marketId → Market
    mapping(bytes32 => Market) public markets;

    // marketId → staker → YES amount
    mapping(bytes32 => mapping(address => uint256)) public yesStakes;

    // marketId => staker => NO amount
    mapping(bytes32 => mapping(address => uint256)) public noStakes;

    // marketId => claimed
    mapping(bytes32 => mapping(address => bool)) public claimed;

    // ─── Events ──────────────────────────────────────────────────────────

    event MarketCreated(bytes32 indexed marketId, string question, string athleteUserId, uint256 windowEnd);
    event Staked(bytes32 indexed marketId, address indexed staker, bool yes, uint256 amount);
    event MarketResolved(bytes32 indexed marketId, Outcome outcome, uint256 totalPool);
    event Claimed(bytes32 indexed marketId, address indexed staker, uint256 amount);
    event MarketCancelled(bytes32 indexed marketId);

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor(address initialOwner, address platformAddr, address plajAddr)
        Ownable(initialOwner)
    {
        platform = platformAddr;
        plaj     = IERC20(plajAddr);
    }

    // ─── Market Creation ─────────────────────────────────────────────────

    function createMarket(
        bytes32         marketId,
        string calldata question,
        string calldata athleteUserId,
        address         athleteWallet,
        bytes32         gameId,
        string calldata statKey,
        uint32          threshold,
        uint256         windowEnd
    ) external onlyOwner {
        require(markets[marketId].windowEnd == 0, "Already exists");
        require(windowEnd > block.timestamp, "Window expired");

        markets[marketId] = Market({
            marketId:           marketId,
            question:           question,
            athleteUserId:      athleteUserId,
            athleteWallet:      athleteWallet,
            gameId:             gameId,
            statKey:            statKey,
            threshold:          threshold,
            windowEnd:          windowEnd,
            yesPool:            0,
            noPool:             0,
            outcome:            Outcome.UNRESOLVED,
            resolved:           false,
            platformFeeCollected: 0
        });

        emit MarketCreated(marketId, question, athleteUserId, windowEnd);
    }

    // ─── Staking ─────────────────────────────────────────────────────────

    function stakeYes(bytes32 marketId, uint256 amount) external nonReentrant {
        _stake(marketId, true, amount);
    }

    function stakeNo(bytes32 marketId, uint256 amount) external nonReentrant {
        _stake(marketId, false, amount);
    }

    function _stake(bytes32 marketId, bool yes, uint256 amount) internal {
        Market storage m = markets[marketId];
        require(!m.resolved, "Market resolved");
        require(block.timestamp < m.windowEnd, "Window closed");
        require(amount >= MIN_STAKE, "Below minimum stake");

        plaj.transferFrom(msg.sender, address(this), amount);

        if (yes) {
            yesStakes[marketId][msg.sender] += amount;
            m.yesPool += amount;
        } else {
            noStakes[marketId][msg.sender] += amount;
            m.noPool += amount;
        }

        emit Staked(marketId, msg.sender, yes, amount);
    }

    // ─── Resolution (called by platform when stat threshold crossed) ─────

    /**
     * @notice Resolve the market. Called automatically when AthleteRegistry
     *         records a stat that crosses the threshold.
     * @param outcome  YES (threshold crossed) or NO (window expired without crossing)
     */
    function resolveMarket(bytes32 marketId, Outcome outcome) external onlyOwner {
        Market storage m = markets[marketId];
        require(!m.resolved, "Already resolved");
        require(outcome == Outcome.YES || outcome == Outcome.NO, "Invalid outcome");

        m.outcome  = outcome;
        m.resolved = true;

        uint256 totalPool = m.yesPool + m.noPool;
        if (totalPool > 0) {
            uint256 fee = (totalPool * PLATFORM_FEE) / FEE_DENOM;
            m.platformFeeCollected = fee;
            plaj.transfer(platform, fee);
        }

        emit MarketResolved(marketId, outcome, totalPool);
    }

    function cancelMarket(bytes32 marketId) external onlyOwner {
        Market storage m = markets[marketId];
        require(!m.resolved, "Already resolved");
        m.resolved = true;
        m.outcome  = Outcome.CANCELLED;
        emit MarketCancelled(marketId);
    }

    // ─── Claiming winnings ────────────────────────────────────────────────

    function claim(bytes32 marketId) external nonReentrant {
        Market storage m = markets[marketId];
        require(m.resolved, "Not resolved");
        require(!claimed[marketId][msg.sender], "Already claimed");

        claimed[marketId][msg.sender] = true;
        uint256 payout = _calculatePayout(marketId, msg.sender);
        require(payout > 0, "Nothing to claim");
        plaj.transfer(msg.sender, payout);

        emit Claimed(marketId, msg.sender, payout);
    }

    function _calculatePayout(bytes32 marketId, address staker) internal view returns (uint256) {
        Market storage m = markets[marketId];
        uint256 totalPool = m.yesPool + m.noPool;
        uint256 netPool   = totalPool - m.platformFeeCollected;

        if (m.outcome == Outcome.CANCELLED) {
            return yesStakes[marketId][staker] + noStakes[marketId][staker];
        }
        if (m.outcome == Outcome.YES && m.yesPool > 0) {
            return (yesStakes[marketId][staker] * netPool) / m.yesPool;
        }
        if (m.outcome == Outcome.NO && m.noPool > 0) {
            return (noStakes[marketId][staker] * netPool) / m.noPool;
        }
        return 0;
    }

    // ─── Views ────────────────────────────────────────────────────────────

    function getStakerPosition(bytes32 marketId, address staker)
        external view returns (uint256 yesAmt, uint256 noAmt)
    {
        return (yesStakes[marketId][staker], noStakes[marketId][staker]);
    }

    function getPotentialPayout(bytes32 marketId, address staker) external view returns (uint256) {
        return _calculatePayout(marketId, staker);
    }
}
