-- Champs pour le briefing : statut de réponse, email automatique, brouillon
ALTER TABLE email_metadata
  ADD COLUMN IF NOT EXISTS user_replied boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_automatic boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS draft_body text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS draft_subject text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS draft_to text DEFAULT NULL;
