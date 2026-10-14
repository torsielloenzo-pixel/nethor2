// Nethor 2: contrôle client conservateur pour afficher l'application.
// ATTENTION : la sécurité des données repose sur RLS et les contrôles serveur.
export async function loadAuthorizedSession(client) {
  if (!client?.auth?.getUser || !client?.from || !client?.rpc)
    throw new TypeError('Client Supabase incomplet');
  const {data: userData,error: authError}=await client.auth.getUser();
  if(authError || !userData?.user) return {status:'signed-out',user:null,profile:null};
  const user=userData.user;
  const {data: context,error: contextError}=await client.rpc('nethor_security_context');
  if(contextError || context?.authenticated!==true || context?.session_active!==true)
    return {status:'denied',user:null,profile:null};
  const {data: profile,error: profileError}=await client.from('profiles')
    .select('id,display_name,role,account_enabled').eq('id',user.id).maybeSingle();
  if(profileError || !profile || profile.account_enabled!==true || profile.id!==user.id)
    return {status:'denied',user:null,profile:null};
  return {status:'authorized',user:{id:user.id},profile:{
    id:profile.id,display_name:profile.display_name,role:profile.role
  }};
}
