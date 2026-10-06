export type OperationsWorkflowRunConfig={repo:string;branch:string;ci:string;deploy:string;quickDeploy:string};
export function operationsWorkflowRunPaths(cfg:OperationsWorkflowRunConfig):{ci:string;deploy:string;quickDeploy:string};
