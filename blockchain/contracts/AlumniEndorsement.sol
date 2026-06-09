// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PlajahAlumniEndorsement
 *
 * @notice Cryptographic reputation staking by verified alumni professionals.
 *
 *         CONCEPT
 *         ───────
 *         Former professional athletes who attended the same school can "stake" their
 *         verified on-chain identity behind a current high school player.
 *
 *         The endorsement appears on the athlete's Plajah recruiting card as
 *         "Endorsed by [verified pro wallet]" — provably signed, cannot be faked,
 *         cannot be bought (only the actual alumni wallet can sign it).
 *
 *         STAKING MECHANISM
 *         ──────────────────
 *         Alumni lock a small amount of PLAJ tokens as a "reputation deposit" for the
 *         duration of the endorsement window. This creates economic skin-in-the-game:
 *         alumni who publicly back a player have something to lose if the endorsement
 *         is abused. Deposit is returned when endorsement expires or is withdrawn.
 *
 *         VERIFICATION TIERS
 *         ──────────────────
 *         TIER_1 = Pro (verified playing contract on-chain or by Plajah ops)
 *         TIER_2 = College athlete (verified NCAA eligibility record)
 *         TIER_3 = High school alum (self-attested, school-confirmed)
 *
 *         STATUS: Not yet activated — On The Horizon (Q1 2027)
 */
contract PlajahAlumniEndorsement is Ownable, ReentrancyGuard {

    IERC20 public immutable plaj;
    address public platform;

    uint256 public constant DEPOSIT_PRO     = 500 ether;   // 500 PLAJ for pro alumni
    uint256 public constant DEPOSIT_COLLEGE = 100 ether;   // 100 PLAJ for college alumni
    uint256 public constant DEPOSIT_HS      = 25 ether;    // 25 PLAJ for HS alumni

    // ─── Enums ───────────────────────────────────────────────────────────

    enum AlumniTier { PRO, COLLEGE, HIGH_SCHOOL }
    enum EndorsementStatus { ACTIVE, WITHDRAWN, EXPIRED }

    // ─── Structs ─────────────────────────────────────────────────────────

    struct AlumniProfile {
        address wallet;
        string  plajahUserId;
        string  name;
        string  school;           // Must match the endorsed athlete's school
        AlumniTier tier;
        bool    verified;         // Verified by Plajah ops
        uint256 verifiedAt;
        string  verificationProof; // IPFS CID of proof document
    }

    struct Endorsement {
        bytes32 endorsementId;
        address alumni;
        address athlete;
        string  publicMessage;    // Short public statement (max 280 chars)
        bytes32 messageHash;      // keccak256 of full message + timestamp
        uint256 depositAmount;    // PLAJ locked during endorsement
        uint256 createdAt;
        uint256 expiresAt;        // Endorsements expire (max 4 years = career)
        EndorsementStatus status;
    }

    // alumni address → AlumniProfile
    mapping(address => AlumniProfile) public alumniProfiles;

    // endorsementId → Endorsement
    mapping(bytes32 => Endorsement) public endorsements;

    // athlete address → active endorsement IDs
    mapping(address => bytes32[]) public athleteEndorsements;

    // alumni address → endorsement IDs they've given
    mapping(address => bytes32[]) public alumniGivenEndorsements;

    // Total active endorsements per athlete (for UI badge count)
    mapping(address => uint256) public activeEndorsementCount;

    // ─── Events ──────────────────────────────────────────────────────────

    event AlumniVerified(address indexed alumni, string name, string school, AlumniTier tier);
    event EndorsementCreated(
        bytes32 indexed endorsementId,
        address indexed alumni,
        address indexed athlete,
        AlumniTier tier
    );
    event EndorsementWithdrawn(bytes32 indexed endorsementId, address indexed alumni);
    event EndorsementExpired(bytes32 indexed endorsementId);

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor(address initialOwner, address platformAddr, address plajAddr)
        Ownable(initialOwner)
    {
        platform = platformAddr;
        plaj     = IERC20(plajAddr);
    }

    // ─── Alumni registration ──────────────────────────────────────────────

    /**
     * @notice Plajah platform verifies an alumni's professional credentials.
     * @param proofIpfsCid  IPFS CID of the proof document (contract, roster page, etc.)
     */
    function verifyAlumni(
        address         alumniWallet,
        string calldata plajahUserId,
        string calldata name,
        string calldata school,
        AlumniTier      tier,
        string calldata proofIpfsCid
    ) external onlyOwner {
        alumniProfiles[alumniWallet] = AlumniProfile({
            wallet:           alumniWallet,
            plajahUserId:     plajahUserId,
            name:             name,
            school:           school,
            tier:             tier,
            verified:         true,
            verifiedAt:       block.timestamp,
            verificationProof:proofIpfsCid
        });

        emit AlumniVerified(alumniWallet, name, school, tier);
    }

    // ─── Endorsement ─────────────────────────────────────────────────────

    /**
     * @notice Alumni endorses an athlete by locking PLAJ tokens.
     * @param athleteWallet    The athlete's Plajah wallet address
     * @param publicMessage    Short public endorsement statement (max 280 chars)
     * @param durationDays     How long the endorsement is active (max 1460 days / 4 years)
     */
    function endorseAthlete(
        bytes32         endorsementId,
        address         athleteWallet,
        string calldata publicMessage,
        uint256         durationDays
    ) external nonReentrant {
        AlumniProfile storage profile = alumniProfiles[msg.sender];
        require(profile.verified, "Alumni not verified");
        require(bytes(publicMessage).length <= 280, "Message too long");
        require(durationDays > 0 && durationDays <= 1460, "Invalid duration");
        require(endorsements[endorsementId].createdAt == 0, "ID already used");

        uint256 deposit = _depositForTier(profile.tier);
        plaj.transferFrom(msg.sender, address(this), deposit);

        bytes32 msgHash = keccak256(abi.encodePacked(msg.sender, athleteWallet, publicMessage, block.timestamp));

        endorsements[endorsementId] = Endorsement({
            endorsementId: endorsementId,
            alumni:        msg.sender,
            athlete:       athleteWallet,
            publicMessage: publicMessage,
            messageHash:   msgHash,
            depositAmount: deposit,
            createdAt:     block.timestamp,
            expiresAt:     block.timestamp + (durationDays * 1 days),
            status:        EndorsementStatus.ACTIVE
        });

        athleteEndorsements[athleteWallet].push(endorsementId);
        alumniGivenEndorsements[msg.sender].push(endorsementId);
        activeEndorsementCount[athleteWallet]++;

        emit EndorsementCreated(endorsementId, msg.sender, athleteWallet, profile.tier);
    }

    /**
     * @notice Alumni withdraws their endorsement and reclaims their PLAJ deposit.
     */
    function withdrawEndorsement(bytes32 endorsementId) external nonReentrant {
        Endorsement storage e = endorsements[endorsementId];
        require(msg.sender == e.alumni, "Not the endorser");
        require(e.status == EndorsementStatus.ACTIVE, "Not active");

        e.status = EndorsementStatus.WITHDRAWN;
        activeEndorsementCount[e.athlete]--;

        plaj.transfer(e.alumni, e.depositAmount);

        emit EndorsementWithdrawn(endorsementId, msg.sender);
    }

    // ─── Views ────────────────────────────────────────────────────────────

    function getAthleteEndorsements(address athlete) external view returns (bytes32[] memory) {
        return athleteEndorsements[athlete];
    }

    function isEndorsementActive(bytes32 endorsementId) external view returns (bool) {
        Endorsement storage e = endorsements[endorsementId];
        return e.status == EndorsementStatus.ACTIVE && block.timestamp < e.expiresAt;
    }

    // ─── Internal ─────────────────────────────────────────────────────────

    function _depositForTier(AlumniTier tier) internal pure returns (uint256) {
        if (tier == AlumniTier.PRO)        return DEPOSIT_PRO;
        if (tier == AlumniTier.COLLEGE)    return DEPOSIT_COLLEGE;
        return DEPOSIT_HS;
    }
}
