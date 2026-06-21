import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token, x-user-jwt',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const adminToken = req.headers.get('x-admin-token')
    const body       = await req.json()
    const { acao, tabela, id, chave, dados, filtros, ordem } = body

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Token interno do sistema (para marcar convites como usados)
    const tokenSistema = adminToken === 'SISTEMA_INTERNO';

    // ── Validação pública de convite (usado no cadastro, antes do login) ──
    // Recebe um código e devolve apenas { valido, role } — sem expor a lista de convites.
    if (acao === 'validar_convite') {
      const codigo = (dados?.codigo || '').trim()
      if (!codigo) {
        return new Response(JSON.stringify({ valido: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data: conv } = await serviceClient
        .from('convites')
        .select('role, usado')
        .eq('codigo', codigo)
        .eq('usado', false)
        .maybeSingle()
      if (!conv) {
        return new Response(JSON.stringify({ valido: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ valido: true, role: conv.role || 'cliente' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Marca um convite como usado (por código) ──
    if (acao === 'marcar_convite_usado') {
      const codigo = (dados?.codigo || '').trim()
      if (codigo) {
        await serviceClient.from('convites').update({ usado: true }).eq('codigo', codigo)
      }
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }


    // ── Modo serviceiro: atua apenas nos próprios chamados ──
    // Disparado por acao 'serviceiro_update_ag'. Autentica pelo JWT do usuário
    // (header x-user-jwt) e só permite mudar status/obs do agendamento se o
    // serviceiro vinculado ao perfil for o mesmo do agendamento.
    if (acao === 'serviceiro_update_ag') {
      const jwt = req.headers.get('x-user-jwt')
      if (!jwt) {
        return new Response(JSON.stringify({ error: 'Sem autenticação' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: `Bearer ${jwt}` } } }
      )
      const { data: userData, error: userErr } = await authClient.auth.getUser()
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Sessão inválida' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const uid = userData.user.id

      // Perfil do usuário (service_role lê tudo)
      const { data: perfil } = await serviceClient
        .from('perfis').select('role, serviceiro_nome, nick').eq('id', uid).single()
      if (!perfil || perfil.role !== 'serviceiro') {
        return new Response(JSON.stringify({ error: 'Apenas serviceiros' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const nomeServ = perfil.serviceiro_nome || perfil.nick

      // Confirma que o agendamento pertence a este serviceiro
      const { data: ag } = await serviceClient
        .from('agendamentos').select('serviceiro, status, inicio, fim').eq('id', id).single()
      if (!ag || ag.serviceiro !== nomeServ) {
        return new Response(JSON.stringify({ error: 'Este chamado não é seu' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Só permite alterar status e obs_conclusao
      const novoStatus = dados?.status
      const permitidos  = ['aprovado','recusado','em_andamento','concluido','encerrado','cancelado']
      if (!permitidos.includes(novoStatus)) {
        return new Response(JSON.stringify({ error: 'Status não permitido' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Trava de horário: iniciar só a partir do início; concluir só após o fim.
      const agora = new Date()
      if (novoStatus === 'em_andamento' && ag.inicio && agora < new Date(ag.inicio)) {
        return new Response(JSON.stringify({ error: 'Ainda não chegou o horário de início deste serviço.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (novoStatus === 'concluido' && ag.fim && agora < new Date(ag.fim)) {
        return new Response(JSON.stringify({ error: 'O serviço só pode ser concluído após o horário de término. Use "Encerrar" para terminar antes.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const patch: Record<string, unknown> = { status: novoStatus }
      if (typeof dados?.obs_conclusao === 'string') patch.obs_conclusao = dados.obs_conclusao
      if (typeof dados?.anotacoes === 'string') patch.anotacoes = dados.anotacoes
      if (dados?.valor_final != null && !isNaN(Number(dados.valor_final))) patch.valor_final = Number(dados.valor_final)
      if (typeof dados?.print_url === 'string') patch.print_url = dados.print_url
      // Marca os momentos reais para cálculo de horas trabalhadas
      if (novoStatus === 'em_andamento') patch.iniciado_em = agora.toISOString()
      if (novoStatus === 'concluido' || novoStatus === 'encerrado') patch.finalizado_em = agora.toISOString()

      const { error } = await serviceClient.from('agendamentos').update(patch).eq('id', id)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Modo serviceiro: aprovar/recusar pagamento dos próprios chamados ──
    if (acao === 'serviceiro_update_pag') {
      const jwt = req.headers.get('x-user-jwt')
      if (!jwt) {
        return new Response(JSON.stringify({ error: 'Sem autenticação' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: `Bearer ${jwt}` } } }
      )
      const { data: userData, error: userErr } = await authClient.auth.getUser()
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Sessão inválida' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const uid = userData.user.id

      const { data: perfil } = await serviceClient
        .from('perfis').select('role, serviceiro_nome, nick').eq('id', uid).single()
      if (!perfil || perfil.role !== 'serviceiro') {
        return new Response(JSON.stringify({ error: 'Apenas serviceiros' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const nomeServ = perfil.serviceiro_nome || perfil.nick

      // Confirma que o pagamento é de um chamado deste serviceiro
      const { data: pag } = await serviceClient
        .from('pagamentos').select('serviceiro, status').eq('id', id).single()
      if (!pag || pag.serviceiro !== nomeServ) {
        return new Response(JSON.stringify({ error: 'Este pagamento não é de um chamado seu' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const novoStatus = dados?.status
      if (!['aprovado', 'recusado'].includes(novoStatus)) {
        return new Response(JSON.stringify({ error: 'Status de pagamento inválido' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { error } = await serviceClient.from('pagamentos').update({ status: novoStatus }).eq('id', id)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }


    // ── Modo serviceiro: gerencia os próprios horários de disponibilidade ──
    if (acao === 'serviceiro_horario') {
      const jwt = req.headers.get('x-user-jwt')
      if (!jwt) {
        return new Response(JSON.stringify({ error: 'Sem autenticação' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: `Bearer ${jwt}` } } }
      )
      const { data: userData, error: userErr } = await authClient.auth.getUser()
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Sessão inválida' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data: perfil } = await serviceClient
        .from('perfis').select('role, serviceiro_nome, nick').eq('id', userData.user.id).single()
      // serviceiro puro OU admin com vínculo
      const podeServ = perfil && (perfil.role === 'serviceiro' || (perfil.role === 'admin' && perfil.serviceiro_nome))
      if (!podeServ) {
        return new Response(JSON.stringify({ error: 'Sem permissão' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const nomeServ = perfil.serviceiro_nome || perfil.nick
      const sub = dados?.sub  // 'insert' | 'delete'

      if (sub === 'insert') {
        const { data, error } = await serviceClient.from('horarios_serviceiros').insert({
          serviceiro:  nomeServ,  // forçado: nunca aceita nome de outro
          dia_semana:  dados.dia_semana,
          hora_inicio: dados.hora_inicio,
          hora_fim:    dados.hora_fim,
          ativo: true
        }).select()
        if (error) throw error
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      if (sub === 'delete') {
        // Só deleta se o horário for do próprio serviceiro
        const { data: h } = await serviceClient
          .from('horarios_serviceiros').select('serviceiro').eq('id', dados.id).single()
        if (!h || h.serviceiro !== nomeServ) {
          return new Response(JSON.stringify({ error: 'Este horário não é seu' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
        const { error } = await serviceClient.from('horarios_serviceiros').delete().eq('id', dados.id)
        if (error) throw error
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ error: 'Sub-ação inválida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Valida que quem chama é admin — pelo JWT (exceto ações do sistema)
    if (!tokenSistema) {
      const jwt = req.headers.get('x-user-jwt')
      if (!jwt) {
        return new Response(JSON.stringify({ error: 'Sem autenticação' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: `Bearer ${jwt}` } } }
      )
      const { data: userData, error: userErr } = await authClient.auth.getUser()
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Sessão inválida' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data: perfilAdmin } = await serviceClient
        .from('perfis').select('role').eq('id', userData.user.id).single()
      if (!perfilAdmin || perfilAdmin.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Apenas administradores' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // ── Arquivar serviços finalizados (fechar o mês) ──
      if (acao === 'arquivar_finalizados') {
        const finais = ['concluido','encerrado','cancelado','recusado','expirado']
        let q = serviceClient.from('agendamentos').update({ arquivado: true })
          .in('status', finais).eq('arquivado', false)
        // Filtro opcional por período (datas ISO em dados.de / dados.ate)
        if (dados?.de)  q = q.gte('fim', dados.de)
        if (dados?.ate) q = q.lte('fim', dados.ate)
        const { data, error } = await q.select('id')
        if (error) throw error
        return new Response(JSON.stringify({ success: true, arquivados: (data || []).length }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // Ações permitidas para o sistema (sem token admin)
    const acoesSistema = ['update']
    const tabelasSistema = ['convites']

    if (tokenSistema && (!acoesSistema.includes(acao) || !tabelasSistema.includes(tabela))) {
      return new Response(
        JSON.stringify({ error: 'Ação não permitida para sistema' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tabelasPermitidas = [
      'agendamentos','pagamentos','contatos','configuracoes',
      'sugestoes','horarios_serviceiros','convites','perfis','avaliacoes','permissoes'
    ]
    if (tabela && !tabelasPermitidas.includes(tabela)) {
      return new Response(
        JSON.stringify({ error: 'Tabela não permitida' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    } else if (acao === 'delete_user') {
      // Exclusão total: remove a linha em perfis E o usuário em auth.users,
      // liberando o email para novo cadastro. id = uuid do usuário.
      // Apaga perfis primeiro (ignora erro caso a linha já não exista).
      await serviceClient.from('perfis').delete().eq('id', id)
      const { error } = await serviceClient.auth.admin.deleteUser(id)
      if (error) throw error
      result = { success: true }

    } else if (acao === 'select') {
      let q = serviceClient.from(tabela).select('*')
      // filtros: array de { coluna, op, valor }, op em ('eq','neq')
      if (Array.isArray(filtros)) {
        for (const f of filtros) {
          if (!f || !f.coluna) continue
          if (f.op === 'neq') q = q.neq(f.coluna, f.valor)
          else q = q.eq(f.coluna, f.valor)
        }
      }
      if (ordem && ordem.coluna) {
        q = q.order(ordem.coluna, { ascending: ordem.ascending !== false })
      }
      const { data, error } = await q
      if (error) throw error
      result = data

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
