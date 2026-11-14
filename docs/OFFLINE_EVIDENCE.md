# Portable offline Node verification evidence (Windows/Linux/macOS)

**Research-only; no SpicaCash token is deployed or approved for release.** This helper captures proof of a *local Node-only check*, not an audit, EVM test, token distribution decision or launch permission. It does not call any RPC, wallet, exchange or deployment tool. Git and Node.js 20+ must already be installed on a trusted machine.

## Windows 11 / PowerShell

Run from a **fresh clone** of `main` with no local edits. Use a trusted Node and Git installation. Before invoking Node, clear executable startup options inherited from the environment:

```powershell
git clone https://github.com/Cesare-ml/SpicaCash.git
Set-Location SpicaCash
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
Remove-Item Env:npm_config_node_options -ErrorAction SilentlyContinue
Remove-Item Env:NPM_CONFIG_NODE_OPTIONS -ErrorAction SilentlyContinue
node --version
git rev-parse HEAD
$evidence = Join-Path $env:TEMP "spicacash-node-evidence.json"
node scripts/capture-offline-evidence.mjs > $evidence
$code = $LASTEXITCODE
Write-Output "Verifier exit code: $code"
Write-Output "Evidence saved locally: $evidence"
```

The redirect must point **outside the checkout**: untracked report files deliberately fail the clean-tree check. Save the command's exit code; a JSON report may exist even when checks failed. Never publish the entire report without first reviewing and redacting local console output.

Run `node --test test/node/offline-evidence.test.mjs` for the helper's regression tests. These tests create and delete disposable local Git repositories; they never clone a remote or deploy a token.

## What the JSON records

- Git commit SHA, verified Git-worktree-root location, Git clean/dirty state and SHA-256 of **seven files**: the package policy, lockfile, `.npmrc`, dependency checker, Node runner, the evidence collector itself and its regression test. Each file is read for hashing in bounded 64 KiB chunks, rejecting any file larger than 1 MiB, including files that grow after preflight. The file descriptor's size, identity, and modification timestamps are compared before and after reading; these are best-effort guards rather than an atomic snapshot of a mutable filesystem.
- OS/architecture, Node.js version, UTC timestamp.
- **First** the dependency-policy check, **then** the Node-only offline regression runner. Each has a numeric exit code and captured stdout/stderr, or a process failure indicator. Subprocesses do not invoke a shell, have a bounded output buffer, and filter inherited Git metadata/configuration overrides (`GIT_*`), Node/npm execution options (`NODE_*`/`NPM_CONFIG_*`), Foundry/Dapp settings, Bash startup/exported-function variables, native-loader overrides (`LD_*`/`DYLD_*`), and selected RPC/signing controls. The five prior Node/npm compatibility overrides remain present only as **empty strings**. Tool discovery variables such as `PATH`, `HOME` and `TEMP` are retained.
- A *second* checkout integrity check after tests, to reject source mutations while the checks ran.
- `PASSED_NODE_ONLY`, `FAILED` or `INCOMPLETE`. Even `PASSED_NODE_ONLY` always has `releaseStatus: "NOT_AUTHORIZED"` and `authorization: "NONE"`.

The helper **does not verify** Git commit authenticity, npm-installed binary integrity, test coverage completeness of unlisted future suites, the browser demo, Bash deployment guards, real Solidity compilation, Foundry tests, security audits, legal readiness, or investor demand. Do not substitute this for `bash scripts/verify-local.sh` or mark SC-01/SC-02 complete without full independent acceptance evidence. This helper does not prove the machine itself is trustworthy: a malicious **initial** Node preload (executed before filtering), global Git config, shell startup files affecting the parent, Git hooks, unsafe `PATH`/`HOME`, altered executables or a modified helper may still compromise the run. Filtering inherited environment names does not authenticate the checkout or test binaries. Use a fresh trusted environment.

`spawnSync` caps captured output to 1 MiB per stream and timeouts each Node check after five minutes. Either situation fails rather than claiming success. The JSON output is **local evidence containing raw child stdout/stderr**; it can include local file paths or confidential data from unrelated machine configuration. Keep it private until manually sanitized; never commit it to the public repository.

**Current verification status:** 12/12 real Node regression tests passed on disposable local Git fixtures with Node.js 22.16.0 on Linux using files matched to the committed Git blobs, including a real child Git-redirection injection test. The real current SpicaCash checkout, complete Node suite, Windows 11 run and Foundry toolchain have **not** been executed by this result. SC-01/SC-02 stay open.
