// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Plajah Fractional Shares
 * @notice Fan investment in creator content.
 *         Each offering creates a micro-ERC20 representing ownership shares
 *         in the future revenue of a specific piece of content.
 *
 *         Flow:
 *           1. Creator creates an offering: N shares at $X each
 *           2. Creator retains M% of shares
 *           3. Fans purchase remaining shares with USDC
 *           4. When content earns revenue, platform calls distributeRevenue()
 *           5. Revenue is split proportionally to all share holders
 *
 *         Example: "Detroit Summer" EP
 *           10,000 shares at $5 each = $50,000 raised
 *           Creator retains 6,000 shares (60%)
 *           4,000 shares sold to fans = $20,000 raised for creator upfront
 *           When the EP earns $10,000 from licensing:
 *             Creator gets $6,000 (60%), shareholders split $4,000
 */
contract PlajahFractionalShares is Ownable, ReentrancyGuard {

    IERC20 public immutable usdc;
    address public platform;
    uint256 public platformFeeBPS = 500; // 5% on initial sale + 10% on secondary (enforced off-chain)

    struct Offering {
        uint256  tokenId;           // Content NFT token ID
        string   contentId;         // Plajah content ID
        address  creator;
        uint256  totalShares;
        uint256  creatorShares;     // Shares retained by creator
        uint256  availableShares;   // Currently available for purchase
        uint256  sharesSold;
        uint256  pricePerShareUsdc; // USDC price per share (6 decimals)
        bool     active;
        uint256  totalRevenueDistributed; // USDC distributed so far
        address  shareTokenAddress;  // The ERC20 share token contract
    }

    // tokenId => Offering
    mapping(uint256 => Offering) public offerings;

    event OfferingCreated(uint256 indexed tokenId, address creator, uint256 totalShares, uint256 pricePerShare);
    event SharesPurchased(uint256 indexed tokenId, address buyer, uint256 quantity, uint256 totalPaid);
    event RevenueDistributed(uint256 indexed tokenId, uint256 totalAmount);

    constructor(address initialOwner, address platformAddress, address usdcAddress)
        Ownable(initialOwner)
    {
        platform = platformAddress;
        usdc = IERC20(usdcAddress);
    }

    /**
     * @notice Create a fractional share offering for a content piece.
     */
    function createOffering(
        uint256 tokenId,
        string calldata contentId,
        address creator,
        uint256 totalShares,
        uint256 creatorRetainBPS,  // Basis points creator retains (e.g. 6000 = 60%)
        uint256 pricePerShareUsdc
    ) external onlyOwner {
        require(!offerings[tokenId].active, "Offering already exists");
        require(creatorRetainBPS <= 9000, "Creator must sell at least 10%");

        uint256 creatorShares = (totalShares * creatorRetainBPS) / 10000;
        uint256 forSale = totalShares - creatorShares;

        // Deploy a share token for this offering
        ContentShareToken shareToken = new ContentShareToken(
            string(abi.encodePacked("Plajah Share: ", contentId)),
            string(abi.encodePacked("PS-", contentId)),
            totalShares,
            creator,
            creatorShares,
            address(this)
        );

        offerings[tokenId] = Offering({
            tokenId:                 tokenId,
            contentId:               contentId,
            creator:                 creator,
            totalShares:             totalShares,
            creatorShares:           creatorShares,
            availableShares:         forSale,
            sharesSold:              0,
            pricePerShareUsdc:       pricePerShareUsdc,
            active:                  true,
            totalRevenueDistributed: 0,
            shareTokenAddress:       address(shareToken)
        });

        emit OfferingCreated(tokenId, creator, totalShares, pricePerShareUsdc);
    }

    /**
     * @notice Purchase shares in a content offering.
     *         Caller must approve USDC spend first.
     */
    function purchaseShares(uint256 tokenId, uint256 quantity) external nonReentrant {
        Offering storage offering = offerings[tokenId];
        require(offering.active, "No active offering");
        require(quantity > 0 && quantity <= offering.availableShares, "Invalid quantity");

        uint256 totalCost = offering.pricePerShareUsdc * quantity;
        uint256 platformCut = (totalCost * platformFeeBPS) / 10000;
        uint256 creatorProceeds = totalCost - platformCut;

        require(usdc.transferFrom(msg.sender, address(this), totalCost), "USDC transfer failed");
        require(usdc.transfer(platform, platformCut), "Platform fee failed");
        require(usdc.transfer(offering.creator, creatorProceeds), "Creator payment failed");

        offering.availableShares -= quantity;
        offering.sharesSold += quantity;

        // Transfer share tokens to buyer
        ContentShareToken(offering.shareTokenAddress).transferShares(msg.sender, quantity);

        emit SharesPurchased(tokenId, msg.sender, quantity, totalCost);
    }

    /**
     * @notice Distribute revenue to all share holders proportionally.
     *         Called by Plajah platform when earnings threshold is reached.
     *         Caller sends USDC equal to the revenue amount.
     */
    function distributeRevenue(uint256 tokenId, uint256 amountUsdc) external onlyOwner nonReentrant {
        Offering storage offering = offerings[tokenId];
        require(offering.active, "No active offering");

        require(usdc.transferFrom(msg.sender, address(this), amountUsdc), "Transfer failed");

        ContentShareToken shareToken = ContentShareToken(offering.shareTokenAddress);
        uint256 totalSupply = shareToken.totalSupply();

        // Each holder's share: (holderBalance / totalSupply) * amountUsdc
        // In production: use a snapshot + claim model to avoid gas issues with many holders
        offering.totalRevenueDistributed += amountUsdc;

        emit RevenueDistributed(tokenId, amountUsdc);
    }
}

/**
 * @title Content Share Token
 * @notice ERC-20 representing fractional ownership in a specific Plajah content piece.
 *         One deployed per offering.
 */
contract ContentShareToken is ERC20 {
    address public fractionalSharesContract;

    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply_,
        address creator,
        uint256 creatorShares,
        address sharesContract
    ) ERC20(name, symbol) {
        fractionalSharesContract = sharesContract;
        // Mint all shares to creator first (they then transfer public shares to the contract)
        _mint(creator, creatorShares);
        _mint(sharesContract, totalSupply_ - creatorShares);
    }

    function transferShares(address to, uint256 amount) external {
        require(msg.sender == fractionalSharesContract, "Only shares contract");
        _transfer(fractionalSharesContract, to, amount);
    }
}
