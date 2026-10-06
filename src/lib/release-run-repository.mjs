export function githubRunRepository(runUrl){
 const raw=String(runUrl||"").trim();
 if(!raw)return "";
 try{
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.hostname.toLowerCase()!=="github.com")return "";
  const parts=url.pathname.split("/").filter(Boolean);
  if(parts.length<5||parts[2]!=="actions"||parts[3]!=="runs"||!/^\d+$/.test(parts[4]))return "";
  return parts[0]+"/"+parts[1];
 }catch{return ""}
}

export function activeReleaseRunRepository({sourceRepo,runUrl,activeSourceRepo,activeWorkerRepo}){
 const source=String(sourceRepo||"").trim();
 const expectedSource=String(activeSourceRepo||"").trim();
 const expectedWorker=String(activeWorkerRepo||"").trim();
 if(!source||!expectedSource||!expectedWorker||source!==expectedSource)return "";
 const rawRunUrl=String(runUrl||"").trim();
 const urlRepo=githubRunRepository(rawRunUrl);
 if(rawRunUrl&&!urlRepo)return "";
 if(urlRepo&&urlRepo!==expectedWorker)return "";
 return expectedWorker;
}
