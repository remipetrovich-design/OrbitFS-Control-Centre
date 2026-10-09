// MAIN Dev Panel remains the stable entrypoint. Only browser document
// navigations may move to a verified Fallback Production deployment.
// API calls, assets, uploads and background release requests stay untouched.
const AUTHORITY_URL='https://incendiarynetworks.cc/api/v1/source-routing';
const MAIN_PUBLIC_HOST='dev.incendiarynetworks.cc';
const FALLBACK_URL='https://orbitfs-dev-panel-fallback.vercel.app';

export function allowedDocumentRequest(request:Request):boolean{
  const url=new URL(request.url);
  return request.method==='GET' &&
    url.hostname.toLowerCase()===MAIN_PUBLIC_HOST &&
    (request.headers.get('accept')||'').toLowerCase().includes('text/html') &&
    !url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/_') &&
    !url.pathname.startsWith('/.well-known/');
}

export async function activePanelRedirect(
  request:Request,
  get:typeof fetch=fetch
):Promise<Response|undefined>{
  if(!allowedDocumentRequest(request))return;
  try{
    const result=await get(AUTHORITY_URL,{
      method:'GET',cache:'no-store',signal:AbortSignal.timeout(3500),
      headers:{accept:'application/json'},
    });
    if(!result.ok)return;
    const state=await result.json() as {
      mode?:string;ready?:{panel?:boolean};targets?:{panel?:string}
    };
    if(state.mode!=='fallback'||state.ready?.panel!==true)return;
    // Exact trusted destination, not an arbitrary URL supplied by a remote
    // response. Prevents open redirects and cross-account routing mistakes.
    if(state.targets?.panel!==FALLBACK_URL)return;
    const incoming=new URL(request.url);
    const to=new URL(FALLBACK_URL);
    to.pathname=incoming.pathname;
    to.search=incoming.search;
    return Response.redirect(to.toString(),307);
  }catch{
    // Never break Vault access because the routing authority is offline.
    // Release mutation APIs still enforce the selected source profile.
    return;
  }
}
