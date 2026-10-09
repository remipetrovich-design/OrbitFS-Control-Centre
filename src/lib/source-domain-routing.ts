// Standby Dev Panel browsers move back to the stable Main address after
// License Manager selects MAIN and verifies Main Production readiness.
// API calls and asset requests are never redirected.
const AUTHORITY_URL='https://incendiarynetworks.cc/api/v1/source-routing';
const FALLBACK_HOST='orbitfs-dev-panel-fallback.vercel.app';
const MAIN_URL='https://dev.incendiarynetworks.cc';

export function allowedDocumentRequest(request:Request):boolean{
  const url=new URL(request.url);
  return request.method==='GET' &&
    url.hostname.toLowerCase()===FALLBACK_HOST &&
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
    if(state.mode!=='main'||state.ready?.panel!==true)return;
    if(state.targets?.panel!==MAIN_URL)return;
    const incoming=new URL(request.url);
    const to=new URL(MAIN_URL);
    to.pathname=incoming.pathname;
    to.search=incoming.search;
    return Response.redirect(to.toString(),307);
  }catch{return;}
}
