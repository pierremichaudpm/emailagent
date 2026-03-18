-- Ajout du champ dismissed pour les emails ignorés
ALTER TABLE email_metadata
  ADD COLUMN IF NOT EXISTS dismissed boolean DEFAULT false;
