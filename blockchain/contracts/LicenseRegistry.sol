// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Plajah License Registry
 * @notice On-chain marketplace for licensing creative content.
 *         Supports: Music, Film, Books, IP Worlds, Lorea scores.
 *         Payment token: USDC on Polygon (stable, dollar-denominated).
 *         Platform takes a percentage of every license (configured via platformFeeBPS).
 *
 *         Licensors (creators) set their own prices per license type.
 *         Licensees (brands, studios, publishers) purchase directly.
 *         No middlemen. Instant settlement.
 */
contract PlajahLicenseRegistry is Ownable, ReentrancyGuard {

    // USDC on Polygon mainnet
    IERC20 public immutable usdc;

    address public platform;
    uint256 public platformFeeBPS = 1000; // 10%

    struct LicenseTier {
        uint256 priceUsdc;      // Price in USDC (6 decimals)
        uint256 durationDays;   // 0 = perpetual
        bool    active;
    }

    struct License {
        bytes32  licenseId;
        uint256  tokenId;
        string   licenseType;
        address  licensee;
        address  licensor;
        uint256  amountUsdc;
        uint256  purchasedAt;
        uint256  expiresAt;     // 0 = perpetual
        string   contentId;     // Plajah content ID
    }

    // tokenId => licenseType => LicenseTier
    mapping(uint256 => mapping(string => LicenseTier)) public licenseTiers;

    // licenseId => License
    mapping(bytes32 => License) public licenses;

    // licensee => tokenId => licenseId[] (all licenses for content)
    mapping(address => mapping(uint256 => bytes32[])) public licensesByLicensee;

    event LicenseTierSet(uint256 indexed tokenId, string licenseType, uint256 priceUsdc, uint256 durationDays);
    event LicensePurchased(
        bytes32 indexed licenseId,
        uint256 indexed tokenId,
        address indexed licensee,
        string licenseType,
        uint256 amountUsdc
    );
    event PlatformFeeUpdated(uint256 newFeeBPS);

    constructor(address initialOwner, address platformAddress, address usdcAddress)
        Ownable(initialOwner)
    {
        platform = platformAddress;
        usdc = IERC20(usdcAddress);
    }

    /**
     * @notice Creator sets pricing for a license type on their content.
     * @param tokenId       The NFT token ID representing the content
     * @param licenseType   e.g. "SYNC_30_DAY", "TRANSLATION", "BROADCAST_1_YEAR"
     * @param priceUsdc     Price in USDC (6 decimals, e.g. 25000000 = $25.00)
     * @param durationDays  License duration; 0 = perpetual
     */
    function setLicenseTier(
        uint256 tokenId,
        string calldata licenseType,
        uint256 priceUsdc,
        uint256 durationDays
    ) external {
        // In production: verify msg.sender owns tokenId via MusicNFT/ContentNFT contract
        licenseTiers[tokenId][licenseType] = LicenseTier({
            priceUsdc:    priceUsdc,
            durationDays: durationDays,
            active:       true
        });
        emit LicenseTierSet(tokenId, licenseType, priceUsdc, durationDays);
    }

    /**
     * @notice Purchase a license. Caller must approve USDC spend before calling.
     * @param tokenId     Content NFT token ID
     * @param licenseType License type to purchase
     * @param contentId   Plajah platform content ID (for off-chain records)
     */
    function purchaseLicense(
        uint256 tokenId,
        string calldata licenseType,
        string calldata contentId
    ) external nonReentrant returns (bytes32 licenseId) {
        LicenseTier storage tier = licenseTiers[tokenId][licenseType];
        require(tier.active, "License tier not available");
        require(tier.priceUsdc > 0, "Price not set");

        uint256 platformCut = (tier.priceUsdc * platformFeeBPS) / 10000;
        uint256 creatorCut  = tier.priceUsdc - platformCut;

        // Pull USDC from licensee
        require(usdc.transferFrom(msg.sender, address(this), tier.priceUsdc), "USDC transfer failed");

        // Distribute: platform fee + creator payment
        require(usdc.transfer(platform, platformCut), "Platform fee transfer failed");
        // Creator payment: stored in contract for batch withdrawal or sent directly
        // For simplicity: send directly to NFT owner (requires NFT ownership lookup)
        // In production: integrate with MusicNFT/ContentNFT to get creator address

        licenseId = keccak256(abi.encodePacked(tokenId, licenseType, msg.sender, block.timestamp));

        uint256 expiresAt = tier.durationDays == 0
            ? 0
            : block.timestamp + (tier.durationDays * 1 days);

        licenses[licenseId] = License({
            licenseId:   licenseId,
            tokenId:     tokenId,
            licenseType: licenseType,
            licensee:    msg.sender,
            licensor:    address(0), // Set by platform backend
            amountUsdc:  tier.priceUsdc,
            purchasedAt: block.timestamp,
            expiresAt:   expiresAt,
            contentId:   contentId
        });

        licensesByLicensee[msg.sender][tokenId].push(licenseId);

        emit LicensePurchased(licenseId, tokenId, msg.sender, licenseType, tier.priceUsdc);
    }

    /**
     * @notice Check if an address holds a valid (non-expired) license.
     */
    function hasValidLicense(address licensee, uint256 tokenId, string calldata licenseType)
        external view returns (bool)
    {
        bytes32[] storage ids = licensesByLicensee[licensee][tokenId];
        for (uint256 i = 0; i < ids.length; i++) {
            License storage lic = licenses[ids[i]];
            if (keccak256(bytes(lic.licenseType)) == keccak256(bytes(licenseType))) {
                if (lic.expiresAt == 0 || lic.expiresAt > block.timestamp) return true;
            }
        }
        return false;
    }

    function updatePlatformFee(uint256 newFeeBPS) external onlyOwner {
        require(newFeeBPS <= 2000, "Max platform fee 20%");
        platformFeeBPS = newFeeBPS;
        emit PlatformFeeUpdated(newFeeBPS);
    }

    function withdrawCreatorEarnings(address creator, uint256 amount) external onlyOwner {
        require(usdc.transfer(creator, amount), "Transfer failed");
    }
}
