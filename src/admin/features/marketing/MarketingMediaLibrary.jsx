import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { BORDER, MUTED } from '../../theme'
import Button from '../../components/ui/Button'
import { deleteMarketingMedia, listMarketingMedia, updateMarketingMedia, uploadMarketingMedia } from './marketingApi'

function publicUrl(asset) {
  return asset.metadata?.publicUrl || `${import.meta.env.VITE_SUPABASE_URL || ''}/storage/v1/object/public/${asset.bucket}/${asset.objectPath || asset.object_path}`
}

export default function MarketingMediaLibrary({ locale }) {
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const load = async (term = query) => { setLoading(true); try { setItems(await listMarketingMedia(term)) } catch (error) { toast.error(error?.message || 'تعذر تحميل الوسائط') } finally { setLoading(false) } }
  useEffect(() => { load('') }, [])
  const upload = async (event) => {
    const file = event.target.files?.[0]; if (!file) return
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) { toast.error('اختر صورة حتى 10 MB'); return }
    setBusy(true)
    try { const asset = await uploadMarketingMedia(file); setItems((current) => [asset, ...current]); setSelected(asset); toast.success('رُفعت الصورة. أضف النص البديل قبل استخدامها.') } catch (error) { toast.error(error?.message || 'فشل رفع الصورة') } finally { setBusy(false); event.target.value = '' }
  }
  const save = async () => {
    if (!selected) return
    setBusy(true)
    try { await updateMarketingMedia(selected.id, { ...(selected.altText || selected.alt_text || {}), [locale]: selected._alt || (selected.altText || selected.alt_text || {})[locale] || '' }, { ...(selected.caption || {}), [locale]: selected._caption || (selected.caption || {})[locale] || '' }, selected.metadata || {}); toast.success('حُفظت بيانات الوسيط'); await load(); } catch (error) { toast.error(error?.message || 'فشل حفظ بيانات الوسيط') } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!selected || !window.confirm('حذف سجل الوسيط؟ احذف الملف من التخزين كذلك يدويًا إن لزم.')) return
    setBusy(true)
    try { await deleteMarketingMedia(selected.id); setItems((current) => current.filter((item) => item.id !== selected.id)); setSelected(null); toast.success('حُذف سجل الوسيط') } catch (error) { toast.error(error?.message || 'فشل الحذف') } finally { setBusy(false) }
  }
  const copy = async (asset) => { const url = publicUrl(asset); if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url); else window.prompt('انسخ الرابط', url); toast.success('نُسخ رابط الصورة') }
  return <section style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(0,1fr) minmax(280px,.38fr)' : '1fr', gap: 15 }}><div style={{ background: '#12141C', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 15 }}><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><strong style={{ color: 'white' }}>مكتبة الوسائط</strong><input className="admin-input" value={query} placeholder="ابحث باسم الملف…" onChange={(event) => setQuery(event.target.value)} style={{ width: 210, marginRight: 'auto' }} /><Button variant="neutral" onClick={() => load()}>بحث</Button><label style={{ color: '#FFB27F', fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}><input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml" onChange={upload} disabled={busy} style={{ display: 'none' }} />+ ارفع صورة</label></div>{loading ? <p style={{ color: MUTED }}>جارٍ التحميل…</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(118px,1fr))', gap: 10, marginTop: 13 }}>{items.map((asset) => <button type="button" key={asset.id} onClick={() => setSelected({ ...asset, _alt: (asset.altText || asset.alt_text || {})[locale] || '', _caption: (asset.caption || {})[locale] || '' })} style={{ textAlign: 'right', overflow: 'hidden', padding: 0, background: '#0D0F15', border: `1px solid ${selected?.id === asset.id ? '#FF6A00' : BORDER}`, borderRadius: 10, cursor: 'pointer' }}><img src={publicUrl(asset)} alt="" style={{ width: '100%', aspectRatio: '1 / .72', objectFit: 'cover', display: 'block' }} /><span style={{ display: 'block', padding: 7, color: '#D1D5DB', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.objectPath || asset.object_path}</span></button>)}</div>}</div>{selected && <aside style={{ background: '#12141C', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 15 }}><img src={publicUrl(selected)} alt="" style={{ width: '100%', borderRadius: 9, maxHeight: 190, objectFit: 'cover' }} /><p style={{ color: MUTED, fontSize: 11, wordBreak: 'break-all' }}>{selected.objectPath || selected.object_path}</p><label style={{ display: 'block', color: '#D1D5DB', fontSize: 12 }}>النص البديل ({locale})<input className="admin-input" value={selected._alt || ''} onChange={(event) => setSelected({ ...selected, _alt: event.target.value })} style={{ width: '100%', marginTop: 5 }} /></label><label style={{ display: 'block', color: '#D1D5DB', fontSize: 12, marginTop: 10 }}>التعليق ({locale})<textarea className="admin-textarea" value={selected._caption || ''} onChange={(event) => setSelected({ ...selected, _caption: event.target.value })} style={{ width: '100%', marginTop: 5, minHeight: 70 }} /></label><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}><Button variant="neutral" disabled={busy} onClick={() => copy(selected)}>نسخ الرابط</Button><Button variant="primary" disabled={busy} onClick={save}>حفظ البيانات</Button><button type="button" disabled={busy} onClick={remove} style={{ color: '#F87171', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '0 10px' }}>حذف السجل</button></div></aside>}</section>
}
