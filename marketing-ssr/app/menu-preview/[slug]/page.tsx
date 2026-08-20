import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getMenu } from '@/lib/menu-repository'
import MenuFrame from '@/components/menu/MenuFrame'
import MenuHeaderServer from '@/components/menu/MenuHeaderServer'
import MenuBodyServer from '@/components/menu/MenuBodyServer'
import MenuBrandingServer from '@/components/menu/MenuBrandingServer'
import type { MenuLayout } from '@/lib/menu-types'

// ISR (Phase 1، البند 8): يُقرأ المنيو كثيراً ويتغيّر نادراً؛ إعادة توليد كل 5 دقائق + tags للإبطال الدقيق.
export const revalidate = 300

type PageParams = { slug: string }
type PageSearch = { branch?: string; table?: string }

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { slug } = await params
  const data = await getMenu(slug, null)
  if (!data) return {}
  const { restaurant } = data
  return {
    title: restaurant.name,
    description: restaurant.description || undefined,
    openGraph: {
      title: restaurant.name,
      description: restaurant.description || undefined,
      images: restaurant.cover_url ? [{ url: restaurant.cover_url }] : undefined,
    },
  }
}

export default async function MenuPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>
  searchParams: Promise<PageSearch>
}) {
  const { slug } = await params
  const sp = await searchParams
  // البند 14: دعم ?branch= و?table= بلا تغيير بنية الرابط. توثيق رمز الطاولة (RPC) مؤجَّل (Phase لاحقة).
  const branchId = firstParam(sp.branch)

  const data = await getMenu(slug, branchId)
  if (!data) notFound()

  const { restaurant, branch, categories, products, manualBestSellers, featuredProducts, branding } = data
  const brandColor = restaurant.brand_color || '#FF6A00'
  const priceColor = restaurant.price_color || brandColor
  const descColor = restaurant.description_color || '#9CA3AF'
  const layout = (restaurant.menu_layout || 'list') as MenuLayout

  return (
    <MenuFrame>
      <MenuHeaderServer restaurant={restaurant} branch={branch} />
      <MenuBodyServer
        categories={categories}
        products={products}
        manualBestSellers={manualBestSellers}
        featuredProducts={featuredProducts}
        brandColor={brandColor}
        priceColor={priceColor}
        descColor={descColor}
        layout={layout}
      />
      <MenuBrandingServer branding={branding} />
    </MenuFrame>
  )
}
