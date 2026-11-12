// SPDX-License-Identifier: MIT
// Offline-only review of proposed contributor grants. Never signs or distributes tokens.
import { validateTokenomics } from './tokenomics-core.mjs';

const MAX_UINT256 = (1n << 256n) - 1n;
const SLUG = /^[a-z][a-z0-9-]{1,63}$/;
const PUBLIC_PR_URL = /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}\/pull\/[1-9][0-9]*$/;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateContributorGrants(plan, tokenomicsPlan = null, options = {}) {
  const errors = [];
  const fail = (path, message) => errors.push(path + ': ' + message);
  const shape = (value, path, keys) => {
    if (!isObject(value)) { fail(path, 'expected object'); return false; }
    for (const key of Object.keys(value)) if (!keys.includes(key)) fail(path + '.' + key, 'unknown field');
    for (const key of keys) if (!Object.hasOwn(value, key)) fail(path + '.' + key, 'missing field');
    return true;
  };
  const units = (value, path) => {
    if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
      fail(path, 'expected positive exact base-10 integer string'); return null;
    }
    // Prevent parsing arbitrarily long attacker-controlled strings as BigInts.
    if (value.length > 78) { fail(path, 'exceeds uint256'); return null; }
    const amount = BigInt(value);
    if (amount > MAX_UINT256) { fail(path, 'exceeds uint256'); return null; }
    return amount;
  };
  if (!shape(plan, 'plan', ['schemaVersion', 'status', 'deploymentApproved',
    'distributionEnabled', 'aiCreditConversionEnabled', 'tokenomicsBucketId', 'grants'])) {
    return { valid: false, errors, status: 'invalid' };
  }
  if (plan.schemaVersion !== 1) fail('schemaVersion', 'must equal 1');
  if (!['draft', 'proposal'].includes(plan.status)) fail('status', 'must be draft or proposal');
  if (options.requireProposal && plan.status !== 'proposal') fail('status', 'proposal required');
  for (const flag of ['deploymentApproved', 'distributionEnabled', 'aiCreditConversionEnabled']) {
    if (plan[flag] !== false) fail(flag, 'must remain false; never authorizes execution');
  }
  if (!Array.isArray(plan.grants)) fail('grants', 'expected array');
  else if (plan.grants.length > 1000) fail('grants', 'maximum 1000 entries');
  let total = 0n;
  if (Array.isArray(plan.grants) && plan.grants.length <= 1000) {
    const ids = new Set();
    const sources = new Set();
    for (const [index, grant] of plan.grants.entries()) {
      const path = 'grants[' + index + ']';
      if (!shape(grant, path, ['id', 'sourcePullRequest', 'amountBaseUnits',
        'rationale', 'vestingMonths', 'cliffMonths'])) continue;
      if (typeof grant.id !== 'string' || !SLUG.test(grant.id)) fail(path + '.id', 'invalid slug');
      else if (ids.has(grant.id)) fail(path + '.id', 'duplicate grant ID');
      else ids.add(grant.id);
      if (typeof grant.sourcePullRequest !== 'string' || !PUBLIC_PR_URL.test(grant.sourcePullRequest)) {
        fail(path + '.sourcePullRequest', 'expected canonical GitHub pull request URL');
      } else {
        const key = grant.sourcePullRequest.toLowerCase();
        if (sources.has(key)) fail(path + '.sourcePullRequest', 'duplicate contribution reference');
        else sources.add(key);
      }
      if (typeof grant.rationale !== 'string' || grant.rationale.trim().length < 40 || grant.rationale.length > 1000) {
        fail(path + '.rationale', 'requires 40 to 1000 characters');
      }
      const amount = units(grant.amountBaseUnits, path + '.amountBaseUnits');
      if (amount !== null) total += amount;
      if (!Number.isInteger(grant.vestingMonths) || grant.vestingMonths < 1 || grant.vestingMonths > 120) {
        fail(path + '.vestingMonths', 'integer between 1 and 120 required');
      }
      if (!Number.isInteger(grant.cliffMonths) || grant.cliffMonths < 0 ||
          !Number.isInteger(grant.vestingMonths) || grant.cliffMonths > grant.vestingMonths) {
        fail(path + '.cliffMonths', 'integer between 0 and vestingMonths required');
      }
    }
  }
  if (total > MAX_UINT256) fail('grants', 'sum exceeds uint256');

  let bucketAmount = null;
  if (plan.status === 'draft') {
    if (plan.tokenomicsBucketId !== null) fail('tokenomicsBucketId', 'draft must not select an allocation bucket');
    if (Array.isArray(plan.grants) && plan.grants.length !== 0) fail('grants', 'draft must remain empty');
  }
  if (plan.status === 'proposal') {
    if (typeof plan.tokenomicsBucketId !== 'string' || !SLUG.test(plan.tokenomicsBucketId)) {
      fail('tokenomicsBucketId', 'a valid contributor allocation ID is required');
    }
    if (!Array.isArray(plan.grants) || plan.grants.length === 0) fail('grants', 'proposal requires grants');
    if (tokenomicsPlan === null) {
      fail('tokenomics', 'a complete local tokenomics proposal is required');
    } else {
      const check = validateTokenomics(tokenomicsPlan, { requireProposal: true });
      if (!check.valid) {
        fail('tokenomics', 'invalid companion proposal: ' + check.errors.join('; '));
      } else {
        const bucket = tokenomicsPlan.allocations.find((a) => a.id === plan.tokenomicsBucketId);
        if (!bucket || bucket.category !== 'contributors') {
          fail('tokenomicsBucketId', 'must reference a contributors-category allocation');
        } else {
          bucketAmount = BigInt(bucket.amountBaseUnits);
          if (total > bucketAmount) fail('grants', 'proposed grants exceed the contributor bucket');
        }
      }
    }
  }
  const result = { valid: errors.length === 0, errors, status: plan.status };
  if (result.valid && plan.status === 'proposal' && bucketAmount !== null) {
    result.proposedBaseUnits = total.toString();
    result.unassignedBucketBaseUnits = (bucketAmount - total).toString();
  }
  return result;
}
