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

## Optional real-browser smoke test (Chrome / Edge / Chromium)

With Node.js 20+ and a locally installed Chromium-based browser, run in a clean checkout:

```powershell
node scripts/check-viewer-browser.mjs
```

The script locates Chrome, Edge or Chromium (or uses an explicit browser path), creates an **ephemeral copy** of `demo/index.html` in a temporary folder, injects a test-only inline harness into that copy, launches the real browser in headless mode, and exercises:

- All six checkpoints including the exact Alice/Bob balances, allowance and conservation values.
- Enabled/disabled Next and Previous controls, rejected delegated spending and Reset.
- The number of ledger entries, progress semantics and the no-network content-security policy.

A successful run reports **61 browser DOM assertions** and deletes the temporary copy and browser profile. The evidence parser requires exactly 61 completed assertions, exactly one result marker, and a strict PASS/FAIL payload: fewer checks or duplicate result elements fail closed instead of reporting success. A missing browser, nonzero browser exit, timeout, malformed result or failed assertion exits nonzero; the test never guesses that it passed. No screenshots are captured automatically. The check runs **only** when explicitly invoked; it is not part of `test:offline:node`, which remains portable without a browser.

To point to a browser not discovered automatically, use a known local executable:

```powershell
$env:SPICA_BROWSER_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
node scripts/check-viewer-browser.mjs
Remove-Item Env:SPICA_BROWSER_PATH
```

Microsoft Edge can be selected similarly using its `msedge.exe` path. Do not disable the Chrome sandbox on Windows. The exceptional `SPICA_BROWSER_NO_SANDBOX=1` override is available only for isolated disposable Linux test environments where a browser cannot otherwise launch; **it reduces browser isolation and must never be used on an ordinary workstation.**

**Status:** The exact harness logic passed 61 assertions in an isolated DOM simulation on 14 November 2026. This is **not** evidence of a successful real Chrome/Edge launch; the Chromium process in the available execution container timed out. Execute the browser command on Windows, record the current Git commit and output, and inspect a screenshot manually before accepting SC-04. This also does not run Foundry or independently audit the contract.

## Safety and scope

- No token has been deployed on Arbitrum, Base, testnet or mainnet.
- No SPICA price, market, tokenomics, approved supply or acquisition flow is shown.
- Do not connect real wallets, private keys, RPCs, payment gateways or network transfers to this demo.
- The local viewer is intentionally independent of VirgoStars AI credits and existing VirgoStars services.
- Do not use its success as evidence that SC-02 real Foundry/security verification or SC-04 independent browser acceptance has passed.

For launch prerequisites and verification acceptance criteria, see [Launch readiness](LAUNCH_READINESS.md).
