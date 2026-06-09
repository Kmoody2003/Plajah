// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/token/ERC2981/ERC2981.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Plajah AthleteRegistry
 *
 * @notice Verifiable on-chain career record system for high school and college athletes.
 *
 *         ARCHITECTURE
 *         ────────────
 *         Every athlete on Plajah has a custodial Polygon wallet (created at signup).
 *         When a game goes live in Sports Broadcast mode, the producer (coach/manager)
 *         signs stat events. Those events are submitted here and stored permanently.
 *
 *         WHAT'S STORED ON-CHAIN
 *         ───────────────────────
 *         • Athlete identity: name, school, sport, graduating class
 *         • Per-game stat events: touchdowns, goals, points, yards, etc.
 *         • Career aggregates: auto-updated on each event write
 *         • Highlight NFTs: ERC-1155 limited editions tied to verified events
 *         • NIL escrow: brands deposit USDC, auto-released when stat threshold met
 *         • Scholar fund: community pledges locked to milestone conditions
 *
 *         MONEY FLOWS
 *         ───────────
 *         1. Highlight NFT sale → 70% athlete | 20% school program | 10% Plajah
 *         2. NIL deal completion → 90% athlete | 5% school | 5% Plajah (auto-released)
 *         3. Scholar fund release → 100% athlete (when milestone verified by platform)
 *         4. Secondary NFT sales → 7.5% royalty via ERC-2981 (4% athlete, 2.5% school, 1% Plajah)
 *
 *         AUTHORIZED PRODUCERS
 *         ─────────────────────
 *         Only addresses the platform approves can sign stat events.
 *         In practice: Plajah's platform signer (relayer) submits on behalf of coaches
 *         who authenticate via the Plajah sports broadcast UI.
 */
contract PlajahAthleteRegistry is ERC1155, ERC1155Supply, ERC2981, Ownable, ReentrancyGuard {

    IERC20 public immutable usdc;

    // ─── Constants ─────────────────────────────────────────────────────────────

    uint256 public constant ATHLETE_FEE_BPS   = 7000; // 70% highlight NFT sale
    uint256 public constant SCHOOL_FEE_BPS    = 2000; // 20%
    uint256 public constant PLATFORM_FEE_BPS  = 1000; // 10%

    uint256 public constant NIL_ATHLETE_BPS   = 9000; // 90% NIL deal
    uint256 public constant NIL_SCHOOL_BPS    =  500; //  5%
    uint256 public constant NIL_PLATFORM_BPS  =  500; //  5%

    // Royalty on secondary sales (ERC-2981): 7.5%
    uint96  public constant SECONDARY_ROYALTY_BPS = 750;

    // ─── Enums ─────────────────────────────────────────────────────────────────

    enum Sport { FOOTBALL, BASKETBALL, SOCCER, BASEBALL, HOCKEY, TRACK, SWIMMING, VOLLEYBALL, OTHER }

    enum StatEventType {
        TOUCHDOWN, FIELD_GOAL, SAFETY,          // Football scoring
        TWO_POINT, RUSHING_YARDS, PASSING_YARDS, RECEIVING_YARDS, INTERCEPTION,
        BASKET_2PT, BASKET_3PT, FREE_THROW, REBOUND, ASSIST, STEAL, BLOCK, // Basketball
        GOAL, ASSIST_SOCCER, SAVE,              // Soccer
        HOME_RUN, RBI, HIT, STRIKEOUT,          // Baseball
        GOAL_HOCKEY, ASSIST_HOCKEY, SAVE_HOCKEY,// Hockey
        MILESTONE                               // Generic: PR, team record, etc.
    }

    // ─── Structs ───────────────────────────────────────────────────────────────

    struct AthleteProfile {
        address wallet;
        string  plajahUserId;      // Firestore UID
        string  name;
        string  schoolName;
        address schoolWallet;      // Receives 20% of NFT sales + 5% of NIL
        Sport   sport;
        uint16  graduatingClass;   // e.g. 2027
        bool    registered;
        uint256 totalNftRevenue;   // Lifetime USDC earned from highlight NFTs
        uint256 totalNilEarned;    // Lifetime USDC from NIL deals
        uint256 totalPlajRewarded; // Lifetime PLAJ tokens earned from milestones
    }

    struct GameRecord {
        bytes32 gameId;
        string  feedId;            // Plajah live_feeds doc ID
        string  opponentName;
        uint256 gameDate;
        Sport   sport;
        bool    producerVerified;  // True once authorized producer signs off
        address producer;
    }

    struct StatEvent {
        bytes32       eventId;
        bytes32       gameId;
        address       athlete;
        StatEventType statType;
        uint16        value;       // e.g. 6 for TD, 47 for rushing yards
        uint256       timestamp;
        bytes32       videoClipHash; // keccak256 of IPFS CID for the highlight clip
        string        videoIpfsCid; // Full IPFS CID for the clip
        bool          hasNft;      // True after mintHighlightNFT() called for this event
    }

    struct NILDeal {
        bytes32 dealId;
        address athlete;
        address brand;
        uint256 amountUsdc;        // Escrow amount
        StatEventType statType;    // Stat that triggers release
        uint16  threshold;         // e.g. "10 touchdowns this season"
        uint256 windowStart;       // Season window start timestamp
        uint256 windowEnd;         // Deadline for threshold
        bool    fulfilled;
        bool    refunded;
        bytes32 conditionsIpfsCid; // Full legal terms doc on IPFS
    }

    struct ScholarFund {
        bytes32 fundId;
        address athlete;
        uint256 totalPledged;      // USDC in escrow
        uint256 releaseTimestamp;  // Platform can release after this
        string  milestoneDesc;     // e.g. "D1 signing or 3.5 GPA graduation"
        bool    released;
        bool    refunded;
    }

    // ─── State ─────────────────────────────────────────────────────────────────

    address public platform;

    // athlete address → profile
    mapping(address => AthleteProfile) public athletes;
    // plajahUserId → athlete address (reverse lookup)
    mapping(string => address) public athleteByUserId;

    // gameId → GameRecord
    mapping(bytes32 => GameRecord) public games;

    // eventId → StatEvent
    mapping(bytes32 => StatEvent) public statEvents;

    // athlete → all their stat event IDs
    mapping(address => bytes32[]) public athleteStatEvents;

    // athlete → career aggregates [indexed by StatEventType uint]
    mapping(address => mapping(uint8 => uint32)) public careerStats;

    // tokenId → eventId (for highlight NFTs)
    mapping(uint256 => bytes32) public nftToEvent;

    // tokenId → athlete address
    mapping(uint256 => address) public nftToAthlete;

    // tokenId → max supply for this NFT
    mapping(uint256 => uint256) public nftMaxEditions;

    // NIL deals
    mapping(bytes32 => NILDeal) public nilDeals;
    mapping(address => bytes32[]) public athleteNilDeals;

    // Scholar funds
    mapping(bytes32 => ScholarFund) public scholarFunds;
    mapping(address => bytes32[]) public athleteScholarFunds;

    // Authorized stat event producers (Plajah platform signer)
    mapping(address => bool) public authorizedProducers;

    // Counters
    uint256 private _nextTokenId = 1;
    uint256 public  totalAthletes;
    uint256 public  totalGamesRecorded;
    uint256 public  totalHighlightNFTsMinted;

    // ─── Events ────────────────────────────────────────────────────────────────

    event AthleteRegistered(address indexed athlete, string plajahUserId, string name, string school, Sport sport);
    event GameOpened(bytes32 indexed gameId, string feedId, address producer);
    event GameVerified(bytes32 indexed gameId, address producer);
    event StatRecorded(
        bytes32 indexed eventId,
        bytes32 indexed gameId,
        address indexed athlete,
        StatEventType statType,
        uint16 value
    );
    event HighlightNFTMinted(
        uint256 indexed tokenId,
        bytes32 indexed eventId,
        address indexed athlete,
        uint256 maxEditions,
        uint256 priceUsdc
    );
    event HighlightNFTPurchased(
        uint256 indexed tokenId,
        address indexed buyer,
        uint256 priceUsdc,
        uint256 athleteShare,
        uint256 schoolShare
    );
    event NILDealCreated(bytes32 indexed dealId, address indexed athlete, address brand, uint256 amountUsdc);
    event NILDealFulfilled(bytes32 indexed dealId, address indexed athlete, uint256 amountUsdc);
    event NILDealRefunded(bytes32 indexed dealId, address brand, uint256 amountUsdc);
    event ScholarFundPledged(bytes32 indexed fundId, address indexed athlete, address pledger, uint256 amountUsdc);
    event ScholarFundReleased(bytes32 indexed fundId, address indexed athlete, uint256 amountUsdc);

    // ─── NFT price registry ────────────────────────────────────────────────────

    mapping(uint256 => uint256) public nftPrice; // tokenId → USDC price (6 decimals)

    // ─── Constructor ───────────────────────────────────────────────────────────

    constructor(
        address initialOwner,
        address platformAddress,
        address usdcAddress
    ) ERC1155("") Ownable(initialOwner) {
        platform = platformAddress;
        usdc = IERC20(usdcAddress);
        authorizedProducers[platformAddress] = true;

        // 7.5% secondary royalty paid to this contract (redistributed to athlete)
        _setDefaultRoyalty(address(this), SECONDARY_ROYALTY_BPS);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setAuthorizedProducer(address producer, bool authorized) external onlyOwner {
        authorizedProducers[producer] = authorized;
    }

    function setPlatform(address newPlatform) external onlyOwner {
        platform = newPlatform;
    }

    // ─── Athlete Registration ─────────────────────────────────────────────────

    /**
     * @notice Register an athlete on-chain.
     * @dev Called by Plajah platform when athlete enables sports profile.
     *      schoolWallet receives school's share of NFT sales and NIL deals.
     */
    function registerAthlete(
        address       athleteWallet,
        string calldata plajahUserId,
        string calldata name,
        string calldata schoolName,
        address       schoolWallet,
        Sport         sport,
        uint16        graduatingClass
    ) external onlyOwner {
        require(!athletes[athleteWallet].registered, "Already registered");
        require(bytes(plajahUserId).length > 0, "Missing user ID");

        athletes[athleteWallet] = AthleteProfile({
            wallet:           athleteWallet,
            plajahUserId:     plajahUserId,
            name:             name,
            schoolName:       schoolName,
            schoolWallet:     schoolWallet,
            sport:            sport,
            graduatingClass:  graduatingClass,
            registered:       true,
            totalNftRevenue:  0,
            totalNilEarned:   0,
            totalPlajRewarded:0
        });

        athleteByUserId[plajahUserId] = athleteWallet;
        totalAthletes++;

        _setTokenRoyalty(_nextTokenId, athleteWallet, SECONDARY_ROYALTY_BPS);

        emit AthleteRegistered(athleteWallet, plajahUserId, name, schoolName, sport);
    }

    // ─── Game Recording ───────────────────────────────────────────────────────

    /**
     * @notice Open a new game record. Called when a Sports Broadcast stream starts.
     * @param feedId      Plajah live_feeds doc ID (ties on-chain game to off-chain stream)
     */
    function openGame(
        bytes32       gameId,
        string calldata feedId,
        string calldata opponentName,
        Sport         sport
    ) external {
        require(authorizedProducers[msg.sender], "Not authorized producer");
        require(games[gameId].gameDate == 0, "Game already opened");

        games[gameId] = GameRecord({
            gameId:          gameId,
            feedId:          feedId,
            opponentName:    opponentName,
            gameDate:        block.timestamp,
            sport:           sport,
            producerVerified:false,
            producer:        msg.sender
        });

        totalGamesRecorded++;
        emit GameOpened(gameId, feedId, msg.sender);
    }

    /**
     * @notice Producer verifies the final box score and closes the game record.
     */
    function verifyGame(bytes32 gameId) external {
        require(authorizedProducers[msg.sender], "Not authorized producer");
        require(games[gameId].gameDate > 0, "Game not found");
        games[gameId].producerVerified = true;
        games[gameId].producer = msg.sender;
        emit GameVerified(gameId, msg.sender);
    }

    // ─── Stat Recording ───────────────────────────────────────────────────────

    /**
     * @notice Record a verified stat event for an athlete.
     *
     * @param eventId       Unique ID for this event (keccak256 of feedId+timestamp+type)
     * @param gameId        Game this event occurred in
     * @param athlete       Athlete wallet address
     * @param statType      Type of stat (TOUCHDOWN, GOAL, etc.)
     * @param value         Numeric value (e.g. 6 for TD points, 47 for rushing yards)
     * @param videoClipHash keccak256 of the IPFS CID for the highlight video
     * @param videoIpfsCid  Full IPFS CID string for the clip
     */
    function recordStatEvent(
        bytes32         eventId,
        bytes32         gameId,
        address         athlete,
        StatEventType   statType,
        uint16          value,
        bytes32         videoClipHash,
        string calldata videoIpfsCid
    ) external {
        require(authorizedProducers[msg.sender], "Not authorized producer");
        require(athletes[athlete].registered, "Athlete not registered");
        require(games[gameId].gameDate > 0, "Game not opened");
        require(statEvents[eventId].timestamp == 0, "Event already recorded");

        statEvents[eventId] = StatEvent({
            eventId:      eventId,
            gameId:       gameId,
            athlete:      athlete,
            statType:     statType,
            value:        value,
            timestamp:    block.timestamp,
            videoClipHash:videoClipHash,
            videoIpfsCid: videoIpfsCid,
            hasNft:       false
        });

        athleteStatEvents[athlete].push(eventId);

        // Update career aggregate
        careerStats[athlete][uint8(statType)] += value;

        // Check if any NIL deals are now fulfilled
        _checkNilFulfillment(athlete, statType);

        emit StatRecorded(eventId, gameId, athlete, statType, value);
    }

    // ─── Highlight NFT Minting ────────────────────────────────────────────────

    /**
     * @notice Mint a limited edition highlight NFT tied to a verified stat event.
     *
     * @param eventId      The stat event this NFT is based on
     * @param maxEditions  Max number of copies (e.g. 25 or 100)
     * @param priceUsdc    Sale price per edition in USDC (6 decimals)
     * @param metadataUri  IPFS URI for NFT metadata (image, video, stats)
     *
     * @dev Only the platform can mint — we verify the event exists and is real.
     *      The athlete automatically receives 1 copy (their "card").
     */
    function mintHighlightNFT(
        bytes32         eventId,
        uint256         maxEditions,
        uint256         priceUsdc,
        string calldata metadataUri
    ) external onlyOwner returns (uint256 tokenId) {
        StatEvent storage ev = statEvents[eventId];
        require(ev.timestamp > 0, "Event not found");
        require(!ev.hasNft, "NFT already minted for this event");
        require(maxEditions > 0 && maxEditions <= 10000, "Invalid edition count");

        tokenId = _nextTokenId++;
        ev.hasNft = true;

        nftToEvent[tokenId]    = eventId;
        nftToAthlete[tokenId]  = ev.athlete;
        nftMaxEditions[tokenId]= maxEditions;
        nftPrice[tokenId]      = priceUsdc;

        // Set per-token URI
        _setURI(metadataUri);

        // Mint 1 copy to the athlete (their personal "I was there" card)
        _mint(ev.athlete, tokenId, 1, "");

        totalHighlightNFTsMinted++;

        emit HighlightNFTMinted(tokenId, eventId, ev.athlete, maxEditions, priceUsdc);
    }

    /**
     * @notice Fan purchases a highlight NFT edition.
     * @dev Revenue is split: 70% athlete, 20% school, 10% platform.
     */
    function purchaseHighlightNFT(uint256 tokenId, uint256 quantity) external nonReentrant {
        require(nftToAthlete[tokenId] != address(0), "NFT not found");
        require(totalSupply(tokenId) + quantity <= nftMaxEditions[tokenId], "Sold out");

        AthleteProfile storage profile = athletes[nftToAthlete[tokenId]];
        require(profile.registered, "Athlete not registered");

        uint256 total       = nftPrice[tokenId] * quantity;
        uint256 platformCut = (total * PLATFORM_FEE_BPS) / 10000;
        uint256 schoolCut   = (total * SCHOOL_FEE_BPS) / 10000;
        uint256 athleteCut  = total - platformCut - schoolCut;

        require(usdc.transferFrom(msg.sender, platform, platformCut), "Platform transfer failed");
        require(usdc.transferFrom(msg.sender, profile.schoolWallet, schoolCut), "School transfer failed");
        require(usdc.transferFrom(msg.sender, profile.wallet, athleteCut), "Athlete transfer failed");

        profile.totalNftRevenue += athleteCut;

        _mint(msg.sender, tokenId, quantity, "");

        emit HighlightNFTPurchased(tokenId, msg.sender, total, athleteCut, schoolCut);
    }

    // ─── NIL Deal Escrow ──────────────────────────────────────────────────────

    /**
     * @notice Brand creates a performance-conditional NIL deal.
     *
     * @param dealId         Unique ID for this deal
     * @param athlete        Athlete wallet
     * @param statType       The stat type that triggers release
     * @param threshold      The value the stat must reach
     * @param windowEnd      Deadline timestamp (e.g. end of season)
     * @param conditionsIpfsCid IPFS CID of full legal agreement doc
     *
     * @dev Brand deposits USDC into this contract as escrow.
     *      When the athlete's career total for statType reaches threshold within window,
     *      the deal auto-fulfills via _checkNilFulfillment().
     */
    function createNILDeal(
        bytes32         dealId,
        address         athlete,
        uint256         amountUsdc,
        StatEventType   statType,
        uint16          threshold,
        uint256         windowEnd,
        string calldata conditionsIpfsCid
    ) external nonReentrant {
        require(athletes[athlete].registered, "Athlete not registered");
        require(nilDeals[dealId].amountUsdc == 0, "Deal already exists");
        require(windowEnd > block.timestamp, "Window already expired");
        require(amountUsdc > 0, "Amount required");

        require(usdc.transferFrom(msg.sender, address(this), amountUsdc), "USDC transfer failed");

        nilDeals[dealId] = NILDeal({
            dealId:           dealId,
            athlete:          athlete,
            brand:            msg.sender,
            amountUsdc:       amountUsdc,
            statType:         statType,
            threshold:        threshold,
            windowStart:      block.timestamp,
            windowEnd:        windowEnd,
            fulfilled:        false,
            refunded:         false,
            conditionsIpfsCid:conditionsIpfsCid
        });

        athleteNilDeals[athlete].push(dealId);

        emit NILDealCreated(dealId, athlete, msg.sender, amountUsdc);
    }

    /**
     * @notice Brand reclaims escrow if the window passed without fulfillment.
     */
    function refundExpiredNILDeal(bytes32 dealId) external nonReentrant {
        NILDeal storage deal = nilDeals[dealId];
        require(msg.sender == deal.brand, "Not the brand");
        require(!deal.fulfilled && !deal.refunded, "Already settled");
        require(block.timestamp > deal.windowEnd, "Window not expired");

        deal.refunded = true;
        require(usdc.transfer(deal.brand, deal.amountUsdc), "Refund failed");

        emit NILDealRefunded(dealId, deal.brand, deal.amountUsdc);
    }

    // ─── Scholar Fund ─────────────────────────────────────────────────────────

    /**
     * @notice Anyone can pledge USDC toward an athlete's scholar fund.
     * @dev Funds lock until the platform verifies the milestone (D1 signing, graduation GPA, etc.)
     *      At that point the platform calls releaseScholarFund().
     */
    function pledgeToScholarFund(
        bytes32         fundId,
        address         athlete,
        uint256         amountUsdc,
        string calldata milestoneDesc
    ) external nonReentrant {
        require(athletes[athlete].registered, "Athlete not registered");
        require(!scholarFunds[fundId].released, "Already released");

        if (scholarFunds[fundId].totalPledged == 0) {
            scholarFunds[fundId] = ScholarFund({
                fundId:           fundId,
                athlete:          athlete,
                totalPledged:     0,
                releaseTimestamp: 0,
                milestoneDesc:    milestoneDesc,
                released:         false,
                refunded:         false
            });
            athleteScholarFunds[athlete].push(fundId);
        }

        require(usdc.transferFrom(msg.sender, address(this), amountUsdc), "Transfer failed");
        scholarFunds[fundId].totalPledged += amountUsdc;

        emit ScholarFundPledged(fundId, athlete, msg.sender, amountUsdc);
    }

    /**
     * @notice Platform releases scholar fund to athlete after milestone verification.
     */
    function releaseScholarFund(bytes32 fundId) external onlyOwner {
        ScholarFund storage fund = scholarFunds[fundId];
        require(!fund.released && !fund.refunded, "Already settled");
        require(fund.totalPledged > 0, "Nothing to release");

        fund.released = true;
        uint256 amount = fund.totalPledged;

        require(usdc.transfer(fund.athlete, amount), "Release failed");

        emit ScholarFundReleased(fundId, fund.athlete, amount);
    }

    // ─── Read Helpers ─────────────────────────────────────────────────────────

    function getCareerStat(address athlete, StatEventType statType) external view returns (uint32) {
        return careerStats[athlete][uint8(statType)];
    }

    function getAthleteEventIds(address athlete) external view returns (bytes32[] memory) {
        return athleteStatEvents[athlete];
    }

    function getAthleteNilDeals(address athlete) external view returns (bytes32[] memory) {
        return athleteNilDeals[athlete];
    }

    function getAthleteScholarFunds(address athlete) external view returns (bytes32[] memory) {
        return athleteScholarFunds[athlete];
    }

    function isAthleteRegistered(address wallet) external view returns (bool) {
        return athletes[wallet].registered;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /**
     * @dev Check if any NIL deals for this athlete are now fulfillable.
     *      Called automatically on every stat event write.
     */
    function _checkNilFulfillment(address athlete, StatEventType statType) internal {
        bytes32[] storage dealIds = athleteNilDeals[athlete];
        uint32 currentStat = careerStats[athlete][uint8(statType)];

        for (uint256 i = 0; i < dealIds.length; i++) {
            NILDeal storage deal = nilDeals[dealIds[i]];
            if (
                deal.statType == statType &&
                !deal.fulfilled &&
                !deal.refunded &&
                block.timestamp <= deal.windowEnd &&
                currentStat >= deal.threshold
            ) {
                deal.fulfilled = true;

                uint256 platformCut = (deal.amountUsdc * NIL_PLATFORM_BPS) / 10000;
                uint256 schoolCut   = (deal.amountUsdc * NIL_SCHOOL_BPS) / 10000;
                uint256 athleteCut  = deal.amountUsdc - platformCut - schoolCut;

                athletes[athlete].totalNilEarned += athleteCut;

                usdc.transfer(platform, platformCut);
                usdc.transfer(athletes[athlete].schoolWallet, schoolCut);
                usdc.transfer(athletes[athlete].wallet, athleteCut);

                emit NILDealFulfilled(dealIds[i], athlete, deal.amountUsdc);
            }
        }
    }

    // ─── ERC-1155 / ERC-2981 overrides ───────────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC1155, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal override(ERC1155, ERC1155Supply)
    {
        super._update(from, to, ids, values);
    }
}
