import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const adminToken = req.headers.get('x-admin-token')
    const body       = await req.json()
    const { acao, tabela, id, chave, dados } = body

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )
    const { data: cfg } = await anonClient
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'senhas')
      .single()

    if (!cfg || cfg.valor?.admin !== adminToken) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tabelasPermitidas = [
      'agendamentos','pagamentos','contatos','configuracoes',
      'sugestoes','horarios_serviceiros','convites','perfis','avaliacoes'
    ]
    if (tabela && !tabelasPermitidas.includes(tabela)) {
      return new Response(
        JSON.stringify({ error: 'Tabela não permitida' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let result

    if (acao === 'update') {
      const { data, error } = await serviceClient
        .from(tabela).update(dados).eq('id', id).select()
      if (error) throw error
      result = data

    } else if (acao === 'update_config') {
      const { data, error } = await serviceClient
        .from('configuracoes').update(dados).eq('chave', chave).select()
      if (error) throw error
      result = data

    } else if (acao === 'update_perm') {
      // Atualiza permissões por role
      const { data, error } = await serviceClient
        .from('permissoes')
        .upsert({
          role: dados.role,
          abas: dados.abas,
          acoes: dados.acoes,
          atualizado_em: new Date().toISOString()
        }, { onConflict: 'role' })
        .select()
      if (error) throw error
      result = data

    } else if (acao === 'delete') {
      const { error } = await serviceClient
        .from(tabela).delete().eq('id', id)
      if (error) throw error
      result = { success: true }

    } else if (acao === 'insert') {
      const { data, error } = await serviceClient
        .from(tabela).insert(dados).select()
      if (error) throw error
      result = data

    } else {
      throw new Error(`Ação desconhecida: ${acao}`)
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
