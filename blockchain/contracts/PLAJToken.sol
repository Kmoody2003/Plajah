// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PLAJ Token
 * @notice Plajah platform utility token.
 *         Earned by: contributing bandwidth/storage nodes, platform activity rewards.
 *         Spent on: premium features, tipping, governance participation.
 *         NOT a security — no profit promise, no dividends.
 *         Total supply: 1,000,000,000 PLAJ (1 billion)
 *         Distribution:
 *           40% — Platform rewards pool (earned by users over time)
 *           25% — Ecosystem development (grants, partnerships)
 *           20% — Team (4-year vesting, 1-year cliff)
 *           10% — Liquidity reserves
 *            5% — Community treasury (DAO-governed)
 */
contract PLAJToken is ERC20, ERC20Burnable, Ownable {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** 18;

    // Authorized minters (reward distribution contracts)
    mapping(address => bool) public minters;

    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);

    constructor(address initialOwner) ERC20("Plajah", "PLAJ") Ownable(initialOwner) {
        // Mint initial allocation to owner for distribution
        // Remaining supply minted via reward contracts as earned
        _mint(initialOwner, MAX_SUPPLY / 5); // 20% initial mint
    }

    modifier onlyMinter() {
        require(minters[msg.sender] || msg.sender == owner(), "Not authorized to mint");
        _;
    }

    function addMinter(address minter) external onlyOwner {
        minters[minter] = true;
        emit MinterAdded(minter);
    }

    function removeMinter(address minter) external onlyOwner {
        minters[minter] = false;
        emit MinterRemoved(minter);
    }

    function mint(address to, uint256 amount) external onlyMinter {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
    }
}
