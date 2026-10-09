import type {VaultSystem} from "./vault-schema.ts";

export type SetupSystem="License"|"Billing"|"Dev";
export type SetupSide="main"|"fallback";
export type EnvPresence={key:string;placeholderNote?:boolean};
export type SetupStatus="unchecked"|"present"|"missing"|"review";
export type SetupKeySpec={name:string;what:string;origin:string;priority:"important"|"feature"};
const specs:Record<SetupSystem,SetupKeySpec[]>={
 License:[
  {name:"DATABASE_URL",what:"Connects License Manager to its PostgreSQL database.",origin:"Same License Manager database in both accounts.",priority:"important"},
  {name:"DATABASE_SSL",what:"Enables SSL for the database connection.",origin:"Keep consistent with the database connection.",priority:"important"},
  {name:"SUPABASE_POOLER_HOST",what:"Pooler address used for the shared License Manager database.",origin:"Same database host when both use the same Supabase project.",priority:"feature"},
  {name:"MASTER_API_TOKEN",what:"Fallback machine token inside License Manager.",origin:"Authority-only; never send it to Billing or Dev.",priority:"feature"},
  {name:"BILLING_API_TOKEN",what:"Optional License Manager fallback for Billing integration.",origin:"License Manager-scoped key, not a generic GitHub token.",priority:"feature"},
  {name:"DEPLOYER_API_TOKEN",what:"Optional License Manager fallback for deployment operations.",origin:"Use approved scopes from License Manager.",priority:"feature"},
  {name:"ORBITFS_RELEASE_DISPATCH_TOKEN",what:"GitHub private release asset and workflow access.",origin:"Token must access the relevant account's release repositories.",priority:"feature"},
  {name:"AUTHORITY_LOCKDOWN_RECOVERY_TOKEN",what:"Owner emergency recovery credential.",origin:"Controlled by License Manager; protect separately.",priority:"feature"}
 ],
 Billing:[
  {name:"NEXT_PUBLIC_SUPABASE_URL",what:"Public address of the Billing database.",origin:"Same Billing Supabase project in both accounts.",priority:"important"},
  {name:"NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",what:"Browser-safe Supabase project key.",origin:"Same Billing Supabase project in both accounts.",priority:"important"},
  {name:"SUPABASE_SERVICE_ROLE_KEY",what:"Server-only access to Billing database.",origin:"Same Billing database; keep this key secret.",priority:"important"},
  {name:"BILLING_API_TOKEN",what:"Billing Store calls License Manager licensing APIs.",origin:"License Manager-issued, correctly scoped Billing token.",priority:"important"},
  {name:"DEPLOYER_API_TOKEN",what:"Authorizes deploy and update integration calls.",origin:"License Manager-issued scoped deployer key.",priority:"feature"},
  {name:"RESEND_API_KEY",what:"Sends Billing and customer emails.",origin:"Resend account configured for the Store.",priority:"feature"},
  {name:"DEV_PANEL_EVENT_SECRET",what:"Authenticates events between Billing and Dev Panel.",origin:"Must match the receiving Dev Panel's key.",priority:"feature"},
  {name:"NEXT_PUBLIC_ORBITFS_STORE_URL",what:"Customer-facing Store address.",origin:"Same canonical Store domain; switch traffic during failover.",priority:"feature"}
 ],
 Dev:[
  {name:"SUPABASE_URL",what:"Connects Dev Panel to its operations database.",origin:"Use the intended shared Dev/License database.",priority:"important"},
  {name:"SUPABASE_PUBLISHABLE_KEY",what:"Public Supabase project credential.",origin:"Matches the SUPABASE_URL project.",priority:"important"},
  {name:"SUPABASE_SERVICE_ROLE_KEY",what:"Server-only database and Vault administration.",origin:"Same database project as SUPABASE_URL; never publish.",priority:"important"},
  {name:"APP_SESSION_SECRET",what:"Signs Dev Panel login sessions.",origin:"Use a valid secret in each running environment.",priority:"important"},
  {name:"LICENSE_MASTER_URL",what:"Address for License Manager API calls.",origin:"Keep pointing to the currently authorized License Manager.",priority:"feature"},
  {name:"LICENSE_MASTER_API_TOKEN",what:"Authenticated Dev Panel operations against License Manager.",origin:"License Manager-issued scoped token.",priority:"feature"},
  {name:"ORBITFS_RELEASE_DISPATCH_TOKEN",what:"Triggers GitHub release and dispatch workflows.",origin:"Token must access the active GitHub repository profile.",priority:"feature"}
 ]
};
export const SETUP_PROJECTS:ReadonlyArray<{system:SetupSystem;main:string;fallback:string}>= [
 {system:"License",main:"custom-licence-manager",fallback:"orbitfs-license-fallback"},
 {system:"Billing",main:"v2-billing-store",fallback:"orbitfs-billing-fallback"},
 {system:"Dev",main:"base-deploy-panel",fallback:"orbitfs-dev-panel-fallback"}
];
export function getSetupKeySpecs(system:SetupSystem):ReadonlyArray<SetupKeySpec>{return specs[system]}
export function setupKeyState(environments:ReadonlyArray<EnvPresence>|null,key:string):{status:SetupStatus;description:string}{
 if(environments===null)return{status:"unchecked",description:"Not checked — connect this Vercel account"};
 const matches=environments.filter(x=>x.key===key);
 if(matches.length===0)return{status:"missing",description:"Not present in Vercel Production"};
 if(matches.some(x=>x.placeholderNote))return{status:"review",description:"Present, but its Vercel note says placeholder. Verify the actual value."};
 return{status:"present",description:"Exists in Vercel; secret value not verified"};
}
export function summarizeSystemSetup(system:SetupSystem,main:ReadonlyArray<EnvPresence>|null,fallback:ReadonlyArray<EnvPresence>|null){
 const configuredKeys=new Set(specs[system].map(s=>s.name));
 const rows=specs[system].map(spec=>({
    key:spec.name,what:spec.what,origin:spec.origin,priority:spec.priority,
    main:setupKeyState(main,spec.name),fallback:setupKeyState(fallback,spec.name)
 }));
 const mainKeys=new Set((main||[]).map(e=>e.key)),fallbackKeys=new Set((fallback||[]).map(e=>e.key));
 return{
   system,rows,
   mainCount:main?.length??null,fallbackCount:fallback?.length??null,
   missingFallback:main===null||fallback===null?[]:rows.filter(row=>row.priority==="important"&&row.fallback.status==="missing"),
   mainExtra:[...mainKeys].filter(key=>!configuredKeys.has(key)).sort(),
   fallbackExtra:[...fallbackKeys].filter(key=>!configuredKeys.has(key)).sort(),
   mainOnly:main===null||fallback===null?[]:[...mainKeys].filter(key=>!fallbackKeys.has(key)).sort(),
   fallbackOnly:main===null||fallback===null?[]:[...fallbackKeys].filter(key=>!mainKeys.has(key)).sort()
 };
}
