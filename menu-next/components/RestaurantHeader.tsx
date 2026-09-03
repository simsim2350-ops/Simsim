import Image from 'next/image'
import type { Restaurant, Branch, Lang } from '@/lib/types'
import { t } from '@/lib/i18n'

// Server Component — no interactivity, so no 'use client'.
export function RestaurantHeader({
  restaurant,
  branches,
  activeBranch,
  lang,
}: {
  restaurant: Restaurant
  branches: Branch[]
  activeBranch: Branch
  lang: Lang
}) {
  // restaurants has no name_en column in the current schema — only description is bilingual.
  const name = restaurant.name
  const description = lang === 'en' ? restaurant.description_en || restaurant.description : restaurant.description
  const brandColor = restaurant.brand_color || '#FF6A00'

  return (
    <header className="menu-header" style={{ borderColor: brandColor }}>
      <div className="menu-header__top">
        {restaurant.logo_url ? (
          <Image
            src={restaurant.logo_url}
            alt={name}
            width={64}
            height={64}
            className="menu-header__logo"
            priority
          />
        ) : (
          <div className="menu-header__logo menu-header__logo--placeholder" style={{ background: brandColor }} aria-hidden />
        )}
        <div>
          <h1 className="menu-header__name">{name}</h1>
          {description && <p className="menu-header__desc">{description}</p>}
        </div>
      </div>

      {branches.length > 1 && (
        <nav className="menu-header__branches" aria-label={t(lang).branches}>
          {branches.map((b) => {
            const label = lang === 'en' && b.name_en ? b.name_en : b.name
            const isActive = b.id === activeBranch.id
            return (
              <a
                key={b.id}
                href={`?branch=${b.id}${lang === 'en' ? '&lang=en' : ''}`}
                className={`menu-header__branch${isActive ? ' is-active' : ''}`}
                style={isActive ? { background: brandColor, borderColor: brandColor } : undefined}
              >
                {label}
              </a>
            )
          })}
        </nav>
      )}
    </header>
  )
}
