-- Un classeur ne doit pas rester éternellement marqué « Analyse en cours ».
-- Après 4 tentatives de réseau/serveur, conserver le fichier et signaler l'échec.
select cron.schedule(
 'nethor-sync-auto-finalize-failures','*/10 * * * *',
 $task$
   update private.nethor_sync_auto_jobs
   set status='failed',
       detail='Analyse serveur indisponible après quatre tentatives ; fichier conservé sans publication.',
       completed_at=now()
   where attempts>=4 and status in ('processing','queued')
     and coalesce(started_at,created_at)<now()-interval '7 minutes';
 $task$
);
