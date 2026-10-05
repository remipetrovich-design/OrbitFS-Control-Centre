export type OperationsRunLike={status?:string|null;created_at?:string|null;[key:string]:unknown};
export function selectOperationsRun(input:{ciRun:OperationsRunLike|null;deployRun:OperationsRunLike|null;quickDeployRun:OperationsRunLike|null}):OperationsRunLike|null;
