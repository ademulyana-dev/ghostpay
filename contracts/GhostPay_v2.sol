// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ─────────────────────────────────────────────────────────────────────────────
// GhostPay v2 — Patched release
//
// Changes from v1 (see contracts/AUDIT.md for full findings):
//
//  [C-1] d7a2c4f8 now accepts `secret` (preimage) instead of `commitment`.
//        `commitment` is derived on-chain as keccak256(secret), so only the
//        party holding the offchain secret can claim — no on-chain stalking attack.
//
//  [C-2] msgHash now binds to address(this) + block.chainid — prevents
//        cross-chain / cross-contract signature replay.
//
//  [C-3] `receive()` removed — no ETH can be permanently trapped.
//        rescueERC20() added for stray non-active ERC-20 tokens.
//
//  [H-1] Resolved by [C-1]: cancel front-run is only possible if the claim
//        function is trivially exploitable; it no longer is.
//
//  [M-1] c4d9e7a2 event now includes `commitment` field for offchain traceability.
//
//  [M-2] activeDepositCount per token tracked; a7f3b8d2 (removeToken) requires
//        count == 0 before removal.
//
//  [M-3] MAX_TOKENS = 50 cap enforced in b2d6f3e9 (addToken).
//
//  [L-1] Pausable added; deposit + claim gated by whenNotPaused.
//
//  [L-2] rescueERC20() restricted to non-active tokens only.
//
//  [I-1] depositorOf[commitment] deleted on claim/cancel (gas refund).
//
//  [I-2] recipient validated != address(0) and != address(this).
// ─────────────────────────────────────────────────────────────────────────────

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract Xc8f4a2e1 is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using MessageHashUtils for bytes32;

    // ─── Constants ────────────────────────────────────────────────────────────

    address public constant ETH_ADDR = address(0);
    uint256 public constant MIN_DELAY = 1 hours;
    uint256 public constant MAX_DELAY = 30 days;
    uint256 public constant MAX_TOKENS = 50; // [M-3] cap token list growth

    // ─── Storage ──────────────────────────────────────────────────────────────

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
    mapping(address => uint256) private activeDepositCount; // [M-2]

    mapping(bytes32 => DepositInfo) public deposits;
    mapping(bytes32 => address) private depositorOf;
    mapping(bytes32 => bool) public usedNullifiers;

    // ─── Events ───────────────────────────────────────────────────────────────

    event TokenAdded(address indexed token, string symbol);
    event TokenUpdated(address indexed token, string newSymbol);
    event TokenRemoved(address indexed token);

    // Deposit: emits commitment so the recipient can look up their incoming transfer
    event e8a3f1b2(
        bytes32 indexed commitment,
        address indexed token,
        uint256 amount,
        uint256 deadline
    );

    // Claim: [M-1] now includes commitment for offchain correlation
    event c4d9e7a2(
        bytes32 indexed commitment,
        bytes32 indexed nullifier,
        address indexed token,
        uint256 amount
    );

    // Cancel / refund
    event f1b3d8e4(
        bytes32 indexed commitment,
        address indexed token,
        uint256 amount,
        address refundTo
    );

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {
        tokens[ETH_ADDR] = TokenConfig({supported: true, symbol: "ETH"});
        tokenList.push(ETH_ADDR);
        tokenIndex[ETH_ADDR] = 0;
    }

    // ─── Owner: pause / unpause ───────────────────────────────────────────────
    // [L-1] Emergency halt: pauses deposits and claims while allowing cancels.

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─── Owner: token management ──────────────────────────────────────────────

    /// @notice Add a new supported ERC-20 token.
    function b2d6f3e9(
        address _token,
        string calldata _symbol
    ) external onlyOwner {
        require(_token != address(0), "use ETH deposit");
        require(!tokens[_token].supported, "exists");
        require(bytes(_symbol).length > 0, "empty symbol");
        require(tokenList.length < MAX_TOKENS, "token limit reached"); // [M-3]
        tokenIndex[_token] = tokenList.length;
        tokens[_token] = TokenConfig({supported: true, symbol: _symbol});
        tokenList.push(_token);
        emit TokenAdded(_token, _symbol);
    }

    /// @notice Update the display symbol of a supported token.
    function c9a1e7f4(
        address _token,
        string calldata _newSymbol
    ) external onlyOwner {
        require(tokens[_token].supported, "not found");
        require(bytes(_newSymbol).length > 0, "empty symbol");
        tokens[_token].symbol = _newSymbol;
        emit TokenUpdated(_token, _newSymbol);
    }

    /// @notice Remove a token. Requires zero active (unclaimed/uncancelled) deposits. [M-2]
    function a7f3b8d2(address _token) external onlyOwner {
        require(_token != ETH_ADDR, "cannot remove ETH");
        require(tokens[_token].supported, "not found");
        require(activeDepositCount[_token] == 0, "active deposits exist"); // [M-2]
        tokens[_token].supported = false;
        uint256 idx = tokenIndex[_token];
        address last = tokenList[tokenList.length - 1];
        tokenList[idx] = last;
        tokenIndex[last] = idx;
        tokenList.pop();
        delete tokenIndex[_token];
        emit TokenRemoved(_token);
    }

    /// @notice Rescue stray ERC-20 tokens sent directly to this contract.
    ///         Only callable for tokens that are NOT currently supported (active). [C-3 / L-2]
    function rescueERC20(address _token, uint256 _amount) external onlyOwner {
        require(
            !tokens[_token].supported,
            "active token — use removeToken first"
        );
        IERC20(_token).safeTransfer(owner(), _amount);
    }

    // ─── Deposits ─────────────────────────────────────────────────────────────

    /// @notice Deposit ERC-20 tokens.
    ///         `commitment` = keccak256(abi.encodePacked(secret)) computed offchain.
    function a3f8c2d1(
        bytes32 commitment,
        address token,
        uint256 amount,
        uint256 cancelDelay
    ) external nonReentrant whenNotPaused {
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
        activeDepositCount[token]++; // [M-2]
        emit e8a3f1b2(commitment, token, actual, block.timestamp + cancelDelay);
    }

    /// @notice Deposit ETH.
    ///         `commitment` = keccak256(abi.encodePacked(secret)) computed offchain.
    function e1b5f9c3(
        bytes32 commitment,
        uint256 cancelDelay
    ) external payable nonReentrant whenNotPaused {
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
        activeDepositCount[ETH_ADDR]++; // [M-2]
        emit e8a3f1b2(
            commitment,
            ETH_ADDR,
            msg.value,
            block.timestamp + cancelDelay
        );
    }

    // ─── Claim ────────────────────────────────────────────────────────────────

    /// @notice Claim a deposit by revealing the secret.
    ///
    ///  [C-1] Caller passes `secret` (the raw preimage). The contract derives
    ///        `commitment` on-chain — only the holder of the offchain secret can claim.
    ///
    ///  [C-2] signature must be over:
    ///        keccak256(abi.encodePacked(address(this), block.chainid,
    ///                                  commitment, nullifier, token, amount))
    ///        This binds the signature to this exact contract on this exact chain.
    ///
    ///  The signed message controls WHERE funds are delivered (recipient = recovered
    ///  address). Providing the secret proves the right to initiate the claim.
    ///
    /// @param secret    Offchain secret whose keccak256 equals the commitment.
    /// @param nullifier keccak256(abi.encodePacked(commitment, "nullifier"))
    /// @param token     Token address matching the deposit.
    /// @param amount    Token amount matching the deposit.
    /// @param signature EIP-191 signature over the domain-separated hash above.
    function d7a2c4f8(
        bytes32 secret, // [C-1] replaces `commitment` — proves knowledge of secret
        bytes32 nullifier,
        address token,
        uint256 amount,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        // Derive commitment from secret — only secret-holder can pass this check
        bytes32 commitment = keccak256(abi.encodePacked(secret)); // [C-1]

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

        // [C-2] Bind signature to this specific contract + chain
        bytes32 msgHash = keccak256(
            abi.encodePacked(
                address(this),
                block.chainid,
                commitment,
                nullifier,
                token,
                amount
            )
        ).toEthSignedMessageHash();

        address recipient = ECDSA.recover(msgHash, signature);
        // [I-2] Guard against zero address and self-send
        require(
            recipient != address(0) && recipient != address(this),
            "invalid recipient"
        );

        usedNullifiers[nullifier] = true;
        d.claimed = true;
        activeDepositCount[token]--; // [M-2]
        delete depositorOf[commitment]; // [I-1] gas refund

        if (token == ETH_ADDR) {
            (bool ok, ) = recipient.call{value: amount}("");
            require(ok, "ETH failed");
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
        emit c4d9e7a2(commitment, nullifier, token, amount); // [M-1] includes commitment
    }

    // ─── Cancel / refund ──────────────────────────────────────────────────────

    /// @notice Cancel a deposit after the timelock and refund to the original depositor.
    ///         Cancel is NOT gated by whenNotPaused so depositors can always retrieve
    ///         their funds even during an emergency pause.
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
        activeDepositCount[token]--; // [M-2]
        delete depositorOf[commitment]; // [I-1] gas refund

        if (token == ETH_ADDR) {
            (bool ok, ) = msg.sender.call{value: amount}("");
            require(ok, "ETH failed");
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }
        emit f1b3d8e4(commitment, token, amount, msg.sender);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /// @notice Returns all supported token addresses and their symbols.
    function e4c8a3f1()
        external
        view
        returns (address[] memory addrs, string[] memory symbols)
    {
        uint256 len = tokenList.length;
        addrs = new address[](len);
        symbols = new string[](len);
        for (uint256 i = 0; i < len; i++) {
            addrs[i] = tokenList[i];
            symbols[i] = tokens[tokenList[i]].symbol;
        }
    }

    /// @notice Returns deposit state for a given commitment.
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

    // [C-3] receive() removed — this contract does not accept untracked ETH.
    // Legitimate ETH enters only through e1b5f9c3 (payable).
}
