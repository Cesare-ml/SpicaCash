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

For a deliberate three-safeguard check, add the optional `--pinned-proposal-review` flag. It **requires all three** `--require-proposal`, `--inventory-dir <flat-folder>` and `--expected-manifest-sha256 <trusted-digest>`; omitting any returns usage exit code 2 before reading the manifest. Existing commands remain compatible without this opt-in flag:

```bash
node scripts/check-grant-manifest.mjs path/to/manifest.json \
  --pinned-proposal-review --require-proposal \
  --inventory-dir review-batches \
  --expected-manifest-sha256 <independently-reviewed-64-character-sha256>
```

This mode does not independently establish where the expected digest came from, who approved it, whether the inventory covers folders outside the requested scope or whether contributions are eligible. It does **not** authorize token issuance or payment. The corresponding tests are in `test/node/grant-manifest.test.mjs`.

A matching digest permits the usual **read-only checks** to continue; a mismatch fails validation. Invalid/missing digest arguments fail with usage exit code 2. Without the option, the CLI remains compatible with existing draft workflows and simply prints the actual manifest digest. The programmatic `loadGrantManifest()` API also accepts `expectedManifestSha256` and returns `manifestSha256`.

**Important:** the digest is a fingerprint, **not a signature or approval**. Copying it directly from the same untrusted manifest or checker run does not establish authenticity. Obtain the approved value separately (for example, from a trusted, reviewed Git commit or independently verified review record). The loader reads at most 1 MiB through a verified file descriptor (POSIX `O_NOFOLLOW` where available), compares pre-open and opened file metadata (device, inode, size, mtime and ctime), then uses a one-byte overflow probe and a second descriptor metadata check after reading to reject observed modifications. `O_NONBLOCK` where supported also prevents a swapped named pipe from blocking the open indefinitely. File handles close on success or failure. This reduces symlink-swap and unbounded-read exposure, but is **not** a guarantee against all concurrent filesystem races, especially on Windows; review in a controlled, immutable checkout. The loader checks the independently supplied digest against raw manifest bytes **before JSON parsing or opening any manifest-listed files**. A mismatch stops the review without traversing those paths. Even a pinned manifest does not prove that the declared folder is the complete intended grant corpus or that any contributor is eligible. Because raw bytes are hashed, even whitespace-only formatting changes require a newly reviewed digest. No grants, payments or tokens are issued.

## Unambiguous hashed JSON review

The manifest loader now rejects duplicate object properties at any nesting level, including keys that decode to the same string after Unicode escaping. It rejects malformed UTF-8, initial UTF-8 BOMs, unpaired UTF-16 surrogate escapes in keys or values, and nesting beyond 128 levels. Paired surrogate escapes and literal Unicode characters remain valid. This extra restriction avoids the cross-implementation ambiguity described in RFC 8259 section 8.2. Unlike `JSON.parse` on its own, this avoids silently treating conflicting duplicate fields as the last value. The strict parser still uses native `JSON.parse` for final grammar validation.

A trusted, independently supplied SHA-256 pin is checked **before manifest parsing**. For each referenced grant batch and tokenomics JSON document, its raw bytes are compared with the manifest hash **before strict parsing**. A mismatch reports a digest error rather than interpreting unauthenticated document contents.

Run `npm run test:review-json` (seventeen parser tests and eleven manifest-integration tests). The strict rules apply to the hashed-manifest review path, not automatically to all standalone JSON draft CLIs. Validation does not authorize any distributions or onchain actions.

## Optional directory inventory verification

A manifest hash check validates only the entries listed by the author. To detect **JSON batch files omitted from that manifest within a known folder**, the CLI now supports `--inventory-dir`:

```bash
# Future review: keep only proposed grant batch JSON files inside `review-batches/`.
# Keep the manifest and tokenomics JSON in the parent directory.
node scripts/check-grant-manifest.mjs path/to/manifest.json \
  --require-proposal \
  --inventory-dir review-batches
```

The folder is resolved relative to the manifest location. Every regular `.json` file **directly in that directory** must be included in the hashed manifest, and every manifest-listed batch must reside in that same folder. The verifier fails on unlisted batch files, missing files, symlinked directories and paths that leave the manifest directory. Subdirectories are **rejected outright** (including empty subdirectories), rather than silently ignored; symlinks and special filesystem entries are also rejected even if their names do not end in `.json`. Regular non-JSON files such as `README.md` are allowed for notes. Mixed-case JSON suffixes such as `.JSON` or `.Json` are rejected rather than silently ignored: use lowercase `.json` only. Inventory diagnostics are listed in stable filename order. The inventory scanner reads at most **128 directory entries** (including notes and batches), then fails closed on an additional entry without materializing an unbounded directory listing. Keep all proposal batch files in one dedicated, flat directory and put the tokenomics file outside it. This remains a **scoped** check, not evidence that no other batches exist elsewhere.

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

The 35 Node tests in `test/node/grant-manifest.test.mjs` cover default and synthetic proposals, tampered file hashes, unsafe file paths, duplicate references, Symlink denial, cross-batch over-allocation and CLI authorization disclaimers. Run `npm run test:safe-reader`, `npm run test:grant-manifest`, `npm run test:grant-inventory` and `npm run test:offline` in a clean repository checkout and document actual test output before merge. Solidity compilation and audit are separate, still mandatory before an onchain trial.
