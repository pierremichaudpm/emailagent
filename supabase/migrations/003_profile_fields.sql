-- Ajout des champs pour le suivi de la génération de profil
ALTER TABLE user_configs
  ADD COLUMN IF NOT EXISTS profile_status text DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS profile_progress text DEFAULT '';
