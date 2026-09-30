// =====================================================================
//  ia — leitura de nota fiscal por IA (0027).
//
//  POST { tarefa: 'nota', obraId, arquivo: 'storage:<obra>/lancamentos/…',
//         contexto: { etapas, materiais: [{id, nome}], formasPagamento } }
//    → 200 { id, leitura, uso }  |  4xx/5xx { erro }
//
//  Camadas:
//    1. o gateway do Supabase exige um JWT válido (verify_jwt = true);
//    2. ia_reservar(obra, 'nota') roda COM O TOKEN DE QUEM PEDIU: confere
//       acesso de escrita na obra, IA ligada, prazo, cota e limite por
//       hora — e reserva a vaga;
//    3. a nota é baixada do Storage com o mesmo token (a RLS do bucket
//       decide se a pessoa pode ler aquele arquivo);
//    4. a resposta da IA passa por validarLeituraNota antes de sair;
//    5. só a conclusão do registro (tokens, custo) usa a service_role,
//       que o runtime injeta — nunca vem do repositório.
//
//  Segredo: ANTHROPIC_API_KEY (painel → Edge Functions → Secrets, ou
//  supabase secrets set --env-file supabase/.env). Nunca aparece em log
//  nem em resposta.
//
//  Deploy:  supabase functions deploy ia
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';
import { ErroIa, processarNota } from './leitura.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Método não suportado.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const chaveIa = Deno.env.get('ANTHROPIC_API_KEY');
  if (!url || !anon || !serviceKey)
    return json({ erro: 'Função sem configuração de ambiente.' }, 500);
  if (!chaveIa) return json({ erro: 'A leitura por IA ainda não foi configurada.' }, 503);

  const autorizacao = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+/i.test(autorizacao)) return json({ erro: 'Sem credencial.' }, 401);

  // cliente com o token de quem pediu: tudo o que ele faz passa pela RLS
  const usuario = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: autorizacao } },
  });
  const servico = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anthropic = new Anthropic({ apiKey: chaveIa, maxRetries: 1, timeout: 90_000 });

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'Pedido inválido.' }, 400);
  }

  try {
    const r = await processarNota(corpo, {
      agora: () => Date.now(),
      anthropic,
      async reservar(obraId: string, tarefa: string) {
        const { data, error } = await usuario.rpc('ia_reservar', {
          p_obra: obraId,
          p_tarefa: tarefa,
        });
        if (error) throw new Error(error.message);
        return data as string;
      },
      async baixar(caminho: string) {
        const { data, error } = await usuario.storage.from('anexos').download(caminho);
        if (error || !data) throw new Error(error ? error.message : 'sem arquivo');
        return new Uint8Array(await data.arrayBuffer());
      },
      async concluir(
        id: string,
        status: string,
        modelo: string,
        entrada: number,
        saida: number,
        custo: number,
        ms: number,
        erro: string | null,
      ) {
        const { error } = await servico.rpc('ia_concluir', {
          p_id: id,
          p_status: status,
          p_modelo: modelo,
          p_tokens_entrada: entrada,
          p_tokens_saida: saida,
          p_custo_usd: custo,
          p_ms: ms,
          p_erro: erro,
        });
        if (error) console.error('ia_concluir falhou', error.code);
      },
    });
    return json(r);
  } catch (e) {
    if (e instanceof ErroIa) {
      // no log só o motivo interno curto — nunca a chave, a nota ou o token
      console.warn('ia', e.status, e.interno.slice(0, 120));
      return json({ erro: e.message }, e.status);
    }
    console.error('ia: erro inesperado');
    return json({ erro: 'Erro na leitura da nota.' }, 500);
  }
});
