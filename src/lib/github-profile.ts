import {createClient} from "@supabase/supabase-js";

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
 engine:{repo:process.env.FALLBACK_ENGINE_RELEASE_REPO||"remipetrovich-design/OrbitFS_Engine",branch:"main",releaseRef:process.env.FALLBACK_ENGINE_RELEASE_REF||"UPDATE_RELEASES",baselineRef:process.env.FALLBACK_ENGINE_BASELINE_REF||"main"},
 devPanel:{repo:process.env.FALLBACK_DEV_PANEL_REPO||"remipetrovich-design/OrbitFS-Control-Centre",branch:"main"},
 licenseManager:{repo:process.env.FALLBACK_LICENSE_MANAGER_REPO||"remipetrovich-design/OrbitFS-License-Administration",branch:"main"},
 billingStore:{repo:process.env.FALLBACK_BILLING_STORE_REPO||"remipetrovich-design/OrbitFS-Billing-Shopfront",branch:"main"}
};

let profileCache:{name:GithubProfileName;expires:number}|null=null;

function fallbackProfileName():GithubProfileName{
 return String(process.env.ORBITFS_GITHUB_PROFILE||"primary").trim().toLowerCase()==="fallback"?"fallback":"primary";
}

async function storedProfileName():Promise<GithubProfileName>{
 if(profileCache&&profileCache.expires>Date.now())return profileCache.name;
 const url=String(process.env.SUPABASE_URL||"").trim();
 const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
 if(!url||!key){
  const name=fallbackProfileName();
  profileCache={name,expires:Date.now()+5000};
  return name;
 }
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.from("dev_panel_settings").select("github_profile").eq("id",true).single();
 if(error)throw new Error("Unable to resolve persisted GitHub profile: "+error.message);
 const raw=String(data?.github_profile||"").trim().toLowerCase();
 if(raw!=="primary"&&raw!=="fallback")throw new Error("Persisted GitHub profile is invalid or missing.");
 const name=raw as GithubProfileName;
 profileCache={name,expires:Date.now()+5000};
 return name;
}

export function clearGithubProfileCache(){profileCache=null;}

export async function activeGithubProfileName():Promise<GithubProfileName>{
 return storedProfileName();
}
export async function activeGithubProfile():Promise<GithubProfile>{
 return (await activeGithubProfileName())==="fallback"?FALLBACK:PRIMARY;
}
export async function githubToken(){
 const profile=await activeGithubProfile();
 const value=String(process.env[profile.tokenEnv]||"").trim();
 if(!value)throw new Error("Missing server environment variable: "+profile.tokenEnv+" for "+profile.name+" GitHub profile");
 return value;
}
export async function githubProfiles(){return {primary:PRIMARY,fallback:FALLBACK,active:await activeGithubProfileName()};}
export function githubProfileDefinitions(){return {primary:PRIMARY,fallback:FALLBACK};}
