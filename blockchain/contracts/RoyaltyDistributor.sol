// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Plajah Royalty Distributor
 * @notice Handles automated multi-party royalty splitting for all content types.
 *         Used for:
 *           - Streaming revenue splits (platform cut + creator)
 *           - Collaborative content (multiple creators)
 *           - Fractional shareholder distributions
 *           - Cross-vertical licensing proceeds
 *
 *         All amounts in USDC (6 decimals).
 *         Platform always takes its cut first, remainder goes to creator/collaborators.
 */
contract PlajahRoyaltyDistributor is Ownable, ReentrancyGuard {

    IERC20 public immutable usdc;
    address public platform;
    uint256 public platformFeeBPS = 1000; // 10% default

    struct SplitConfig {
        address[] recipients;
        uint256[] sharesBPS;    // Must sum to 10000 (100%)
        bool      exists;
    }

    // contentId => SplitConfig
    mapping(string => SplitConfig) public splits;

    // Accumulated balances for pull-based withdrawals
    mapping(address => uint256) public pendingWithdrawals;

    event SplitConfigured(string indexed contentId, address[] recipients, uint256[] sharesBPS);
    event RoyaltyDistributed(string indexed contentId, uint256 totalAmount, uint256 platformCut);
    event Withdrawn(address indexed recipient, uint256 amount);

    constructor(address initialOwner, address platformAddress, address usdcAddress)
        Ownable(initialOwner)
    {
        platform = platformAddress;
        usdc = IERC20(usdcAddress);
    }

    /**
     * @notice Configure how royalties are split for a content piece.
     *         Called by Plajah platform at content creation time.
     */
    function configureSplit(
        string calldata contentId,
        address[] calldata recipients,
        uint256[] calldata sharesBPS
    ) external onlyOwner {
        require(recipients.length == sharesBPS.length, "Length mismatch");
        require(recipients.length > 0 && recipients.length <= 20, "1–20 recipients");

        uint256 total = 0;
        for (uint256 i = 0; i < sharesBPS.length; i++) total += sharesBPS[i];
        require(total == 10000, "Shares must total 100%");

        splits[contentId] = SplitConfig({
            recipients: recipients,
            sharesBPS:  sharesBPS,
            exists:     true
        });

        emit SplitConfigured(contentId, recipients, sharesBPS);
    }

    /**
     * @notice Distribute revenue for a content piece according to its split config.
     *         Caller must approve USDC transfer first.
     *         Platform fee deducted before creator split.
     */
    function distribute(string calldata contentId, uint256 amountUsdc) external nonReentrant {
        SplitConfig storage config = splits[contentId];
        require(config.exists, "No split configured for this content");

        require(usdc.transferFrom(msg.sender, address(this), amountUsdc), "USDC transfer failed");

        uint256 platformCut = (amountUsdc * platformFeeBPS) / 10000;
        uint256 remaining   = amountUsdc - platformCut;

        pendingWithdrawals[platform] += platformCut;

        for (uint256 i = 0; i < config.recipients.length; i++) {
            uint256 share = (remaining * config.sharesBPS[i]) / 10000;
            pendingWithdrawals[config.recipients[i]] += share;
        }

        emit RoyaltyDistributed(contentId, amountUsdc, platformCut);
    }

    /**
     * @notice Pull-based withdrawal — recipients claim their accumulated earnings.
     */
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        require(usdc.transfer(msg.sender, amount), "Transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    function updatePlatformFee(uint256 newFeeBPS) external onlyOwner {
        require(newFeeBPS <= 2000, "Max 20%");
        platformFeeBPS = newFeeBPS;
    }

    function updatePlatform(address newPlatform) external onlyOwner {
        platform = newPlatform;
    }
}
