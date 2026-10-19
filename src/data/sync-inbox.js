// Nethor Sync 2: fichiers en attente. Aucune publication automatique.
const RX=/^([a-f0-9]{64})-([a-zA-Z0-9_.-]+\.(?:xls|xlsx|xlsm))$/i;
export function incomingOriginalName(name){
  const match=RX.exec(String(name||''));
  return match?match[2]:null;
}
export async function listIncomingPlannings(client,{maxPages=5}={}){
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>10)throw new RangeError('Pagination invalide');
  const results=[];
  for(let page=0;page<maxPages;page++){
    const {data,error}=await client.storage.from('planning-files').list('sync-inbox',{
      limit:100,offset:page*100,sortBy:{column:'name',order:'asc'}
    });
    if(error)throw error;
    const items=Array.isArray(data)?data:[];
    for(const item of items){
      const originalName=incomingOriginalName(item?.name);
      if(originalName&&item.id&&Number(item.metadata?.size)>0){
        results.push({name:item.name,originalName,size:Number(item.metadata.size),createdAt:item.created_at||null});
      }
    }
    if(items.length<100)break;
  }
  return results;
}
export async function downloadIncomingPlanning(client,name){
  const originalName=incomingOriginalName(name);
  if(!originalName)throw new Error('Nom du fichier recu invalide');
  const path='sync-inbox/'+name;
  const {data,error}=await client.storage.from('planning-files').download(path);
  if(error)throw error;
  if(!data||!Number.isFinite(data.size)||data.size===0||data.size>10*1024*1024)
    throw new Error('Le fichier recu est vide ou depasse 10 Mo');
  const type=/\.xls$/i.test(originalName)?'application/vnd.ms-excel':/\.xlsm$/i.test(originalName)?'application/vnd.ms-excel.sheet.macroenabled.12':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return {file:new File([data],originalName,{type}),path};
}
