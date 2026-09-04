import { CartProvider } from '@/lib/cart/CartContext'

// Server Component — only wraps children in the client CartProvider boundary.
// Shared by /menu/[slug] and /menu/[slug]/checkout so the cart (browser-only
// state) survives client-side navigation between the two.
export default async function MenuSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <CartProvider slug={slug}>{children}</CartProvider>
}
