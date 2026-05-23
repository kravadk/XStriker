// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title XSight BracketNFT
/// @notice A collectible, transferable ERC-721 of a fan's World Cup bracket. Minimal,
/// dependency-free, standard ERC-721 + Metadata. One mint per wallet; tokenIds from 1.
contract BracketNFT {
    string public name = "XSight Bracket";
    string public symbol = "XBRKT";
    address public owner;
    string public baseURI;
    uint256 public totalSupply;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(address => uint256) public mintedBy; // wallet => tokenId (0 = not minted)

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    constructor(string memory baseURI_) {
        owner = msg.sender;
        baseURI = baseURI_;
        emit OwnerChanged(address(0), msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        baseURI = uri;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Mint the caller's bracket NFT. One per wallet.
    function mint() external returns (uint256 tokenId) {
        require(mintedBy[msg.sender] == 0, "already minted");
        totalSupply += 1;
        tokenId = totalSupply;
        _owners[tokenId] = msg.sender;
        _balances[msg.sender] += 1;
        mintedBy[msg.sender] = tokenId;
        emit Transfer(address(0), msg.sender, tokenId);
    }

    function balanceOf(address account) external view returns (uint256) {
        require(account != address(0), "zero address");
        return _balances[account];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address holder = _owners[tokenId];
        require(holder != address(0), "no token");
        return holder;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_owners[tokenId] != address(0), "no token");
        return string(abi.encodePacked(baseURI, _toString(tokenId)));
    }

    function approve(address to, uint256 tokenId) external {
        address holder = ownerOf(tokenId);
        require(to != holder, "approve to owner");
        require(msg.sender == holder || _operatorApprovals[holder][msg.sender], "not authorized");
        _tokenApprovals[tokenId] = to;
        emit Approval(holder, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        require(_owners[tokenId] != address(0), "no token");
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        require(operator != msg.sender, "self approval");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address account, address operator) external view returns (bool) {
        return _operatorApprovals[account][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "not authorized");
        require(ownerOf(tokenId) == from, "wrong from");
        require(to != address(0), "zero to");
        _tokenApprovals[tokenId] = address(0);
        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        require(_checkReceiver(from, to, tokenId, data), "non-ERC721Receiver");
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 // ERC165
            || interfaceId == 0x80ac58cd // ERC721
            || interfaceId == 0x5b5e139f; // ERC721Metadata
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address holder = ownerOf(tokenId);
        return spender == holder
            || _tokenApprovals[tokenId] == spender
            || _operatorApprovals[holder][spender];
    }

    function _checkReceiver(address from, address to, uint256 tokenId, bytes memory data) private returns (bool) {
        if (to.code.length == 0) return true; // EOA — always safe
        try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 retval) {
            return retval == IERC721Receiver.onERC721Received.selector;
        } catch {
            return false;
        }
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits += 1;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}
