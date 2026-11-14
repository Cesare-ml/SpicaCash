// SPDX-License-Identifier: MIT
// Offline-only governance proposal validation; NEVER authorizes issuance.
export function validateTokenomics(p, options={}) {
  const errors=[], err=(path,why)=>errors.push(path+': '+why);
  const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const shape=(x,path,keys)=>{
    if(!obj(x)){err(path,'expected object');return false}
    for(const key of Object.keys(x))if(!keys.includes(key))err(path+'.'+key,'unknown field');
    for(const key of keys)if(!Object.hasOwn(x,key))err(path+'.'+key,'missing field');
    return true;
  };
  const MAX=(1n<<256n)-1n;
  const units=(x,path)=>{
    if(typeof x!=='string'){err(path,'expected exact base-10 integer string');return null}
    // uint256 has at most 78 decimal digits: bound input before regex/BigInt parsing.
    if(x.length>78){err(path,'exceeds uint256');return null}
    if(! /^(0|[1-9][0-9]*)$/.test(x)){err(path,'expected exact base-10 integer string');return null}
    const n=BigInt(x); if(n===0n)err(path,'must be positive');if(n>MAX)err(path,'exceeds uint256');return n;
  };
  if(!shape(p,'plan',['schemaVersion','status','deploymentApproved','product','network','token','allocations','treasury','reviews']))
    return {valid:false,errors,status:'invalid'};
  if(p.schemaVersion!==1)err('schemaVersion','must equal 1');
  if(!['draft','proposal'].includes(p.status))err('status','expected draft or proposal');
  if(options.requireProposal&&p.status!=='proposal')err('status','proposal required');
  if(p.deploymentApproved!==false)err('deploymentApproved','this validator never authorizes deployment');
  if(shape(p.product,'product',['aiCreditConversionEnabled','tokenSalesEnabled'])){
    if(p.product.aiCreditConversionEnabled!==false)err('product.aiCreditConversionEnabled','must be false');
    if(p.product.tokenSalesEnabled!==false)err('product.tokenSalesEnabled','must be false');
  }
  if(shape(p.network,'network',['candidate'])&&!['undecided','arbitrum-one','base'].includes(p.network.candidate))
    err('network.candidate','invalid candidate');
  let supply=null;
  if(shape(p.token,'token',['name','symbol','decimals','totalSupplyBaseUnits'])){
    if(p.token.name!=='SpicaCash')err('token.name','expected SpicaCash');
    if(p.token.symbol!=='SPICA')err('token.symbol','expected provisional SPICA');
    if(p.token.decimals!==18)err('token.decimals','expected 18');
    if(p.token.totalSupplyBaseUnits===null){
      if(p.status==='proposal')err('token.totalSupplyBaseUnits','required for proposal');
    }else supply=units(p.token.totalSupplyBaseUnits,'token.totalSupplyBaseUnits');
  }
  if(!Array.isArray(p.allocations))err('allocations','expected array');
  else{
    if(p.status==='proposal'&&!p.allocations.length)err('allocations','proposal needs allocations');
    let total=0n;const seen=new Set();
    for(const [i,a] of p.allocations.entries()){
      const path='allocations['+i+']';
      if(!shape(a,path,['id','category','amountBaseUnits','rationale','vestingPolicy','vestingMonths']))continue;
      if(typeof a.id!=='string'||! /^[a-z][a-z0-9-]{1,63}$/.test(a.id))err(path+'.id','invalid slug');
      else if(seen.has(a.id))err(path+'.id','duplicate id');else seen.add(a.id);
      if(!['community','ecosystem','contributors','treasury','team','liquidity','other'].includes(a.category))err(path+'.category','invalid category');
      if(typeof a.rationale!=='string'||a.rationale.trim().length<20)err(path+'.rationale','at least 20 characters required');
      const n=units(a.amountBaseUnits,path+'.amountBaseUnits');if(n!==null)total+=n;
      if(!['none','onchain'].includes(a.vestingPolicy))err(path+'.vestingPolicy','must be none or onchain');
      if(!Number.isInteger(a.vestingMonths)||a.vestingMonths<0||a.vestingMonths>240)err(path+'.vestingMonths','integer 0-240 required');
      else if(a.vestingPolicy==='none'&&a.vestingMonths!==0)err(path+'.vestingMonths','none requires zero months');
      else if(a.vestingPolicy==='onchain'&&a.vestingMonths===0)err(path+'.vestingMonths','onchain requires positive months');
      if(a.category==='team'&&a.vestingPolicy!=='onchain')err(path+'.vestingPolicy','team allocation must vest onchain');
    }
    if(total>MAX)err('allocations','sum exceeds uint256');
    if(supply!==null&&total!==supply)err('allocations','allocation sum differs from total supply');
  }
  if(shape(p.treasury,'treasury',['status','walletType','signerCount','approvalThreshold'])){
    if(p.treasury.walletType!=='multisig')err('treasury.walletType','must be multisig');
    if(p.treasury.status==='undecided'){
      if(p.treasury.signerCount!==null||p.treasury.approvalThreshold!==null)err('treasury','undecided policy must not specify signers');
      if(p.status==='proposal')err('treasury.status','proposal requires a multisig policy');
    }else if(p.treasury.status==='proposed'){
      const n=p.treasury.signerCount,m=p.treasury.approvalThreshold;
      if(!Number.isInteger(n)||n<3||n>15)err('treasury.signerCount','integer between 3 and 15 required');
      if(!Number.isInteger(m)||m<2||!Number.isInteger(n)||m>n)err('treasury.approvalThreshold','threshold must be 2..signerCount');
    }else err('treasury.status','must be undecided or proposed');
  }
  if(shape(p.reviews,'reviews',['security','legal']))
    for(const k of ['security','legal'])if(!['not_started','in_progress','completed'].includes(p.reviews[k]))err('reviews.'+k,'invalid review status');
  // A draft is intentionally undecided; populated economic fields need explicit proposal status.
  if(p.status==='draft'){
    if(obj(p.token)&&p.token.totalSupplyBaseUnits!==null)
      err('token.totalSupplyBaseUnits','draft must leave supply undecided');
    if(Array.isArray(p.allocations)&&p.allocations.length!==0)
      err('allocations','draft must not contain allocation commitments');
    if(obj(p.treasury)&&p.treasury.status!=='undecided')
      err('treasury.status','draft must leave treasury policy undecided');
  }
  return {valid:errors.length===0,errors,status:p.status};
}
