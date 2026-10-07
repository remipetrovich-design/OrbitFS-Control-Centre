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
 base:{repo:process.env.PRIMARY_BASE_RELEASE_REPO||process.env.BASE_RELEASE_REPO||"lucaskerim123/V1-vercel-base",branch:"main",releaseRef:process.env.PRIMARY_BASE_RELEASE_REF||process.env.BASE_RELEASE_REF||"base-release"},
 engine:{repo:process.env.PRIMARY_ENGINE_RELEASE_REPO||process.env.ENGINE_RELEASE_REPO||"lucaskerim123/V1-vercel-engine",branch:"main",releaseRef:process.env.PRIMARY_ENGINE_RELEASE_REF||process.env.ENGINE_RELEASE_REF||"UPDATE_RELEASE",baselineRef:process.env.PRIMARY_ENGINE_BASELINE_REF||process.env.ENGINE_BASELINE_REF||"main"},
 devPanel:{repo:process.env.PRIMARY_DEV_PANEL_REPO||"lucaskerim123/Dev-panel",branch:"main"},
 licenseManager:{repo:process.env.PRIMARY_LICENSE_MANAGER_REPO||process.env.LICENSE_MANAGER_REPO||"lucaskerim123/Custom-licence-manager",branch:"main"},
 billingStore:{repo:process.env.PRIMARY_BILLING_STORE_REPO||process.env.BILLING_STORE_REPO||"lucaskerim123/V2_Billing_Store",branch:"main"}
};

const FALLBACK:GithubProfile={
 name:"fallback",
 owner:"remipetrovich-design",
 tokenEnv:"ORBITFS_FALLBACK_GITHUB_TOKEN",
 base:{repo:process.env.FALLBACK_BASE_RELEASE_REPO||"remipetrovich-design/OrbitFS-Base-System",branch:"main",releaseRef:process.env.FALLBACK_BASE_RELEASE_REF||"base-release"},
 engine:{repo:process.env.FALLBACK_ENGINE_RELEASE_REPO||"remipetrovich-design/OrbitFS_Engine",branch:"main",releaseRef:"UPDATE_RELEASE",baselineRef:process.env.FALLBACK_ENGINE_BASELINE_REF||"main"},
 devPanel:{repo:process.env.FALLBACK_DEV_PANEL_REPO||"remipetrovich-design/OrbitFS-Control-Centre",branch:"main"},
 licenseManager:{repo:process.env.FALLBACK_LICENSE_MANAGER_REPO||"remipetrovich-design/OrbitFS-License-Administration",branch:"main"},
 billingStore:{repo:process.env.FALLBACK_BILLING_STORE_REPO||"remipetrovich-design/OrbitFS-Billing-Shopfront",branch:"main"}
};

// Runtime/release operations are permanently bound to this repository family.
// The persisted profile switch only decides which family is allowed to run.
const LOCAL_PROFILE:GithubProfile=PRIMARY;

let profileCache:{name:GithubProfileName;expires:number}|null=null;

function fallbackProfileName():GithubProfileName{
 return String(process.env.ORBITFS_GITHUB_PROFILE||"primary").trim().toLowerCase()==="fallback"?"fallback":"primary";
}

async function storedProfileName():Promise<GithubProfileName>{
 if(profileCache&&profileCache.expires>Date.now())return profileCache.name;
 const base=String(process.env.LICENSE_MANAGER_URL||process.env.LICENSE_MASTER_URL||"https://incendiarynetworks.cc/api/v1").trim().replace(/\/+$/,"");
 try{
  const response=await fetch(base+"/github-profile",{cache:"no-store",signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error("License Manager profile endpoint returned "+response.status);
  const body=await response.json();
  const raw=String(body?.profile||"").trim().toLowerCase();
  if(raw!=="primary"&&raw!=="fallback")throw new Error("License Manager source profile is invalid or missing.");
  const name=raw as GithubProfileName;
  profileCache={name,expires:Date.now()+20*60*1000};
  return name;
 }catch(error){
  if(profileCache)return profileCache.name;
  const name=fallbackProfileName();
  profileCache={name,expires:Date.now()+20*60*1000};
  return name;
 }
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
export async function githubToken(){
 await requireLocalGithubProfileActive();
 const value=String(process.env[LOCAL_PROFILE.tokenEnv]||"").trim();
 if(!value)throw new Error("Missing server environment variable: "+LOCAL_PROFILE.tokenEnv+" for local "+LOCAL_PROFILE.name+" GitHub system");
 return value;
}
export async function githubProfiles(){return {primary:PRIMARY,fallback:FALLBACK,active:await activeGithubProfileName(),local:LOCAL_PROFILE.name};}
export function githubProfileDefinitions(){return {primary:PRIMARY,fallback:FALLBACK};}
