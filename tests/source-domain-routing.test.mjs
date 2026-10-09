import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedDocumentRequest,activePanelRedirect} from '../src/lib/source-domain-routing.ts';

const req=(host='orbitfs-dev-panel-fallback.vercel.app',path='/settings?tab=vault',method='GET',accept='text/html')=>
  new Request('https://'+host+path,{method,headers:{accept}});
test('only standby browser page navigation can redirect',()=>{
 assert.equal(allowedDocumentRequest(req()),true);
 assert.equal(allowedDocumentRequest(req('dev.incendiarynetworks.cc')),false);
 assert.equal(allowedDocumentRequest(req('orbitfs-dev-panel-fallback.vercel.app','/api/health')),false);
 assert.equal(allowedDocumentRequest(req('orbitfs-dev-panel-fallback.vercel.app','/settings','POST')),false);
});
test('Main readiness redirects standby page to stable Main URL',async()=>{
 const response=await activePanelRedirect(req(),async()=>new Response(JSON.stringify({
  mode:'main',ready:{panel:true},targets:{panel:'https://dev.incendiarynetworks.cc'}
 })));
 assert.equal(response.status,307);
 assert.equal(response.headers.get('location'),'https://dev.incendiarynetworks.cc/settings?tab=vault');
});
test('unready and Fallback stay on standby page',async()=>{
 for(const state of [
  {mode:'fallback',ready:{panel:true},targets:{panel:'https://dev.incendiarynetworks.cc'}},
  {mode:'main',ready:{panel:false},targets:{panel:'https://dev.incendiarynetworks.cc'}},
  {mode:'main',ready:{panel:true},targets:{panel:'https://other.example'}},
 ])assert.equal(await activePanelRedirect(req(),async()=>new Response(JSON.stringify(state))),undefined);
});
