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

## Optional directory inventory verification

A manifest hash check validates only the entries listed by the author. To detect **JSON batch files omitted from that manifest within a known folder**, the CLI now supports `--inventory-dir`:

```bash
# Future review: keep only proposed grant batch JSON files inside `review-batches/`.
# Keep the manifest and tokenomics JSON in the parent directory.
node scripts/check-grant-manifest.mjs path/to/manifest.json \
  --require-proposal \
  --inventory-dir review-batches
```

The folder is resolved relative to the manifest location. Every regular `.json` file **directly in that directory** must be included in the hashed manifest, and every manifest-listed batch must reside in that same folder. The verifier fails on unlisted batch files, missing files, **any nested directories (even empty ones), symbolic links (including non-JSON names)** and paths that leave the manifest directory. `.JSON` or `.Json` extensions fail instead of being silently ignored; batch names must use the canonical lowercase `.json`. Ordinary non-JSON regular notes (such as `README.md`) are ignored. Subdirectories are deliberately rejected, rather than recursively scanned. Keep all proposal batch files in one dedicated, flat directory and put the tokenomics file outside it.

For a local smoke test of the inventory checker:

```bash
npm run test:grant-inventory
```

This is an **opt-in** directory check; omitting `--inventory-dir` explicitly reports that the inventory was not checked. For final reviews, use the strict option and separately verify that the selected folder represents the complete intended proposal scope.

## Boundaries and remaining risks

- **Completeness cannot be proved by the manifest itself.** An author could omit a batch entirely. Governance must separately confirm that the list is the agreed canonical set, e.g. by reviewing its committed Git revision and inventory.
- SHA-256 detects changes relative to the listed digest; an attacker who edits the file *and* manifest can create a self-consistent dishonest proposal. Independent reviewers must inspect the committed content and authorship.
- Public GitHub PR references remain unverified by this tool. Reviewers must confirm eligibility, merge/acceptance, conflicts of interest, ownership and anti-Sybil measures.
- The validator does not check actual prior token distributions, onchain balances, actual vesting contracts or treasury state.
- Even successful syntax/arithmetic/hash checks **never** authorize payments, grants, launches, listings or token-to-credit conversions.
- No real tokenomics or official chain is chosen; Arbitrum is only a testnet candidate.
- No private keys, wallets, API credentials, onchain transactions or GitHub Actions are involved.

## Validation gates

The 21 Node tests in `test/node/grant-manifest.test.mjs` cover default and synthetic proposals, tampered file hashes, unsafe file paths, duplicate references, Symlink denial, cross-batch over-allocation and CLI authorization disclaimers. Run `npm run test:grant-manifest`, `npm run test:grant-inventory` and `npm run test:offline` in a clean repository checkout and document actual test output before merge. Solidity compilation and audit are separate, still mandatory before an onchain trial.
