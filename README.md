# Crypto Lab

**Where does your money go when you buy crypto?** A small web app that answers that with live data. It runs entirely in your browser: no accounts, no backend, no ads, no affiliate links.

**▶ Live: [joan-bl.github.io/crypto-lab](https://joan-bl.github.io/crypto-lab/)** · Interface in Spanish.

## What's inside

### 1. Fee calculator (*Calculadora*)
Enter an amount in euros and compare every way of buying BTC or ETH: order-book exchanges (Binance, Revolut X, Bitvavo, Kraken Pro, Coinbase Advanced), "simple buy" apps (Revolut, Coinbase), card on-ramps and a DEX (Uniswap).

Every euro of cost is booked like a ledger entry, **with its recipient**:

| Cost | Goes to |
|---|---|
| Deposit / card fee | Payment processor or bank |
| Trading fee | The platform |
| Hidden spread | The broker app ("zero commission" apps) |
| Spread + slippage | The sellers in the order book, computed by walking the **real, live Binance order book** for your exact amount |
| Withdrawal network fee | Miners / validators, at the **current** mempool or gas price |
| Pool fee | DEX liquidity providers |

Published fees change often and depend on country and volume, so every default links to the official fee page, carries the date it was checked, and can be edited (saved only in your browser).

### 2. Market (*Mercado*)
- **Live quotes** in euros for 14 coins (BTC, ETH, SOL, XRP, BNB, ADA, DOGE, LINK, LTC, DOT, AVAX, POL, TRX, USDT) with 24 h change.
- **Price chart** per coin for 24 h / 7 days / 30 days / 1 year / 5 years, with a crosshair tooltip (mouse or arrow keys) and a table view of the same data.
- **Price alerts** ("tell me when BTC goes below 50 000 €"). They are checked every minute while Crypto Lab is open in any tab, shown in the page and, if you allow it, as a system notification. There is no server, so nothing watches prices while the page is closed.

### 3. My investments (*Mis inversiones*)
Log the buys and sells you make anywhere (exchange, app…) and see:
- current value, cost, unrealized gain/loss and realized gain, the latter computed **FIFO** (the method Spain's tax agency applies to crypto) and with average cost;
- holdings with average price, current price and portfolio weight;
- a daily chart of **portfolio value vs. money put in** since your first purchase;
- **watched addresses**: paste a public Bitcoin or Ethereum address (e.g. your hardware wallet) to include its real balance, read-only.

Everything stays in your browser's storage. Back up to JSON, export movements to CSV for Excel, and restore from a backup.

### 4. How it works (*Cómo funciona*)
Four short chapters, each with live data:
1. **Buying is buying from someone.** The live order book, highlighting which sell orders your purchase would consume.
2. **A wallet is just numbers.** Generate 12 words and watch them become entropy → seed → private key → public key → hash160 → address, with the real intermediate values (BIP39 / BIP32 / BIP84, plus the Ethereum address from the same words).
3. **Sending means paying to be written down.** Projected mempool blocks, recently mined blocks and fee rates from mempool.space; Ethereum gas from a public node.
4. **UTXOs vs accounts.** How Bitcoin and Ethereum keep their books differently.

### 5. Test-network wallet (*Mi cartera de pruebas*)
A real self-custody wallet that **only works on test networks**: Bitcoin testnet4 / signet and Ethereum Sepolia. Test coins are free (faucet links included) and worthless, so you can learn to receive, sign and broadcast without risk.

- 12-word BIP39 seed, encrypted in `localStorage` with AES-GCM-256 and a PBKDF2-SHA256 (600 000 iterations) key from your password. Keys never leave the browser.
- Bitcoin: native SegWit (`m/84'/1'/0'`), separate change address, coin selection you can see, and a **review screen** showing which UTXOs are spent, which outputs are created, the change and the miner fee, plus the raw signed transaction, before anything is broadcast.
- Ethereum: EIP-1559 transfers on Sepolia, with nonce and maximum gas shown before signing. The provider is pinned to chain ID 11155111.
- Mainnet is out of reach by design. Bitcoin uses test-network parameters and rejects `bc1…`/`1…`/`3…` addresses; Ethereum only talks to a Sepolia node.

### 6. Follow the money (*Sigue el dinero*)
A read-only explorer for **real** Bitcoin and Ethereum addresses and transactions, with plain-language explanations: inputs and outputs, where the fee comes from (inputs − outputs), coinbase transactions, confirmations. Examples include the first Bitcoin transfer (Satoshi → Hal Finney) and the 10 000 BTC pizza.

## Data sources
All public and keyless: [Binance market data](https://data-api.binance.vision) (prices, candles, order books), [CoinGecko](https://www.coingecko.com/en/api) (BTC/ETH prices), [mempool.space](https://mempool.space/docs/api) (Bitcoin mainnet, testnet4 and signet), [PublicNode](https://www.publicnode.com) (Ethereum RPC), [Blockscout](https://docs.blockscout.com) (Ethereum history).

## Tech
Vanilla JavaScript + [Vite](https://vite.dev). Cryptography from audited, dependency-light libraries: [`@scure/btc-signer`](https://github.com/paulmillr/scure-btc-signer), [`@scure/bip39`](https://github.com/paulmillr/scure-bip39), [`@scure/bip32`](https://github.com/paulmillr/scure-bip32), [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) and [`ethers`](https://docs.ethers.org/v6/). Fonts are self-hosted, so the page itself makes no third-party requests besides the data APIs above.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # key derivation against published BIP84/Ethereum vectors, tx signing, encryption, fee maths, FIFO/average cost, alerts
npm run build    # static site in dist/
```

Every push to `main` runs the tests and deploys to GitHub Pages.

```
src/
├── lib/
│   ├── fees.js        cost model: order-book walk, spreads, network fees (pure, tested)
│   ├── providers.js   default fee schedules, with sources and date checked
│   ├── btc.js         derivation, coin selection, signing, mempool.space API
│   ├── eth.js         Sepolia wallet, EIP-1559 transfers
│   ├── vault.js       seed generation and encryption
│   └── market.js      live prices, order books, fees (cached, shared requests)
└── views/             calculator, market, portfolio, learn, wallet, explorer
```

## Disclaimer
Educational project. Not financial advice. Fees are approximate; check each platform's official page. The wallet is for test networks only: **never put real funds on a seed created here**.

## License
MIT © joan-bl
