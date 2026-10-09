import { useMemo, useState } from "react";
import { AlertTriangle, Copy, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import type { VaultRecord } from "@/lib/vault-crypto";
import { CORE_GROUPS, coreMatches, coreSpecOf, coreStatus, isCoreRecord, type CoreSpec } from "@/lib/vault-core";
import { whereDoesThisGo } from "@/lib/vault-placement";

type Props = {
  records: VaultRecord[];
  onEdit: (record: VaultRecord | null, spec?: CoreSpec) => void;
};

export function VaultCoreSection({records,onEdit}:Props) {
  const [visible,setVisible]=useState<string[]>([]);
  const outstanding = useMemo(() =>
    CORE_GROUPS.flatMap(group=>group.entries).filter(spec => {
      const value=records.find(row=>coreMatches(row,spec))?.secret;
      return coreStatus(value)!=="filled";
    }).length,[records]);
  const extras=useMemo(()=>records.filter(row=>isCoreRecord(row) && !coreSpecOf(row)),[records]);

  function statusLabel(value:string | undefined) {
    switch(coreStatus(value)){
      case "missing":return "Not saved";
      case "blank":return "Saved blank";
      case "placeholder":return "Placeholder / reminder";
      default:return "Saved";
    }
  }
  function item(key:string,description:string,record:VaultRecord | undefined,spec?:CoreSpec){
    const status=coreStatus(record?.secret);
    const show=!!record && visible.includes(record.id);
    return <div key={key} className="rounded-lg border border-amber-500/20 bg-background/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-semibold break-all">{key}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          <p className="mt-1 text-xs"><strong>Goes to: </strong>{whereDoesThisGo(record||{
            keyName:key,systems:[spec?.system||"Other"],service:spec?.service||"Environment"
          }).destination}</p>
          <p className={status==="filled"?"mt-1 text-xs text-muted-foreground":"mt-1 text-xs font-semibold text-amber-500"}>
            {statusLabel(record?.secret)}{record?" · "+record.systems.join(" / ")+" · "+record.service:""}
          </p>
          {record&&<p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            {show ? (record.secret || "(blank)") : record.secret ? "••••••••••••" : "(blank)"}
          </p>}
        </div>
        <div className="flex flex-wrap gap-1">
          {record&&<button type="button" className="icon-button" title={show?"Hide value":"Show value"}
            aria-label={show?"Hide value":"Show value"} onClick={()=>setVisible(prev=>show?prev.filter(x=>x!==record.id):[...prev,record.id])}>
            {show?<EyeOff size={14}/>:<Eye size={14}/>}</button>}
          {record&&<button type="button" className="icon-button" title="Copy value"
            onClick={()=>void navigator.clipboard.writeText(record.secret)}><Copy size={14}/></button>}
          <button type="button" className="button-secondary" onClick={()=>onEdit(record||null,spec)}>
            {record?<Pencil size={14}/>:<Plus size={14}/>} {record?"Edit":"Add"}
          </button>
        </div>
      </div>
    </div>;
  }

  return <section className="rounded-xl border-2 border-amber-500/60 bg-amber-500/10 p-4 space-y-4">
    <div className="flex items-start gap-3">
      <AlertTriangle className="shrink-0 text-amber-500 mt-1" size={20}/>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">1 · Important keys — fill in what you know</h2>
        <p className="text-xs">Separate from the ordinary Vault key list. These are important connections collected from the Dev Panel,
          Billing Store and License Manager Production environment references, plus existing runtime requirements.</p>
        <p className="text-xs text-amber-500 font-semibold">{outstanding} expected core entries not filled with a normal value.
          Orange is a reminder only. Blank and change-me can always be saved; they are not automatically pushed to production.</p>
        <p className="text-xs text-muted-foreground">Values are encrypted inside your existing Vault. Save the actual credentials yourself;
          no values from the uploaded reference files are added to application source code. Syncing to GitHub or Vercel is a separate reviewed operation.</p>
      </div>
    </div>
    {CORE_GROUPS.map((group,index)=>{
      const filled=group.entries.filter(spec=>coreStatus(records.find(row=>coreMatches(row,spec))?.secret)==="filled").length;
      return <details key={group.title} className="rounded-lg border border-amber-500/30 bg-background/40 p-3" open={index===0}>
        <summary className="cursor-pointer text-sm font-semibold" aria-label={`Show or hide ${group.title} credentials`}>
          {group.title} · {filled}/{group.entries.length} values saved
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">{group.purpose}</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {group.entries.map(spec=>item(
            spec.keyName,spec.description,
            records.find(row=>coreMatches(row,spec)),spec
          ))}
        </div>
      </details>;
    })}
    {extras.length>0&&<details className="rounded-lg border border-amber-500/30 bg-background/40 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Other marked core keys · {extras.length}</summary>
      <p className="mt-2 text-xs text-muted-foreground">Additional or alternate-scope critical keys remain separate and are not silently merged with another service's credential.</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {extras.map(row=>item(row.keyName,row.systems.join(" / ")+" · "+row.service, row))}
      </div>
    </details>}
  </section>;
}
