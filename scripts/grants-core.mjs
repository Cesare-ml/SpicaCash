// SPDX-License-Identifier: MIT
// Documentation-only contribution grant validator. Does not check GitHub
// merge status, reviews, identities or payments against any external system.
export function validateGrantLedger(data) {
  const errors=[], fail=(path,message)=>errors.push(path+": "+message);
  const isObject=(value)=>value!==null&&typeof value==="object"&&!Array.isArray(value);
  const exact=(value,path,fields)=>{
    if(!isObject(value)){fail(path,"expected an object");return false;}
    for(const key of Object.keys(value))if(!fields.includes(key))fail(path+"."+key,"unexpected field");
    for(const key of fields)if(!Object.hasOwn(value,key))fail(path+"."+key,"missing required field");
    return true;
  };
  const slug=(value)=>typeof value==="string"&&/^[a-z][a-z0-9-]{1,63}$/.test(value);
  const MAX=(1n<<256n)-1n;
  if(!exact(data,"ledger",["schemaVersion","status","distributionEnabled","aiCreditConversionEnabled","entries"]))return {valid:false,errors};
  if(data.schemaVersion!==1)fail("schemaVersion","expected 1");
  if(!["draft","proposal"].includes(data.status))fail("status","must be draft or proposal");
  if(data.distributionEnabled!==false)fail("distributionEnabled","must remain false");
  if(data.aiCreditConversionEnabled!==false)fail("aiCreditConversionEnabled","must remain false");
  if(!Array.isArray(data.entries)){fail("entries","expected array");return {valid:false,errors};}
  if(data.entries.length>1000){fail("entries","exceeds 1000-entry review limit");return {valid:false,errors};}
  const ids=new Set(), sources=new Set();
  for(const [i,entry] of data.entries.entries()){
    const path="entries["+i+"]";
    if(!exact(entry,path,["id","source","contributorId","review","amountBaseUnits","vesting","rationale"]))continue;
    if(!slug(entry.id))fail(path+".id","expected public pseudonymous slug");
    else if(ids.has(entry.id))fail(path+".id","duplicate grant id");else ids.add(entry.id);
    if(!slug(entry.contributorId))fail(path+".contributorId","expected pseudonymous slug");
    if(!exact(entry.source,path+".source",["repository","pullRequest"]))continue;
    if(typeof entry.source.repository!=="string"||! /^(Cesare-ml|virgostars)\/[A-Za-z0-9_.-]+$/.test(entry.source.repository))
      fail(path+".source.repository","must name an allowed public VirgoStars GitHub namespace");
    if(!Number.isSafeInteger(entry.source.pullRequest)||entry.source.pullRequest<1)
      fail(path+".source.pullRequest","expected positive safe integer");
    const key=entry.source.repository.toLowerCase()+"/"+entry.source.pullRequest+"/"+entry.contributorId;
    if(sources.has(key))fail(path+".source","duplicate contribution for the same recipient");else sources.add(key);
    if(exact(entry.review,path+".review",["status","reviewerIds"])) {
      if(!["unreviewed","peer-review-proposed"].includes(entry.review.status))fail(path+".review.status","invalid status");
      if(!Array.isArray(entry.review.reviewerIds)){fail(path+".review.reviewerIds","expected array");}
      else{
        const reviewers=new Set();
        for(const r of entry.review.reviewerIds){
          if(!slug(r))fail(path+".review.reviewerIds","reviewer must be pseudonymous slug");
          if(r===entry.contributorId)fail(path+".review.reviewerIds","contributor cannot review own proposal");
          if(reviewers.has(r))fail(path+".review.reviewerIds","duplicate reviewer");else reviewers.add(r);
        }
        if(entry.review.status==="unreviewed"&&entry.review.reviewerIds.length!==0)
          fail(path+".review.reviewerIds","unreviewed grant cannot contain reviewers");
        if(entry.review.status==="peer-review-proposed"&&reviewers.size<2)
          fail(path+".review.reviewerIds","two independent reviewer references required");
      }
    }
    if(entry.amountBaseUnits!==null){
      if(typeof entry.amountBaseUnits!=="string"||! /^(0|[1-9][0-9]*)$/.test(entry.amountBaseUnits))
        fail(path+".amountBaseUnits","expected exact unsigned base-unit integer string");
      else{
        const n=BigInt(entry.amountBaseUnits);
        if(n===0n||n>MAX)fail(path+".amountBaseUnits","must be positive uint256");
      }
      if(data.status!=="proposal")fail(path+".amountBaseUnits","numeric grant amounts only allowed in review proposals");
      if(!isObject(entry.review)||entry.review.status!=="peer-review-proposed")
        fail(path+".review","numeric grant requires a peer-review proposal");
    }
    if(exact(entry.vesting,path+".vesting",["mode","startTimestampSeconds","durationSeconds"])){
      if(!["undecided","linear"].includes(entry.vesting.mode))fail(path+".vesting.mode","unsupported vesting policy");
      if(entry.vesting.mode==="undecided"){
        if(entry.vesting.startTimestampSeconds!==null||entry.vesting.durationSeconds!==null)
          fail(path+".vesting","undecided schedule must not set timestamps");
      }else{
        if(!Number.isSafeInteger(entry.vesting.startTimestampSeconds)||entry.vesting.startTimestampSeconds<1)
          fail(path+".vesting.startTimestampSeconds","expected positive safe Unix seconds");
        if(!Number.isSafeInteger(entry.vesting.durationSeconds)||entry.vesting.durationSeconds<1||
           entry.vesting.durationSeconds>365*86400*20)
          fail(path+".vesting.durationSeconds","expected 1 second to 20 years");
        if(Number.isSafeInteger(entry.vesting.startTimestampSeconds)&&
           Number.isSafeInteger(entry.vesting.durationSeconds)&&
           entry.vesting.startTimestampSeconds+entry.vesting.durationSeconds>2**64-1)
          fail(path+".vesting","vesting end exceeds uint64");
      }
      if(entry.vesting.mode==="linear"&&entry.amountBaseUnits===null)
        fail(path+".amountBaseUnits","linear vesting proposal needs numeric amount");
    }
    if(typeof entry.rationale!=="string"||entry.rationale.trim().length<25||entry.rationale.length>2000)
      fail(path+".rationale","expected rationale with 25 to 2000 characters");
  }
  return {valid:errors.length===0,errors};
}
