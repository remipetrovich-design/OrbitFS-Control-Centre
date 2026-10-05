function newest(runs){
  return runs.filter(Boolean).sort((a,b)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime())[0]||null;
}

export function selectOperationsRun({ciRun,deployRun,quickDeployRun}){
  const activeDeployment=newest([deployRun,quickDeployRun].filter(run=>run&&run.status!=="completed"));
  if(activeDeployment)return activeDeployment;
  if(ciRun&&ciRun.status!=="completed")return ciRun;
  return newest([ciRun,deployRun,quickDeployRun]);
}
