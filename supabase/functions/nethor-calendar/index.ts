import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const secret=(()=>{
  try{
    const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
    if(keys.default)return keys.default;
  }catch(_){/* fallback legacy */}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
})();
if(!SUPABASE_URL||!secret)throw new Error("Configuration Supabase incomplète");

const admin=createClient(SUPABASE_URL,secret,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});
const cors={
  "Access-Control-Allow-Origin":"https://nethor.fr",
  "Access-Control-Allow-Headers":"authorization, apikey, content-type",
  "Access-Control-Allow-Methods":"GET, HEAD, POST, OPTIONS"
};
const pad=(value:number)=>String(value).padStart(2,"0");
const norm=(value:unknown)=>String(value??"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").toLowerCase();
const escapeIcs=(value:unknown)=>String(value??"").replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/;/g,"\\;").replace(/,/g,"\\,");
const utcStamp=(value:Date|string)=>{
  const d=value instanceof Date?value:new Date(value);
  return d.getUTCFullYear()+pad(d.getUTCMonth()+1)+pad(d.getUTCDate())+"T"+pad(d.getUTCHours())+pad(d.getUTCMinutes())+pad(d.getUTCSeconds())+"Z";
};
const localClock=(minutes:number)=>pad(Math.floor(minutes/60))+":"+pad(Math.round(minutes%60));
function parisDateIso(now=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const get=(type:string)=>parts.find(part=>part.type===type)?.value||"";
  return get("year")+"-"+get("month")+"-"+get("day");
}
function addDays(iso:string,delta:number){
  const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);
}
function mondayFor(iso:string){
  const d=new Date(iso+"T12:00:00Z");const offset=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-offset);return d.toISOString().slice(0,10);
}
function parisInstant(date:string,minutes:number){
  const [year,month,day]=date.split("-").map(Number);
  const hour=Math.floor(minutes/60),minute=Math.round(minutes%60);
  const target=Date.UTC(year,month-1,day,hour,minute,0);
  let guess=target;
  const formatter=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
  for(let i=0;i<3;i++){
    const parts=formatter.formatToParts(new Date(guess));
    const get=(type:string)=>Number(parts.find(part=>part.type===type)?.value||0);
    const observed=Date.UTC(get("year"),get("month")-1,get("day"),get("hour"),get("minute"),get("second"));
    guess+=target-observed;
  }
  return new Date(guess);
}
function buildWorkShifts(cells:unknown,startMinutes:number,step:number){
  if(!Array.isArray(cells))return [] as Array<{start:number,end:number}>;
  const shifts:Array<{start:number,end:number}>=[];
  let begin=-1;
  for(let i=0;i<=cells.length;i++){
    const working=i<cells.length&&(cells[i]==="g"||cells[i]==="b");
    if(working&&begin<0)begin=i;
    if(!working&&begin>=0){
      shifts.push({start:startMinutes+begin*step,end:startMinutes+i*step});
      begin=-1;
    }
  }
  return shifts;
}
function matchingEmployeeIndices(data:any,profile:any){
  const names=new Set([profile.planning_name,profile.display_name,...(Array.isArray(profile.planning_aliases)?profile.planning_aliases:[])].map(norm).filter(Boolean));
  if(!names.size||!Array.isArray(data?.employees))return [];
  return data.employees.map((employee:any,index:number)=>names.has(norm(employee?.name))?index:-1).filter((index:number)=>index>=0);
}
async function etagFor(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return '"'+Array.from(new Uint8Array(digest)).slice(0,16).map(byte=>byte.toString(16).padStart(2,"0")).join("")+'"';
}
function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
}
function buildWebcalUrl(httpsUrl:string){
  const url=new URL(httpsUrl);
  return "webcal://"+url.host+url.pathname+url.search;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  try{
    if(req.method==="POST"){
      const auth=req.headers.get("Authorization")||"";
      const accessToken=auth.match(/^Bearer\s+(.+)$/i)?.[1]||"";
      if(!accessToken)return json({enabled:false,error:"Authentification requise"},401);
      const {data:userData,error:userError}=await admin.auth.getUser(accessToken);
      const user=userData?.user;
      if(userError||!user)return json({enabled:false,error:"Session invalide"},401);
      const {data:subscription,error:subscriptionError}=await admin.from("calendar_subscriptions")
        .select("token,enabled").eq("user_id",user.id).maybeSingle();
      if(subscriptionError)throw subscriptionError;
      if(!subscription?.enabled)return json({enabled:false},403);
      const {data:profile,error:profileError}=await admin.from("profiles")
        .select("account_enabled").eq("id",user.id).maybeSingle();
      if(profileError)throw profileError;
      if(profile?.account_enabled!==true)return json({enabled:false},403);
      const httpsUrl=SUPABASE_URL+"/functions/v1/nethor-calendar?token="+encodeURIComponent(subscription.token);
      return json({enabled:true,calendar_name:"NETHOR · Mon planning",https_url:httpsUrl,webcal_url:buildWebcalUrl(httpsUrl)});
    }

    if(req.method!=="GET"&&req.method!=="HEAD")return json({error:"Méthode non autorisée"},405);
    const url=new URL(req.url);
    const token=url.searchParams.get("token")||"";
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token))return new Response("Calendrier introuvable",{status:404});

    const {data:subscription,error:subscriptionError}=await admin.from("calendar_subscriptions")
      .select("user_id,enabled").eq("token",token).eq("enabled",true).maybeSingle();
    if(subscriptionError)throw subscriptionError;
    if(!subscription)return new Response("Calendrier introuvable",{status:404});

    const {data:profile,error:profileError}=await admin.from("profiles")
      .select("id,display_name,planning_name,planning_aliases,account_enabled").eq("id",subscription.user_id).maybeSingle();
    if(profileError)throw profileError;
    if(!profile||profile.account_enabled!==true)return new Response("Calendrier introuvable",{status:404});

    const minWeek=mondayFor(addDays(parisDateIso(),-35));
    const {data:weeks,error:weeksError}=await admin.from("planning_weeks")
      .select("week_start,data,updated_at").gte("week_start",minWeek).order("week_start",{ascending:true});
    if(weeksError)throw weeksError;

    const events:string[]=[];
    const feedVersions:string[]=[];
    for(const week of weeks||[]){
      const data=week.data||{};
      const indices=matchingEmployeeIndices(data,profile);
      if(!indices.length)continue;
      const startMinutes=Math.round(Number(data.startTime??6)*60);
      const step=Number(data.slotMinutes)||15;
      const modified=week.updated_at?new Date(week.updated_at):new Date();
      const stamp=utcStamp(modified);
      const sequence=Math.max(0,Math.min(2147483647,Math.floor(modified.getTime()/1000)));
      feedVersions.push(String(week.week_start)+":"+String(week.updated_at||""));
      for(let offset=0;offset<7;offset++){
        const date=addDays(String(week.week_start),offset);
        const seen=new Set<string>();
        let slotIndex=0;
        for(const employeeIndex of indices){
          const cells=data.days?.[date]?.cells?.[employeeIndex];
          for(const shift of buildWorkShifts(cells,startMinutes,step)){
            const key=shift.start+"-"+shift.end;
            if(seen.has(key))continue;
            seen.add(key);
            const uid="nethor-"+profile.id+"-"+date+"-"+slotIndex+"@nethor.fr";
            events.push([
              "BEGIN:VEVENT",
              "UID:"+uid,
              "DTSTAMP:"+stamp,
              "LAST-MODIFIED:"+stamp,
              "SEQUENCE:"+sequence,
              "DTSTART:"+utcStamp(parisInstant(date,shift.start)),
              "DTEND:"+utcStamp(parisInstant(date,shift.end)),
              "SUMMARY:"+escapeIcs("NETHOR · "+localClock(shift.start)+"–"+localClock(shift.end)),
              "DESCRIPTION:"+escapeIcs("Planning NETHOR · "+String(profile.display_name||profile.planning_name||"")),
              "CATEGORIES:Travail",
              "TRANSP:OPAQUE",
              "STATUS:CONFIRMED",
              "END:VEVENT"
            ].join("\r\n"));
            slotIndex++;
          }
        }
      }
    }

    const etag=await etagFor(profile.id+"|"+feedVersions.join("|"));
    if(req.headers.get("If-None-Match")===etag)return new Response(null,{status:304,headers:{ETag:etag,"Cache-Control":"private, max-age=300, must-revalidate"}});
    const body=[
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//NETHOR//Planning abonné//FR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:"+escapeIcs("NETHOR · Mon planning"),
      "X-WR-TIMEZONE:Europe/Paris",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
      ...events,
      "END:VCALENDAR",
      ""
    ].join("\r\n");
    const headers={
      "Content-Type":"text/calendar; charset=utf-8",
      "Content-Disposition":'inline; filename="nethor-planning.ics"',
      "Cache-Control":"private, max-age=300, must-revalidate",
      "ETag":etag,
      "X-Content-Type-Options":"nosniff"
    };
    return new Response(req.method==="HEAD"?null:body,{status:200,headers});
  }catch(error){
    console.error("nethor-calendar error",error instanceof Error?error.message:String(error));
    return new Response("Calendrier temporairement indisponible",{status:500,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
  }
});
