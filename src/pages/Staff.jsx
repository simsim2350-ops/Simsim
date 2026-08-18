import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { appConfig } from '../config'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import ConfirmDialog from '../components/ConfirmDialog'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { fetchBranches } from '../lib/branchesApi'
import { CAPABILITIES } from '../registry/features.manifest'
import { MEMBER_ROLES, OWNER_ONLY, ROLE_LABELS, ROLE_PRESETS } from '../lib/permissions'

// عميل ثانوي لإنشاء حسابات الموظفين دون تغيير جلسة صاحب المطعم الحالية.
const signupClient = createClient(
  appConfig.supabaseUrl,
  appConfig.supabaseAnonKey,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const GROUP_DEFINITIONS = [
  { key: 'sales', label: 'المبيعات', keys: ['orders', 'tables', 'qr'] },
  { key: 'restaurant', label: 'المطعم', keys: ['menu', 'branches'] },
  { key: 'customers', label: 'العملاء', keys: ['customers', 'loyalty'] },
  { key: 'reports', label: 'التقارير', keys: ['analytics'] },
]

const pageCapabilities = CAPABILITIES.filter(capability => capability.kind === 'page' && !OWNER_ONLY.includes(capability.key))
const pageByKey = new Map(pageCapabilities.map(capability => [capability.key, capability]))
const groupedKeys = new Set(GROUP_DEFINITIONS.flatMap(group => group.keys))
const extraCapabilityKeys = pageCapabilities.map(capability => capability.key).filter(key => !groupedKeys.has(key))
const PERMISSION_GROUPS = [
  ...GROUP_DEFINITIONS.map(group => ({
    ...group,
    pages: group.keys.map(key => pageByKey.get(key)).filter(Boolean),
  })).filter(group => group.pages.length > 0),
  ...(extraCapabilityKeys.length ? [{
    key: 'other',
    label: 'أخرى',
    pages: extraCapabilityKeys.map(key => pageByKey.get(key)).filter(Boolean),
  }] : []),
]
const MANAGEABLE_PAGE_KEYS = pageCapabilities.map(capability => capability.key)

const filterOptions = [
  { key: 'all', label: 'الكل' },
  { key: 'manager', label: 'المديرون' },
  { key: 'cashier', label: 'الكاشير' },
  { key: 'staff', label: 'الموظفون' },
  { key: 'active', label: 'المفعلون' },
  { key: 'inactive', label: 'المعطلون' },
]

const emptyForm = {
  username: '',
  password: '',
  role: 'staff',
  allowed_pages: [...(ROLE_PRESETS.staff || [])],
  all_pages: false,
  branch_mode: 'all',
  branch_ids: [],
}

function Icon({ type, size = 16 }) {
  const paths = {
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    plus: 'M12 5v14M5 12h14', search: 'm21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z',
    link: 'M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1',
    copy: 'M9 9h10v11H9zM5 5h10v4', more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0-14a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    edit: 'M4 20h4l10-10-4-4L4 16v4zM13 7l4 4', trash: 'M4 7h16M10 11v5m4-5v5M9 7l1-3h4l1 3m-9 0 1 14h10l1-14',
    power: 'M12 2v10m5.66-6.34a8 8 0 1 1-11.32 0', close: 'm18 6-12 12M6 6l12 12',
    branch: 'M4 20V4h16v16M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2',
    clock: 'M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    check: 'm5 12 4 4L19 6', external: 'M15 3h6v6M14 10l7-7M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5', info: 'M12 8h.01M11 12h1v4h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[type] || paths.users} /></svg>
}

function Spinner() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0B0B0F', color: 'white', gap: '16px', fontFamily: 'Tajawal,sans-serif' }}>
      <div style={{ width: '44px', height: '44px', border: '3px solid rgba(255,106,0,0.3)', borderTopColor: '#FF6A00', borderRadius: '50%', animation: 'staffSpin 0.8s linear infinite' }} />
      <style>{'@keyframes staffSpin{to{transform:rotate(360deg)}}'}</style>
      جارٍ التحميل...
    </div>
  )
}

const inputStyle = {
  width: '100%', minHeight: '46px', padding: '11px 13px', border: '1.5px solid #E1E5EA', borderRadius: '11px',
  fontFamily: 'Tajawal,sans-serif', fontSize: '14px', color: '#111827', outline: 'none', boxSizing: 'border-box', background: 'white',
}
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '800', marginBottom: '7px', color: '#374151' }
const softButton = { padding: '8px 11px', borderRadius: '9px', border: '1px solid #E1E5EA', background: 'white', color: '#374151', fontFamily: 'Tajawal,sans-serif', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }

const formatDateTime = (value) => {
  if (!value) return null
  return new Date(value).toLocaleString('ar-SA', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export default function Staff() {
  const { restaurant } = useAuthStore()
  const { isMobile, isDesktop } = useBreakpoint()
  const [members, setMembers] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [openMenuId, setOpenMenuId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmToggle, setConfirmToggle] = useState(null)
  const [permissionView, setPermissionView] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const [loginLinkCopied, setLoginLinkCopied] = useState(false)

  useBodyScrollLock(modalOpen || !!confirmDelete || !!confirmToggle || !!permissionView)

  useEffect(() => {
    if (!restaurant?.id) return
    fetchAll()
  }, [restaurant?.id])

  const fetchAll = async () => {
    if (!restaurant?.id) return
    setLoading(true)
    setLoadError(null)
    try {
      const [{ data: mem, error: memberError }, branchList] = await Promise.all([
        supabase.from('restaurant_members').select('*').eq('restaurant_id', restaurant.id).order('created_at', { ascending: false }),
        fetchBranches(restaurant.id),
      ])
      if (memberError) throw memberError
      setMembers(mem || [])
      setBranches(branchList || [])
    } catch (err) {
      const message = err.message || 'تعذّر تحميل الموظفين'
      toast.error(message)
      setLoadError(message)
      setMembers([])
    } finally {
      setLoading(false)
    }
  }

  const summary = useMemo(() => ({
    total: members.length,
    active: members.filter(member => member.is_active).length,
    inactive: members.filter(member => !member.is_active).length,
    manager: members.filter(member => member.role === 'manager').length,
    cashier: members.filter(member => member.role === 'cashier').length,
    staff: members.filter(member => member.role === 'staff').length,
  }), [members])

  const visibleMembers = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return members.filter(member => {
      const selectedBranchNames = member.branch_scope === 'all' || (!member.branch_scope && !(member.branch_ids || []).length)
        ? ['كل الفروع']
        : (member.branch_ids || []).map(id => branches.find(branch => branch.id === id)?.name).filter(Boolean)
      const statusWords = member.is_active ? ['مفعل', 'نشط', 'active'] : ['معطل', 'متوقف', 'inactive']
      const haystack = [member.username, ROLE_LABELS[member.role], ...selectedBranchNames, ...statusWords].filter(Boolean).join(' ').toLowerCase()
      const matchesSearch = !keyword || haystack.includes(keyword)
      const matchesFilter = filter === 'all'
        || filter === member.role
        || (filter === 'active' && member.is_active)
        || (filter === 'inactive' && !member.is_active)
      return matchesSearch && matchesFilter
    })
  }, [members, branches, search, filter])

  const getBranchIds = (member) => Array.isArray(member.branch_ids) ? member.branch_ids : []
  const branchNames = (member) => {
    if (member.branch_scope === 'all' || (!member.branch_scope && getBranchIds(member).length === 0)) return ['كل الفروع']
    const ids = getBranchIds(member)
    const names = ids.map(id => branches.find(branch => branch.id === id)?.name).filter(Boolean)
    return names.length ? names : ['فروع محددة']
  }
  const branchDescription = (member) => {
    const names = branchNames(member)
    if (names[0] === 'كل الفروع') return 'يرى ويعمل على كل فروع المطعم'
    return names.length === 1 ? 'يرى ويعمل على هذا الفرع فقط' : `يرى ويعمل على ${names.length} فروع`
  }
  const pageNames = (member) => {
    const pages = Array.isArray(member.allowed_pages) ? member.allowed_pages : []
    if (pages.includes('all')) return ['كل الصفحات']
    return pages.map(key => pageByKey.get(key)?.name || key)
  }
  const pagesSummary = (member) => {
    const names = pageNames(member)
    if (!names.length) return 'بدون صلاحيات صفحات'
    if (names[0] === 'كل الصفحات') return 'كل الصفحات التشغيلية'
    return names.slice(0, 4).join(' · ') + (names.length > 4 ? ` +${names.length - 4}` : '')
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm, allowed_pages: [...(ROLE_PRESETS.staff || [])] })
    setModalOpen(true)
  }

  const openEdit = (member) => {
    setEditing(member)
    const pages = Array.isArray(member.allowed_pages) ? member.allowed_pages : []
    setForm({
      username: member.username || '',
      password: '',
      role: member.role || 'staff',
      allowed_pages: pages.filter(page => page !== 'all'),
      all_pages: pages.includes('all'),
      branch_mode: member.branch_scope === 'all' || (!member.branch_scope && getBranchIds(member).length === 0) ? 'all' : 'selected',
      branch_ids: [...getBranchIds(member)],
    })
    setOpenMenuId(null)
    setModalOpen(true)
  }

  const applyRole = (role) => {
    const preset = ROLE_PRESETS[role] || []
    const fullAccess = preset.includes('all')
    setForm(current => ({ ...current, role, all_pages: fullAccess, allowed_pages: fullAccess ? [] : [...preset] }))
  }

  const togglePage = (key) => setForm(current => ({
    ...current,
    allowed_pages: current.allowed_pages.includes(key)
      ? current.allowed_pages.filter(page => page !== key)
      : [...current.allowed_pages, key],
  }))

  const toggleBranch = (id) => setForm(current => ({
    ...current,
    branch_ids: current.branch_ids.includes(id)
      ? current.branch_ids.filter(branchId => branchId !== id)
      : [...current.branch_ids, id],
  }))

  const buildEmail = (username) => `${username.toLowerCase()}.${restaurant.slug}@staff.simsim.app`

  const handleSave = async () => {
    const username = form.username.trim().toLowerCase()
    if (!editing && !/^[a-z][a-z0-9._-]{2,}$/.test(username)) {
      toast.error('اسم المستخدم يبدأ بحرف إنجليزي (3 أحرف على الأقل، بدون مسافات)')
      return
    }
    const pages = form.all_pages ? ['all'] : form.allowed_pages
    if (!pages.length) { toast.error('اختر صفحة واحدة على الأقل'); return }
    if (form.branch_mode === 'selected' && !form.branch_ids.length) { toast.error('اختر فرعًا واحدًا على الأقل'); return }
    if (!editing && getPasswordStrength(form.password).level < 3) { toast.error('اختر كلمة مرور قوية: 8 أحرف أو أكثر مع رقم ورمز وحروف متنوعة'); return }

    const accessPayload = {
      role: form.role || 'staff',
      allowed_pages: pages,
      branch_scope: form.branch_mode === 'all' ? 'all' : 'selected',
      branch_ids: form.branch_mode === 'all' ? [] : form.branch_ids,
    }

    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase.from('restaurant_members').update(accessPayload).eq('id', editing.id).eq('restaurant_id', restaurant.id)
        if (error) throw error
        toast.success('تم حفظ التعديلات')
      } else {
        const email = buildEmail(username)
        const { data: signData, error: signError } = await signupClient.auth.signUp({ email, password: form.password })
        if (signError) {
          toast.error(String(signError.message || '').toLowerCase().includes('already') ? 'اسم المستخدم مستخدم مسبقًا، اختر غيره' : (signError.message || 'تعذّر إنشاء الحساب'))
          return
        }
        const newUserId = signData?.user?.id
        if (!newUserId) throw new Error('تعذّر إنشاء حساب الدخول')
        await signupClient.auth.signOut()

        const { error: memberError } = await supabase.from('restaurant_members').insert({
          restaurant_id: restaurant.id,
          user_id: newUserId,
          username,
          is_active: true,
          ...accessPayload,
        })
        if (memberError) throw memberError
        toast.success('تم إنشاء الموظف بنجاح')
      }
      setModalOpen(false)
      await fetchAll()
    } catch (err) {
      toast.error(err.message || 'حصل خطأ، جرّب مرة ثانية')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (member) => {
    setTogglingId(member.id)
    try {
      const { error } = await supabase.from('restaurant_members').update({ is_active: !member.is_active }).eq('id', member.id).eq('restaurant_id', restaurant.id)
      if (error) throw error
      toast.success(member.is_active ? 'تم تعطيل الموظف' : 'تم تفعيل الموظف')
      await fetchAll()
    } catch (err) {
      toast.error(err.message || 'تعذّر تحديث حالة الموظف')
    } finally {
      setTogglingId(null)
      setOpenMenuId(null)
    }
  }

  const removeMember = async () => {
    const member = confirmDelete
    if (!member) return
    try {
      const { data, error } = await supabase.functions.invoke('delete-staff', { body: { member_id: member.id } })
      if (error) throw error
      if (data?.warning) {
        toast.error('تمت إزالة العضوية ومنع الدخول، لكن تعذّر حذف حساب المصادقة')
      } else {
        toast.success('تم حذف الموظف نهائيًا')
      }
      setConfirmDelete(null)
      await fetchAll()
    } catch (err) {
      toast.error(err.message || 'تعذّر حذف الموظف')
    }
  }

  const staffLoginLink = `${window.location.origin}/staff-login/${restaurant.slug}`
  // العرض مختصر بصريًا فقط؛ قيمة النسخ والفتح تظل الرابط الحقيقي الكامل.
  const staffLoginDisplayLink = staffLoginLink.replace(/^https?:\/\//, '')

  const copyLoginLink = async () => {
    const link = staffLoginLink
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(link)
      else {
        const field = document.createElement('textarea')
        field.value = link
        field.style.position = 'fixed'
        field.style.opacity = '0'
        document.body.appendChild(field)
        field.select()
        document.execCommand('copy')
        document.body.removeChild(field)
      }
      setLoginLinkCopied(true)
      window.setTimeout(() => setLoginLinkCopied(false), 2200)
      toast.success('تم نسخ الرابط ✓')
    } catch {
      toast.error('تعذّر النسخ، انسخه يدويًا')
    }
  }

  if (!restaurant || loading) return <Spinner />

  return (
    <AppShell
      title="الموظفون"
      active="staff"
      headerStacked
      actions={<button onClick={openAdd} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px', minHeight: '42px', padding: '10px 15px', borderRadius: '11px', border: 'none', background: '#FF6A00', color: 'white', fontFamily: 'Tajawal,sans-serif', fontWeight: '900', fontSize: '13px', cursor: 'pointer', boxShadow: '0 6px 16px rgba(255,106,0,.22)', whiteSpace: 'nowrap' }}><Icon type="plus" size={16} /> إضافة موظف</button>}
    >
      <style>{`
        .staff-login-utility, .staff-login-title, .staff-login-url, .staff-login-actions { min-width: 0; max-width: 100%; box-sizing: border-box; }
        .staff-login-url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .staff-login-copy, .staff-login-open { transition: transform 160ms ease-out, background 160ms ease-out, border-color 160ms ease-out; }
        .staff-login-copy:active, .staff-login-open:active { transform: scale(.97); }
        .staff-login-copy:hover { background: #E85F00 !important; }
        .staff-login-open:hover { background: #F9FAFB !important; border-color: #D0D5DD !important; }
        .staff-login-copy:focus-visible, .staff-login-open:focus-visible { outline: 3px solid rgba(255, 106, 0, .35); outline-offset: 2px; }
        @media (max-width:640px){
          .staff-filter-scroll{margin-left:-16px;margin-right:-16px;padding:0 16px}
          .staff-card-actions{width:100%;justify-content:flex-end}
          .staff-page-grid{grid-template-columns:1fr!important}
          .staff-modal-sheet{border-radius:22px 22px 0 0!important;max-height:92dvh!important}
        }
      `}</style>
      <div style={{ maxWidth: '1020px', paddingBottom: '32px' }}>
        <section style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '5px' }}>
                <span style={{ width: '34px', height: '34px', borderRadius: '10px', display: 'grid', placeItems: 'center', background: '#FFF0EB', color: '#FF6A00', border: '1px solid #FFD4BE' }}><Icon type="users" size={18} /></span>
                <h1 style={{ margin: 0, fontFamily: 'Tajawal,sans-serif', color: '#101828', fontSize: isMobile ? '20px' : '23px', fontWeight: '900' }}>إدارة فريق العمل</h1>
              </div>
              <p style={{ margin: 0, color: '#667085', fontSize: '13px', lineHeight: 1.6 }}>أضف الموظفين وحدد أدوارهم وصلاحياتهم ونطاق الفروع بأمان.</p>
            </div>
            <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
              <SummaryChip label="إجمالي" value={summary.total} color="#344054" bg="#F2F4F7" />
              <SummaryChip label="مفعلين" value={summary.active} color="#027A48" bg="#ECFDF3" />
              <SummaryChip label="معطلين" value={summary.inactive} color="#667085" bg="#F2F4F7" />
              <SummaryChip label="مديرون" value={summary.manager} color="#175CD3" bg="#EEF4FF" />
              <SummaryChip label="كاشير" value={summary.cashier} color="#C2410C" bg="#FFF7ED" />
              <SummaryChip label="موظفون" value={summary.staff} color="#475467" bg="#F2F4F7" />
            </div>
          </div>
        </section>

        <section
          className="staff-login-utility"
          aria-labelledby="staff-login-link-title"
          style={{ width: '100%', maxWidth: '100%', minWidth: 0, minHeight: '80px', boxSizing: 'border-box', background: 'white', borderRadius: '16px', padding: '10px 12px', marginBottom: '14px', display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr) auto' : 'auto minmax(0, 1fr) auto', gridTemplateRows: isMobile ? 'minmax(0, auto) minmax(0, auto)' : '1fr', alignItems: 'center', columnGap: '10px', rowGap: '4px', border: '1px solid #E5E7EB', boxShadow: '0 2px 6px rgba(16,24,40,.02)' }}
        >
          <div className="staff-login-title" style={{ gridColumn: isMobile ? '1' : 'auto', gridRow: isMobile ? '1' : 'auto', display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span style={{ width: '30px', height: '30px', display: 'grid', placeItems: 'center', color: '#FF6A00', background: '#FFF0EB', border: '1px solid #FFD4BE', borderRadius: '9px', flexShrink: 0 }}><Icon type="link" size={16} /></span>
            <div id="staff-login-link-title" style={{ minWidth: 0, color: '#344054', fontFamily: 'Tajawal,sans-serif', fontWeight: '700', fontSize: '16px', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>رابط دخول الموظفين</div>
          </div>

          <div className="staff-login-url" dir="ltr" title={staffLoginDisplayLink} style={{ gridColumn: isMobile ? '1' : 'auto', gridRow: isMobile ? '2' : 'auto', minWidth: 0, color: '#667085', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px', lineHeight: 1.35, fontWeight: '700', textAlign: 'left' }}>{staffLoginDisplayLink}</div>

          <div className="staff-login-actions" style={{ gridColumn: isMobile ? '2' : 'auto', gridRow: isMobile ? '1 / span 2' : 'auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'center' }}>
            <button
              type="button"
              className="staff-login-copy"
              onClick={copyLoginLink}
              aria-label="نسخ رابط دخول الموظفين"
              title="نسخ الرابط"
              style={{ minWidth: '36px', height: '36px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '0 7px', borderRadius: '9px', border: '1px solid #FF6A00', background: '#FF6A00', color: 'white', fontFamily: 'Tajawal,sans-serif', fontSize: '12px', lineHeight: 1, fontWeight: '900', cursor: 'pointer', whiteSpace: 'nowrap', boxSizing: 'border-box' }}
            >
              <Icon type={loginLinkCopied ? 'check' : 'copy'} size={15} /> {loginLinkCopied ? 'تم' : 'نسخ'}
            </button>
            <a
              className="staff-login-open"
              href={staffLoginLink}
              target="_blank"
              rel="noreferrer"
              aria-label="فتح رابط دخول الموظفين في تبويب جديد"
              title="فتح الرابط في تبويب جديد"
              style={{ minWidth: '36px', height: '36px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '0 7px', boxSizing: 'border-box', borderRadius: '9px', border: '1px solid #D0D5DD', background: 'white', color: '#475467', fontFamily: 'Tajawal,sans-serif', fontSize: '12px', lineHeight: 1, fontWeight: '900', textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              <Icon type="external" size={15} /> فتح
            </a>
          </div>
        </section>

        <section style={{ background: 'white', border: '1px solid #E7EAEE', borderRadius: '15px', padding: isMobile ? '12px' : '14px', marginBottom: '14px', boxShadow: '0 3px 10px rgba(16,24,40,.025)' }}>
          <div style={{ position: 'relative', marginBottom: '11px' }}>
            <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#98A2B3', pointerEvents: 'none' }}><Icon type="search" size={17} /></span>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="بحث عن موظف..." style={{ ...inputStyle, paddingRight: '40px', background: '#FCFCFD' }} />
          </div>
          <div className="staff-filter-scroll" style={{ display: 'flex', gap: '7px', overflowX: 'auto', paddingBottom: '1px', scrollbarWidth: 'none' }}>
            {filterOptions.map(option => {
              const selected = filter === option.key
              return <button key={option.key} onClick={() => setFilter(option.key)} style={{ flexShrink: 0, padding: '7px 11px', borderRadius: '999px', border: `1px solid ${selected ? '#FFD1B8' : '#E4E7EC'}`, background: selected ? '#FFF0EB' : 'white', color: selected ? '#C2410C' : '#667085', fontFamily: 'Tajawal,sans-serif', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>{option.label}</button>
            })}
          </div>
        </section>

        {loadError ? (
          <LoadErrorState message={loadError} onRetry={fetchAll} />
        ) : members.length === 0 ? (
          <EmptyState onAdd={openAdd} />
        ) : visibleMembers.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #E7EAEE', padding: '34px 20px', textAlign: 'center' }}>
            <div style={{ color: '#667085', fontWeight: '800', fontSize: '14px' }}>لا توجد نتائج مطابقة</div>
            <button onClick={() => { setSearch(''); setFilter('all') }} style={{ ...softButton, marginTop: '12px' }}>إزالة الفلاتر</button>
          </div>
        ) : (
          <div className="staff-page-grid" style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: '12px' }}>
            {visibleMembers.map(member => {
              const isOpen = openMenuId === member.id
              const active = !!member.is_active
              const lastLogin = formatDateTime(member.last_login_at)
              const lastActivity = member.last_activity_at ? formatDateTime(member.last_activity_at) : null
              return (
                <article key={member.id} style={{ position: 'relative', background: 'white', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '15px', boxShadow: '0 4px 13px rgba(16,24,40,.035)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <span style={{ width: '42px', height: '42px', borderRadius: '12px', display: 'grid', placeItems: 'center', background: active ? '#FFF0EB' : '#F2F4F7', color: active ? '#FF6A00' : '#98A2B3', fontWeight: '900', fontSize: '16px', flexShrink: 0 }}>{member.username?.slice(0, 1).toUpperCase() || 'م'}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                          <h2 style={{ margin: 0, color: '#101828', fontFamily: 'Tajawal,sans-serif', fontSize: '15px', fontWeight: '900', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '155px' }}>{member.username}</h2>
                          <RoleBadge role={member.role} />
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '4px', fontSize: '11px', color: active ? '#027A48' : '#667085', fontWeight: '800' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: active ? '#12B76A' : '#98A2B3' }} />{active ? 'مفعل' : 'معطل'}</div>
                      </div>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <button aria-label={`إجراءات ${member.username}`} onClick={() => setOpenMenuId(isOpen ? null : member.id)} style={{ width: '32px', height: '32px', borderRadius: '9px', border: '1px solid #E4E7EC', background: isOpen ? '#F9FAFB' : 'white', color: '#667085', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon type="more" size={17} /></button>
                      {isOpen && <div style={{ position: 'absolute', left: 0, top: '38px', zIndex: 8, minWidth: '154px', padding: '5px', background: 'white', border: '1px solid #E4E7EC', borderRadius: '11px', boxShadow: '0 10px 26px rgba(16,24,40,.14)' }}>
                        <MenuAction icon="edit" label="تعديل الموظف" onClick={() => openEdit(member)} />
                        <MenuAction icon="shield" label="عرض الصلاحيات" onClick={() => { setPermissionView(member); setOpenMenuId(null) }} />
                        <MenuAction icon="power" label={active ? (togglingId === member.id ? 'جارٍ التعطيل...' : 'تعطيل الموظف') : (togglingId === member.id ? 'جارٍ التفعيل...' : 'إعادة التفعيل')} onClick={() => active ? (setConfirmToggle(member), setOpenMenuId(null)) : toggleActive(member)} disabled={togglingId === member.id} />
                        <MenuAction icon="trash" label="حذف" danger onClick={() => { setConfirmDelete(member); setOpenMenuId(null) }} />
                      </div>}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '8px', padding: '11px', background: '#FCFCFD', border: '1px solid #F0F2F5', borderRadius: '12px' }}>
                    <MetaRow icon="branch" label="الفروع" value={branchNames(member).join(' · ')} title={branchDescription(member)} />
                    <MetaRow icon="shield" label="الصلاحيات" value={pagesSummary(member)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
                    <CompactMetric icon="clock" label="آخر دخول" value={lastLogin || 'لم يسجل دخولًا بعد'} />
                    <CompactMetric icon="info" label="آخر نشاط" value={lastActivity || 'لا يوجد نشاط مسجل'} />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {modalOpen && <StaffModal
        isMobile={isMobile}
        editing={editing}
        form={form}
        branches={branches}
        saving={saving}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onForm={setForm}
        onRole={applyRole}
        onTogglePage={togglePage}
        onToggleBranch={toggleBranch}
      />}

      <PermissionDialog
        member={permissionView}
        branchNames={permissionView ? branchNames(permissionView) : []}
        pageNames={permissionView ? pageNames(permissionView) : []}
        onClose={() => setPermissionView(null)}
      />

      <ConfirmDialog
        open={!!confirmToggle}
        icon="⏸️"
        title="هل تريد تعطيل هذا الموظف؟"
        body={`لن يتمكن ${confirmToggle?.username || 'الموظف'} من تسجيل الدخول حتى إعادة تفعيله، ولن تُحذف بياناته أو سجل نشاطه.`}
        confirmLabel="تعطيل الموظف"
        cancelLabel="إلغاء"
        danger={false}
        onCancel={() => setConfirmToggle(null)}
        onConfirm={async () => { const member = confirmToggle; setConfirmToggle(null); if (member) await toggleActive(member) }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        icon="⚠️"
        title="حذف الموظف؟"
        body={`سيتم إزالة حساب ${confirmDelete?.username || 'الموظف'} ومنعه من تسجيل الدخول. هذا الإجراء لا يمكن التراجع عنه.`}
        confirmLabel="حذف الموظف"
        cancelLabel="إلغاء"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={removeMember}
      />
    </AppShell>
  )
}

function SummaryChip({ label, value, color, bg }) {
  return <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '5px', padding: '7px 10px', borderRadius: '10px', background: bg, color }}><b style={{ fontSize: '15px', fontFamily: 'Tajawal,sans-serif' }}>{value}</b><span style={{ fontSize: '11px', fontWeight: '800' }}>{label}</span></span>
}

function RoleBadge({ role }) {
  const palette = {
    manager: { bg: '#EEF4FF', color: '#175CD3', border: '#D1E0FF' },
    cashier: { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
    staff: { bg: '#F2F4F7', color: '#475467', border: '#E4E7EC' },
  }[role] || { bg: '#F2F4F7', color: '#475467', border: '#E4E7EC' }
  return <span style={{ padding: '3px 7px', borderRadius: '999px', background: palette.bg, color: palette.color, border: `1px solid ${palette.border}`, fontSize: '10px', fontWeight: '900' }}>{ROLE_LABELS[role] || ROLE_LABELS.staff}</span>
}

function MetaRow({ icon, label, value, title }) {
  return <div title={title} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', minWidth: 0 }}><span style={{ color: '#98A2B3', marginTop: '1px' }}><Icon type={icon} size={14} /></span><span style={{ color: '#667085', fontSize: '11px', fontWeight: '800', flexShrink: 0 }}>{label}:</span><span style={{ color: '#344054', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span></div>
}

function CompactMetric({ icon, label, value }) {
  return <div style={{ minWidth: 0, padding: '8px 9px', border: '1px solid #F0F2F5', borderRadius: '10px', background: 'white' }}><div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#98A2B3', marginBottom: '3px' }}><Icon type={icon} size={12} /><span style={{ fontSize: '10px', fontWeight: '800' }}>{label}</span></div><div style={{ color: '#475467', fontSize: '10.5px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div></div>
}

function MenuAction({ icon, label, onClick, danger = false, disabled = false }) {
  return <button disabled={disabled} onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '9px', border: 'none', borderRadius: '8px', background: 'transparent', color: danger ? '#D92D20' : '#344054', fontFamily: 'Tajawal,sans-serif', fontSize: '12px', fontWeight: '800', cursor: disabled ? 'default' : 'pointer', textAlign: 'right', opacity: disabled ? .6 : 1 }}><Icon type={icon} size={14} />{label}</button>
}

function LoadErrorState({ message, onRetry }) {
  return <div style={{ background: 'white', border: '1px solid #FECACA', borderRadius: '16px', padding: '34px 20px', textAlign: 'center' }}><span style={{ width: '44px', height: '44px', display: 'grid', placeItems: 'center', borderRadius: '13px', background: '#FEF2F2', color: '#D92D20', margin: '0 auto 10px' }}><Icon type="info" size={22} /></span><div style={{ color: '#B42318', fontFamily: 'Tajawal,sans-serif', fontSize: '15px', fontWeight: '900' }}>تعذّر تحميل الموظفين</div><p style={{ margin: '6px auto 14px', maxWidth: '360px', color: '#7A271A', fontSize: '12px', lineHeight: 1.7 }}>{message}</p><button onClick={onRetry} style={{ ...softButton, borderColor: '#FECACA', color: '#B42318' }}>إعادة المحاولة</button></div>
}

function EmptyState({ onAdd }) {
  return <div style={{ background: 'white', border: '1px solid #E7EAEE', borderRadius: '18px', padding: '48px 22px', textAlign: 'center', boxShadow: '0 4px 12px rgba(16,24,40,.025)' }}><span style={{ width: '58px', height: '58px', borderRadius: '17px', display: 'grid', placeItems: 'center', color: '#FF6A00', background: '#FFF0EB', margin: '0 auto 14px' }}><Icon type="users" size={27} /></span><div style={{ color: '#101828', fontFamily: 'Tajawal,sans-serif', fontSize: '16px', fontWeight: '900', marginBottom: '5px' }}>لا يوجد موظفون بعد</div><p style={{ maxWidth: '330px', margin: '0 auto 18px', color: '#667085', fontSize: '13px', lineHeight: 1.7 }}>أضف أعضاء فريقك وحدد صلاحياتهم ونطاق الفروع لإدارة المطعم بأمان.</p><button onClick={onAdd} style={{ padding: '10px 14px', borderRadius: '11px', border: 'none', background: '#FF6A00', color: 'white', fontFamily: 'Tajawal,sans-serif', fontWeight: '900', cursor: 'pointer' }}>+ إضافة موظف</button></div>
}

function PermissionDialog({ member, branchNames, pageNames, onClose }) {
  if (!member) return null
  const pages = pageNames[0] === 'كل الصفحات' ? ['كل الصفحات التشغيلية المتاحة'] : pageNames
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 110, padding: '18px', background: 'rgba(16,24,40,.48)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: '390px', background: 'white', borderRadius: '17px', padding: '20px', direction: 'rtl' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '15px' }}><div><div style={{ color: '#101828', fontFamily: 'Tajawal,sans-serif', fontSize: '16px', fontWeight: '900' }}>صلاحيات {member.username}</div><div style={{ color: '#667085', fontSize: '12px', marginTop: '4px' }}>{ROLE_LABELS[member.role] || 'موظف'} · {member.is_active ? 'حساب مفعل' : 'حساب معطل'}</div></div><button aria-label="إغلاق" onClick={onClose} style={{ width: '32px', height: '32px', display: 'grid', placeItems: 'center', border: '1px solid #E4E7EC', borderRadius: '9px', background: 'white', color: '#667085', cursor: 'pointer' }}><Icon type="close" size={16} /></button></div><div style={{ display: 'grid', gap: '12px' }}><PermissionSummary title="الفروع المسموحة" items={branchNames} /><PermissionSummary title="الصفحات المفعلة" items={pages.length ? pages : ['بدون صلاحيات صفحات']} /></div><button onClick={onClose} style={{ width: '100%', minHeight: '43px', marginTop: '18px', border: 'none', borderRadius: '11px', background: '#FF6A00', color: 'white', fontFamily: 'Tajawal,sans-serif', fontWeight: '900', cursor: 'pointer' }}>تم</button></div></div>
}

function PermissionSummary({ title, items }) {
  return <div style={{ padding: '12px', border: '1px solid #EAECF0', borderRadius: '12px', background: '#FCFCFD' }}><div style={{ color: '#475467', fontSize: '11px', fontWeight: '900', marginBottom: '8px' }}>{title}</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{items.map(item => <span key={item} style={{ padding: '4px 7px', borderRadius: '999px', background: '#FFF0EB', color: '#9A3412', fontSize: '11px', fontWeight: '800' }}>{item}</span>)}</div></div>
}

function StaffModal({ isMobile, editing, form, branches, saving, onClose, onSave, onForm, onRole, onTogglePage, onToggleBranch }) {
  const [activeTab, setActiveTab] = useState('info')
  const [showPassword, setShowPassword] = useState(false)
  const isAllPages = form.all_pages
  const rolePreset = ROLE_PRESETS[form.role] || []
  const presetPages = rolePreset.includes('all') ? MANAGEABLE_PAGE_KEYS : rolePreset
  const enabledPages = isAllPages ? MANAGEABLE_PAGE_KEYS : form.allowed_pages
  const addedPages = enabledPages.filter(page => !presetPages.includes(page))
  const removedPages = presetPages.filter(page => !enabledPages.includes(page))
  const manualCount = addedPages.length + removedPages.length
  const strength = getPasswordStrength(form.password)
  const tabs = [
    { key: 'info', label: 'معلومات الموظف' },
    { key: 'permissions', label: 'الصلاحيات' },
    { key: 'branches', label: 'الفروع' },
    { key: 'security', label: 'الحساب والأمان' },
  ]
  const setGroupPages = (group, checked) => {
    const groupKeys = group.pages.map(page => page.key)
    onForm(current => ({
      ...current,
      allowed_pages: checked
        ? [...new Set([...current.allowed_pages, ...groupKeys])]
        : current.allowed_pages.filter(page => !groupKeys.includes(page)),
    }))
  }
  const selectAllBranches = () => onForm(current => ({ ...current, branch_ids: branches.map(branch => branch.id) }))
  const clearBranches = () => onForm(current => ({ ...current, branch_ids: [] }))

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, padding: isMobile ? 0 : '16px', background: 'rgba(16,24,40,.48)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}>
      <div className="staff-modal-sheet" onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: '640px', maxHeight: '88vh', overflowY: 'auto', background: 'white', borderRadius: '18px', padding: isMobile ? '18px 16px calc(18px + env(safe-area-inset-bottom))' : '22px', direction: 'rtl' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '15px' }}>
          <div><h2 style={{ margin: 0, color: '#101828', fontFamily: 'Tajawal,sans-serif', fontSize: '18px', fontWeight: '900' }}>{editing ? 'تعديل الموظف' : 'إضافة موظف'}</h2><p style={{ margin: '4px 0 0', color: '#667085', fontSize: '12px', lineHeight: 1.55 }}>{editing ? `تعديل دور وصلاحيات وفروع ${editing.username}.` : 'أنشئ حسابًا وحدد الدور والصلاحيات ونطاق الفروع بأمان.'}</p></div>
          <button aria-label="إغلاق" onClick={onClose} style={{ width: '34px', height: '34px', borderRadius: '9px', border: '1px solid #E4E7EC', background: 'white', color: '#667085', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}><Icon type="close" size={17} /></button>
        </div>

        <div role="tablist" aria-label="أقسام إدارة الموظف" style={{ display: 'flex', gap: '5px', overflowX: 'auto', paddingBottom: '9px', borderBottom: '1px solid #EAECF0', marginBottom: '16px', scrollbarWidth: 'none' }}>
          {tabs.map(tab => <button type="button" role="tab" aria-selected={activeTab === tab.key} key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ flexShrink: 0, padding: '8px 10px', border: 'none', borderRadius: '9px', background: activeTab === tab.key ? '#FFF0EB' : 'transparent', color: activeTab === tab.key ? '#C2410C' : '#667085', fontFamily: 'Tajawal,sans-serif', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>{tab.label}</button>)}
        </div>

        {activeTab === 'info' && <section>
          {editing ? <div style={{ padding: '12px', border: '1px solid #EAECF0', borderRadius: '12px', background: '#FCFCFD', marginBottom: '15px' }}><div style={{ color: '#98A2B3', fontSize: '10px', fontWeight: '900', marginBottom: '3px' }}>اسم المستخدم</div><div style={{ direction: 'ltr', textAlign: 'right', color: '#344054', fontWeight: '900', fontSize: '14px' }}>{editing.username}</div></div> : <div style={{ marginBottom: '15px' }}><label style={labelStyle}>اسم المستخدم *</label><input style={{ ...inputStyle, direction: 'ltr', textAlign: 'left' }} value={form.username} onChange={event => onForm(current => ({ ...current, username: event.target.value }))} placeholder="e.g. ahmad_muruj" autoCapitalize="none" autoCorrect="off" autoComplete="username" /><p style={{ margin: '6px 0 0', color: '#98A2B3', fontSize: '11px' }}>3 أحرف إنجليزية على الأقل، من دون مسافات.</p></div>}
          <label style={labelStyle}>الدور *</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '8px' }}>{MEMBER_ROLES.map(role => { const selected = form.role === role; return <button type="button" key={role} onClick={() => onRole(role)} style={{ padding: '11px 7px', borderRadius: '11px', cursor: 'pointer', fontFamily: 'Tajawal,sans-serif', fontWeight: '900', fontSize: '12px', border: `1.5px solid ${selected ? '#FFD0B5' : '#E4E7EC'}`, background: selected ? '#FFF0EB' : 'white', color: selected ? '#C2410C' : '#475467' }}>{ROLE_LABELS[role]}</button> })}</div>
          <div style={{ display: 'flex', gap: '7px', marginTop: '10px', color: '#667085', fontSize: '11px', lineHeight: 1.6 }}><Icon type="info" size={14} />اختيار الدور يطبق الصلاحيات الافتراضية، ويمكن تخصيصها من تبويب الصلاحيات.</div>
        </section>}

        {activeTab === 'permissions' && <section>
          <div style={{ padding: '12px', border: '1px solid #E4E7EC', background: '#FCFCFD', borderRadius: '12px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}><div><div style={{ color: '#344054', fontSize: '12px', fontWeight: '900' }}>ملخص الصلاحيات</div><div style={{ color: '#667085', fontSize: '11px', marginTop: '3px' }}>{isAllPages ? 'كل الصفحات التشغيلية مفعلة' : `${enabledPages.length} صلاحيات مفعلة`} {manualCount ? ` · ${manualCount} مخصصة` : ''}</div></div><span style={{ padding: '4px 7px', borderRadius: '999px', background: manualCount ? '#FFF7ED' : '#ECFDF3', color: manualCount ? '#C2410C' : '#027A48', fontSize: '10px', fontWeight: '900' }}>{manualCount ? 'مخصصة' : 'الصلاحيات الافتراضية'}</span></div>
            <div style={{ marginTop: '10px' }}><div style={{ color: '#98A2B3', fontSize: '10px', fontWeight: '900', marginBottom: '5px' }}>الصلاحيات الافتراضية</div><PermissionChips items={presetPages.length ? presetPages.map(key => pageByKey.get(key)?.name || key) : ['لا توجد صلاحيات افتراضية']} muted /></div>
            {manualCount > 0 && <div style={{ marginTop: '9px' }}><div style={{ color: '#98A2B3', fontSize: '10px', fontWeight: '900', marginBottom: '5px' }}>التخصيصات اليدوية</div><PermissionChips items={[...addedPages.map(key => `+ ${pageByKey.get(key)?.name || key}`), ...removedPages.map(key => `− ${pageByKey.get(key)?.name || key}`)]} /></div>}
          </div>
          <div style={{ display: 'flex', gap: '7px', marginBottom: '9px' }}><button type="button" onClick={() => onForm(current => ({ ...current, all_pages: true, allowed_pages: [] }))} style={{ ...softButton, flex: 1, borderColor: isAllPages ? '#FFD0B5' : '#E4E7EC', background: isAllPages ? '#FFF0EB' : 'white', color: isAllPages ? '#C2410C' : '#475467' }}>كل الصفحات</button><button type="button" onClick={() => onForm(current => ({ ...current, all_pages: false, allowed_pages: current.allowed_pages }))} style={{ ...softButton, flex: 1, borderColor: !isAllPages ? '#FFD0B5' : '#E4E7EC', background: !isAllPages ? '#FFF0EB' : 'white', color: !isAllPages ? '#C2410C' : '#475467' }}>تخصيص يدوي</button></div>
          {!isAllPages && <><div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '9px' }}><label style={{ ...labelStyle, margin: 0 }}>الصلاحيات *</label><div style={{ display: 'flex', gap: '6px' }}><button type="button" onClick={() => onForm(current => ({ ...current, allowed_pages: [...MANAGEABLE_PAGE_KEYS] }))} style={{ border: 0, background: 'transparent', color: '#C2410C', fontFamily: 'Tajawal,sans-serif', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>تحديد الكل</button><button type="button" onClick={() => onForm(current => ({ ...current, allowed_pages: [] }))} style={{ border: 0, background: 'transparent', color: '#667085', fontFamily: 'Tajawal,sans-serif', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>إلغاء الكل</button></div></div><div style={{ display: 'grid', gap: '9px' }}>{PERMISSION_GROUPS.map(group => <PermissionGroup key={group.key} group={group} selectedPages={form.allowed_pages} onTogglePage={onTogglePage} onSetGroup={setGroupPages} isMobile={isMobile} />)}<OwnerOnlyGroup /></div></>}
        </section>}

        {activeTab === 'branches' && <section>
          <label style={labelStyle}>الفروع *</label><div style={{ display: 'flex', gap: '7px', marginBottom: '10px' }}>{[{ key: 'all', label: 'كل الفروع' }, { key: 'selected', label: 'فروع محددة' }].map(option => <button type="button" key={option.key} onClick={() => onForm(current => ({ ...current, branch_mode: option.key, branch_ids: option.key === 'all' ? [] : current.branch_ids }))} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: `1.5px solid ${form.branch_mode === option.key ? '#FFD0B5' : '#E4E7EC'}`, background: form.branch_mode === option.key ? '#FFF0EB' : 'white', color: form.branch_mode === option.key ? '#C2410C' : '#475467', fontFamily: 'Tajawal,sans-serif', fontWeight: '900', fontSize: '12px', cursor: 'pointer' }}>{option.label}</button>)}</div>
          {form.branch_mode === 'all' ? <div style={{ display: 'flex', gap: '7px', padding: '12px', borderRadius: '12px', background: '#FCFCFD', border: '1px solid #EAECF0', color: '#667085', fontSize: '11px', lineHeight: 1.6 }}><Icon type="info" size={14} />هذا الموظف يرى ويعمل على كل فروع المطعم ضمن صفحاته المسموحة.</div> : <><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}><span style={{ color: '#667085', fontSize: '11px', fontWeight: '800' }}>{form.branch_ids.length} من {branches.length} فروع محددة</span><div style={{ display: 'flex', gap: '6px' }}><button type="button" onClick={selectAllBranches} style={{ border: 0, background: 'transparent', color: '#C2410C', fontFamily: 'Tajawal,sans-serif', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>تحديد الكل</button><button type="button" onClick={clearBranches} style={{ border: 0, background: 'transparent', color: '#667085', fontFamily: 'Tajawal,sans-serif', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>إلغاء الكل</button></div></div><div style={{ display: 'grid', gap: '7px' }}>{branches.map(branch => { const checked = form.branch_ids.includes(branch.id); return <label key={branch.id} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '11px', borderRadius: '10px', border: `1px solid ${checked ? '#FFD0B5' : '#EAECF0'}`, background: checked ? '#FFF9F5' : 'white', cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={() => onToggleBranch(branch.id)} style={{ accentColor: '#FF6A00', width: '16px', height: '16px' }} /><span style={{ display: 'grid', color: '#98A2B3' }}><Icon type="branch" size={14} /></span><span style={{ color: '#344054', fontSize: '12px', fontWeight: '800' }}>{branch.name}{branch.is_primary ? ' · الرئيسي' : ''}</span></label> })}</div><p style={{ margin: '8px 0 0', color: form.branch_ids.length ? '#667085' : '#B42318', fontSize: '11px' }}>{form.branch_ids.length ? 'البيانات في الطلبات والطاولات تُحجب خادميًا عن الفروع غير المحددة.' : 'اختر فرعًا واحدًا على الأقل.'}</p></>}
        </section>}

        {activeTab === 'security' && <section>
          {!editing ? <><label style={labelStyle}>كلمة المرور *</label><div style={{ position: 'relative' }}><input type={showPassword ? 'text' : 'password'} style={{ ...inputStyle, direction: 'ltr', textAlign: 'left', paddingLeft: '46px' }} value={form.password} onChange={event => onForm(current => ({ ...current, password: event.target.value }))} placeholder="كلمة مرور قوية" autoComplete="new-password" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', minWidth: '34px', height: '32px', border: 'none', borderRadius: '8px', background: '#F2F4F7', color: '#475467', fontFamily: 'Tajawal,sans-serif', fontSize: '10px', fontWeight: '900', cursor: 'pointer' }}>{showPassword ? 'إخفاء' : 'إظهار'}</button></div><PasswordStrength strength={strength} /></> : <div style={{ display: 'grid', gap: '10px' }}><SecurityInfo title="حالة الحساب" value={editing.is_active ? 'مفعل' : 'معطل'} good={!!editing.is_active} /><SecurityInfo title="كلمة المرور" value="لا تتغير من هذه الصفحة حفاظًا على أمان الحساب." /><SecurityInfo title="تسجيل الدخول والنشاط" value="تعرض بطاقة الموظف القيم الحقيقية عند توفر مصدر بيانات لها؛ لا يتم إنشاء سجل وهمي." /></div>}
          <div style={{ display: 'flex', gap: '7px', marginTop: '12px', padding: '11px', borderRadius: '11px', border: '1px solid #FEF3F2', background: '#FFFAF8', color: '#9A3412', fontSize: '11px', lineHeight: 1.6 }}><Icon type="shield" size={14} />الصلاحيات ونطاق الفروع مطبقان على مستوى Authorization وRLS، وليس بإخفاء عناصر الواجهة فقط.</div>
        </section>}

        <div style={{ position: 'sticky', bottom: 0, display: 'flex', gap: '9px', paddingTop: '15px', marginTop: '17px', background: 'linear-gradient(180deg,rgba(255,255,255,0),#fff 22%)' }}><button onClick={onClose} disabled={saving} style={{ ...softButton, flex: 1, minHeight: '46px', background: 'white' }}>إلغاء</button><button onClick={onSave} disabled={saving} style={{ flex: 2, minHeight: '46px', borderRadius: '11px', border: 'none', background: saving ? '#98A2B3' : '#FF6A00', color: 'white', fontFamily: 'Tajawal,sans-serif', fontSize: '13px', fontWeight: '900', cursor: saving ? 'default' : 'pointer' }}>{saving ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديلات' : 'إنشاء الموظف'}</button></div>
      </div>
    </div>
  )
}

function PermissionGroup({ group, selectedPages, onTogglePage, onSetGroup, isMobile }) {
  const groupKeys = group.pages.map(page => page.key)
  const selectedCount = groupKeys.filter(key => selectedPages.includes(key)).length
  return <div style={{ border: '1px solid #EAECF0', borderRadius: '12px', overflow: 'hidden' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '9px', padding: '9px 11px', background: '#F9FAFB', color: '#475467' }}><span style={{ fontSize: '11px', fontWeight: '900' }}>{group.label}</span><GroupToggle checked={selectedCount === groupKeys.length} indeterminate={selectedCount > 0 && selectedCount < groupKeys.length} label={`${selectedCount}/${groupKeys.length}`} onChange={checked => onSetGroup(group, checked)} /></div><div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1px', background: '#EAECF0' }}>{group.pages.map(page => { const checked = selectedPages.includes(page.key); return <label key={page.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 11px', background: checked ? '#FFF9F5' : 'white', cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={() => onTogglePage(page.key)} style={{ accentColor: '#FF6A00', width: '16px', height: '16px' }} /><span style={{ fontSize: '12px', fontWeight: '800', color: checked ? '#9A3412' : '#475467' }}>{page.name}</span></label> })}</div></div>
}

function GroupToggle({ checked, indeterminate, label, onChange }) {
  const inputRef = useRef(null)
  useEffect(() => { if (inputRef.current) inputRef.current.indeterminate = indeterminate }, [indeterminate])
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '10px', fontWeight: '900' }}><span>{label}</span><input ref={inputRef} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} style={{ accentColor: '#FF6A00', width: '15px', height: '15px' }} /></label>
}

function OwnerOnlyGroup() {
  return <div style={{ padding: '11px', border: '1px dashed #D0D5DD', borderRadius: '12px', background: '#FCFCFD' }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#667085', fontSize: '11px', fontWeight: '900' }}><Icon type="shield" size={14} />الإدارة <span style={{ padding: '2px 6px', borderRadius: '999px', background: '#F2F4F7', fontSize: '9px' }}>للمالك فقط</span></div><p style={{ margin: '5px 0 0', color: '#98A2B3', fontSize: '10px', lineHeight: 1.55 }}>إدارة الموظفين وإعدادات المطعم والتكاملات تبقى محمية ولا يمكن منحها من هنا.</p></div>
}

function PermissionChips({ items, muted = false }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>{items.map(item => <span key={item} style={{ padding: '3px 6px', borderRadius: '999px', background: muted ? '#F2F4F7' : '#FFF0EB', color: muted ? '#667085' : '#9A3412', fontSize: '10px', fontWeight: '800' }}>{item}</span>)}</div>
}

function PasswordStrength({ strength }) {
  const colors = ['#EAECF0', '#D92D20', '#F79009', '#12B76A']
  return <div style={{ marginTop: '9px' }}><div style={{ display: 'flex', gap: '4px' }}>{[1, 2, 3].map(level => <span key={level} style={{ height: '4px', flex: 1, borderRadius: '99px', background: strength.level >= level ? colors[strength.level] : '#EAECF0' }} />)}</div><div style={{ marginTop: '5px', color: strength.level ? colors[strength.level] : '#98A2B3', fontSize: '11px', fontWeight: '800' }}>{strength.label}</div><div style={{ marginTop: '2px', color: '#98A2B3', fontSize: '10px' }}>استخدم 8 أحرف أو أكثر مع رقم ورمز لزيادة الحماية.</div></div>
}

function getPasswordStrength(password) {
  if (!password) return { level: 0, label: 'أدخل كلمة المرور' }
  const score = Number(password.length >= 8) + Number(/[A-Z]/.test(password)) + Number(/[a-z]/.test(password)) + Number(/\d/.test(password)) + Number(/[^A-Za-z0-9]/.test(password))
  if (score <= 2) return { level: 1, label: 'كلمة المرور ضعيفة' }
  if (score <= 3) return { level: 2, label: 'كلمة المرور متوسطة' }
  return { level: 3, label: 'كلمة المرور قوية' }
}

function SecurityInfo({ title, value, good = false }) {
  return <div style={{ padding: '12px', border: '1px solid #EAECF0', borderRadius: '11px', background: '#FCFCFD' }}><div style={{ color: '#98A2B3', fontSize: '10px', fontWeight: '900', marginBottom: '4px' }}>{title}</div><div style={{ color: good ? '#027A48' : '#475467', fontSize: '12px', lineHeight: 1.55, fontWeight: '800' }}>{value}</div></div>
}
