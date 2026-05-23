// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title XSight FanPassSBT
/// @notice Minimal non-transferable FanPass proof badge for World Cup campaign gating.
contract FanPassSBT {
    string public name = "XSight FanPass";
    string public symbol = "XFAN";
    address public owner;
    uint256 public totalSupply;

    mapping(uint256 => address) private owners;
    mapping(address => uint256) public tokenOf;
    mapping(uint256 => string) public tokenURI;
    mapping(uint256 => bytes32) public eligibilityHashOf;

    event OwnerChanged(address indexed previousOwner, address indexed nextOwner);
    event FanPassMinted(address indexed wallet, uint256 indexed tokenId, bytes32 eligibilityHash, string uri);

    error OnlyOwner();
    error ZeroAddress();
    error AlreadyMinted();
    error NonTransferable();
    error TokenNotFound();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnerChanged(address(0), msg.sender);
    }

    function transferOwner(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert ZeroAddress();
        emit OwnerChanged(owner, nextOwner);
        owner = nextOwner;
    }

    function mintBadge(address wallet, bytes32 eligibilityHash, string calldata uri) external onlyOwner returns (uint256 tokenId) {
        if (wallet == address(0)) revert ZeroAddress();
        if (tokenOf[wallet] != 0) revert AlreadyMinted();
        tokenId = ++totalSupply;
        owners[tokenId] = wallet;
        tokenOf[wallet] = tokenId;
        tokenURI[tokenId] = uri;
        eligibilityHashOf[tokenId] = eligibilityHash;
        emit FanPassMinted(wallet, tokenId, eligibilityHash, uri);
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address holder = owners[tokenId];
        if (holder == address(0)) revert TokenNotFound();
        return holder;
    }

    function balanceOf(address wallet) external view returns (uint256) {
        if (wallet == address(0)) revert ZeroAddress();
        return tokenOf[wallet] == 0 ? 0 : 1;
    }

    function approve(address, uint256) external pure {
        revert NonTransferable();
    }

    function setApprovalForAll(address, bool) external pure {
        revert NonTransferable();
    }

    function transferFrom(address, address, uint256) external pure {
        revert NonTransferable();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert NonTransferable();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert NonTransferable();
    }
}
