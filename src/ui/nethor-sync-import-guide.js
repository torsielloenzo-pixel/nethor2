import {syncHealth} from '../data/nethor-sync-control.js';

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function importSyncHealth(snapshot,now=Date.now()){
  if(snapshot?.error)return 'error';
  if(!snapshot?.loaded)return 'loading';
  return syncHealth(snapshot.status,now);
}

export function renderImportSyncGuide(snapshot,now=Date.now()){
  const health=importSyncHealth(snapshot,now);
  const labels={online:'Poste connecté',offline:'Poste hors ligne','not-seen':'Poste jamais connecté','not-configured':'Non configuré',loading:'Vérification…',error:'État indisponible'};
  const descriptions={
    online:'Un poste NethorSync a été détecté récemment. Le suivi automatique est disponible tant que ce PC et sa connexion fonctionnent.',
    offline:'Un poste est enregistré, mais il ne s’est pas manifesté récemment. Les transmissions reprendront quand il pourra se connecter.',
    'not-seen':'Un ordinateur est associé à NethorSync, mais aucune connexion récente n’a encore été enregistrée.',
    'not-configured':'Aucun ordinateur n’est actuellement associé. Les plannings peuvent toujours être importés manuellement.',
    loading:'Nous vérifions si un ordinateur NethorSync est associé au magasin.',
    error:'Impossible de vérifier l’état du poste pour le moment. Cela ne prouve ni qu’il fonctionne, ni qu’il est arrêté.'
  };
  const machine=snapshot?.status?.installed&&snapshot.status.deviceLabel
    ?'<span class="n2import-machine">Poste lié : <strong>'+escapeHtml(snapshot.status.deviceLabel)+'</strong></span>':'';
  const steps=[
    ['01','Sur l’ordinateur','NethorSync consulte le dossier des plannings Excel.'],
    ['02','Les fichiers changés','Il évite de renvoyer les fichiers déjà transmis à l’identique.'],
    ['03','Transfert privé','Les versions nouvelles ou modifiées sont transmises à Supabase.'],
    ['04','Vérification et publication','Supabase analyse les fichiers et ne publie que les versions recevables.']
  ];
  return '<section class="card n2import-guide" aria-labelledby="n2import-guide-title">'+
    '<div class="n2import-guide-head"><div><span class="n2import-eyebrow">GUIDE PRATIQUE · SYNCHRONISATION</span>'+
    '<h2 id="n2import-guide-title">NethorSync, comment ça marche ?</h2>'+
    '<p>Vos plannings passent de l’ordinateur au site, sans réimporter inutilement les mêmes fichiers.</p></div>'+
    '<span class="n2import-status" data-state="'+escapeHtml(health)+'"><i aria-hidden="true"></i>'+escapeHtml(labels[health])+'</span></div>'+
    '<div class="n2import-current" data-state="'+escapeHtml(health)+'"><span aria-hidden="true">↻</span><div>'+
    '<strong>État de la synchronisation</strong><p>'+escapeHtml(descriptions[health])+'</p>'+machine+'</div></div>'+
    '<div class="n2import-flow" role="list" aria-label="Les quatre étapes de NethorSync">'+steps.map((step,index)=>
      '<div class="n2import-step" role="listitem"><span class="n2import-step-num">'+step[0]+'</span>'+
      '<strong>'+step[1]+'</strong><p>'+step[2]+'</p></div>'+
      (index<steps.length-1?'<span class="n2import-flow-arrow" aria-hidden="true">→</span>':'')
    ).join('')+'</div>'+
    '<div class="n2import-guide-foot"><div class="n2import-guide-note">'+
    '<span class="n2import-note-icon" aria-hidden="true">i</span><div><strong>Et le bouton « Importer un fichier planning » ?</strong>'+
    '<p>Il sert à une importation exceptionnelle : correction urgente, dépannage ou fichier absent de l’automatisation. Il ne désactive pas NethorSync. Vérifiez la semaine et les horaires avant de publier.</p></div></div>'+
    '<details class="n2import-more"><summary>À retenir sur les contrôles automatiques</summary>'+
    '<p>Le programme Windows doit pouvoir accéder à ses fichiers et à Internet. Côté serveur, Supabase contrôle également les fichiers déjà reçus toutes les 4 heures (00 h, 04 h, 08 h, 12 h, 16 h et 20 h UTC), indépendamment du poste Windows.</p>'+
    '<p>Un fichier inchangé n’a normalement pas besoin d’être renvoyé. Une version non conforme peut être refusée sans remplacer le planning publié. Vous pouvez consulter les remplacements dans l’historique.</p>'+
    '</details></div></section>';
}

export function confirmImportManually({health='loading',weekLabel='',fileName=''}={}){
  const active=health==='online';
  const messages={
    online:['NethorSync est déjà actif','Un ordinateur NethorSync s’est connecté récemment et prend en charge les transferts automatiques. Un import manuel n’est normalement pas nécessaire.'],
    offline:['NethorSync est installé, mais hors ligne','Le poste associé n’a pas été détecté récemment. Il pourra reprendre ses transferts lorsque sa connexion sera rétablie.'],
    'not-seen':['Un poste NethorSync est associé','Cet ordinateur n’a pas encore été détecté en fonctionnement.'],
    'not-configured':['Confirmer un import manuel','Aucun ordinateur NethorSync n’est actuellement associé au magasin.'],
    loading:['État de NethorSync en vérification','Impossible de confirmer pour le moment si un poste gère déjà ce planning.'],
    error:['État de NethorSync indisponible','Impossible de confirmer si NethorSync est actif. Vérifiez que cet import manuel est nécessaire.']
  };
  const [title,detail]=messages[health]||messages.error;
  const question='Voulez-vous vraiment publier ce planning manuellement ?';
  const fallback=()=>window.confirm(title+'\n\n'+detail+'\n\n'+question+'\nSemaine : '+weekLabel);
  if(typeof document==='undefined'||typeof HTMLDialogElement==='undefined')return Promise.resolve(typeof window==='undefined'?false:fallback());
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');
    dialog.className='n2import-confirm';
    dialog.setAttribute('aria-labelledby','n2import-confirm-title');
    dialog.setAttribute('aria-describedby','n2import-confirm-desc');
    dialog.innerHTML='<div class="n2import-confirm-body">'+
      '<div class="n2import-confirm-icon" aria-hidden="true">'+(active?'!':'↻')+'</div>'+
      '<span class="n2import-confirm-kicker">'+(active?'IMPORT AUTOMATIQUE DÉTECTÉ':'PUBLICATION MANUELLE')+'</span>'+
      '<h2 id="n2import-confirm-title">'+escapeHtml(title)+'</h2>'+
      '<p id="n2import-confirm-desc">'+escapeHtml(detail)+'</p>'+
      '<div class="n2import-confirm-file"><span>Fichier sélectionné</span><strong>'+escapeHtml(fileName)+'</strong>'+
      '<span>Semaine du '+escapeHtml(weekLabel)+'</span></div>'+
      '<p class="n2import-confirm-warning">'+escapeHtml(question)+' Cette action peut remplacer la version actuellement visible, après les contrôles habituels.</p>'+
      '<div class="n2import-confirm-actions"><button type="button" class="btn" data-import-decision="cancel">Annuler</button>'+
      '<button type="button" class="btn primary" data-import-decision="confirm">Oui, publier manuellement</button></div>'+
      '</div>';
    let finished=false;
    const finish=value=>{
      if(finished)return;
      finished=true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.addEventListener('click',event=>{
      const choice=event.target.closest('[data-import-decision]')?.dataset.importDecision;
      if(choice)finish(choice==='confirm');
    });
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
    document.body.appendChild(dialog);
    try{dialog.showModal();dialog.querySelector('[data-import-decision="cancel"]')?.focus();}
    catch(_){dialog.remove();resolve(fallback());}
  });
}
