import { LAYOUTS, type BuildItem, type CatalogueItem, type Layout } from '@office/shared'
import { BUILDS, CATALOGUE } from '@office/shared/catalogue'

/** Lookups over the generated catalogue, builds and layouts for the gallery. */

export type Tab = 'parts' | 'layouts' | 'reference'

export const TAB_KIND: Record<Tab, CatalogueItem['kind']> = { parts: 'part', layouts: 'composite', reference: 'reference' }

export const ITEMS: ReadonlyMap<string, CatalogueItem> = new Map(CATALOGUE.items.map((i) => [i.id, i]))
export const BUILD: ReadonlyMap<string, BuildItem> = new Map(BUILDS.items.map((b) => [b.id, b]))
export const LAYOUT: ReadonlyMap<string, Layout> = new Map(LAYOUTS.map((l) => [l.id, l]))

export const itemsOf = (tab: Tab) => CATALOGUE.items.filter((i) => i.kind === TAB_KIND[tab])

/** The first board crop of an item, if any source has one. */
export const cropOf = (item: CatalogueItem) => item.sources.find((s) => s.crop)?.crop ?? null

/** What the list shows as an item's picture: the build's render for parts, the board crop otherwise. */
export const pictureOf = (item: CatalogueItem) => BUILD.get(item.id)?.thumb.url ?? cropOf(item)

export const formatMm = (dims: CatalogueItem['dimsMm']) =>
  dims ? [dims.w, dims.d, dims.h].filter((v) => v !== null).join(' x ') + ' mm' : null

export const formatM = (m: { w: number; d: number; h: number }) =>
  `${Math.round(m.w * 1000)} x ${Math.round(m.d * 1000)} x ${Math.round(m.h * 1000)} mm`
