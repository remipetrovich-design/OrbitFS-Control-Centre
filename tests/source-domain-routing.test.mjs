import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedDocumentRequest,activePanelRedirect} from '../src/lib/source-domain-routing.ts';

const req=(host='dev.incendiarynetworks.cc',path='/settings?tab=vault',method='GET',accept='text/html')=>
  new Request('https://'+host+path,{method,headers:{accept}});

test('document-only routing never handles API calls, POST, assets or previews',()=>{
 assert.equal(allowedDocumentRequest(req()),true);
 assert.equal(allowedDocumentRequest(req('base-deploy-panel.vercel.app')),false);
 assert.equal(allowedDocumentRequest(req('dev.incendiarynetworks.cc','/api/v1/update')),false);
 assert.equal(allowedDocumentRequest(req('dev.incendiarynetworks.cc','/_build/assets.js')),false);
 assert.equal(allowedDocumentRequest(req('dev.incendiarynetworks.cc','/settings','POST')),false);
 assert.equal(allowedDocumentRequest(req('dev.incendiarynetworks.cc','/settings','GET','application/json')),false);
});
test('FALLBACK READY redirects only to the configured Production service',async()=>{
 const state={mode:'fallback',ready:{panel:true},targets:{panel:'https://orbitfs-dev-panel-fallback.vercel.app'}};
 const response=await activePanelRedirect(req(),async()=>new Response(JSON.stringify(state),{status:200}));
 assert.equal(response.status,307);
 assert.equal(response.headers.get('location'),'https://orbitfs-dev-panel-fallback.vercel.app/settings?tab=vault');
});
test('MAIN, unready target, authority failure or modified destination preserve current entrypoint',async()=>{
 const body={mode:'fallback',ready:{panel:false},targets:{panel:'https://orbitfs-dev-panel-fallback.vercel.app'}};
 const cases=[
  {...body,mode:'main',ready:{panel:true}},
  body,
  {...body,ready:{panel:true},targets:{panel:'https://evil.example'}},
 ];
 for(const state of cases)
  assert.equal(await activePanelRedirect(req(),async()=>new Response(JSON.stringify(state))),undefined);
 assert.equal(await activePanelRedirect(req(),async()=>{throw new Error('outage')}),undefined);
});
