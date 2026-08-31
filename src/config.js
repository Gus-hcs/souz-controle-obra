/**
 * config.js — Configuração de ambiente.
 *
 * Os valores vêm das variáveis VITE_* (arquivos .env). A chave publicável do
 * Supabase é pública por natureza: ela vai para o navegador de qualquer forma e
 * sozinha não dá acesso a nada, porque cada linha do banco só é visível para o
 * usuário dono dela (Row Level Security). A chave secreta (service_role) nunca
 * entra neste projeto.
 */
const env = import.meta.env ?? {};

export const CFG = {
  url: env.VITE_SUPABASE_URL ?? '',
  anon: env.VITE_SUPABASE_ANON ?? '',
  /** true = o sistema exige banco; false = modo local/artefato */
  exigeBanco: String(env.VITE_EXIGE_BANCO ?? 'true') !== 'false',
  versao: env.VITE_VERSAO ?? '0.0.0-dev',
  ambiente: env.MODE ?? 'development',
};
