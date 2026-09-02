// =====================================================================
//  admin-criar-usuario — cria uma conta de acesso a pedido de um admin.
//
//  Substitui o antigo signUp num cliente isolado. Vantagens:
//    · a service_role fica no servidor, nunca no navegador nem no repo
//      (o runtime das Edge Functions injeta SUPABASE_SERVICE_ROLE_KEY);
//    · não depende do cadastro público estar aberto (pode-se desligar
//      "Allow new users to sign up" no painel);
//    · a conta já nasce com o e-mail confirmado — o cliente entra direto
//      com a senha provisória e troca depois em Ajustes.
//
//  Camadas de acesso:
//    1. o gateway do Supabase já exige um JWT válido (verify_jwt = true);
//    2. aqui confirmamos que quem chama tem perfis.admin = true.
//
//  Deploy:  supabase functions deploy admin-criar-usuario
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

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

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Espelha a política de senha do projeto no Supabase: 12+ caracteres,
   com minúscula, maiúscula, número e símbolo. Devolve a mensagem do
   primeiro requisito que falta, em português. */
function problemaSenha(s: string): string | null {
  if (s.length < 12) return 'A senha precisa de pelo menos 12 caracteres.';
  if (!/[a-z]/.test(s)) return 'Inclua uma letra minúscula na senha.';
  if (!/[A-Z]/.test(s)) return 'Inclua uma letra maiúscula na senha.';
  if (!/[0-9]/.test(s)) return 'Inclua um número na senha.';
  if (!/[^A-Za-z0-9]/.test(s)) return 'Inclua um símbolo na senha (! @ # - …).';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Método não suportado.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ erro: 'Função sem configuração de ambiente.' }, 500);

  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ erro: 'Sem credencial.' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Quem está chamando?
  const { data: quem, error: erroQuem } = await admin.auth.getUser(jwt);
  if (erroQuem || !quem?.user) return json({ erro: 'Sessão inválida.' }, 401);

  // É admin?
  const { data: perfil, error: erroPerfil } = await admin
    .from('perfis')
    .select('admin')
    .eq('id', quem.user.id)
    .maybeSingle();
  if (erroPerfil) return json({ erro: 'Não foi possível verificar o acesso.' }, 500);
  if (!perfil?.admin) return json({ erro: 'Acesso restrito a administradores.' }, 403);

  // Corpo
  let corpo: { email?: string; senha?: string; empresa?: string };
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'Requisição inválida.' }, 400);
  }

  const email = String(corpo.email || '').trim().toLowerCase();
  const senha = String(corpo.senha || '');
  const empresa = String(corpo.empresa || '').trim();

  if (!EMAIL_RX.test(email)) return json({ erro: 'E-mail inválido.' }, 400);
  const senhaRuim = problemaSenha(senha);
  if (senhaRuim) return json({ erro: senhaRuim }, 400);

  // Cria com o e-mail já confirmado.
  const { data: novo, error: erroCria } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (erroCria) {
    const m = String(erroCria.message || '');
    if (/already been registered|already exists|duplicate/i.test(m)) {
      return json({ erro: 'Já existe uma conta com esse e-mail.' }, 409);
    }
    return json({ erro: m || 'Não foi possível criar a conta.' }, 400);
  }

  const id = novo.user?.id;

  // O gatilho criar_perfil() já criou a linha em perfis; aqui só completa o nome.
  if (empresa && id) {
    await admin.from('perfis').update({ empresa_nome: empresa }).eq('id', id);
  }

  return json({ id, precisaConfirmar: false }, 201);
});
