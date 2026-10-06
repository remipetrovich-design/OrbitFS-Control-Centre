export function operationsWorkflowRunPaths(cfg){
  const repo=String(cfg?.repo||"");
  const branch=encodeURIComponent(String(cfg?.branch||"main"));
  const make=(workflow)=>`/repos/${repo}/actions/workflows/${encodeURIComponent(String(workflow||""))}/runs?branch=${branch}&per_page=20`;
  return {ci:make(cfg?.ci),deploy:make(cfg?.deploy),quickDeploy:make(cfg?.quickDeploy)};
}
