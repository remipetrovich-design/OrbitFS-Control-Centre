export type OrbitReleaseVersion={raw:string;parts:number[]};

const CURRENT_ORBIT_RELEASE_VERSION_PATTERN=/^[1-9][0-9]*(?:\.(?:0|[1-9][0-9]*)){1,3}$/;

export function parseOrbitReleaseVersion(value:unknown):OrbitReleaseVersion|null{
 const raw=String(value??"").trim();
 if(!CURRENT_ORBIT_RELEASE_VERSION_PATTERN.test(raw))return null;
 const parts=raw.split(".").map(Number);
 if(parts.length<2||parts.length>4||parts.some(part=>!Number.isSafeInteger(part)||part<0))return null;
 return {raw,parts};
}

export function isOrbitReleaseVersion(value:unknown){
 return parseOrbitReleaseVersion(value)!==null;
}

export function compareOrbitReleaseVersions(a:unknown,b:unknown):number|null{
 const left=parseOrbitReleaseVersion(a),right=parseOrbitReleaseVersion(b);
 if(!left||!right)return null;
 const width=Math.max(left.parts.length,right.parts.length);
 for(let index=0;index<width;index++){
  const delta=(left.parts[index]??0)-(right.parts[index]??0);
  if(delta!==0)return delta>0?1:-1;
 }
 if(left.parts.length!==right.parts.length)return left.parts.length>right.parts.length?1:-1;
 return 0;
}

export function satisfiesMinimumOrbitReleaseVersion(installed:unknown,minimum:unknown){
 const comparison=compareOrbitReleaseVersions(installed,minimum);
 return comparison!==null&&comparison>=0;
}

export function nextOrbitReleaseVersion(value:unknown){
 const parsed=parseOrbitReleaseVersion(value);
 if(!parsed)return "1.0";
 const parts=[...parsed.parts];
 parts[parts.length-1]+=1;
 return parts.join(".");
}
