# خطة أتمتة E2E لـ Super Admin Marketing CMS على Staging

**النطاق:** واجهة Super Admin وموقع Marketing SSR في Staging فقط.  
**الهدف:** إثبات رحلة المستخدم الإدارية الحقيقية، لا مجرد صحة RPC أو build.  
**حالة التنفيذ الحالية:** التصميم جاهز؛ يبدأ التنفيذ فقط بعد توفر رابطَي Staging وحساب اختبار Super Admin مستقل ومتغيرات CI السرية.

> لا تستخدم service-role أو JWT مصنوعًا يدويًا أو استدعاء RPC مباشرًا بدل تسجيل الدخول. هذه وسائل مفيدة لتحضير البيانات أو تشخيصها، لكنها لا تثبت أن المستخدم الحقيقي يستطيع تشغيل الواجهة.

## القرار المقترح

يوصى باعتماد **Playwright** كإطار E2E الأساسي. المشروع Vite/React ولا يحتوي إطار E2E قائمًا، وPlaywright مناسب لاختبار واجهة الإدارة وموقع SSR في رحلة واحدة، مع عزل browser contexts وإعادة استخدام جلسة مصادق عليها عبر `storageState` وآثار تشخيصية قابلة للتحليل عند الفشل.[1]

| النهج | ملاءمة Simsim | المقايضات | التكلفة | تعقيد الإعداد |
|---|---|---|---:|---:|
| **Playwright — موصى به** | اختبار UI وNetwork ورفع ملف ومعاينة ونشر ثم موقع SSR، مع trace/video/screenshots | يحتاج إضافة اعتماديات ومتغيرات سرية وحساب Staging | لا تكلفة أداة مباشرة | متوسط |
| **Cypress** | بديل جيد إن كان الفريق يستخدمه بالفعل ويريد واجهة تفاعلية محلية | يحتاج بنية مماثلة لإدارة session والبيانات؛ أقل ملاءمة قليلًا لاختبار موقعين مستقلين في رحلة واحدة | لا تكلفة أداة مباشرة | متوسط |
| **اختبار يدوي موثق فقط** | مناسب كخطوة أولى أو اختبار قبول قليل التكرار | لا يمنع الانحدار ولا يلتقط تكراريًا مشكلة fallback/الـcache | منخفض | منخفض |

لا يوصى بتشغيل هذه الاختبارات عبر جدولة عامة أو حسابات إنتاج. هي اختبارات حتمية يجب تشغيلها عند فتح PR، أو نشر Preview/Staging، أو ليلًا على بيئة Stage مخصصة؛ لا تحتاج حكمًا ذكائيًا أو عملية دائمة.

## 1. متطلبات البيئة الآمنة

ينبغي فصل واجهة الإدارة وMarketing SSR مرحليًا من البداية. لا يبدأ الاختبار إذا كانت أي قيمة تشير إلى الإنتاج أو كانت النافذة غير مهيأة. يوضع كل secret في منصة CI فقط ولا يسجل في trace أو artifacts.

| متغير CI | الغرض | شرط الحماية |
|---|---|---|
| `E2E_ADMIN_BASE_URL` | عنوان Super Admin Staging/Preview | يجب أن يكون عنوان Staging؛ يرفض الاختبار `simsim.sa` وأي عنوان Production معروف |
| `E2E_MARKETING_BASE_URL` | عنوان Marketing SSR Staging | يجب أن يكون مختلفًا عن Production أو يحمل نطاق Stage واضحًا |
| `E2E_SUPER_ADMIN_EMAIL` | بريد حساب E2E المنفصل | secret؛ لا يظهر في التقرير |
| `E2E_SUPER_ADMIN_PASSWORD` | كلمة مرور حساب E2E | secret؛ لا يكتب في log أو `storageState` محفوظ |
| `E2E_EXPECTED_SUPABASE_HOST` | `rgqsetckcigkgsyobyjg.supabase.co` | قيمة غير حساسة؛ تستخدم كحاجز لمنع الاختبار على إنتاج |
| `E2E_REVALIDATE_WAIT_MS` | مهلة تحقق موجّهة معقولة | قيمة اختيارية، مثل 5–15 ثانية حسب النشر المرحلي |

قبل تنفيذ أي scenario، يقرأ الاختبار Network logs ويؤكد أن طلبات Supabase تتجه إلى `rgqsetckcigkgsyobyjg.supabase.co`. أي طلب إلى `gpwwnuuicywsvmmhxngs.supabase.co` أو ظهور شاشة «إعداد Supabase غير مكتمل» ينتج **FAIL**، لا SKIP.

## 2. حساب الاختبار والبيانات

ينشأ حساب مستقل مثل `cms-e2e-staging@…` في Supabase Staging فقط، ويمنح الدور عبر `platform_admins.role_id → platform_roles.name = 'super_admin'`. لا تضاف كلمة مرور الحساب إلى الكود أو ملفات `.env` الملتزمة.

يجب أن تكون بيانات الاختبار قابلة للعزل والتعقب. الخيار المفضل هو slug خاص بكل تشغيل مثل `e2e-cms-${CI_RUN_ID}`، وعنوان صفحة يحمل البادئة `[E2E]`. بذلك لا تعدل الاختبارات `home` أو المحتوى التجاري. تحفظ نتيجة كل تشغيل المعرفات التي أنشأتها، ثم تنظفها في `afterAll` باستدعاء UI للحذف أو الأرشفة، لا عبر service-role. إذا فشل التنظيف، يبلغ الاختبار عن المعرّفات كي تزال يدويًا من Staging.

| الأصل | أسلوبه | ملاحظة |
|---|---|---|
| صفحة اختبار | إنشاء من UI باسم slug فريد | لا يغير Home أو صفحات قانونية |
| قسم اختبار | HERO وFAQ أو TESTIMONIALS بعلامة `[E2E]` | يكفي اختبار Typed editor والترتيب والإخفاء |
| إعدادات عامة | تفضيل namespace اختبار أو تشغيل منفصل محكوم | لا ينشر تغيير الهوية العامة إلا في نافذة اختبار متفق عليها |
| ملف وسائط | PNG صغير محفوظ في `tests/fixtures/e2e-image.png` | يرفع عبر UI ويزال بعد التحقق |
| إصدارات | A ثم B ثم Restore A | تحقق visual + public content marker |

## 3. بنية Playwright المقترحة

```text
playwright.config.ts
tests/
  auth.setup.ts
  helpers/
    staging-guard.ts
    console-and-network.ts
    marketing.ts
  fixtures/
    e2e-image.png
  marketing/
    settings.spec.ts
    media.spec.ts
    pages.spec.ts
    sections.spec.ts
    revision-restore.spec.ts
    full-acceptance.spec.ts
playwright/.auth/                 # في .gitignore، لا يرفع إلى Git
playwright-report/                # artifact عند الفشل
```

### إعداد `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  fullyParallel: false, // CMS يغير محتوى مشتركًا؛ يمنع race conditions.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.E2E_ADMIN_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/super-admin.json' },
      dependencies: ['setup'],
    },
  ],
})
```

يبقي `fullyParallel: false` اختبارات CMS متسلسلة لأن النشر والإعدادات وإبطال الكاش تشترك في حالة عامة. يوفر Playwright trace وصورة وفيديو عند الفشل لتحديد error Console أو طلب REST الذي أخفق.[2]

### بوابة Staging قبل المصادقة

```ts
import { expect, test } from '@playwright/test'

export async function assertStaging(page) {
  const admin = new URL(process.env.E2E_ADMIN_BASE_URL!)
  const publicSite = new URL(process.env.E2E_MARKETING_BASE_URL!)

  expect(admin.hostname).not.toContain('simsim.sa')
  expect(publicSite.hostname).not.toContain('simsim.sa')

  const badRequests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('supabase.co') && !url.includes(process.env.E2E_EXPECTED_SUPABASE_HOST!)) {
      badRequests.push(url)
    }
  })

  await page.goto('/admin/login')
  await expect(page.getByRole('heading', { name: /إعداد Supabase غير مكتمل/i })).toHaveCount(0)
  expect(badRequests, `Supabase host drift: ${badRequests.join(', ')}`).toEqual([])
}
```

في التنفيذ الفعلي، يحتفظ helper بقائمة أخطاء console ذات `error` وأخطاء network لاستبعاد تحذيرات React Router المعروفة فقط. أي `PGRST`, `admin_.* not found`, `pa.role`, أو استجابة CMS غير ناجحة تعتبر فشلًا فوريًا.

### إعداد الجلسة بالـUI

```ts
import { test as setup, expect } from '@playwright/test'
import { assertStaging } from './helpers/staging-guard'

setup('authenticate the staging Super Admin through the UI', async ({ page }) => {
  await assertStaging(page)
  await page.getByLabel('البريد الإلكتروني').fill(process.env.E2E_SUPER_ADMIN_EMAIL!)
  await page.getByLabel('كلمة المرور').fill(process.env.E2E_SUPER_ADMIN_PASSWORD!)
  await page.getByRole('button', { name: /دخول لوحة المنصّة/i }).click()
  await expect(page).toHaveURL(/\/admin(?:$|\/)/)
  await page.context().storageState({ path: 'playwright/.auth/super-admin.json' })
})
```

ملف `storageState` حساس لأنه يحمل session cookies أو local storage؛ لا يرفع إلى Git ولا ينشر كـartifact. توصي وثائق Playwright بحمايته مثل كلمة المرور.[1]

## 4. Selectors قابلة للصيانة

تضاف `data-testid` إلى عناصر Marketing CMS الحرجة بدل الاعتماد على CSS أو ترتيب العناصر. لا تعد هذه الاختبارات ثابتة إذا كانت تعتمد على نصوص عامة أو DOM متغير.

| المنطقة | أمثلة test IDs |
|---|---|
| التبويبات | `marketing-tab-pages`, `marketing-tab-settings`, `marketing-tab-media` |
| الصفحات | `marketing-create-page`, `marketing-page-row-${slug}`, `marketing-save-draft`, `marketing-preview`, `marketing-publish` |
| الأقسام | `section-add`, `section-${id}`, `section-move-up`, `section-visibility`, `section-delete` |
| الإصدارات | `revision-row-${id}`, `revision-restore-${id}` |
| الإعدادات | `settings-save-draft`, `settings-publish` |
| الوسائط | `media-upload-input`, `media-row-${id}`, `media-save`, `media-delete` |
| الحالة | `marketing-operation-status`, `publish-confirm-dialog` |

يجب أن تتضمن كل عملية حالة `saving`, `saved`, أو `error` قابلة للقراءة آليًا. لا ينتظر الاختبار مهلة ثابتة وحسب؛ ينتظر استجابة mutation وحالة النجاح المرئية ثم يتحقق من نتيجة الموقع العام.

## 5. السيناريوهات الإلزامية

| الملف | الرحلة | دليل النجاح |
|---|---|---|
| `settings.spec.ts` | Open → Edit → Save Draft → Publish | نسخة Settings منشورة، Network بلا خطأ، والتغيير محدود للـfixture |
| `media.spec.ts` | Open → Upload → Register → Edit alt/caption → Delete | ملف يظهر في المكتبة برابط صحيح ثم يحذف السجل والملف وفق السياسة |
| `pages.spec.ts` | Create → Edit → Save Draft → Preview → Publish | preview يظهر marker للمسودة؛ الموقع العام يظهر marker المنشور بعد revalidation |
| `sections.spec.ts` | Add → Edit → Reorder → Hide → Show → Publish | ترتيب renderer يطابق UI؛ القسم المخفي غير ظاهر؛ القسم المعاد إظهاره ظاهر بعد النشر |
| `revision-restore.spec.ts` | Publish A → Publish B → Restore A → Publish | الموقع العام يعرض marker A بعد rollback، لا marker B |
| `full-acceptance.spec.ts` | Login → Marketing → Draft → Preview → Publish → Revalidate → Public → Restore | ملف trace/screenshot/Network يثبت الرحلة كاملة بلا error CMS |

### مثال تحقق النشر وإبطال الكاش

```ts
await page.getByTestId('marketing-publish').click()
await page.getByTestId('publish-confirm-dialog').getByRole('button', { name: /نشر/i }).click()
await expect(page.getByTestId('marketing-operation-status')).toHaveText(/تم النشر|published/i)

await expect.poll(async () => {
  const response = await page.request.get(
    `${process.env.E2E_MARKETING_BASE_URL}/en/${slug}`,
  )
  return await response.text()
}, { timeout: Number(process.env.E2E_REVALIDATE_WAIT_MS || 15000) }).toContain('[E2E] Published B')
```

التحقق العام يقرأ محتوى الموقع المنشور فعلًا؛ لا يكتفي بتحقق حالة زر النشر أو الاستجابة الداخلية.

## 6. Cypress كبديل

يمكن تطبيق الخطة ذاتها بـCypress، مع `cy.session()` لتخزين الجلسة وإعادة استخدامها، و`cy.intercept()` لمراقبة طلبات Supabase وإبطال الكاش.[3] ينصح به فقط إذا كان الفريق لديه خبرة وتشغيل CI قائم عليه. يجب أن تبقى حماية Staging، الحساب المنفصل، بيانات fixture، تسلسل الاختبارات، ومعيار فشل Console/API كما هي.

```js
Cypress.Commands.add('loginAsSuperAdmin', () => {
  cy.session('staging-super-admin', () => {
    cy.visit('/admin/login')
    cy.findByLabelText('البريد الإلكتروني').type(Cypress.env('E2E_SUPER_ADMIN_EMAIL'), { log: false })
    cy.findByLabelText('كلمة المرور').type(Cypress.env('E2E_SUPER_ADMIN_PASSWORD'), { log: false })
    cy.contains('button', 'دخول لوحة المنصّة').click()
    cy.url().should('match', /\/admin/)
  })
})
```

## 7. تشغيل CI المقترح

تشغل اختبارات PR على Preview/Staging فقط بعد نجاح build ونشر عنوان Preview قابل للوصول. لا تشغل على `main` إذا كان ذلك يعني بيئة Production. يفضل تشغيل smoke سريع في كل PR، وتشغيل رحلة الإصدارات والرفع الكاملة ليلًا أو قبل إصدار مرحلي، لأن تشغيلها متسلسل ويتعامل مع بيانات قابلة للتغيير.

| مستوى التشغيل | محتوى الاختبار | بوابة النجاح |
|---|---|---|
| PR smoke | login، فتح Marketing، Settings read، Media list، إنشاء صفحة fixture وحذفها | لا error Console/API، وكل request إلى Staging |
| Staging acceptance | السيناريوهات الستة كلها | PASS فقط إذا تحقق العرض العام والاستعادة |
| Nightly Staging | acceptance + تنظيف fixtures + التقرير | failure يرفع trace/video/screenshot دون أسرار |

## 8. معايير PASS / FAIL / BLOCKED

| الحالة | التعريف |
|---|---|
| PASS | جلسة Super Admin حقيقية، كل خطوة UI مكتملة، network/console نظيفان من أخطاء Marketing، الموقع العام يعرض المحتوى الصحيح بعد النشر ثم الاستعادة |
| FAIL | أي `PGRST` أو RPC مفقود أو `pa.role` أو طلب Supabase إلى الإنتاج أو فشل معاينة/نشر/revalidation/rollback |
| BLOCKED | لا يوجد حساب E2E أو رابط Staging أو secrets CI أو نشر مرحلي قابل للوصول؛ لا يتحول إلى PASS باختبار RPC أو build |

## 9. خطوات البداية العملية

1. أنشئ حساب E2E منفصلًا في Staging وامنحه `super_admin` عبر `role_id`، ثم خزّن بريده وكلمة مروره كأسرار CI.
2. اضبط Vercel Staging/Preview إلى مشروع Supabase `rgqsetckcigkgsyobyjg` وموقع Marketing SSR المرحلي، ثم انشر رابطًا قابلًا للوصول من CI.
3. أضف Playwright، scripts مثل `test:e2e:smoke` و`test:e2e:staging`، و`data-testid` المطلوبة.
4. نفذ smoke أولًا؛ إذا مر، أضف السيناريوهات الستة ببيانات fixture فريدة وتشغيل متسلسل.
5. اجعل artifact الفشل يتضمن HTML report وscreenshot/video/trace منقحة من الأسرار، ثم لا تعلن Phase 2 PASS إلا بعد رحلة `full-acceptance.spec.ts` الناجحة.

## References

[1]: https://playwright.dev/docs/auth "Playwright — Authentication"
[2]: https://playwright.dev/docs/trace-viewer "Playwright — Trace viewer"
[3]: https://docs.cypress.io/app/core-concepts/writing-and-organizing-tests "Cypress — Writing and organizing tests"
