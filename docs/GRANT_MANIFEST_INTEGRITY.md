# SHA-256 pinned grant batch manifest (offline review v0)

> **Research-only.** This feature is NOT a token issuance, payment authorization, reward award, signer registry or financial allocation. SpicaCash is not deployed and cannot be exchanged for VirgoStars AI credits in the initial VirgoStars release.

## Problem

The [grant batch reconciler](GRANT_BATCH_RECONCILIATION.md) checks only the local files supplied on the command line. Reviewers can accidentally omit another batch, or a proposed batch file may be modified between review and reconciliation.

This optional manifest lists the exact relative paths and **SHA-256 hashes of the raw file bytes** for every declared batch, plus a tokenomics file for review proposals. The checksum catches modification; it is NOT a cryptographic signature, approval, immutability guarantee or evidence of completeness.

## Schema

`config/grant-batches.draft.manifest.json` references the existing **empty** grant draft. It intentionally has no tokenomics plan, grant amounts, beneficiaries, signer details or issuance authorization.

```json
{
  "schemaVersion": 1,
  "status": "draft",
  "executionAuthorized": false,
  "tokenomics": null,
  "batches": [
    {
      "path": "contributor-grants.draft.json",
      "sha256": "<64 lowercase SHA-256 hex characters>"
    }
  ]
}
```

The checked-in file includes the real digest of the checked-in empty draft. A future `proposal` manifest would reference a hashed `tokenomics` object with the same `path`/`sha256` fields and a nonempty `batches` array. **No real proposal manifest exists yet.**

## Reproduction

Requires Node.js 20+, without Node package downloads:

```bash
npm run check:grant-manifest
npm run test:grant-manifest

# Proposals: requires a complete, independently reviewed and hash-pinned local set
node scripts/check-grant-manifest.mjs path/to/manifest.json --require-proposal
```

The checked-in draft passes the first command but **must fail** `--require-proposal`.

File paths must be relative to the manifest directory and end in `.json`. The loader refuses path traversal, absolute paths, symlink redirects, duplicated local paths, malformed/unexpected fields, digest mismatches, invalid statuses and files larger than 1 MiB. Maximum: 64 batches, each subject to the existing grant validator limits. It validates hashes **before** arithmetic and cross-file PR duplicate checks.

## Optional out-of-band review fingerprint

The CLI prints the SHA-256 digest of the **raw manifest bytes**, in addition to checking each declared file digest. Reviewers can pin one approved review snapshot through an independent channel and reject any changed manifest (including a manifest and batches maliciously modified together):

```bash
# Replace with a 64-character lowercase SHA-256 value obtained independently.
node scripts/check-grant-manifest.mjs path/to/manifest.json \
  --require-proposal \
  --inventory-dir review-batches \
  --expected-manifest-sha256 <independently-reviewed-64-character-sha256>
```

A matching digest permits the usual **read-only checks** to continue; a mismatch fails validation. Invalid/missing digest arguments fail with usage exit code 2. Without the option, the CLI remains compatible with existing draft workflows and simply prints the actual manifest digest. The programmatic `loadGrantManifest()` API also accepts `expectedManifestSha256` and returns `manifestSha256`.

**Important:** the digest is a fingerprint, **not a signature or approval**. Copying it directly from the same untrusted manifest or checker run does not establish authenticity. Obtain the approved value separately (for example, from a trusted, reviewed Git commit or independently verified review record). The loader checks the independently supplied digest against raw manifest bytes **before JSON parsing or opening any manifest-listed files**. Each referenced batch and tokenomics file is also checked against its own declared SHA-256 **before strict JSON decoding**; a mismatched checksum takes precedence over duplicate-key and malformed-UTF-8 diagnostics. A mismatch stops the review without traversing those paths. Even a pinned manifest does not prove that the declared folder is the complete intended grant corpus or that any contributor is eligible. Because raw bytes are hashed, even whitespace-only formatting changes require a newly reviewed digest. No grants, payments or tokens are issued.

## Optional directory inventory verification

A manifest hash check validates only the entries listed by the author. To detect **JSON batch files omitted from that manifest within a known folder**, the CLI now supports `--inventory-dir`:

```bash
# Future review: keep only proposed grant batch JSON files inside `review-batches/`.
# Keep the manifest and tokenomics JSON in the parent directory.
node scripts/check-grant-manifest.mjs path/to/manifest.json \
  --require-proposal \
  --inventory-dir review-batches
```

The folder is resolved relative to the manifest location. Every regular `.json` file **directly in that directory** must be included in the hashed manifest, and every manifest-listed batch must reside in that same folder. The verifier fails on unlisted batch files, missing files, symlinked directories and paths that leave the manifest directory. Subdirectories are **rejected outright** (including empty subdirectories), rather than silently ignored; symlinks and special filesystem entries are also rejected even if their names do not end in `.json`. Regular non-JSON files such as `README.md` are allowed for notes. Mixed-case JSON suffixes such as `.JSON` or `.Json` are rejected rather than silently ignored: use lowercase `.json` only. Inventory diagnostics are listed in stable filename order. Keep all proposal batch files in one dedicated, flat directory and put the tokenomics file outside it. This remains a **scoped** check, not evidence that no other batches exist elsewhere.

For a local smoke test of the inventory checker:

```bash
npm run test:grant-inventory
```

This is an **opt-in** directory check; omitting `--inventory-dir` explicitly reports that the inventory was not checked. For final reviews, use the strict option and separately verify that the selected folder represents the complete intended proposal scope.

## Unambiguous JSON semantics

The offline manifest loader now rejects **duplicate object properties at any nesting level** in the manifest, referenced grant batches, and referenced tokenomics JSON. This includes distinct textual spellings which decode to the same key (for example, a literal key and its `\\u`-escaped equivalent). Standard `JSON.parse` otherwise silently keeps the last occurrence, which can conceal contradictory authority or amount fields from human review.

The decoder also refuses malformed UTF-8 instead of silently replacing invalid sequences, caps nesting at 128 levels, and still relies on native `JSON.parse` to validate full JSON syntax. These checks operate on the same raw file bytes that the SHA-256 digest pins. An invalid document fails review without approving or issuing anything.

Run `npm run test:review-json` for the ten direct parser tests and six manifest integration tests, or `npm run test:offline` for the full local offline chain. These rules apply to the **hashed manifest review workflow**; other independent draft-validation CLIs should not be assumed to reject duplicate keys until migrated to the shared decoder.

## Descriptor-bound, size-limited JSON reads

The manifest loader opens each local JSON file once and reads its bytes through the **opened descriptor** instead of separately trusting a size check followed by an unrestricted path-based read. It uses an upper bound of **1 MiB per file** (the manifest, every batch and tokenomics JSON), reads no more than 1 MiB + 1 byte, and rejects non-regular files, oversized data and files whose descriptor metadata or observed byte count change during the read. On platforms with `O_NOFOLLOW`, it also refuses a final-path symlink swapped in between the precheck and the open. No network access, token transfer or signing is involved.

This reduces common check-to-open and file-growth risks, but is **not an atomic filesystem snapshot**. Metadata checks cannot detect every concurrent in-place rewrite, and no-follow protection is platform-dependent; upstream directories may be modified by other users. Review an immutable checkout with no concurrent writers, pin the raw manifest through a trusted independent record, and retain external human review.

## Boundaries and remaining risks

- **Completeness cannot be proved by the manifest itself.** An author could omit a batch entirely. Governance must separately confirm that the list is the agreed canonical set, e.g. by reviewing its committed Git revision and inventory.
- SHA-256 detects changes relative to the listed digest; an attacker who edits the file *and* manifest can create a self-consistent dishonest proposal. Independent reviewers must inspect the committed content and authorship.
- Public GitHub PR references remain unverified by this tool. Reviewers must confirm eligibility, merge/acceptance, conflicts of interest, ownership and anti-Sybil measures.
- The validator does not check actual prior token distributions, onchain balances, actual vesting contracts or treasury state.
- Even successful syntax/arithmetic/hash checks **never** authorize payments, grants, launches, listings or token-to-credit conversions.
- No real tokenomics or official chain is chosen; Arbitrum is only a testnet candidate.
- No private keys, wallets, API credentials, onchain transactions or GitHub Actions are involved.

## Validation gates

The 35 Node tests in `test/node/grant-manifest.test.mjs` cover default and synthetic proposals, tampered file hashes, unsafe file paths, duplicate references, Symlink denial, cross-batch over-allocation and CLI authorization disclaimers. Run `npm run test:grant-manifest`, `npm run test:grant-inventory` and `npm run test:offline` in a clean repository checkout and document actual test output before merge. Solidity compilation and audit are separate, still mandatory before an onchain trial.
