import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const route=readFileSync(new URL('../src/routes/index.tsx',import.meta.url),'utf8');
const server=readFileSync(new URL('../src/lib/panel.server.ts',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../src/components/release-workspace.tsx',import.meta.url),'utf8');

test('Update re-inspection preserves manually selected BASE while adding detected Engine targets',()=>{
 assert.match(route,/setComponents\(\(previous:string\[\]\)=>previous\.length\?\[\.\.\.previous\]:\[\.\.\.detectedComponents\]\)/);
 assert.doesNotMatch(route,/setComponents\(detectedComponents\)/);
 assert.match(route,/baseInspection:r\.baseInspection\|\|null/);
 assert.match(route,/components:type==="engine"\?\(components\.length\?components:detectedComponents\):components/);
});

test('server inspects Base release source independently and rejects stale selection at dispatch',()=>{
 assert.match(server,/if\(data\.type==="engine"\)\{\s*const inspectedRepo=BASE_REPO,inspectedRef=BASE_REF;/);
 assert.match(server,/await completeSourceDiff\(inspectedRepo,baselineSourceSha,head\)/);
 assert.match(server,/baseBaseline:baseBaselineInfo,baseInspection/);
 assert.match(server,/if\(inspectedBaseBaselineSha&&inspectedBaseBaselineSha!==baselineSourceCommit\)throw/);
 assert.match(server,/if\(inspectedBaseSourceSha&&baseHead!==inspectedBaseSourceSha\)throw/);
 assert.doesNotMatch(server,/BASE must be inspected in Update Releases before packaging/);
 assert.match(route,/inspectedBaseSourceSha:type==="engine"\?/);
 assert.match(route,/inspectedBaseBaselineSha:type==="engine"\?/);
});

test('BASE cannot be packaged just because the button is selected without a verified delta',()=>{
 assert.match(workspace,/const baseInspectedReady=Boolean\(inspected&&baseInspection\?\.ready===true/);
 assert.match(workspace,/baseTargetSelected&&baseInspectedReady/);
 assert.match(workspace,/!baseTargetSelected\|\|baseInspectedReady/);
 assert.match(workspace,/title="Base source inspection"/);
 assert.match(workspace,/baseInspection\.changedFiles\.map/);
 assert.doesNotMatch(workspace,/\(baseTargetSelected&&inspected\)/);
});

test('Shared Engine Host is independently selectable, source-detected and dispatched',()=>{
 assert.match(server,/add\("engine-shared"\)/);
 assert.match(server,/engine_shared:String\(selectedComponents\.includes\("engine-shared"\)\)/);
 assert.match(server,/selected\.includes\("engine-shared"\)/);
 assert.match(workspace,/\["base","engine-shared","apex","mcp","studio"\]/);
 assert.match(workspace,/name==="engine-shared"\?"ENGINE HOST"/);
});

test('Operator can deselect detected Engine Host to package Base only and vice versa',()=>{
 assert.doesNotMatch(server,/if\(missingDetectedComponents\.length\)throw/);
 assert.match(server,/const excludedDetectedComponents=detectedComponents\.filter/);
 assert.match(workspace,/detected\?"Source changes detected; you may include or exclude this target"/);
 assert.match(workspace,/onClick=\{\(\)=>p\.setComponents\(\(old:string\[\]\)=>old\.includes\(name\)\?/);
 assert.doesNotMatch(workspace,/if\(detected\)return/);
});

test('an Engine Host-only release can follow a Base-only release with the same Engine source',()=>{
 assert.match(server,/components:Array\.isArray\(baseline\.manifest\?\.components\)\?baseline\.manifest\.components:\[\]/);
 assert.match(server,/const previouslyReleasedTargets=new Set/);
 assert.match(server,/const hasNewUpdateTarget=data\.type==="engine"&&selectedComponents\.some/);
 assert.match(server,/&&!hasNewUpdateTarget/);
 assert.match(workspace,/const newEngineTargetNotInBaseline=!base&&inspected&&componentRows\.some/);
 assert.match(workspace,/newEngineTargetNotInBaseline\|\|\(repackageMode&&inspected\)/);
});
