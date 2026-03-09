import { GmailProvider } from './gmail.js';

const providers = {
  gmail: new GmailProvider(),
};

export function getProvider(name) {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Provider inconnu: ${name}. Disponibles: ${Object.keys(providers).join(', ')}`);
  }
  return provider;
}
