# SpicaCash threat model and residual-risk register

**Status: working model for independent review, 16 November 2026.** This document describes risks to investigate; it is not a security assessment, audit, assurance statement or authorization to issue SPICA. A control marked "implemented" means source exists, not that it has passed a current clean-checkout or independent test. All risks remain open until evidence and an accountable review are recorded.

## 1. Scope and security objectives

The current scope is the experimental fixed-supply ERC-20, its build and test toolchain, local verification/evidence scripts, offline tokenomics and contributor-grant validators, browser demonstration, and the guarded Arbitrum Sepolia helper. No official token is deployed. No holder rights, supply, treasury signers, beneficiary allocation or canonical chain have been approved.

Security objectives:

1. Preserve the contract's fixed total supply and standard ERC-20 behavior.
2. Prevent unreviewed source, dependencies, environment overrides or fabricated test output from being mistaken for verified release evidence.
3. Keep local demonstrations and validators offline, non-authorizing and separate from production wallets, VirgoStars accounts and AI credits.
4. Prevent accidental public-chain actions and make any later testnet activity explicitly authorized and independently observable.
5. Preserve a documented **no-launch** outcome when demand, engineering, legal, custody or governance evidence is insufficient.

## 2. Assets and trust boundaries

| Asset / boundary | Why it matters | Current assumption |
| --- | --- | --- |
| Solidity source and deployed bytecode | Defines token supply and transfer behavior | Source is experimental; no official deployed bytecode |
| npm lockfile and OpenZeppelin dependency | Dependency substitution can change compiled behavior | Version and integrity are pinned; installation/reproduction still requires independent confirmation |
| Node, npm, Bash, Git, Foundry and solc binaries | Hostile executables can bypass repository-level checks | Trusted host/toolchain required; local guards cannot establish binary authenticity |
| Local verification receipts and Forge logs | Can influence decisions if misrepresented | Self-reported evidence only; never authorization or an audit |
| Testnet helper and RPC endpoint | A malicious endpoint or unsafe command can mislead an operator | HTTPS and chain-ID checks are syntax/response gates, not endpoint identity proof |
| Initial holder and future treasury | Key compromise or unilateral custody can lose or misdirect assets | No holder, wallet, signer or quorum has been selected |
| Grant proposal files and PR references | Duplicate, fabricated or incomplete evidence can produce false accounting | Offline arithmetic only; no live GitHub verification or Sybil protection |
| VirgoStars services and AI credits | Accidental coupling could imply redemption or create economic obligations | Explicitly out of scope for v1 |
| Project identity and public communications | Impersonators or inaccurate claims can mislead users | No official token address, price, liquidity or listing exists |

The main trust boundaries are: developer workstation to repository; repository to package/compiler toolchain; verifier to child processes; offline proposal files to human reviewers; operator to RPC/testnet; future signers to treasury; and project communications to the public.

## 3. Threat scenarios

The status below is deliberately conservative. "Guard exists" is not equivalent to "risk mitigated": evidence must be generated against the exact reviewed commit and independently inspected.

| ID | Threat scenario and attacker capability | Potential impact | Existing control / evidence to inspect | Residual status |
| --- | --- | --- | --- | --- |
| T-01 | A maintainer or compromised account changes Solidity, Foundry configuration or npm scripts while making the checkout appear clean | Reviewer may attribute tests to code that was not actually tested | Git status plus committed-blob checks in the local receipt; inspect exact commit/tree identity and real Git regressions | OPEN — clean-clone reproduction and trusted Git binary required |
| T-02 | A dependency, registry response, lockfile or local `node_modules` is substituted | Malicious or different code may be compiled | Pinned OpenZeppelin version/integrity, strict lock-policy checker, `npm ci --ignore-scripts`; verify actual package bytes and clean install | OPEN — trusted dependency installation and compiler build not independently reproduced |
| T-03 | An attacker controls PATH, Node/npm/Git/Forge/solc binaries, shell startup or the host | Repository guards may execute a malicious binary or report fabricated results | Documentation discloses host/PATH trust limits; environment sanitizers cover selected child overrides only | OPEN — external machine/toolchain trust and binary provenance are outside repository checks |
| T-04 | A forged, truncated, mixed-suite or stale Forge transcript is presented as a successful invariant campaign | False confidence in contract behavior | Bounded parser, exact suite/summary checks and per-selector metrics; inspect parser against genuine output from the reviewed Forge version | OPEN — real Foundry build and campaigns not yet recorded |
| T-05 | Constructor parameters are wrong, supply is misunderstood, or the initial-holder address is compromised | Entire supply could be misdirected or inaccessible | Constructor rejects zero holder/supply; no owner or privileged mint endpoint; future constructor parameters require independent review | OPEN — no approved holder, custody model or audited deployment parameters |
| T-06 | A future signer loses a key, is coerced, colludes, or signs a malicious transaction | Treasury loss, censorship or unauthorized allocation | Governance document lists multisig, independent signers, quorum and recovery as decisions | OPEN — no signer, quorum, hardware policy, recovery or incident process selected |
| T-07 | A compromised or malicious RPC reports a false chain ID or misleading state | Operator may believe an action targets the intended network or contract | HTTPS syntax validation and chain-ID check in helper; inspect endpoint assumptions and command behavior | OPEN — RPC response is not authenticated proof of honest chain state; no public testnet run |
| T-08 | Environment variables or command-line options override Foundry profiles, enable a fork/FFI or alter deployment behavior | Tests or helper can execute outside the assumed offline/testnet boundary | Verifier/helper clears documented override families; inspect complete case-variant and child-process tests | OPEN — guards do not secure hostile parent processes or binaries |
| T-09 | A grant proposal repeats a PR, omits a batch, uses a fabricated link or misattributes group work | False accounting or unfair proposed rewards | Strict local schemas, cross-batch checks and hashed manifest; docs state GitHub evidence is not authenticated | OPEN — no complete canonical inventory, independent eligibility or Sybil/appeal policy |
| T-10 | A reviewer treats a valid draft, green parser or checked roadmap box as authorization | Premature issuance, grant, public statement or deployment | Validators are non-authorizing; launch report must keep `NOT_AUTHORIZED` and `evidenceVerified: false` | OPEN — human process and separate approval must be established and recorded |
| T-11 | A third party creates an impersonator token or uses the SPICA name/ticker to imply official status | Users may acquire an unrelated asset or rely on false claims | README warns there is no official address; project identity notice distinguishes code license from marks | OPEN — name/ticker collision research, monitored official publication process and response plan needed |
| T-12 | A future interface connects wallets, AI credits, checkout or paid services without product/legal review | New attack surface and unintended rights/payment expectations | v1 documents prohibit wallet integration and SPICA/AI-credit conversion | CONTROLLED BY SCOPE — re-open before any product integration |
| T-13 | A browser demo is mistaken for EVM execution or loads unexpected external code | User may infer tested contract behavior that was never executed | Single-file CSP-restricted simulator and explicit disclaimers; browser smoke tests are separate from Foundry | OPEN — actual supported-browser checks and independent screenshot inspection pending |
| T-14 | A malicious contribution, reviewer conflict or Sybil network influences any future grant process | Capture, unfair allocation or reputational damage | Current validator is offline-only and stores no payout data; grant policy requires human review | OPEN — eligibility, conflict, identity-minimization, appeals and independent approval not finalized |
| T-15 | Public sale, liquidity, market claims or launch communications begin before legal assessment | Regulatory, consumer, tax and reputational harm | Roadmap requires qualified Italy/EU advice; no marketing/issuance is authorized | OPEN — legal opinion and accountable entity absent |

## 4. Review priorities

The independent reviewer should prioritize:

1. **P0 — evidence integrity:** T-01 through T-04 and T-08. Reproduce a clean checkout, dependency installation, offline Node/Bash suite, genuine Solidity compile, ABI inspection, unit/fuzz tests and invariant campaigns. Separate actual execution from synthetic parser/guard checks.
2. **P0 — custody and execution boundary:** T-05 through T-08. Inspect constructor inputs and the testnet helper, but do not use real keys or broadcast transactions. Treat all future holder/quorum decisions as unresolved.
3. **P1 — human/process controls:** T-09 through T-11 and T-14. Challenge the completeness of the grant inventory, independence of approvals, identity/privacy risks and anti-impersonation communications.
4. **P1 — product and legal boundary:** T-12, T-13 and T-15. Ensure there is no implicit AI-credit redemption or wallet/payment coupling, and no claim that a local demo is a live token.

## 5. Evidence and risk acceptance

For each threat, the reviewer should attach:

- Exact affected commit and file/function or workflow.
- Attacker capability, preconditions, trust boundary and plausible impact.
- Exact reproducer and observed output, including tool versions and exit codes.
- Relevant regression test and whether it ran against the exact commit.
- Existing mitigation, bypass conditions and residual limitations.
- A named accountable owner, target remediation and independent retest.
- Decision: OPEN, MITIGATED-PENDING-RETEST, ACCEPTED or CLOSED-VERIFIED.

Do not assign a numeric probability or claim "low risk" without evidence and a defined method. A risk may be accepted only by an accountable human with a written rationale, scope and expiry/review date; acceptance is not a technical fix or launch approval. Critical and High findings should block any progression to a public testnet until independently resolved or an explicit, justified decision is documented.

No table row should be marked closed merely because a guard, document, parser or test exists. Real Foundry execution, external review and source/toolchain reproducibility remain required.

## 6. Explicit out-of-scope actions

This threat model does not authorize key generation or custody, wallet connections, public RPC calls, testnet/mainnet transactions, token issuance, transfers, sales, liquidity, listings, grant payments, signer selection, supply/allocation decisions or SPICA-to-AI-credit conversion. Do not place wallet addresses, signer identities, personal data, keys, credentials or provider secrets in this repository.

The default risk treatment is **do not issue** until evidence-led engineering, independent security, legal, economic and governance gates are complete and a separate human go/no-go decision is recorded.
