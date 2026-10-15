export type GithubProfileName="primary"|"fallback";

export type GithubProfile={
 name:GithubProfileName;
 owner:string;
 tokenEnv:string;
 base:{repo:string;branch:string;releaseRef:string};
 engine:{repo:string;branch:string;releaseRef:string;baselineRef:string};
 devPanel:{repo:string;branch:string};
 licenseManager:{repo:string;branch:string};
 billingStore:{repo:string;branch:string};
};

const PRIMARY:GithubProfile={
 name:"primary",
 owner:"lucaskerim123",
 tokenEnv:"ORBITFS_RELEASE_DISPATCH_TOKEN",
 base:{repo:"lucaskerim123/V1-vercel-base",branch:"main",releaseRef:process.env.PRIMARY_BASE_RELEASE_REF||process.env.BASE_RELEASE_REF||"base-release"},
 engine:{repo:"lucaskerim123/V1-vercel-engine",branch:"main",releaseRef:process.env.PRIMARY_ENGINE_RELEASE_REF||process.env.ENGINE_RELEASE_REF||"UPDATE_RELEASE",baselineRef:process.env.PRIMARY_ENGINE_BASELINE_REF||process.env.ENGINE_BASELINE_REF||"main"},
 devPanel:{repo:"lucaskerim123/Dev-panel",branch:"main"},
 licenseManager:{repo:"lucaskerim123/Custom-licence-manager",branch:"main"},
 billingStore:{repo:"lucaskerim123/V2_Billing_Store",branch:"main"}
};

const FALLBACK:GithubProfile={
 name:"fallback",
 owner:"remipetrovich-design",
 tokenEnv:"ORBITFS_FALLBACK_GITHUB_TOKEN",
 base:{repo:"remipetrovich-design/OrbitFS-Base-System",branch:"main",releaseRef:process.env.FALLBACK_BASE_RELEASE_REF||"base-release"},
 engine:{repo:"remipetrovich-design/OrbitFS_Engine",branch:"main",releaseRef:"UPDATE_RELEASE",baselineRef:process.env.FALLBACK_ENGINE_BASELINE_REF||"main"},
 devPanel:{repo:"remipetrovich-design/OrbitFS-Control-Centre",branch:"main"},
 licenseManager:{repo:"remipetrovich-design/OrbitFS-License-Administration",branch:"main"},
 billingStore:{repo:"remipetrovich-design/OrbitFS-Billing-Shopfront",branch:"main"}
};

// Repository identities are immutable and cannot be redirected by environment overrides.
// Runtime/release operations are permanently bound to this repository family.
// The persisted profile switch only decides which family is allowed to run.
const LOCAL_PROFILE:GithubProfile=FALLBACK;

let profileCache:{name:GithubProfileName;expires:number}|null=null;

async function storedProfileName():Promise<GithubProfileName>{
 if(profileCache&&profileCache.expires>Date.now())return profileCache.name;
 const sources=['https://lm.incendiarynetworks.cc/api/v1/source-configuration'] as const;
 const confirmed:GithubProfileName[]=[];
 for(const endpoint of sources){
  try{
   const response=await fetch(endpoint,{cache:"no-store",signal:AbortSignal.timeout(5000)});
   if(!response.ok)continue;
   const body=await response.json() as {mode?:string};
   if(body.mode==="main")confirmed.push("primary");
   else if(body.mode==="fallback")confirmed.push("fallback");
  }catch{/* An inactive License Manager may be paused by Vercel. */}
 }
 if(!confirmed.length){
  profileCache=null;
  throw new Error("License Manager source mode cannot be verified. Production GitHub operations are blocked.");
 }
 if(confirmed.some(name=>name!==confirmed[0])){
  profileCache=null;
  throw new Error("License Manager source authorities disagree. Production GitHub operations are blocked.");
 }
 const name=confirmed[0];
 profileCache={name,expires:Date.now()+10000};
 return name;
}

export function clearGithubProfileCache(){profileCache=null;}

export async function activeGithubProfileName():Promise<GithubProfileName>{
 return storedProfileName();
}
export function localGithubProfileName():GithubProfileName{return LOCAL_PROFILE.name;}
export async function requireLocalGithubProfileActive():Promise<GithubProfileName>{
 const active=await storedProfileName();
 if(active!==LOCAL_PROFILE.name){
  throw new Error("This "+LOCAL_PROFILE.name+" Control Centre is inactive. Active GitHub profile is "+active+". Switch source mode before running GitHub operations from this deployment.");
 }
 return active;
}
export async function activeGithubProfile():Promise<GithubProfile>{
 await requireLocalGithubProfileActive();
 return LOCAL_PROFILE;
}
export function githubTokenForProfile(profile:GithubProfileName){
 const preferred=profile==="primary"
  ? ["MAIN_GITHUB_TOKEN","MAIN_GITHUB_RELEASE_TOKEN","ORBITFS_PRIMARY_GITHUB_TOKEN","ORBITFS_RELEASE_DISPATCH_TOKEN"]
  : ["FALLBACK_GITHUB_TOKEN","ORBITFS_FALLBACK_GITHUB_TOKEN","FALLBACK_GITHUB_RELEASE_TOKEN"];
 const value=preferred.map(name=>String(process.env[name]||"").trim()).find(Boolean)||"";
 if(!value)throw new Error("Missing GitHub credential for "+profile+" account. Configure "+preferred[0]+".");
 return value;
}
export async function githubToken(){
 await requireLocalGithubProfileActive();
 return githubTokenForProfile(LOCAL_PROFILE.name);
}
export async function githubProfiles(){return {primary:PRIMARY,fallback:FALLBACK,active:await activeGithubProfileName(),local:LOCAL_PROFILE.name};}
export function githubProfileDefinitions(){return {primary:PRIMARY,fallback:FALLBACK};}
