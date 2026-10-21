// NethorSync -> publication serveur après un remplacement réel et récent.
// L'endpoint n'accepte aucune opération arbitraire : un job aléatoire privé
// créé par le déclencheur Postgres doit être réclamé avec une preuve UUID.
import { createClient } from "npm:@supabase/supabase-js@2";
import XLSX from "npm:xlsx@0.18.5";
import { parsePlanningWorkbook } from "./excel-structure.js";
import { resolveExcelColor } from "./excel-color.js";
import { legacyStyleReader } from "./xls-legacy-colors.js";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{"content-type":"application/json","cache-control":"no-store"}
});
const digest=async (bytes:ArrayBuffer):Promise<string>=>{
 const result=await crypto.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(result),b=>b.toString(16).padStart(2,"0")).join("");
};
function parseFile(buffer:ArrayBuffer,fileName:string,path:string,modifiedAt:string,uploadedAt:string,sourceKind:string) {
 const workbook=XLSX.read(new Uint8Array(buffer),{type:"array",cellDates:true,cellStyles:true});
 // BIFF8 conserve les couleurs des archives .xls, que SheetJS ne restitue pas toujours.
 // Sans une couleur exploitable, on conserve le refus explicite plutôt que de deviner.
 const legacy=/\.xls$/i.test(fileName)?legacyStyleReader(buffer):null;
 const verifiedColor=({sheetName,rowIndex,colIndex,cell,workbook}:{
   sheetName:string;rowIndex:number;colIndex:number;cell:unknown;workbook:unknown
 })=>{
   const biff=legacy?.color(sheetName,rowIndex,colIndex);
   return biff ?? resolveExcelColor({sheetName,rowIndex,colIndex,cell,workbook});
 };
 const model=parsePlanningWorkbook(workbook,XLSX,verifiedColor);
 if(model.employees.length>200)throw new Error("Nombre de salariés supérieur à 200");
 // Si aucun créneau ne peut être déchiffré, le lecteur n'est pas suffisamment sûr.
 if((model.colorCounts.g+model.colorCounts.b)===0)
   throw new Error("Aucun horaire exploitable : les couleurs du classeur doivent être vérifiées");
 const label=/SEMAINE[ _-]*([ABC])/i.exec(fileName);
 return {...model,sourceFile:fileName,sourcePath:path,
  ...(sourceKind==="storage" ? {sourceUploadedAt:uploadedAt} : {sourceModifiedAt:modifiedAt}),
  weekLabel:label?"SEMAINE "+label[1].toUpperCase():null,
  importedAt:new Date().toISOString()};
}
Deno.serve(async req=>{
 if(req.method!=="POST")return json({accepted:false},405);
 let id="",proof="";
 try{
   const body=await req.json();
   id=String(body?.jobId||"");
   proof=String(body?.proof||"");
 }catch{return json({accepted:false},400);}
 if(!uuid.test(id)||!uuid.test(proof))return json({accepted:false},400);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!serviceKey){
   console.error("NethorSync auto : environnement Supabase incomplet");
   return json({accepted:false},503);
 }
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
   const {data:job,error:claimError}=await admin.rpc("nethor_sync_auto_claim",{p_job_id:id,p_proof:proof});
   if(claimError)throw new Error("Réclamation SQL impossible : "+claimError.message);
   if(!job?.claimed)return json({accepted:false});
   const key=String(job.storagePath||"");
   const hash=String(job.sha256||"").toLowerCase();
   const name=String(job.fileName||"");
   const modified=String(job.modifiedAt||"");
   const uploaded=String(job.uploadedAt||"");
   const sourceKind=String(job.sourceKind||"change");
   const invalid=!/^sync-inbox\/[0-9a-f]{64}-[^/]+$/i.test(key)
     ||!/^([a-f0-9]{64})$/.test(hash)||!key.startsWith("sync-inbox/"+hash+"-")
     ||!/\.(xls|xlsx|xlsm)$/i.test(name);
   let result="publish",model:unknown=null,detail="";
   if(invalid){result="rejected";detail="Chemin, hash ou extension de fichier invalide";}
   else {
     const {data:file,error:fileError}=await admin.storage.from("planning-files").download(key);
     if(fileError||!file)throw new Error("Téléchargement du classeur impossible");
     if(file.size<1||file.size>10*1024*1024) {
       result="rejected";detail="Taille de classeur hors limites";
     } else {
       const bytes=await file.arrayBuffer();
       if(await digest(bytes)!==hash){
         result="rejected";detail="Empreinte SHA-256 du classeur incorrecte";
       }else{
         try{model=parseFile(bytes,name,key,modified,uploaded,sourceKind);}
         catch(e){result="rejected";detail="Lecture du planning refusée : "+String((e as Error)?.message||e).slice(0,180);}
       }
     }
   }
   if(job.dryRun && result==="publish") {
     result="unchanged";
     detail="Test de lecture réussi, sans publication : semaine "+String((model as {weekStart?:string})?.weekStart||"?");
   }
   const {data:out,error:finishError}=await admin.rpc("nethor_sync_auto_complete",{
     p_job_id:id,p_proof:proof,p_result:result,p_model:model,p_detail:detail||null
   });
   if(finishError)throw new Error("Publication SQL impossible : "+finishError.message);
   console.info("NethorSync auto result:",out?.status||"unknown");
   return json({accepted:true,status:out?.status||"unknown"});
 }catch(error){
   // Ne jamais confirmer une publication si l'état côté base est inconnu.
   // Le cron redéclenchera uniquement les jobs encore 'processing' après 4 min.
   console.error("NethorSync auto worker:",String((error as Error)?.message||error).slice(0,250));
   return json({accepted:false},500);
 }
});
