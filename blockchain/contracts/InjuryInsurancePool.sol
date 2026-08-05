// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PlajahInjuryInsurancePool
 *
 * @notice Community-funded injury protection for athletes.
 *
 *         CONCEPT
 *         ───────
 *         Fans stake PLAJ tokens into a pool dedicated to a specific athlete.
 *         If an authorized game producer logs an INJURY event (via the Sports Broadcast),
 *         the contract automatically releases the pool to the athlete's wallet.
 *
 *         No paperwork. No insurance company. No claims adjuster.
 *         The broadcast producer's verified signature IS the claim trigger.
 *
 *         DESIGN CONSTRAINTS
 *         ──────────────────
 *         • Minimum individual stake: 5 PLAJ
 *         • Each pool has a target size (e.g. 5,000 PLAJ = ~$250 at launch price)
 *         • Pools reset after a claim — backers can re-stake for next season
 *         • 3% management fee on claim payout (prevents pool gaming)
 *         • Backers earn proportional PLAJ "loyalty points" (tracked off-chain)
 *         • Cooling period: 30 days between claims per athlete
 *
 *         INJURY SEVERITY TIERS
 *         ──────────────────────
 *         MINOR   = 10% of pool released (sprain, minor fracture)
 *         MAJOR   = 50% of pool released (serious fracture, ligament tear)
 *         SEASON_ENDING = 100% of pool released (ACL, career-threatening)
 *
 *         STATUS: Not yet activated — On The Horizon (Q1 2027)
 */
contract PlajahInjuryInsurancePool is Ownable, ReentrancyGuard {

    IERC20 public immutable plaj;
    address public platform;

    uint256 public constant MIN_STAKE        = 5 ether;    // 5 PLAJ
    uint256 public constant MANAGEMENT_FEE   = 300;        // 3%
    uint256 public constant COOLING_PERIOD   = 30 days;

    enum InjurySeverity { MINOR, MAJOR, SEASON_ENDING }

    uint256[3] public SEVERITY_PCT = [1000, 5000, 10000]; // 10%, 50%, 100% in BPS

    // ─── Structs ─────────────────────────────────────────────────────────

    struct InsurancePool {
        bytes32  poolId;
        address  athlete;
        string   athleteUserId;
        uint256  targetSize;     // PLAJ target (e.g. 5000 ether)
        uint256  currentBalance;
        uint256  totalStaked;    // Lifetime staked
        uint256  totalPaidOut;   // Lifetime claimed
        uint256  lastClaimAt;    // Timestamp of last claim
        bool     active;
        uint256  createdAt;
    }

    struct Stake {
        address staker;
        uint256 amount;
        uint256 stakedAt;
        bool    active;
    }

    // poolId → InsurancePool
    mapping(bytes32 => InsurancePool) public pools;

    // poolId → staker → stake index
    mapping(bytes32 => mapping(address => uint256)) public stakerIndex;

    // poolId → stakes array
    mapping(bytes32 => Stake[]) public poolStakes;

    // poolId → staker → amount (fast lookup)
    mapping(bytes32 => mapping(address => uint256)) public stakerBalance;

    // athlete address → poolId (one pool per athlete)
    mapping(address => bytes32) public athletePool;

    // ─── Events ──────────────────────────────────────────────────────────

    event PoolCreated(bytes32 indexed poolId, address indexed athlete, uint256 targetSize);
    event Staked(bytes32 indexed poolId, address indexed staker, uint256 amount);
    event Unstaked(bytes32 indexed poolId, address indexed staker, uint256 amount);
    event ClaimTriggered(bytes32 indexed poolId, InjurySeverity severity, uint256 amountPaid);
    event PoolReset(bytes32 indexed poolId, uint256 newSeason);

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor(address initialOwner, address platformAddr, address plajAddr)
        Ownable(initialOwner)
    {
        platform = platformAddr;
        plaj     = IERC20(plajAddr);
    }

    // ─── Pool creation ────────────────────────────────────────────────────

    function createPool(
        bytes32         poolId,
        address         athleteWallet,
        string calldata athleteUserId,
        uint256         targetSizePlaj
    ) external onlyOwner {
        require(pools[poolId].createdAt == 0, "Pool exists");
        require(athletePool[athleteWallet] == bytes32(0), "Athlete has pool");

        pools[poolId] = InsurancePool({
            poolId:         poolId,
            athlete:        athleteWallet,
            athleteUserId:  athleteUserId,
            targetSize:     targetSizePlaj,
            currentBalance: 0,
            totalStaked:    0,
            totalPaidOut:   0,
            lastClaimAt:    0,
            active:         true,
            createdAt:      block.timestamp
        });

        athletePool[athleteWallet] = poolId;

        emit PoolCreated(poolId, athleteWallet, targetSizePlaj);
    }

    // ─── Staking ─────────────────────────────────────────────────────────

    function stake(bytes32 poolId, uint256 amount) external nonReentrant {
        InsurancePool storage p = pools[poolId];
        require(p.active, "Pool not active");
        require(amount >= MIN_STAKE, "Below minimum");
        require(p.currentBalance + amount <= p.targetSize, "Pool full");

        plaj.transferFrom(msg.sender, address(this), amount);

        if (stakerBalance[poolId][msg.sender] == 0) {
            poolStakes[poolId].push(Stake({
                staker:   msg.sender,
                amount:   amount,
                stakedAt: block.timestamp,
                active:   true
            }));
            stakerIndex[poolId][msg.sender] = poolStakes[poolId].length - 1;
        } else {
            uint256 idx = stakerIndex[poolId][msg.sender];
            poolStakes[poolId][idx].amount += amount;
        }

        stakerBalance[poolId][msg.sender] += amount;
        p.currentBalance += amount;
        p.totalStaked    += amount;

        emit Staked(poolId, msg.sender, amount);
    }

    function unstake(bytes32 poolId, uint256 amount) external nonReentrant {
        InsurancePool storage p = pools[poolId];
        require(stakerBalance[poolId][msg.sender] >= amount, "Insufficient stake");

        stakerBalance[poolId][msg.sender] -= amount;
        p.currentBalance -= amount;

        uint256 idx = stakerIndex[poolId][msg.sender];
        poolStakes[poolId][idx].amount -= amount;

        plaj.transfer(msg.sender, amount);

        emit Unstaked(poolId, msg.sender, amount);
    }

    // ─── Claim trigger (only authorized producers via platform) ──────────

    /**
     * @notice Triggered when a game producer logs an INJURY event.
     *         Releases pool funds proportional to severity tier.
     */
    function triggerClaim(bytes32 poolId, InjurySeverity severity) external onlyOwner nonReentrant {
        InsurancePool storage p = pools[poolId];
        require(p.active, "Pool not active");
        require(p.currentBalance > 0, "Pool empty");
        require(block.timestamp >= p.lastClaimAt + COOLING_PERIOD, "Cooling period");

        uint256 payoutPct   = SEVERITY_PCT[uint8(severity)];
        uint256 grossPayout = (p.currentBalance * payoutPct) / 10000;
        uint256 fee         = (grossPayout * MANAGEMENT_FEE) / 10000;
        uint256 netPayout   = grossPayout - fee;

        p.currentBalance -= grossPayout;
        p.totalPaidOut   += netPayout;
        p.lastClaimAt     = block.timestamp;

        plaj.transfer(platform, fee);
        plaj.transfer(p.athlete, netPayout);

        emit ClaimTriggered(poolId, severity, netPayout);
    }

    // ─── Season reset ─────────────────────────────────────────────────────

    /**
     * @notice Platform resets the pool between seasons (allows backers to re-stake).
     *         Any remaining balance stays in the pool for the new season.
     */
    function resetPoolForSeason(bytes32 poolId) external onlyOwner {
        InsurancePool storage p = pools[poolId];
        require(p.active, "Pool not active");
        emit PoolReset(poolId, block.timestamp);
    }

    // ─── Views ────────────────────────────────────────────────────────────

    function getPoolBalance(bytes32 poolId) external view returns (uint256) {
        return pools[poolId].currentBalance;
    }

    function getStakerBalance(bytes32 poolId, address staker) external view returns (uint256) {
        return stakerBalance[poolId][staker];
    }

    function getPoolFillPct(bytes32 poolId) external view returns (uint256) {
        InsurancePool storage p = pools[poolId];
        if (p.targetSize == 0) return 0;
        return (p.currentBalance * 10000) / p.targetSize;
    }
}
