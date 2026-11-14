// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/check-abi.mjs');
const expected = [
  ['allowance', ['address', 'address'], 'view', 'uint256'],
  ['approve', ['address', 'uint256'], 'nonpayable', 'bool'],
  ['balanceOf', ['address'], 'view', 'uint256'],
  ['decimals', [], 'view', 'uint8'],
  ['name', [], 'view', 'string'],
  ['symbol', [], 'view', 'string'],
  ['totalSupply', [], 'view', 'uint256'],
  ['transfer', ['address', 'uint256'], 'nonpayable', 'bool'],
  ['transferFrom', ['address', 'address', 'uint256'], 'nonpayable', 'bool'],
];
const standardAbi = () => [
  { type: 'constructor', stateMutability: 'nonpayable', inputs: [{type:'address'}, {type:'uint256'}] },
  ...expected.map(([name, args, stateMutability, output]) => ({
    type:'function', name, stateMutability,
    inputs:args.map(type=>({type})), outputs:[{type:output}]
  })),
  { type:'event',name:'Transfer',anonymous:false,inputs:[
    {type:'address',indexed:true}, {type:'address',indexed:true}, {type:'uint256',indexed:false}
  ]},
  { type:'event',name:'Approval',anonymous:false,inputs:[
    {type:'address',indexed:true}, {type:'address',indexed:true}, {type:'uint256',indexed:false}
  ]},
  { type:'error',name:'ERC20InsufficientBalance',inputs:[
    {type:'address'}, {type:'uint256'}, {type:'uint256'}
  ]},
  { type:'error',name:'InvalidInitialHolder',inputs:[] },
];
function check(abi) {
  const directory = mkdtempSync(join(tmpdir(), 'spica-abi-'));
  try {
    const artifact = join(directory, 'SpicaCash.json');
    writeFileSync(artifact, JSON.stringify({abi}));
    return spawnSync(process.execPath, [scriptPath,artifact], {encoding:'utf8'});
  } finally { rmSync(directory,{recursive:true,force:true}); }
}
function rejects(name, change, expectedError) {
  test(name, () => {
    const abi = standardAbi(); change(abi);
    const run = check(abi);
    assert.notEqual(run.status, 0, run.stdout);
    assert.match(run.stderr, expectedError);
  });
}
test('standard OpenZeppelin-shaped ERC-20 ABI passes', () => {
  const run=check(standardAbi());
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/9 standard ERC-20 functions, 2 events/);
});
rejects('unexpected mint method fails', abi=>{
  abi.push({type:'function',name:'mint',inputs:[{type:'address'},{type:'uint256'}],outputs:[],stateMutability:'nonpayable'});
},/unexpected callable function: mint/);
rejects('missing ERC-20 transfer method fails', abi=>{
  abi.splice(abi.findIndex(item=>item.name==='transfer'),1);
},/missing standard ERC-20 function: transfer/);
rejects('incorrect constructor argument types fail', abi=>{abi[0].inputs[1].type='uint8';},/constructor must take/);
rejects('payable fallback or receiver fails',abi=>{abi.push({type:'receive',stateMutability:'payable'});},/unexpected receive entry/);
rejects('unexpected payable function fails',abi=>{abi.find(x=>x.name==='transfer').stateMutability='payable';},/unexpected mutability for transfer/);
rejects('missing Transfer event fails',abi=>{abi.splice(abi.findIndex(x=>x.name==='Transfer'),1);},/missing standard ERC-20 event: Transfer/);
rejects('missing Approval event fails',abi=>{abi.splice(abi.findIndex(x=>x.name==='Approval'),1);},/missing standard ERC-20 event: Approval/);
rejects('incorrect Transfer indexed positions fail',abi=>{abi.find(x=>x.name==='Transfer').inputs[0].indexed=false;},/unexpected event indexed flags/);
rejects('anonymous Approval event fails',abi=>{abi.find(x=>x.name==='Approval').anonymous=true;},/event must not be anonymous/);
rejects('new unreviewed event fails',abi=>{abi.push({type:'event',name:'Minted',anonymous:false,inputs:[]});},/unexpected or malformed event/);
rejects('duplicate Transfer event fails',abi=>{abi.push(structuredClone(abi.find(x=>x.name==='Transfer')));},/duplicate event/);
rejects('modified ERC-20 return type fails',abi=>{abi.find(x=>x.name==='transfer').outputs[0].type='uint256';},/unexpected return type/);
rejects('missing ERC-20 function outputs fails',abi=>{delete abi.find(x=>x.name==='transfer').outputs;},/explicitly specify inputs and outputs/);
rejects('extra return value on ERC-20 function fails',abi=>{abi.find(x=>x.name==='transfer').outputs.push({type:'bool'});},/unexpected return type/);
rejects('unknown ABI entry type fails',abi=>{abi.push({type:'experimental'});},/unexpected ABI entry type/);
rejects('duplicate function fails',abi=>{abi.push(structuredClone(abi.find(x=>x.name==='approve')));},/duplicate callable function/);
rejects('missing constructor fails',abi=>{abi.shift();},/expected exactly one constructor/);
rejects('duplicate constructor fails',abi=>{abi.push(structuredClone(abi[0]));},/expected exactly one constructor/);
rejects('malformed event inputs fail',abi=>{abi.find(x=>x.name==='Transfer').inputs=null;},/event inputs must be an array/);
rejects('malformed ABI entry fails',abi=>{abi.push(null);},/invalid ABI entry/);
