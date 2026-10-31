import { useCallback, useMemo, useState } from 'react'
import type { CatalogueItem } from '@office/shared'
import Stage from './Stage'
import { LayoutModel, PartModel } from './models'
import { BUILD, ITEMS, LAYOUT, cropOf, formatM, formatMm, itemsOf, pictureOf, type Tab } from './data'
import './gallery.css'

/**
 * Catalogue gallery (`?mode=catalogue`): kit parts and composite layouts on the look-dev stage,
 * reference items as their board crops. `&tab=` and `&item=` select what is shown, so a view can
 * be linked or screenshotted.
 */

const TABS: { id: Tab; label: string }[] = [
  { id: 'parts', label: 'Parts' },
  { id: 'layouts', label: 'Layouts' },
  { id: 'reference', label: 'Reference' },
]

function readUrl(): { tab: Tab; item: string | null } {
  const params = new URLSearchParams(window.location.search)
  const item = params.get('item')
  const fromItem = item ? ITEMS.get(item)?.kind : undefined
  const tab = (params.get('tab') as Tab | null) ?? (fromItem === 'composite' ? 'layouts' : fromItem === 'reference' ? 'reference' : 'parts')
  return { tab: TABS.some((t) => t.id === tab) ? tab : 'parts', item }
}

function writeUrl(tab: Tab, item: string | null) {
  const url = new URL(window.location.href)
  url.searchParams.set('tab', tab)
  if (item) url.searchParams.set('item', item)
  else url.searchParams.delete('item')
  window.history.replaceState({}, '', url.toString())
}

export default function CatalogueGallery() {
  const initial = useMemo(readUrl, [])
  const [tab, setTab] = useState<Tab>(initial.tab)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(initial.item ?? itemsOf(initial.tab)[0]?.id ?? null)

  const all = useMemo(() => itemsOf(tab), [tab])
  const categories = useMemo(() => [...new Set(all.map((i) => i.category))], [all])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((i) => (!category || i.category === category) && (!q || i.name.toLowerCase().includes(q) || i.id.includes(q)))
  }, [all, category, query])

  const select = (id: string | null, nextTab = tab) => {
    setSelected(id)
    writeUrl(nextTab, id)
  }
  const switchTab = (next: Tab) => {
    setTab(next)
    setCategory(null)
    select(itemsOf(next)[0]?.id ?? null, next)
  }

  const item = selected ? ITEMS.get(selected) ?? null : null
  return (
    <div className="cg">
      <aside className="cg-side">
        <header className="cg-head">
          <h1>Office kit catalogue</h1>
          <nav className="cg-tabs" aria-label="Catalogue sections">
            {TABS.map((t) => (
              <button key={t.id} className={t.id === tab ? 'on' : ''} onClick={() => switchTab(t.id)}>
                {t.label} <span>{itemsOf(t.id).length}</span>
              </button>
            ))}
          </nav>
          <input className="cg-search" type="search" placeholder="Search names and ids" value={query}
            onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
          <div className="cg-chips">
            <button className={category === null ? 'on' : ''} onClick={() => setCategory(null)}>All</button>
            {categories.map((c) => (
              <button key={c} className={category === c ? 'on' : ''} onClick={() => setCategory(c)}>{c}</button>
            ))}
          </div>
        </header>
        <ul className="cg-list">
          {shown.map((i) => <ListRow key={i.id} item={i} active={i.id === selected} onSelect={() => select(i.id)} />)}
          {shown.length === 0 && <li className="cg-empty">Nothing matches.</li>}
        </ul>
      </aside>
      <main className="cg-main">{item ? <Detail item={item} /> : <p className="cg-empty">Pick an item.</p>}</main>
    </div>
  )
}

function ListRow({ item, active, onSelect }: { item: CatalogueItem; active: boolean; onSelect: () => void }) {
  const picture = pictureOf(item)
  const build = BUILD.get(item.id)
  return (
    <li>
      <button className={active ? 'cg-row on' : 'cg-row'} onClick={onSelect}>
        {picture ? <img src={picture} alt="" loading="lazy" /> : <span className="cg-noimg" />}
        <span className="cg-row-text">
          <span className="cg-row-name">{item.name}</span>
          <span className="cg-row-id">{item.id}</span>
        </span>
        {build && <span className={`cg-badge qa-${build.qa}`}>{build.qa}</span>}
      </button>
    </li>
  )
}

function Detail({ item }: { item: CatalogueItem }) {
  const [turns, setTurns] = useState(0)
  const [pxPerM, setPxPerM] = useState(0)
  const onZoom = useCallback((z: number) => setPxPerM(z), [])
  const build = BUILD.get(item.id)
  const layout = LAYOUT.get(item.id)
  const crop = cropOf(item)
  const in3d = build || layout
  const rotationY = (turns * Math.PI) / 2

  return (
    <div className="cg-detail">
      <section className="cg-stage">
        {in3d ? (
          <>
            <Stage contentKey={`${item.id}:${turns}`} onZoom={onZoom}>
              {build && <PartModel id={item.id} rotationY={rotationY} />}
              {layout && <group rotation={[0, rotationY, 0]}><LayoutModel layout={layout} /></group>}
            </Stage>
            <div className="cg-tools">
              <button onClick={() => setTurns((t) => (t + 1) % 4)}>Turn 90°</button>
              {pxPerM > 0 && <ScaleBar pxPerM={pxPerM} />}
            </div>
          </>
        ) : crop ? (
          <img className="cg-crop-large" src={crop} alt={`${item.name} on the reference board`} />
        ) : (
          <p className="cg-empty">No picture.</p>
        )}
      </section>
      <section className="cg-info">
        <p className="cg-eyebrow">{item.category} · {item.kind}{item.family ? ` · ${item.family}` : ''}</p>
        <h2>{item.name}</h2>
        {item.subtitle && <p className="cg-sub">{item.subtitle}</p>}
        <dl className="cg-facts">
          <dt>Id</dt><dd><code>{item.id}</code></dd>
          <dt>Board size</dt>
          <dd>{formatMm(item.dimsMm) ?? 'not printed'}{item.dimsOrigin === 'correction' && <em> (hand-corrected)</em>}</dd>
          {build && <><dt>Built size</dt><dd>{formatM(build.measuredM)}</dd></>}
          {build && <><dt>Triangles</dt><dd>{build.tris.toLocaleString()} · {Math.round(build.bytes / 1024)} KB</dd></>}
          {build && <><dt>Review</dt><dd>{build.review}{build.reviewNote && ` — ${build.reviewNote}`}</dd></>}
          {layout && <><dt>Footprint</dt><dd>{layout.footprint.w} x {layout.footprint.d} m · {layout.parts.length} parts</dd></>}
        </dl>
        {build && (
          <ul className="cg-checks">
            {build.checks.map((c) => (
              <li key={c.name} className={`qa-${c.status}`}><b>{c.name}</b> {c.status}<span>{c.detail}</span></li>
            ))}
          </ul>
        )}
        {layout && <LayoutNotes layoutId={layout.id} />}
        {crop && in3d && (
          <figure className="cg-ref">
            <img src={crop} alt="" />
            <figcaption>On the board: {item.sources[0].board.replace(/\.png$/, '')}</figcaption>
          </figure>
        )}
      </section>
    </div>
  )
}

function LayoutNotes({ layoutId }: { layoutId: string }) {
  const layout = LAYOUT.get(layoutId)
  if (!layout) return null
  const counts = new Map<string, number>()
  for (const p of layout.parts) counts.set(p.part, (counts.get(p.part) ?? 0) + 1)
  return (
    <>
      {layout.note && <p className="cg-note">{layout.note}</p>}
      <h3>Parts</h3>
      <ul className="cg-parts">
        {[...counts].map(([id, n]) => <li key={id}>{ITEMS.get(id)?.name ?? id}{n > 1 && <span> × {n}</span>}</li>)}
      </ul>
      {layout.pending.length > 0 && (
        <>
          <h3>Not built yet</h3>
          <ul className="cg-parts pending">
            {layout.pending.map((id) => <li key={id}>{ITEMS.get(id)?.name ?? id}</li>)}
          </ul>
        </>
      )}
    </>
  )
}

/** Scale of the picture plane (orthographic zoom is pixels per metre); receding axes are shorter. */
function ScaleBar({ pxPerM }: { pxPerM: number }) {
  const metres = pxPerM > 240 ? 0.25 : pxPerM > 120 ? 0.5 : 1
  return (
    <span className="cg-scale" title="Length in the picture plane; depth axes appear shorter">
      <i style={{ width: metres * pxPerM }} />{metres} m
    </span>
  )
}
