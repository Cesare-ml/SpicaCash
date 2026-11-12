// SPDX-License-Identifier: MIT
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validateGrantLedger } from "../../scripts/grants-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const draft = JSON.parse(readFileSync(join(root, "config/grants.draft.json"), "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));
function example() {
  return {
    schemaVersion: 1,
    status: "proposal",
    distributionEnabled: false,
    aiCreditConversionEnabled: false,
    entries: [{
      id: "example-grant-a",
      source: { repository: "Cesare-ml/astrological-functions", pullRequest: 12345 },
      contributorId: "example-contributor",
      review: { status: "peer-review-proposed", reviewerIds: ["reviewer-one", "reviewer-two"] },
      amountBaseUnits: "1000000000000000000",
      vesting: { mode: "linear", startTimestampSeconds: 2000000000, durationSeconds: 2592000 },
      rationale: "Only synthetic test data, not an actual proposed payment or vesting schedule."
    }]
  };
}

test("empty grant draft is valid but cannot distribute tokens", () => {
  const report = validateGrantLedger(draft);
  assert.equal(report.valid, true, report.errors.join("\n"));
  assert.equal(draft.distributionEnabled, false);
  assert.equal(draft.entries.length, 0);
});

test("synthetic peer-reviewed proposal is structurally valid, not approved", () => {
  const report = validateGrantLedger(example());
  assert.equal(report.valid, true, report.errors.join("\n"));
});

function rejects(name, mutate, expected) {
  test(name, () => {
    const ledger = example();
    mutate(ledger);
    const report = validateGrantLedger(ledger);
    assert.equal(report.valid, false, "should reject invalid grant");
    assert.ok(report.errors.some((e) => e.includes(expected)), report.errors.join("\n"));
  });
}

rejects("forbids distribution flag", (p) => { p.distributionEnabled = true; }, "distributionEnabled");
rejects("forbids AI credit conversion", (p) => { p.aiCreditConversionEnabled = true; }, "aiCreditConversionEnabled");
rejects("rejects invalid source repo", (p) => { p.entries[0].source.repository = "other/unknown"; }, "source.repository");
rejects("rejects invalid pull request", (p) => { p.entries[0].source.pullRequest = 0; }, "pullRequest");
rejects("rejects self-review", (p) => { p.entries[0].review.reviewerIds[0] = p.entries[0].contributorId; }, "contributor cannot");
rejects("rejects only one reviewer", (p) => { p.entries[0].review.reviewerIds = ["reviewer-one"]; }, "two independent");
rejects("rejects duplicate grant identifiers", (p) => {
  p.entries.push({ ...clone(p.entries[0]), source: { repository: "Cesare-ml/astrological-charts", pullRequest: 42 } });
}, "duplicate grant id");
rejects("rejects duplicate contribution assignments", (p) => {
  p.entries.push({ ...clone(p.entries[0]), id: "second-grant" });
}, "duplicate contribution");
rejects("rejects invalid decimal amounts", (p) => { p.entries[0].amountBaseUnits = "1.5"; }, "amountBaseUnits");
rejects("rejects supply overflow", (p) => { p.entries[0].amountBaseUnits = "1" + "0".repeat(80); }, "positive uint256");
rejects("rejects review-free numeric award", (p) => { p.entries[0].review = { status: "unreviewed", reviewerIds: [] }; }, "numeric grant requires");
rejects("rejects numeric awards in drafts", (p) => { p.status = "draft"; }, "only allowed");
rejects("rejects zero-duration vesting", (p) => { p.entries[0].vesting.durationSeconds = 0; }, "durationSeconds");
rejects("rejects missing rationales", (p) => { p.entries[0].rationale = "too short"; }, "rationale");
rejects("rejects private wallet field injection", (p) => { p.entries[0].walletAddress = "0x123"; }, "walletAddress");

test("CLI validates empty draft without approving payments", () => {
  const cmd = spawnSync(process.execPath, [join(root, "scripts/validate-grants.mjs"), join(root, "config/grants.draft.json")], { encoding: "utf8" });
  assert.equal(cmd.status, 0, cmd.stderr);
  assert.match(cmd.stdout, /no grant, distribution, signing, or payment is authorized/);
});
test("CLI rejects a draft when review proposal is required", () => {
  const cmd = spawnSync(process.execPath, [join(root, "scripts/validate-grants.mjs"), join(root, "config/grants.draft.json"), "--require-proposal"], { encoding: "utf8" });
  assert.equal(cmd.status, 1);
  assert.match(cmd.stderr, /a review proposal is required/);
});
test("CLI accepts only a synthetic proposal with no approval claims", () => {
  const tmp = mkdtempSync(join(tmpdir(), "spica-grant-test-"));
  try {
    const file = join(tmp, "grant.json");
    writeFileSync(file, JSON.stringify(example()));
    const cmd = spawnSync(process.execPath, [join(root, "scripts/validate-grants.mjs"), file, "--require-proposal"], { encoding: "utf8" });
    assert.equal(cmd.status, 0, cmd.stderr);
    assert.match(cmd.stdout, /evidence NOT verified/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
