import test from 'node:test';
import assert from 'node:assert/strict';
import {readCalendarSubscription} from '../src/data/calendar-subscription.js';
import {SUPABASE_URL} from '../src/config/public.js';

const client={auth:{getSession:async()=>({data:{session:{access_token:'session-test'}},error:null})}};

test('abonnement calendrier : récupère uniquement un lien NETHOR valide',async()=>{
  const token='11111111-1111-4111-8111-111111111111';
  const https=SUPABASE_URL+'/functions/v1/nethor-calendar?token='+token;
  const result=await readCalendarSubscription(client,{fetchImpl:async(url,options)=>{
    assert.equal(url,SUPABASE_URL+'/functions/v1/nethor-calendar');
    assert.equal(options.method,'POST');
    assert.equal(options.headers.Authorization,'Bearer session-test');
    return new Response(JSON.stringify({
      enabled:true,
      calendar_name:'NETHOR · Mon planning',
      https_url:https,
      webcal_url:'webcal://'+new URL(https).host+new URL(https).pathname+new URL(https).search
    }),{status:200,headers:{'Content-Type':'application/json'}});
  }});
  assert.equal(result.enabled,true);
  assert.equal(result.calendarName,'NETHOR · Mon planning');
  assert.match(result.webcalUrl,/^webcal:\/\//);
});

test('abonnement calendrier : un compte non activé reste masqué',async()=>{
  const result=await readCalendarSubscription(client,{fetchImpl:async()=>new Response(JSON.stringify({enabled:false}),{status:403})});
  assert.equal(result.enabled,false);
  assert.equal(result.webcalUrl,'');
});

test('abonnement calendrier : refuse un lien retourné depuis un autre domaine',async()=>{
  await assert.rejects(()=>readCalendarSubscription(client,{fetchImpl:async()=>new Response(JSON.stringify({
    enabled:true,
    https_url:'https://example.com/calendar.ics?token=x',
    webcal_url:'webcal://example.com/calendar.ics?token=x'
  }),{status:200,headers:{'Content-Type':'application/json'}})}),/Lien calendrier NETHOR invalide/);
});
