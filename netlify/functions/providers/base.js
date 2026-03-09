/**
 * Interface commune pour tous les providers email.
 * Chaque provider (Gmail, Outlook, IMAP) implémente cette classe.
 */
export class EmailProvider {
  constructor(name) {
    this.name = name;
  }

  /** Génère l'URL d'autorisation OAuth */
  getAuthUrl(state) {
    throw new Error(`${this.name}: getAuthUrl() non implémenté`);
  }

  /** Échange le code OAuth contre des tokens */
  async authenticate(code) {
    throw new Error(`${this.name}: authenticate() non implémenté`);
  }

  /** Rafraîchit un token expiré */
  async refreshToken(refreshToken) {
    throw new Error(`${this.name}: refreshToken() non implémenté`);
  }

  /** Révoque l'accès */
  async revokeAccess(token) {
    throw new Error(`${this.name}: revokeAccess() non implémenté`);
  }

  /** Récupère les courriels au format normalisé */
  async fetchEmails(accessToken, opts = {}) {
    throw new Error(`${this.name}: fetchEmails() non implémenté`);
  }

  /** Récupère un fil de discussion complet */
  async getThread(accessToken, threadId) {
    throw new Error(`${this.name}: getThread() non implémenté`);
  }

  /** Vérifie si une réponse existe pour un courriel donné */
  async checkReplyExists(accessToken, emailId) {
    throw new Error(`${this.name}: checkReplyExists() non implémenté`);
  }
}
