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
 const ambiguous:Array<Record<string,unknown>>=[];
 const verifiedColor=({sheetName,rowIndex,colIndex,cell,workbook}:{
   sheetName:string;rowIndex:number;colIndex:number;cell:any;workbook:unknown
 })=>{
   const biff=legacy?.color(sheetName,rowIndex,colIndex);
   const resolved=biff ?? resolveExcelColor({sheetName,rowIndex,colIndex,cell,workbook});
   if(resolved===undefined||
      ((resolved===null||resolved==='w')&&cell?.v!==undefined&&cell.v!==null
       &&cell.v!==''&&cell.v!==0&&cell.v!==false)){
     const value=cell.v;
     ambiguous.push({sheet:sheetName,row:rowIndex+1,column:colIndex+1,
       valueKind:value===1?'one':typeof value,
       valueNumber:typeof value==='number'&&Number.isFinite(value)?value:null,
       valueText:typeof value==='string'?value.slice(0,12).replace(/[^A-Za-z0-9 ]/g,''):null,
       sheetStyleKind:typeof cell.s,styleId:typeof cell.s==='number'?cell.s:null,
       style:legacy?.inspect(sheetName,rowIndex,colIndex)||null});
     if(ambiguous.length>8)ambiguous.shift();
   }
   return resolved;
 };
 let model;
 try{model=parsePlanningWorkbook(workbook,XLSX,verifiedColor);}
 catch(e){
   if(String((e as Error)?.message||e).includes('cellule B2')){
     const first=workbook.SheetNames.find(n=>String(n).trim().toUpperCase()==='LUNDI');
     const value=workbook.Sheets[first||workbook.SheetNames[0]]?.B2?.v;
     console.info('NethorSync B2 diagnostic',JSON.stringify({
       type:value instanceof Date?'date':typeof value,
       date:value instanceof Date&&!Number.isNaN(+value)?value.toISOString().slice(0,10):null,
       numeric:typeof value==='number'&&Number.isFinite(value)?value:null,
       cleaned:typeof value==='string'?value.slice(0,70).replace(/[^a-zA-Z0-9 .:/-]/g,''):null
     }));
   }
   if(legacy&&ambiguous.length){
     console.info('NethorSync BIFF ambiguous',JSON.stringify(ambiguous));
     const matrix:Record<string,Record<string,number>>={};
     for(const sheetName of workbook.SheetNames.slice(0,8)){
       const ws=workbook.Sheets[sheetName];
       for(let row=3;row<45;row++){
         for(let col=2;col<60;col++){
           const cell=ws[XLSX.utils.encode_cell({r:row,c:col})];
           if(!cell||typeof cell.v!=='number'||!Number.isFinite(cell.v))continue;
           const value=Math.abs(cell.v)<=16?String(cell.v):'other';
           const fill=legacy.color(sheetName,row,col)||'unknown';
           (matrix[value]??={})[fill]=(matrix[value]?.[fill]||0)+1;
         }
       }
     }
     console.info('NethorSync BIFF numeric matrix',JSON.stringify(matrix));
     const labelFlags=[10,11,12,13,14,15].map(r=>{
       const label=String(workbook.Sheets[workbook.SheetNames[0]]?.['B'+r]?.v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
       const kinds=['TOTAL','TOTAUX','NOMBRE','NB','EFFECTIF','COUVERTURE','PERSONNE','SALARIE','PRESENT','HEURE','COMPTE','SOMME','CALCUL','BILAN'];
       return{row:r,blank:!label.trim(),summaryWords:kinds.filter(w=>new RegExp('\\b'+w+'\\b').test(label)),
        startsWithTotal:/^TOTA(?:L|UX)/.test(label.trim()),length:label.length};
     });
     console.info('NethorSync BIFF row labels',JSON.stringify(labelFlags));
     const byRow=[];
     const knownDays=workbook.SheetNames.filter(n=>/^(LUNDI|MARDI|MERCREDI|JEUDI|VENDREDI|SAMEDI|DIMANCHE)/i.test(n));
     for(let ri=3;ri<16;ri++){
       const counts:Record<string,number>={g:0,b:0,r:0,y:0,o:0,w1:0,wOther:0,missing:0};
       for(const sn of knownDays){
         const ws=workbook.Sheets[sn];
         for(let ci=2;ci<60;ci++){
           const cell=ws[XLSX.utils.encode_cell({r:ri,c:ci})];
           const x=legacy.color(sn,ri,ci);
           if(x==='g'||x==='b'||x==='r'||x==='y'||x==='o')counts[x]++;
           else if(cell?.v===1)counts.w1++;
           else if(typeof cell?.v==='number'&&cell.v!==0)counts.wOther++;
           else if(x===null&&cell?.v!=null&&cell.v!=='')counts.missing++;
         }
       }
       byRow.push({r:ri+1,...counts});
     }
     console.info('NethorSync BIFF row fill profile',JSON.stringify(byRow));

   }
   throw e;
 }
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
