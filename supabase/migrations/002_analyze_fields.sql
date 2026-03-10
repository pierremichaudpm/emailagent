-- Ajout des champs pour l'analyse IA (Phase 3)

-- Score numérique de priorité (1-10) en plus du level textuel
alter table email_metadata add column if not exists priority_score integer default 5;

-- Action suggérée par Claude
alter table email_metadata add column if not exists suggested_action text;

-- Contrainte unique sur decisions pour permettre l'upsert
alter table decisions add constraint unique_decision_per_email unique (user_id, email_id, provider);
