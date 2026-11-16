# External security review plan

**Status: preparation only — no audit has been commissioned or completed.** This document defines an evidence-led scope for an independent reviewer. It does not certify the current code, authorize a token, approve a public testnet, or replace legal/economic review. The project remains pre-launch; no official SPICA contract is deployed.

## 1. Review objective and independence

Obtain an independent assessment of whether the current, explicitly identified source snapshot is safe enough to continue toward a separately authorized testnet evaluation. The reviewer must be able to challenge the design, report unacceptable risk, and recommend **no launch**.

The reviewer should:
- Be independent of the implementation and have relevant Solidity/EVM, application-security and supply-chain experience.
- Disclose prior work, financial interests, token holdings, compensation arrangements and other conflicts.
- State the exact repository URL, commit SHA, tree SHA, review dates, tools and versions.
- Distinguish source inspection, reproduced tests, static analysis, runtime testing and assumptions. Do not label a source review or self-test as an audit.
- Preserve negative findings and disagreements in the final report; remediation does not erase the original finding.

A reviewer should not receive or request private keys, seed phrases, signing credentials, production RPC credentials, personal wallet identities or access to a real treasury.

## 2. Scope to assess

The reviewer should first establish the exact review snapshot, then assess these areas.

### A. Contract and EVM behavior

- `src/SpicaCash.sol`: constructor validation, initial holder and supply behavior, inheritance from the pinned OpenZeppelin ERC-20, transfer/allowance semantics, revert behavior and absence of privileged mint, burn, pause, blacklist, upgrade or fee paths.
- Standard ERC-20 compatibility, event emission, zero-address behavior, self-transfers, zero-value transfers, maximum allowance, supply/accounting invariants and arithmetic boundaries.
- Whether the fixed-supply/no-owner design creates operational or recovery risks that are not obvious from the code.
- Unit, fuzz and invariant test quality: meaningful assertions, handler reachability, selector coverage, revert/discard handling, campaign configuration and untested state space.

### B. Build, dependency and artifact integrity

- Exact `package.json`, `package-lock.json`, `.npmrc`, OpenZeppelin version and reviewed package integrity digest.
- Solidity compiler version, `foundry.toml`, remappings, optimizer settings and offline build configuration.
- Whether the documented dependency preflight, bootstrap and local verification entrypoints fail closed under the documented threat model.
- Whether the compiled ABI and bytecode were freshly produced from the reviewed commit, and whether a second reviewer can reproduce the same artifacts.
- Limits of the available evidence: a GitHub blob match or parser test is not a complete clean clone, trusted toolchain, compilation, bytecode attestation or independent audit.

### C. Testnet helper and operational boundaries

- `scripts/deploy-arbitrum-sepolia.sh` and its guards: chain-ID checks, argument validation, recipient/supply handling, command construction, credential exposure, environment-variable overrides and confirmation behavior.
- Confirm that ordinary preflight is non-broadcasting and that no mainnet path, automatic deployment, hidden signing or GitHub Actions workflow has been introduced.
- Assess risks from untrusted RPC responses, provider credentials in process environments/logs, local shell/PATH/tool compromise and operator error.
- Do not execute a transaction or use any real account as part of this review. Public testnet execution requires a separate, explicit human authorization after the relevant gates are reviewed.

### D. Off-chain review and demonstration tools

- Tokenomics, grant, batch-reconciliation and manifest validators: exact schema boundaries, strict JSON handling, amount precision/overflow, duplicate evidence, path handling, hashes, inventory completeness and fail-closed behavior.
- Ensure outputs remain proposals/reports only; they must not create entitlements, pay contributors, sign transactions, authorize issuance or convert SPICA to VirgoStars AI credits.
- Offline browser viewer: content-security policy, absence of network/wallet surfaces, deterministic calculations, accessibility and accurate disclaimers.
- Local verification/evidence collectors: provenance assumptions, bounded input handling, child-process environment, command invocation and honest reporting of blocked or skipped gates.

### E. Threat model and residual risk

At minimum, consider malicious or compromised dependencies/toolchains; forged or incomplete test evidence; unsafe local environment variables and shell executables; malicious RPC endpoints; incorrect constructor parameters; compromised initial-holder or future treasury custody; phishing/impersonation; supply-chain compromise; grant-evidence manipulation; Sybil abuse; denial of service; user misunderstanding of the token's status; and regulatory or operational constraints.

Explicitly record what is out of scope and why. A review of contract code alone is not a treasury, product, governance, legal, privacy or market-integrity assessment.

## 3. Required reproducibility evidence

For each claimed result, record:

| Evidence | Minimum information |
| --- | --- |
| Source identity | Repository, full commit SHA, tree SHA, reviewed file list and working-tree cleanliness |
| Toolchain | OS, architecture, Node/npm, Bash, Foundry/Forge, solc and dependency versions |
| Dependency integrity | Lockfile hash, package integrity verification and whether installation used the reviewed bootstrap with lifecycle scripts disabled |
| Commands | Exact command line, working directory, relevant non-secret environment assumptions and exit code |
| Logs | Unedited stdout/stderr or a cryptographic digest plus a securely retained full log; redact secrets without changing test output |
| Solidity artifacts | Fresh offline build result, artifact paths, ABI/bytecode hashes and compiler configuration |
| Test execution | Separate Node, Bash, Solidity unit, fuzz, invariant and smoke-test results; include skipped/blocked tests |
| Invariant campaigns | Actual Forge output and per-handler `move`, `approve`, `pull` call/revert/discard metrics, independently inspected |
| Static analysis | Tool/version, exact configuration, findings, suppressions and limitations |
| Reviewer | Identity/organization, relevant qualifications, conflicts disclosure and review date |

A report must not combine synthetic parser tests, mocked guards, reconstructed source snippets, browser DOM stubs or old test counts with a claim that the complete current project passed. If Foundry, solc, dependencies, a browser or a platform is unavailable, mark the corresponding gate **BLOCKED / NOT RUN**.

## 4. Finding format and severity

Every finding should include:

- Unique ID and concise title.
- Severity: Critical, High, Medium, Low or Informational, with rationale; CVSS may be included where useful but must not replace context.
- Affected commit and exact file/line or contract/function.
- Preconditions, attacker capability and trust boundary.
- Reproducible impact, proof of concept and expected versus observed behavior.
- Recommended remediation and any safer alternative, including **do not launch** where appropriate.
- Owner, remediation commit, regression test, independent retest result and residual risk.
- Status: Open, Accepted (with named accountable decision-maker and rationale), Fixed-Pending-Retest, Verified-Fixed or Not-Reproducible.

Do not close a finding solely because a patch exists or a regression test passes. The reviewer should retest the fix against the exact proposed release commit. Accepted risks must remain visible in the final residual-risk register.

## 5. Deliverables and acceptance

The engagement should produce:

1. A signed or otherwise attributable report naming the exact commit and scope.
2. An executive summary and architecture/threat-model description.
3. Findings with reproducible evidence and severity rationale.
4. A test/build evidence appendix with blocked and excluded checks clearly identified.
5. A remediation tracker, independent retest results and a residual-risk register.
6. An explicit conclusion: suitable for further local work, suitable only for an explicitly authorized testnet evaluation, or **not suitable to proceed**. The reviewer must not decide legal compliance, token economics or launch authorization on the project's behalf.

SC-12 is not complete until the external report is public (with sensitive details responsibly redacted), findings are triaged, fixes are independently retested and residual risks are recorded. A clean report does not approve issuance or mainnet deployment.

## 6. Explicit exclusions

This plan does not authorize:
- Deploying, minting, distributing, selling, trading or listing SPICA.
- Mainnet or public-testnet transactions, broadcasts, wallet connections or signing.
- Creation or funding of a treasury, liquidity pool or contributor payout.
- Real grant recipients, allocations, token supply, vesting parameters or signer selection.
- Any payment, purchase, redemption or conversion involving VirgoStars AI credits or website services.
- Publishing a contract address as official, promising utility/value/returns, or representing this research as an audit.

The default outcome remains **no issuance** unless independent engineering, legal, economic and governance gates are satisfied and a separate explicit human go/no-go decision is recorded.
