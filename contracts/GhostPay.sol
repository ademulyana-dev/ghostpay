// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract Xc8f4a2e1 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using MessageHashUtils for bytes32;

    address public constant ETH_ADDR = address(0);
    uint256 public constant MIN_DELAY = 1 hours;
    uint256 public constant MAX_DELAY = 30 days;

    struct TokenConfig {
        bool supported;
        string symbol;
    }

    struct DepositInfo {
        address token;
        uint256 amount;
        uint256 depositedAt;
        uint256 cancelDelay;
        bool claimed;
        bool cancelled;
    }

    mapping(address => TokenConfig) public tokens;
    address[] public tokenList;
    mapping(address => uint256) private tokenIndex;

    mapping(bytes32 => DepositInfo) public deposits;
    mapping(bytes32 => address) private depositorOf;
    mapping(bytes32 => bool) public usedNullifiers;

    event TokenAdded(address indexed token, string symbol);
    event TokenUpdated(address indexed token, string newSymbol);
    event TokenRemoved(address indexed token);
    event e8a3f1b2(
        bytes32 indexed commitment,
        address indexed token,
        uint256 amount,
        uint256 deadline
    );
    event c4d9e7a2(
        bytes32 indexed nullifier,
        address indexed token,
        uint256 amount
    );
    event f1b3d8e4(
        bytes32 indexed commitment,
        address indexed token,
        uint256 amount,
        address refundTo
    );

    constructor() Ownable(msg.sender) {
        tokens[ETH_ADDR] = TokenConfig({supported: true, symbol: "ETH"});
        tokenList.push(ETH_ADDR);
        tokenIndex[ETH_ADDR] = 0;
    }

    function b2d6f3e9(
        address _token,
        string calldata _symbol
    ) external onlyOwner {
        require(_token != address(0), "use ETH deposit");
        require(!tokens[_token].supported, "exists");
        require(bytes(_symbol).length > 0, "empty symbol");
        tokenIndex[_token] = tokenList.length;
        tokens[_token] = TokenConfig({supported: true, symbol: _symbol});
        tokenList.push(_token);
        emit TokenAdded(_token, _symbol);
    }

    function c9a1e7f4(
        address _token,
        string calldata _newSymbol
    ) external onlyOwner {
        require(tokens[_token].supported, "not found");
        require(bytes(_newSymbol).length > 0, "empty symbol");
        tokens[_token].symbol = _newSymbol;
        emit TokenUpdated(_token, _newSymbol);
    }

    function a7f3b8d2(address _token) external onlyOwner {
        require(_token != ETH_ADDR, "cannot remove ETH");
        require(tokens[_token].supported, "not found");
        tokens[_token].supported = false;
        uint256 idx = tokenIndex[_token];
        address last = tokenList[tokenList.length - 1];
        tokenList[idx] = last;
        tokenIndex[last] = idx;
        tokenList.pop();
        delete tokenIndex[_token];
        emit TokenRemoved(_token);
    }

    function a3f8c2d1(
        bytes32 commitment,
        address token,
        uint256 amount,
        uint256 cancelDelay
    ) external nonReentrant {
        require(tokens[token].supported, "unsupported");
        require(token != ETH_ADDR, "use ETH fn");
        require(amount > 0, "zero amount");
        require(cancelDelay >= MIN_DELAY, "delay short");
        require(cancelDelay <= MAX_DELAY, "delay long");
        require(depositorOf[commitment] == address(0), "exists");
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 actual = IERC20(token).balanceOf(address(this)) - before;
        require(actual > 0, "no tokens received");
        depositorOf[commitment] = msg.sender;
        deposits[commitment] = DepositInfo({
            token: token,
            amount: actual,
            depositedAt: block.timestamp,
            cancelDelay: cancelDelay,
            claimed: false,
            cancelled: false
        });
        emit e8a3f1b2(commitment, token, actual, block.timestamp + cancelDelay);
    }

    function e1b5f9c3(
        bytes32 commitment,
        uint256 cancelDelay
    ) external payable nonReentrant {
        require(msg.value > 0, "zero amount");
        require(cancelDelay >= MIN_DELAY, "delay short");
        require(cancelDelay <= MAX_DELAY, "delay long");
        require(depositorOf[commitment] == address(0), "exists");
        depositorOf[commitment] = msg.sender;
        deposits[commitment] = DepositInfo({
            token: ETH_ADDR,
            amount: msg.value,
            depositedAt: block.timestamp,
            cancelDelay: cancelDelay,
            claimed: false,
            cancelled: false
        });
        emit e8a3f1b2(
            commitment,
            ETH_ADDR,
            msg.value,
            block.timestamp + cancelDelay
        );
    }

    function d7a2c4f8(
        bytes32 commitment,
        bytes32 nullifier,
        address token,
        uint256 amount,
        bytes calldata signature
    ) external nonReentrant {
        DepositInfo storage d = deposits[commitment];
        require(depositorOf[commitment] != address(0), "invalid");
        require(!d.claimed, "claimed");
        require(!d.cancelled, "cancelled");
        require(d.token == token, "token mismatch");
        require(d.amount == amount, "amount mismatch");
        require(!usedNullifiers[nullifier], "nullifier used");
        require(
            nullifier == keccak256(abi.encodePacked(commitment, "nullifier")),
            "invalid nullifier"
        );
        bytes32 msgHash = keccak256(
            abi.encodePacked(commitment, nullifier, token, amount)
        ).toEthSignedMessageHash();
        address recipient = ECDSA.recover(msgHash, signature);
        require(recipient != address(0), "invalid signature");
        usedNullifiers[nullifier] = true;
        d.claimed = true;
        if (token == ETH_ADDR) {
            (bool ok, ) = recipient.call{value: amount}("");
            require(ok, "ETH failed");
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
        emit c4d9e7a2(nullifier, token, amount);
    }

    function f4e9b1a6(bytes32 commitment) external nonReentrant {
        require(depositorOf[commitment] == msg.sender, "not depositor");
        DepositInfo storage d = deposits[commitment];
        require(!d.claimed, "claimed");
        require(!d.cancelled, "already cancelled");
        require(
            block.timestamp >= d.depositedAt + d.cancelDelay,
            "timelock active"
        );
        address token = d.token;
        uint256 amount = d.amount;
        d.cancelled = true;
        if (token == ETH_ADDR) {
            (bool ok, ) = msg.sender.call{value: amount}("");
            require(ok, "ETH failed");
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }
        emit f1b3d8e4(commitment, token, amount, msg.sender);
    }

    function e4c8a3f1()
        external
        view
        returns (address[] memory addrs, string[] memory symbols)
    {
        uint len = tokenList.length;
        addrs = new address[](len);
        symbols = new string[](len);
        for (uint i = 0; i < len; i++) {
            addrs[i] = tokenList[i];
            symbols[i] = tokens[tokenList[i]].symbol;
        }
    }

    function b9f2d7c1(
        bytes32 commitment
    )
        external
        view
        returns (
            bool exists,
            address token,
            uint256 amount,
            bool claimed,
            bool cancelled,
            uint256 deadline
        )
    {
        DepositInfo storage d = deposits[commitment];
        exists = depositorOf[commitment] != address(0);
        token = d.token;
        amount = d.amount;
        claimed = d.claimed;
        cancelled = d.cancelled;
        deadline = exists ? d.depositedAt + d.cancelDelay : 0;
    }

    receive() external payable {}
}
