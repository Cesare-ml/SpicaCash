# SpicaCash offline viewer — Windows 11

**Experimental demo, not a blockchain wallet or token launch.** The viewer is a **self-contained HTML file** with a deterministic, six-stage model of the sample SpicaCash transfers. It runs in the browser with **no install, dependency, server, RPC, wallet, signing or real SPICA**.

## Open and use it

1. Clone or update [SpicaCash](https://github.com/Cesare-ml/SpicaCash) on your Windows 11 PC with Git:

   ```powershell
   git clone https://github.com/Cesare-ml/SpicaCash.git
   cd SpicaCash
   ```

2. Double-click **`demo/index.html`**, or open the file with your browser from PowerShell:

   ```powershell
   Start-Process .\demo\index.html
   ```

3. Select **Avanti**, **Indietro** or **Ricomincia**. The screen shows Alice/Bob balances, Bob's remaining allowance for a delegated spender, progress, a readable event log and conservation checks.

There is **no HTTP server** to start: the document is opened through `file://` and deliberately includes **all CSS and JavaScript inline** for offline operation. It is responsive for desktop and mobile. The CSP disallows network connections (`connect-src 'none'`); no external scripts, images, APIs or wallet SDKs are loaded.

## Exactly what it simulates

| Stage | Alice | Bob | Bob's allowance | Change |
| --- | ---: | ---: | ---: | --- |
| 1 — local synthetic mint | 1,000 | 0 | 0 | Fixed toy supply |
| 2 — direct transfer | 875 | 125 | 0 | Alice sends 125 to Bob |
| 3 — approval | 875 | 125 | 20 | Bob approves spender for 20 |
| 4 — delegated transfer | 882 | 118 | 13 | Spender moves 7 from Bob to Alice |
| 5 — revocation | 882 | 118 | 0 | Bob revokes the remaining allowance |
| 6 — blocked transfer | 882 | 118 | 0 | Unauthorized 1-token pull rejected |

The viewer uses JavaScript `BigInt` for exact integer arithmetic in **18-decimal token base units** and recalculates every intermediate state from the beginning when navigating. It fails on negative balances, invalid allowances, or changed total supply. The mock token amount **1,000** is not a proposed real issuance quantity.

The accompanying Foundry scenario `test/SpicaCashLocalDemo.t.sol` exercises the *real Solidity contract* in a disposable test EVM with the same six events, but is **not called by this HTML**. Browser output is a mathematical reproduction, **not an EVM transaction trace or contract audit**. For Solidity verification, see [Local demo](LOCAL_DEMO.md).

## Test the viewer

With Node.js 20+ installed, run from the repository root:

```powershell
node --test test/node/local-demo-viewer.test.mjs
```

This test loads the actual `demo/index.html` JavaScript and verifies the six stages, exact balances, approval accounting, supply conservation, rejected transfer, 18-decimal formatting, and absence of visible network/wallet connection surfaces. No npm script or dependency installation is needed.

**Verification status (2026-11-14):** the exact GitHub HTML script passed **10/10 isolated V8 calculation/safety checks**. The full Node suite and a Windows browser end-to-end test have **not** been executed in this environment. Those still require independent run evidence. The static source inspection and tests do not establish freedom from all possible browser or toolchain issues.

## Safety and scope

- No token has been deployed on Arbitrum, Base, testnet or mainnet.
- No SPICA price, market, tokenomics, approved supply or acquisition flow is shown.
- Do not connect real wallets, private keys, RPCs, payment gateways or network transfers to this demo.
- The local viewer is intentionally independent of VirgoStars AI credits and existing VirgoStars services.
- Do not use its success as evidence that SC-02 real Foundry/security verification or SC-04 independent browser acceptance has passed.

For launch prerequisites and verification acceptance criteria, see [Launch readiness](LAUNCH_READINESS.md).
