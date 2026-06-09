// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PlajahBoosterClubDAO
 *
 * @notice On-chain governance and treasury for school athletic programs.
 *
 *         CONCEPT
 *         ───────
 *         School programs launch a Booster Club DAO. Community members (boosters,
 *         parents, alumni, fans) contribute USDC which is held in this contract.
 *
 *         DAO members vote with PLAJ tokens on how to spend the treasury:
 *         equipment purchases, travel budgets, training camps, field improvements.
 *
 *         Every dollar in and out is visible on Polygonscan — full transparency for
 *         programs that have struggled with financial accountability.
 *
 *         FUNDING MODEL
 *         ─────────────
 *         Contributions: any amount of USDC from any supporter
 *         Voting weight: proportional to PLAJ tokens held (capped per wallet to
 *                       prevent whale dominance — max 10% of voting power)
 *         Execution:     proposals pass with 51% quorum + 3-day voting window
 *         Platform fee:  2% on all USDC inflows to the DAO treasury
 *
 *         STATUS: Not yet activated — On The Horizon (Q4 2026)
 */
contract PlajahBoosterClubDAO is Ownable, ReentrancyGuard {

    IERC20 public immutable usdc;
    IERC20 public immutable plaj;
    address public platform;

    uint256 public constant PLATFORM_FEE_BPS = 200;  // 2%
    uint256 public constant VOTING_WINDOW     = 3 days;
    uint256 public constant QUORUM_BPS        = 5100; // 51%
    uint256 public constant MAX_VOTER_BPS     = 1000; // 10% cap per wallet

    // ─── Structs ─────────────────────────────────────────────────────────

    struct DAO {
        bytes32  daoId;
        string   schoolName;
        string   plajahClubId;   // Links to existing Club system in Plajah
        address  programWallet;  // Receives funds when proposals pass
        uint256  treasuryUsdc;   // Current USDC balance
        uint256  totalContributed;
        uint256  totalSpent;
        bool     active;
        uint256  createdAt;
    }

    enum ProposalStatus { PENDING, ACTIVE, PASSED, FAILED, EXECUTED, CANCELLED }

    struct Proposal {
        bytes32        proposalId;
        bytes32        daoId;
        address        proposer;
        string         title;
        string         description;   // What the funds will be used for
        string         ipfsCid;       // Full proposal doc + receipts/quotes
        uint256        amountUsdc;    // Amount requested from treasury
        address        recipient;     // Who receives the funds
        uint256        votesFor;      // PLAJ-weighted yes votes
        uint256        votesAgainst;
        uint256        createdAt;
        uint256        votingEndsAt;
        ProposalStatus status;
    }

    // daoId → DAO
    mapping(bytes32 => DAO) public daos;

    // proposalId → Proposal
    mapping(bytes32 => Proposal) public proposals;

    // daoId → proposal IDs
    mapping(bytes32 => bytes32[]) public daoProposals;

    // proposalId → voter → hasVoted
    mapping(bytes32 => mapping(address => bool)) public hasVoted;

    // proposalId → voter → vote (true = yes)
    mapping(bytes32 => mapping(address => bool)) public votes;

    // daoId → contributor → amount contributed
    mapping(bytes32 => mapping(address => uint256)) public contributions;

    // ─── Events ──────────────────────────────────────────────────────────

    event DAOCreated(bytes32 indexed daoId, string schoolName, string plajahClubId);
    event ContributionReceived(bytes32 indexed daoId, address contributor, uint256 amountUsdc);
    event ProposalCreated(bytes32 indexed proposalId, bytes32 indexed daoId, string title, uint256 amountUsdc);
    event Voted(bytes32 indexed proposalId, address indexed voter, bool yes, uint256 weight);
    event ProposalPassed(bytes32 indexed proposalId, uint256 votesFor, uint256 votesAgainst);
    event ProposalFailed(bytes32 indexed proposalId);
    event ProposalExecuted(bytes32 indexed proposalId, address recipient, uint256 amountUsdc);

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor(address initialOwner, address platformAddr, address usdcAddr, address plajAddr)
        Ownable(initialOwner)
    {
        platform = platformAddr;
        usdc     = IERC20(usdcAddr);
        plaj     = IERC20(plajAddr);
    }

    // ─── DAO creation (by Plajah platform when club activates DAO mode) ──

    function createDAO(
        bytes32         daoId,
        string calldata schoolName,
        string calldata plajahClubId,
        address         programWallet
    ) external onlyOwner {
        require(daos[daoId].createdAt == 0, "DAO already exists");

        daos[daoId] = DAO({
            daoId:           daoId,
            schoolName:      schoolName,
            plajahClubId:    plajahClubId,
            programWallet:   programWallet,
            treasuryUsdc:    0,
            totalContributed:0,
            totalSpent:      0,
            active:          true,
            createdAt:       block.timestamp
        });

        emit DAOCreated(daoId, schoolName, plajahClubId);
    }

    // ─── Contributions ────────────────────────────────────────────────────

    function contribute(bytes32 daoId, uint256 amountUsdc) external nonReentrant {
        DAO storage d = daos[daoId];
        require(d.active, "DAO not active");

        usdc.transferFrom(msg.sender, address(this), amountUsdc);

        uint256 fee = (amountUsdc * PLATFORM_FEE_BPS) / 10000;
        usdc.transfer(platform, fee);

        uint256 net = amountUsdc - fee;
        d.treasuryUsdc    += net;
        d.totalContributed += amountUsdc;
        contributions[daoId][msg.sender] += amountUsdc;

        emit ContributionReceived(daoId, msg.sender, amountUsdc);
    }

    // ─── Proposals ────────────────────────────────────────────────────────

    function createProposal(
        bytes32         proposalId,
        bytes32         daoId,
        string calldata title,
        string calldata description,
        string calldata ipfsCid,
        uint256         amountUsdc,
        address         recipient
    ) external {
        DAO storage d = daos[daoId];
        require(d.active, "DAO not active");
        require(amountUsdc <= d.treasuryUsdc, "Insufficient treasury");
        require(plaj.balanceOf(msg.sender) > 0, "Must hold PLAJ to propose");

        proposals[proposalId] = Proposal({
            proposalId:   proposalId,
            daoId:        daoId,
            proposer:     msg.sender,
            title:        title,
            description:  description,
            ipfsCid:      ipfsCid,
            amountUsdc:   amountUsdc,
            recipient:    recipient,
            votesFor:     0,
            votesAgainst: 0,
            createdAt:    block.timestamp,
            votingEndsAt: block.timestamp + VOTING_WINDOW,
            status:       ProposalStatus.ACTIVE
        });

        daoProposals[daoId].push(proposalId);

        emit ProposalCreated(proposalId, daoId, title, amountUsdc);
    }

    // ─── Voting ───────────────────────────────────────────────────────────

    function vote(bytes32 proposalId, bool yes) external {
        Proposal storage p = proposals[proposalId];
        require(p.status == ProposalStatus.ACTIVE, "Not active");
        require(block.timestamp < p.votingEndsAt, "Voting ended");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        uint256 balance = plaj.balanceOf(msg.sender);
        require(balance > 0, "No PLAJ tokens");

        hasVoted[proposalId][msg.sender] = true;
        votes[proposalId][msg.sender]    = yes;

        if (yes) p.votesFor     += balance;
        else     p.votesAgainst += balance;

        emit Voted(proposalId, msg.sender, yes, balance);
    }

    // ─── Resolution ───────────────────────────────────────────────────────

    function resolveProposal(bytes32 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(p.status == ProposalStatus.ACTIVE, "Not active");
        require(block.timestamp >= p.votingEndsAt, "Voting ongoing");

        uint256 totalVotes = p.votesFor + p.votesAgainst;

        if (totalVotes == 0 || p.votesFor * 10000 < totalVotes * QUORUM_BPS) {
            p.status = ProposalStatus.FAILED;
            emit ProposalFailed(proposalId);
            return;
        }

        p.status = ProposalStatus.PASSED;
        emit ProposalPassed(proposalId, p.votesFor, p.votesAgainst);
    }

    function executeProposal(bytes32 proposalId) external onlyOwner nonReentrant {
        Proposal storage p = proposals[proposalId];
        require(p.status == ProposalStatus.PASSED, "Not passed");

        DAO storage d = daos[p.daoId];
        require(p.amountUsdc <= d.treasuryUsdc, "Treasury depleted");

        p.status = ProposalStatus.EXECUTED;
        d.treasuryUsdc -= p.amountUsdc;
        d.totalSpent   += p.amountUsdc;

        usdc.transfer(p.recipient, p.amountUsdc);

        emit ProposalExecuted(proposalId, p.recipient, p.amountUsdc);
    }

    // ─── Views ────────────────────────────────────────────────────────────

    function getDAOProposals(bytes32 daoId) external view returns (bytes32[] memory) {
        return daoProposals[daoId];
    }

    function getTreasuryBalance(bytes32 daoId) external view returns (uint256) {
        return daos[daoId].treasuryUsdc;
    }
}
