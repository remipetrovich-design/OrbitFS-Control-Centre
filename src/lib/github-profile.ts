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

export function activeGithubProfileName():GithubProfileName{
 return String(process.env.ORBITFS_GITHUB_PROFILE||"primary").trim().toLowerCase()==="fallback"?"fallback":"primary";
}
export function activeGithubProfile():GithubProfile{
 return activeGithubProfileName()==="fallback"?FALLBACK:PRIMARY;
}
export function githubToken(){
 const profile=activeGithubProfile();
 const value=String(process.env[profile.tokenEnv]||"").trim();
 if(!value)throw new Error("Missing server environment variable: "+profile.tokenEnv+" for "+profile.name+" GitHub profile");
 return value;
}
export function githubProfiles(){return {primary:PRIMARY,fallback:FALLBACK,active:activeGithubProfileName()};}
