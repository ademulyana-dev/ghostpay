<div align="center">
  <h1>GhostPay</h1>
  <p><strong>Privacy-first stealth payment protocol on Ethereum</strong></p>

  ![Ethereum](https://img.shields.io/badge/Network-Sepolia-orange?style=flat-square)
  ![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)
  ![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
</div>

---

## Overview

**GhostPay** is a privacy-focused stealth transfer dApp that lets you send ETH and ERC-20 tokens anonymously using a commitment/nullifier scheme. Senders lock funds into a smart contract with a hashed commitment — only the recipient holding the matching nullifier can claim them.

- **No direct wallet-to-wallet trace** on-chain
- **Commitment-based locking** — funds are held in contract until claimed or cancelled
- **Refundable** — senders can cancel and reclaim funds after a time delay
- Deployed on **Ethereum Sepolia** testnet

---

## Features

| Feature | Description |
|---|---|
| 💸 **Send** | Lock ETH or ERC-20 tokens with a stealth commitment |
| 📥 **Receive** | Claim funds using a secret nullifier |
| 🔍 **Check Status** | Look up any commitment's status on-chain |
| ↩️ **Cancel & Refund** | Reclaim unclaimed transfers after the deadline |
| 📜 **History** | View your past send/receive activity |
| 🪙 **Supported Tokens** | Browse available tokens and your balances |

---

## Smart Contract

- **Network:** Ethereum Sepolia (Chain ID: `11155111`)
- **Contract Address:** `0x7906715ad6B8De952AbC35D00C6149E4AcEcA604`
- **Explorer:** [View on Blockscout](https://eth-sepolia.blockscout.com/address/0x7906715ad6B8De952AbC35D00C6149E4AcEcA604)

---

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS v4 + Framer Motion
- **Web3:** ethers.js v6
- **Icons:** Lucide React

---

## Run Locally

**Prerequisites:** Node.js v18+, MetaMask browser extension

1. Clone the repo:
   ```bash
   git clone https://github.com/ademulyana-dev/ghostpay.git
   cd ghostpay
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) and connect your MetaMask wallet on **Sepolia** network.

---

## How It Works

1. **Sender** enters recipient info and amount → app generates a `commitment` (hash)
2. Funds are deposited into the smart contract tied to that commitment
3. **Recipient** receives the secret `nullifier` off-chain (e.g., via message)
4. Recipient calls claim with the nullifier → contract verifies and releases funds
5. If unclaimed, sender can **cancel** after the deadline to reclaim funds

---

## License

MIT © [ademulyana-dev](https://github.com/ademulyana-dev)
