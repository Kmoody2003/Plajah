// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SoulboundAthleteToken (ERC-5192)
 *
 * @notice Non-transferable career credential for Plajah athletes.
 *
 *         CONCEPT
 *         ───────
 *         Each athlete receives exactly ONE token (their "soul"). It cannot be
 *         sold, transferred, or faked — it is permanently bound to the wallet
 *         address created at Plajah registration.
 *
 *         Think of it as a blockchain transcript: colleges, coaches, and scouts
 *         can verify it against the athlete's on-chain career record in
 *         AthleteRegistry.sol without relying on self-reported stats.
 *
 *         WHAT THE TOKEN ACCUMULATES
 *         ──────────────────────────
 *         • Verified game records (written by authorized producers)
 *         • Career milestone badges (100 rushing yards, D1 interest, etc.)
 *         • Coach endorsement signatures
 *         • Academic milestone acknowledgments (GPA tier, graduation)
 *         • LOI (Letter of Intent) signing record
 *
 *         VERIFICATION MODEL
 *         ──────────────────
 *         Any address can call tokenOf(athleteAddress) to verify the token exists.
 *         Institutions pay a small USDC verification fee per check → revenue goes
 *         80% to athlete wallet, 20% to Plajah.
 *
 *         STATUS: Not yet activated — On The Horizon
 */
contract PlajahSoulboundToken is Ownable, ReentrancyGuard {

    // ─── ERC-5192 interface ID ─────────────────────────────────────────────
    bytes4 private constant _INTERFACE_ID_ERC5192 = 0xb45a3c0e;

    // USDC for verification fees
    address public immutable usdc;
    address public platform;

    uint256 public verificationFeeUsdc = 25_000_000; // $25.00 (6 decimals)
    uint256 private _nextTokenId = 1;

    // ─── Structs ──────────────────────────────────────────────────────────

    enum MilestoneBadge {
        DEBUT_GAME,
        FIRST_TOUCHDOWN,
        FIRST_GOAL,
        CENTURY_YARDS,      // 100+ rushing yards in a game
        TRIPLE_DOUBLE,      // Basketball triple-double
        ALL_STAR_SEASON,
        D1_INTEREST,        // College shows verified interest
        D1_OFFER,           // Verbal offer received
        LOI_SIGNED,         // Letter of Intent signed
        SIGNED_PRO,         // Professional contract signed
        ACADEMIC_HONOR,     // GPA milestone
        GRADUATION
    }

    struct SoulboundRecord {
        uint256 tokenId;
        address owner;
        string  plajahUserId;
        string  name;
        string  school;
        uint256 mintedAt;
        uint256 lastUpdated;
        uint32  verifiedGamesCount;
        uint32  totalCareerMilestones;
        bool    loiSigned;
        string  loiSchool;       // School of LOI signing
        string  loiIpfsCid;      // IPFS ref to signed LOI doc
        bool    locked;          // Always true (ERC-5192)
    }

    // athlete address → SoulboundRecord
    mapping(address => SoulboundRecord) public records;

    // tokenId → athlete address (reverse lookup)
    mapping(uint256 => address) public tokenOwner;

    // athlete address → earned badges
    mapping(address => mapping(uint8 => bool)) public badges;

    // athlete address → milestone timestamps
    mapping(address => mapping(uint8 => uint256)) public milestoneDates;

    // coach/institution address → athlete address → endorsement message hash
    mapping(address => mapping(address => bytes32)) public coachEndorsements;

    // ─── Events ───────────────────────────────────────────────────────────

    event Locked(uint256 indexed tokenId);
    event SoulboundIssued(uint256 indexed tokenId, address indexed athlete, string plajahUserId);
    event MilestoneAchieved(address indexed athlete, MilestoneBadge badge, uint256 timestamp);
    event CoachEndorsed(address indexed coach, address indexed athlete, bytes32 messageHash);
    event LOIRecorded(address indexed athlete, string school, string ipfsCid);
    event VerificationPerformed(address indexed institution, address indexed athlete, uint256 feeUsdc);

    // ─── Constructor ──────────────────────────────────────────────────────

    constructor(address initialOwner, address platformAddr, address usdcAddr)
        Ownable(initialOwner)
    {
        platform = platformAddr;
        usdc = usdcAddr;
    }

    // ─── Issuance ─────────────────────────────────────────────────────────

    /**
     * @notice Issue a soulbound token to an athlete. Called at Sports Profile activation.
     * @dev One token per address — reverts if already issued.
     */
    function issueSoulbound(
        address         athlete,
        string calldata plajahUserId,
        string calldata name,
        string calldata school
    ) external onlyOwner returns (uint256 tokenId) {
        require(records[athlete].mintedAt == 0, "Already issued");

        tokenId = _nextTokenId++;
        records[athlete] = SoulboundRecord({
            tokenId:              tokenId,
            owner:                athlete,
            plajahUserId:         plajahUserId,
            name:                 name,
            school:               school,
            mintedAt:             block.timestamp,
            lastUpdated:          block.timestamp,
            verifiedGamesCount:   0,
            totalCareerMilestones:0,
            loiSigned:            false,
            loiSchool:            '',
            loiIpfsCid:           '',
            locked:               true
        });
        tokenOwner[tokenId] = athlete;

        // Award debut badge
        _awardBadge(athlete, MilestoneBadge.DEBUT_GAME);

        emit Locked(tokenId);
        emit SoulboundIssued(tokenId, athlete, plajahUserId);
    }

    // ─── Milestone recording ──────────────────────────────────────────────

    /**
     * @notice Award a milestone badge. Called by Plajah platform when verified.
     */
    function awardMilestone(address athlete, MilestoneBadge badge) external onlyOwner {
        require(records[athlete].mintedAt > 0, "No token");
        _awardBadge(athlete, badge);
    }

    function incrementVerifiedGames(address athlete) external onlyOwner {
        require(records[athlete].mintedAt > 0, "No token");
        records[athlete].verifiedGamesCount++;
        records[athlete].lastUpdated = block.timestamp;
    }

    // ─── LOI recording ────────────────────────────────────────────────────

    /**
     * @notice Record a Letter of Intent signing on-chain.
     * @param ipfsCid  IPFS CID of the signed LOI document scan.
     */
    function recordLOI(
        address         athlete,
        string calldata schoolName,
        string calldata ipfsCid
    ) external onlyOwner {
        require(records[athlete].mintedAt > 0, "No token");
        require(!records[athlete].loiSigned, "LOI already recorded");

        records[athlete].loiSigned   = true;
        records[athlete].loiSchool   = schoolName;
        records[athlete].loiIpfsCid  = ipfsCid;
        records[athlete].lastUpdated = block.timestamp;

        _awardBadge(athlete, MilestoneBadge.LOI_SIGNED);

        emit LOIRecorded(athlete, schoolName, ipfsCid);
    }

    // ─── Coach endorsement ────────────────────────────────────────────────

    /**
     * @notice Coach signs a cryptographic endorsement for an athlete.
     * @param messageHash  keccak256 of "I, [CoachName] at [School], endorse [AthleteName]"
     *                     The plaintext is stored off-chain; hash proves it existed.
     */
    function endorseAthlete(address athlete, bytes32 messageHash) external {
        require(records[athlete].mintedAt > 0, "Athlete not registered");
        coachEndorsements[msg.sender][athlete] = messageHash;
        emit CoachEndorsed(msg.sender, athlete, messageHash);
    }

    // ─── Institution verification (paid) ─────────────────────────────────

    /**
     * @notice Institution pays USDC to perform a verified credential check.
     *         80% goes to athlete wallet, 20% to Plajah.
     */
    function verifyCredential(address athlete) external nonReentrant returns (bool valid) {
        require(records[athlete].mintedAt > 0, "No credential");

        IERC20(usdc).transferFrom(msg.sender, address(this), verificationFeeUsdc);

        uint256 athleteShare  = (verificationFeeUsdc * 8000) / 10000;
        uint256 platformShare = verificationFeeUsdc - athleteShare;

        IERC20(usdc).transfer(athlete, athleteShare);
        IERC20(usdc).transfer(platform, platformShare);

        emit VerificationPerformed(msg.sender, athlete, verificationFeeUsdc);
        return true;
    }

    // ─── ERC-5192: transfers ALWAYS revert ────────────────────────────────

    function transferFrom(address, address, uint256) external pure {
        revert("Soulbound: non-transferable");
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert("Soulbound: non-transferable");
    }

    function locked(uint256 tokenId) external view returns (bool) {
        return tokenOwner[tokenId] != address(0);
    }

    // ─── Read helpers ─────────────────────────────────────────────────────

    function tokenOf(address athlete) external view returns (uint256) {
        return records[athlete].tokenId;
    }

    function hasBadge(address athlete, MilestoneBadge badge) external view returns (bool) {
        return badges[athlete][uint8(badge)];
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == _INTERFACE_ID_ERC5192 || interfaceId == 0x01ffc9a7;
    }

    // ─── Internal ─────────────────────────────────────────────────────────

    function _awardBadge(address athlete, MilestoneBadge badge) internal {
        if (badges[athlete][uint8(badge)]) return;
        badges[athlete][uint8(badge)] = true;
        milestoneDates[athlete][uint8(badge)] = block.timestamp;
        records[athlete].totalCareerMilestones++;
        records[athlete].lastUpdated = block.timestamp;
        emit MilestoneAchieved(athlete, badge, block.timestamp);
    }
}

interface IERC20 {
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}
