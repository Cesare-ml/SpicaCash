// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadGrantManifest } from '../../scripts/grant-manifest-core.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const batch = '{"status":"draft","grants":[]}\n';
function fixture(t, batchBytes = Buffer.from(batch)) {
  const dir = mkdtempSync(join(tmpdir(), 'spica-review-json-'));
  t.after(() => rmSync(dir, { recursive:true, force:true }));
  writeFileSync(join(dir,'batch.json'), batchBytes);
  const manifest = {
    schemaVersion:1,status:'draft',executionAuthorized:false,tokenomics:null,
    batches:[{path:'batch.json',sha256:digest(batchBytes)}]
  };
  const path = join(dir, 'manifest.json');
  writeFileSync(path, JSON.stringify(manifest));
  return { dir, path, manifest };
}

test('valid pinned draft remains loadable',t=>{
  const f = fixture(t);
  const r = loadGrantManifest(f.path);
  assert.equal(r.valid,true,r.errors.join('; '));
  assert.equal(r.batches[0].plan.grants.length,0);
});
test('duplicate manifest authority keys fail even when JSON.parse would choose last',t=>{
  const f=fixture(t);
  const text=JSON.stringify(f.manifest).replace('"executionAuthorized":false',
    '"executionAuthorized":true,"executionAuthorized":false');
  writeFileSync(f.path,text);
  const r=loadGrantManifest(f.path);
  assert.equal(r.valid,false);
  assert.match(r.errors.join('; '),/duplicate JSON object key/);
});
test('duplicate keys inside hash-matching batch fail',t=>{
  const f=fixture(t,Buffer.from('{"status":"proposal","status":"draft","grants":[]}'));
  const r=loadGrantManifest(f.path);
  assert.equal(r.valid,false);
  assert.match(r.errors.join('; '),/duplicate JSON object key/);
});
test('UTF-8 corruption in hash-matching batch fails',t=>{
  const f=fixture(t,Buffer.from([123,34,115,116,97,116,117,115,34,58,34,100,114,97,102,116,34,44,34,120,34,58,34,255,34,125]));
  const r=loadGrantManifest(f.path);
  assert.equal(r.valid,false);
  assert.match(r.errors.join('; '),/encoded|UTF-8|valid/i);
});
test('a mismatched independent manifest pin still short-circuits parsing',t=>{
  const f=fixture(t);
  writeFileSync(f.path,'{"a":1,"a":2}');
  const r=loadGrantManifest(f.path,{expectedManifestSha256:'0'.repeat(64)});
  assert.deepEqual(r.errors,['manifest.sha256: review snapshot digest mismatch']);
});
test('equivalent escaped manifest keys are also duplicates',t=>{
  const f=fixture(t);
  const text=JSON.stringify(f.manifest).replace('"status":"draft"',
    '"status":"draft","\\u0073tatus":"draft"');
  writeFileSync(f.path,text);
  const r=loadGrantManifest(f.path);
  assert.equal(r.valid,false);
  assert.match(r.errors.join('; '),/duplicate JSON object key/);
});

test('hash-matching batch with an unpaired surrogate is rejected',t=>{
  const f=fixture(t,Buffer.from(String.raw`{"status":"draft","memo":"\uD800","grants":[]}`));
  const r=loadGrantManifest(f.path);
  assert.equal(r.valid,false);
  assert.match(r.errors.join('; '),/unpaired UTF-16 surrogate/);
});
test('manifest with a lone surrogate is rejected before following batch paths',t=>{
  const f=fixture(t);
  const source=JSON.stringify(f.manifest).replace('"status":"draft"',
    String.raw`"status":"draft","memo":"\uDC00"`);
  writeFileSync(f.path,source);
  const r=loadGrantManifest(f.path);
  assert.equal(r.valid,false);
  assert.match(r.errors.join('; '),/unpaired UTF-16 surrogate/);
  assert.equal(r.batches.length,0);
});
test('mismatched batch digest fails before parsing duplicate JSON fields',t=>{
  const f=fixture(t,Buffer.from('{"status":"proposal","status":"draft"}'));
  f.manifest.batches[0].sha256='0'.repeat(64);
  writeFileSync(f.path,JSON.stringify(f.manifest));
  const r=loadGrantManifest(f.path);
  assert.deepEqual(r.errors,['batches[0].sha256: file digest mismatch: possible modification']);
});
test('mismatched batch digest fails before decoding malformed UTF-8',t=>{
  const f=fixture(t,Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0xff,0x7d]));
  f.manifest.batches[0].sha256='f'.repeat(64);
  writeFileSync(f.path,JSON.stringify(f.manifest));
  const r=loadGrantManifest(f.path);
  assert.deepEqual(r.errors,['batches[0].sha256: file digest mismatch: possible modification']);
});
test('mismatched tokenomics digest fails before parsing contradictory keys',t=>{
  const f=fixture(t,Buffer.from('{"status":"proposal","grants":[]}'));
  const economics=Buffer.from('{"status":"proposal","status":"draft"}');
  writeFileSync(join(f.dir,'economics.json'),economics);
  f.manifest.status='proposal';
  f.manifest.tokenomics={path:'economics.json',sha256:'0'.repeat(64)};
  writeFileSync(f.path,JSON.stringify(f.manifest));
  const r=loadGrantManifest(f.path);
  assert.deepEqual(r.errors,['tokenomics.sha256: file digest mismatch: possible modification']);
});
