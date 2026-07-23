// ============================================================
// Supabase Edge Function: create-platform-admin
// تُنشئ حساب مشرف منصّة جديداً من الصفر (بلا أي مطعم) وتُسنده لدور.
// الأمان: تتحقق أن الطالب مشرف منصّة يملك صلاحية manage_admins قبل الإنشاء.
// ============================================================
// المتغيّرات (Secrets) تُضبط تلقائياً في Supabase:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

    // 1) هوية الطالب عبر التوكن
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    if (!token) return json({ error: 'unauthorized' }, 401)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'unauthorized' }, 401)

    // 2) التحقق الأمني: الطالب يملك صلاحية manage_admins (عبر RPC مبوّبة تعمل بهوية الطالب)
    const { data: canManage, error: capErr } = await userClient.rpc('platform_admin_can', { p_capability: 'manage_admins' })
    if (capErr) return json({ error: 'permission check failed' }, 500)
    if (!canManage) return json({ error: 'forbidden — requires manage_admins' }, 403)

    // 3) المدخلات
    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const role_id = String(body.role_id || '')
    const full_name = String(body.full_name || '').trim()
    if (!email || !email.includes('@')) return json({ error: 'بريد إلكتروني صالح مطلوب' }, 400)
    if (password.length < 8) return json({ error: 'كلمة المرور 8 أحرف على الأقل' }, 400)
    if (!role_id) return json({ error: 'الدور مطلوب' }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

    // 4) التأكد أن الدور موجود
    const { data: role, error: roleErr } = await admin
      .from('platform_roles').select('id').eq('id', role_id).maybeSingle()
    if (roleErr || !role) return json({ error: 'الدور غير موجود' }, 400)

    // 5) إنشاء حساب المصادقة (بلا أي مطعم؛ مؤكَّد البريد ليدخل فوراً)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: full_name ? { full_name } : undefined,
    })
    if (createErr || !created?.user) {
      const msg = String(createErr?.message || 'فشل إنشاء الحساب')
      const dup = /already|exists|registered/i.test(msg)
      return json({ error: dup ? 'هذا البريد مسجّل بالفعل' : msg }, dup ? 409 : 400)
    }

    // 6) إسناده مشرفاً بالدور المختار — وإن فشل، احذف الحساب لتفادي حساب يتيم
    const { error: insErr } = await admin
      .from('platform_admins')
      .insert({ user_id: created.user.id, role_id, is_active: true })
    if (insErr) {
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: 'فشل إسناد المشرف: ' + insErr.message }, 500)
    }

    // 7) تدوين الإجراء في سجلّ التدقيق (بهوية الطالب — الدالة تُسجّل admin_user_id تلقائياً)
    try {
      await userClient.rpc('log_platform_action', {
        p_action: 'admin.create', p_target_type: 'admin', p_target_id: created.user.id,
        p_new: { email, role_id },
      })
    } catch { /* تجاهل فشل التدقيق — لا يُبطل الإنشاء */ }

    return json({ ok: true, user_id: created.user.id }, 200)
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
