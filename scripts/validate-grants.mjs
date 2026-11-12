#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Read-only offline inspection. A successful check is NEVER an authorization.
import { readFileSync } from "node:fs";
import { validateGrantLedger } from "./grants-core.mjs";

const [file, ...flags] = process.argv.slice(2);
if (!file || flags.length > 1 || flags.some((flag) => flag !== "--require-proposal")) {
  console.error("Usage: node scripts/validate-grants.mjs <ledger.json> [--require-proposal]");
  process.exitCode = 2;
} else {
  try {
    const ledger = JSON.parse(readFileSync(file, "utf8"));
    const report = validateGrantLedger(ledger);
    if (flags.includes("--require-proposal") && ledger.status !== "proposal") {
      report.errors.push("status: a review proposal is required");
      report.valid = false;
    }
    if (!report.valid) {
      console.error("INVALID proposed grant ledger:");
      for (const error of report.errors) console.error(" - " + error);
      process.exitCode = 1;
    } else {
      console.log(
        "VALID " + ledger.status.toUpperCase() +
        " structure only; GitHub evidence NOT verified; no grant, distribution, signing, or payment is authorized."
      );
    }
  } catch (error) {
    console.error("Cannot parse grant ledger: " + error.message);
    process.exitCode = 2;
  }
}
