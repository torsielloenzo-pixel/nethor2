import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from '../config/public.js';

const endpoint=SUPABASE_URL+'/functions/v1/nethor-calendar';

function disabled(){
  return {enabled:false,webcalUrl:'',httpsUrl:'',calendarName:''};
}
function validatePayload(payload){
  if(payload?.enabled!==true)return disabled();
  const httpsUrl=String(payload.https_url||'');
  const webcalUrl=String(payload.webcal_url||'');
  const calendarName=String(payload.calendar_name||'NETHOR · Mon planning');
  const https=new URL(httpsUrl);
  if(https.origin!==SUPABASE_URL||https.pathname!=='/functions/v1/nethor-calendar'||!https.searchParams.get('token'))
    throw new Error('Lien calendrier NETHOR invalide');
  const expected='webcal://'+https.host+https.pathname+https.search;
  if(webcalUrl!==expected)throw new Error('Lien webcal NETHOR invalide');
  return {enabled:true,webcalUrl,httpsUrl,calendarName};
}

export async function readCalendarSubscription(client,{fetchImpl=globalThis.fetch}={}){
  if(!client?.auth?.getSession||typeof fetchImpl!=='function')throw new TypeError('Client calendrier incomplet');
  const {data,error}=await client.auth.getSession();
  const accessToken=data?.session?.access_token||'';
  if(error||!accessToken)return disabled();
  const response=await fetchImpl(endpoint,{
    method:'POST',
    headers:{
      'Authorization':'Bearer '+accessToken,
      'apikey':SUPABASE_PUBLISHABLE_KEY,
      'Content-Type':'application/json'
    },
    body:'{}',
    cache:'no-store'
  });
  if(response.status===401||response.status===403||response.status===404)return disabled();
  if(!response.ok)throw new Error('Service calendrier indisponible');
  return validatePayload(await response.json());
}
