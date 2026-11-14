// SPDX-License-Identifier: MIT
// Offline-only, review-only batch reconciliation; no keys, wallets, signatures,
// token transfers, GitHub API calls or payment authorization.
export function reconcileGrantBatches(batches, tokenomics, validator, options = {}) {
  const errors = [];
  const error = (path, message) => errors.push(path + ": " + message);
  const maxBatches = 64;
  const maxGrants = 10000;
  if (typeof validator !== "function") {
    return {valid:false,errors:["validator: required contributor-grants validation function"]};
  }
  if (!Array.isArray(batches) || batches.length === 0 || batches.length > maxBatches) {
    return {valid:false,errors:["batches: expected between 1 and 64 batches"]};
  }
  const files = new Set(), ids = new Set(), refs = new Set(), totals = new Map();
  let proposals = 0, drafts = 0, count = 0;
  for (const [i, batch] of batches.entries()) {
    const path = "batches[" + i + "]";
    if (!batch || typeof batch !== "object" || Array.isArray(batch) ||
        Object.keys(batch).some(k => !["name","plan"].includes(k)) ||
        typeof batch.name !== "string" || batch.name.trim().length === 0 ||
        batch.name.length > 256) {
      error(path, "must have unique nonempty name and plan, no extra fields");
      continue;
    }
    if (files.has(batch.name)) error(path+".name","duplicate file name");
    else files.add(batch.name);
    const plan = batch.plan;
    const check = validator(plan, tokenomics, {requireProposal:options.requireProposal === true});
    if (!check || check.valid !== true) {
      const issues = check?.errors?.join("; ") || "validator rejected plan";
      error(path+".plan", issues);
      continue;
    }
    if (plan.status === "draft") { drafts++; continue; }
    if (plan.status !== "proposal") {
      error(path+".plan.status","unrecognized review status");
      continue;
    }
    proposals++;
    if (plan.deploymentApproved !== false || plan.distributionEnabled !== false ||
        plan.aiCreditConversionEnabled !== false) {
      error(path+".plan", "authorization and credit-conversion flags must remain false");
      continue;
    }
    if (!Array.isArray(plan.grants)) {
      error(path+".plan.grants","expected grants array");
      continue;
    }
    count += plan.grants.length;
    if (count > maxGrants) {
      error("batches", "aggregate exceeds 10000 grant proposals");
      break;
    }
    for (const [j,grant] of plan.grants.entries()) {
      const source = path+".plan.grants["+j+"]";
      // Each entry was already validated by the required validator.
      const id = grant.id;
      const ref = grant.sourcePullRequest.toLowerCase();
      if (ids.has(id)) error(source+".id","duplicate grant id across batches");
      else ids.add(id);
      if (refs.has(ref)) error(source+".sourcePullRequest","duplicate GitHub PR across batches");
      else refs.add(ref);
      const bucket = plan.tokenomicsBucketId;
      const amount = BigInt(grant.amountBaseUnits);
      const next = (totals.get(bucket) || 0n) + amount;
      totals.set(bucket,next);
    }
  }
  if (proposals > 0 && drafts > 0) error("batches","cannot mix drafts and proposals");
  if (options.requireProposal === true && drafts > 0) error("batches","complete proposal batches required");
  if (proposals > 0 && (!tokenomics || !Array.isArray(tokenomics.allocations))) {
    error("tokenomics","valid companion tokenomics proposal required");
  } else if (proposals > 0) {
    for (const [bucketId,total] of totals.entries()) {
      const allocation = tokenomics.allocations.find(a=>a.id===bucketId && a.category==="contributors");
      if (!allocation) {error("tokenomics."+bucketId,"missing contributors allocation");continue;}
      const budget = BigInt(allocation.amountBaseUnits);
      if (total > budget) error("totals."+bucketId,"aggregate proposals exceed contributors allocation");
    }
  }
  const result = {valid:errors.length===0,errors};
  if (result.valid) {
    result.batchCount = batches.length;
    result.proposalCount = count;
    result.totals = {};
    for (const [bucketId,total] of [...totals.entries()].sort((a,b)=>a[0].localeCompare(b[0]))) {
      const allocation = tokenomics.allocations.find(a=>a.id===bucketId);
      result.totals[bucketId]={proposedBaseUnits:total.toString(),unassignedBaseUnits:(BigInt(allocation.amountBaseUnits)-total).toString()};
    }
  }
  return result;
}
