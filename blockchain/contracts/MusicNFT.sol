// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

/**
 * @title Plajah Music NFT
 * @notice On-chain ownership registry for music tracks uploaded to Plajah.
 *         ERC-1155 so a single token ID can represent:
 *           - 1/1 (unique original)
 *           - Limited editions (e.g., 100 copies of a release)
 *         Implements ERC-2981 for royalty standard (Opensea, Blur compatible).
 *
 *         The artist ALWAYS retains ownership of masters.
 *         This NFT proves ownership — it is not a transfer of masters.
 */
contract PlajahMusicNFT is ERC1155, Ownable, IERC2981 {

    struct Track {
        address artist;
        string  ipfsCID;        // Audio content CID on IPFS
        string  metadataCID;    // JSON metadata CID (title, album, cover art)
        uint256 royaltyBPS;     // Basis points for secondary sale royalties (max 2500 = 25%)
        string  plajahContentId; // Plajah internal track ID
        uint256 mintedAt;
        bool    exists;
    }

    // tokenId => Track
    mapping(uint256 => Track) public tracks;

    // Plajah content ID => tokenId (for lookups)
    mapping(string => uint256) public contentIdToToken;

    // Platform address that receives listing fees
    address public platform;

    uint256 private _nextTokenId;

    event TrackMinted(
        uint256 indexed tokenId,
        address indexed artist,
        string ipfsCID,
        string plajahContentId
    );

    constructor(address initialOwner, address platformAddress)
        ERC1155("https://api.plajah.com/nft/music/{id}")
        Ownable(initialOwner)
    {
        platform = platformAddress;
    }

    /**
     * @notice Mint a music NFT for a track.
     * @param to         Artist's wallet address
     * @param ipfsCID    Audio file CID on IPFS
     * @param metadataCID JSON metadata CID
     * @param royaltyBPS Secondary sale royalty (e.g. 1000 = 10%)
     * @param contentId  Plajah platform track ID
     * @param amount     Number of copies (1 for 1/1, >1 for editions)
     */
    function mintTrack(
        address to,
        string calldata ipfsCID,
        string calldata metadataCID,
        uint256 royaltyBPS,
        string calldata contentId,
        uint256 amount
    ) external onlyOwner returns (uint256 tokenId) {
        require(royaltyBPS <= 2500, "Royalty cannot exceed 25%");
        require(bytes(contentIdToToken[contentId] == 0 ? "" : "taken").length == 0, "Already minted");

        tokenId = _nextTokenId++;
        tracks[tokenId] = Track({
            artist:          to,
            ipfsCID:         ipfsCID,
            metadataCID:     metadataCID,
            royaltyBPS:      royaltyBPS,
            plajahContentId: contentId,
            mintedAt:        block.timestamp,
            exists:          true
        });
        contentIdToToken[contentId] = tokenId;

        _mint(to, tokenId, amount, "");
        emit TrackMinted(tokenId, to, ipfsCID, contentId);
    }

    // ── ERC-2981 Royalty Standard ───────────────────────────────────────────────

    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external view override returns (address receiver, uint256 royaltyAmount)
    {
        Track storage track = tracks[tokenId];
        require(track.exists, "Token does not exist");
        royaltyAmount = (salePrice * track.royaltyBPS) / 10000;
        receiver = track.artist;
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC1155, IERC165) returns (bool)
    {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }

    function updatePlatform(address newPlatform) external onlyOwner {
        platform = newPlatform;
    }
}
