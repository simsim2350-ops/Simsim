// ============================================================================
// buildSeedSQL — يحوّل Manifest القدرات إلى SQL بذر idempotent (ADR-40 · M2)
// ============================================================================
// دالة نقيّة (بلا شبكة/DB) — تُختبَر بلا بيئة، وتُنتج SQL يُطبَّق عبر موصّل Supabase.
// يضمن أن البذر مشتقّ من مصدر الحقيقة الوحيد (features.manifest.js) بلا انحراف يدوي.
// كل العبارات UPSERT (on conflict) — التنفيذ المتكرّر آمن ولا يفقد بيانات تشغيلية.

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const jsonb = (v) => (v === undefined || v === null ? 'null' : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`)
const arr = (v) => (!v || v.length === 0 ? `'{}'::text[]` : `array[${v.map(q).join(',')}]::text[]`)
const catId = (key) => (key ? `(select id from public.feature_categories where key = ${q(key)})` : 'null')

export function buildSeedSQL(manifest) {
  const { CATEGORIES = [], CAPABILITIES = [], DEPENDENCIES = [] } = manifest
  const out = []
  out.push('-- ==== بذر كتالوج القدرات (مُولَّد من features.manifest.js — لا يُحرَّر يدوياً) ====')

  // 1) الفئات
  for (const c of CATEGORIES) {
    out.push(
      `insert into public.feature_categories(key,name,name_en,icon,sort_order) values (` +
        `${q(c.key)},${q(c.name)},${q(c.name_en)},${q(c.icon)},${c.sort_order ?? 0})` +
        ` on conflict(key) do update set name=excluded.name,name_en=excluded.name_en,` +
        `icon=excluded.icon,sort_order=excluded.sort_order,updated_at=now();`,
    )
  }

  // 2) القدرات (صفّ لكل قدرة — الآباء أولاً حسب ترتيب الـManifest؛ يحترم FK الذاتي)
  for (const f of CAPABILITIES) {
    const isFeature = f.type === 'feature'
    const enabledGlobal = isFeature ? (f.default_enabled ? 'true' : 'false') : 'false'
    const defaultValue = isFeature ? 'null' : jsonb(f.default_value)
    out.push(
      `insert into public.feature_flags(` +
        `key,name,description,type,scope,kind,module,parent_key,category_id,` +
        `lifecycle_status,runtime_status,sort_order,icon,enabled_global,` +
        `default_value,allowed_values,metric,unit,upgrade_message,tags,required_permissions,` +
        `is_public,public_label) values (` +
        `${q(f.key)},${q(f.name)},${q(f.description)},${q(f.type)},${q(f.scope || 'restaurant')},` +
        `${q(f.kind)},${q(f.module)},${q(f.parent)},${catId(f.category)},` +
        `${q(f.lifecycle_status || 'active')},${q(f.runtime_status || 'enabled')},${f.sort_order ?? 0},` +
        `${q(f.icon)},${enabledGlobal},${defaultValue},${jsonb(f.allowed_values)},` +
        `${q(f.metric)},${q(f.unit)},${q(f.upgrade_message)},${arr(f.tags)},${arr(f.required_permissions)},` +
        `${f.is_public ? 'true' : 'false'},${q(f.public_label)})` +
        ` on conflict(key) do update set name=excluded.name,description=excluded.description,` +
        `type=excluded.type,scope=excluded.scope,kind=excluded.kind,module=excluded.module,` +
        `parent_key=excluded.parent_key,category_id=excluded.category_id,` +
        `lifecycle_status=excluded.lifecycle_status,runtime_status=excluded.runtime_status,` +
        `sort_order=excluded.sort_order,icon=excluded.icon,enabled_global=excluded.enabled_global,` +
        `default_value=excluded.default_value,allowed_values=excluded.allowed_values,` +
        `metric=excluded.metric,unit=excluded.unit,upgrade_message=excluded.upgrade_message,` +
        `tags=excluded.tags,required_permissions=excluded.required_permissions,` +
        `is_public=excluded.is_public,public_label=excluded.public_label,updated_at=now();`,
    )
  }

  // 3) التبعيات
  for (const d of DEPENDENCIES) {
    out.push(
      `insert into public.feature_dependencies(feature_key,depends_on_key,dependency_type) values (` +
        `${q(d.feature)},${q(d.depends_on)},${q(d.type || 'required')})` +
        ` on conflict(feature_key,depends_on_key,dependency_type) do nothing;`,
    )
  }

  return out.join('\n')
}

export default buildSeedSQL
