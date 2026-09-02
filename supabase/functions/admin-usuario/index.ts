// =====================================================================
//  admin-usuario — operações de conta a pedido de um admin.
//
//  Uma função para todas as ações que precisam da service_role:
//    acao: 'criar'           { email, senha, empresa? }  -> { id }
//    acao: 'excluir'         { id }                       -> { ok: true }
//    acao: 'trocar-email'    { id, email }                -> { ok, email }
//    acao: 'redefinir-senha' { id, senha }                -> { ok: true }
//
//  Camadas de acesso:
//    1. o gateway do Supabase já exige um JWT válido (verify_jwt = true);
//    2. aqui confirmamos que quem chama tem perfis.admin = true;
//    3. o admin não mexe na própria conta nem em outra conta de admin
//       por esta função.
//
//  A service_role vem do runtime (SUPABASE_SERVICE_ROLE_KEY), nunca do
//  repositório. Substitui a antiga admin-criar-usuario.
//
//  Deploy:  supabase functions deploy admin-usuario
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
   com minúscula, maiúscula, número e símbolo. Mensagem em português. */
function problemaSenha(s: string): string | null {
  if (s.length < 12) return 'A senha precisa de pelo menos 12 caracteres.';
  if (!/[a-z]/.test(s)) return 'Inclua uma letra minúscula na senha.';
  if (!/[A-Z]/.test(s)) return 'Inclua uma letra maiúscula na senha.';
  if (!/[0-9]/.test(s)) return 'Inclua um número na senha.';
  if (!/[^A-Za-z0-9]/.test(s)) return 'Inclua um símbolo na senha (! @ # - …).';
  return null;
}

const jaExiste = (m: string) => /already been registered|already exists|duplicate|email_exists/i.test(m);

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
    .from('perfis').select('admin').eq('id', quem.user.id).maybeSingle();
  if (erroPerfil) return json({ erro: 'Não foi possível verificar o acesso.' }, 500);
  if (!perfil?.admin) return json({ erro: 'Acesso restrito a administradores.' }, 403);

  let corpo: { acao?: string; id?: string; email?: string; senha?: string; empresa?: string };
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'Requisição inválida.' }, 400);
  }
  const acao = String(corpo.acao || '');

  // -------------------------------------------------------------- criar
  if (acao === 'criar') {
    const email = String(corpo.email || '').trim().toLowerCase();
    const senha = String(corpo.senha || '');
    const empresa = String(corpo.empresa || '').trim();
    if (!EMAIL_RX.test(email)) return json({ erro: 'E-mail inválido.' }, 400);
    const ruim = problemaSenha(senha);
    if (ruim) return json({ erro: ruim }, 400);

    const { data: novo, error } = await admin.auth.admin.createUser({
      email, password: senha, email_confirm: true,
    });
    if (error) {
      const m = String(error.message || '');
      if (jaExiste(m)) return json({ erro: 'Já existe uma conta com esse e-mail.' }, 409);
      return json({ erro: m || 'Não foi possível criar a conta.' }, 400);
    }
    const id = novo.user?.id;
    if (empresa && id) await admin.from('perfis').update({ empresa_nome: empresa }).eq('id', id);
    return json({ id, precisaConfirmar: false }, 201);
  }

  // ---- as demais ações precisam de um alvo, que não pode ser admin nem o próprio
  const alvo = String(corpo.id || '');
  if (!alvo) return json({ erro: 'Informe o usuário.' }, 400);
  if (alvo === quem.user.id) {
    return json({ erro: 'Você não pode alterar a sua própria conta por aqui.' }, 400);
  }
  const { data: alvoPerfil } = await admin
    .from('perfis').select('admin').eq('id', alvo).maybeSingle();
  if (alvoPerfil?.admin) {
    return json({ erro: 'Não é possível alterar outra conta de administrador por aqui.' }, 403);
  }

  // ------------------------------------------------------------ excluir
  if (acao === 'excluir') {
    const { error } = await admin.auth.admin.deleteUser(alvo);
    if (error) return json({ erro: String(error.message || 'Não foi possível excluir a conta.') }, 400);
    return json({ ok: true });
  }

  // ------------------------------------------------------- trocar-email
  if (acao === 'trocar-email') {
    const novo = String(corpo.email || '').trim().toLowerCase();
    if (!EMAIL_RX.test(novo)) return json({ erro: 'E-mail inválido.' }, 400);
    const { error } = await admin.auth.admin.updateUserById(alvo, { email: novo, email_confirm: true });
    if (error) {
      const m = String(error.message || '');
      if (jaExiste(m)) return json({ erro: 'Já existe uma conta com esse e-mail.' }, 409);
      return json({ erro: m || 'Não foi possível trocar o e-mail.' }, 400);
    }
    await admin.from('perfis').update({ email: novo }).eq('id', alvo);
    return json({ ok: true, email: novo });
  }

  // --------------------------------------------------- redefinir-senha
  if (acao === 'redefinir-senha') {
    const senha = String(corpo.senha || '');
    const ruim = problemaSenha(senha);
    if (ruim) return json({ erro: ruim }, 400);
    const { error } = await admin.auth.admin.updateUserById(alvo, { password: senha });
    if (error) return json({ erro: String(error.message || 'Não foi possível redefinir a senha.') }, 400);
    return json({ ok: true });
  }

  return json({ erro: 'Ação desconhecida.' }, 400);
});
