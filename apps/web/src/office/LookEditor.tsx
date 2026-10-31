import { useEffect, useRef } from 'react'
import { BODY_IDS, CLOTHING, HEIGHT_RANGE, LOOK_PRESETS, bodyOf, lookFromSeed, type AvatarLook, type BodyId } from '@office/shared'
import { useMe } from './me'
import { view } from './state'

/**
 * "Your look": name, a colleague to start from, then outfit, clothing colours and height. Changes show on
 * the avatar straight away and are kept in this browser (me.ts). The camera zooms in while it is open.
 */

const OUTFIT: Record<BodyId, string> = { casual: 'Blouse', suit: 'Blazer', suit_tie: 'Suit & tie' }

function Swatches<T extends string>({ label, values, value, onPick }: { label: string; values: readonly T[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="look-row" role="radiogroup" aria-label={label}>
      {values.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} aria-label={`${label} ${v}`}
          className={v === value ? 'look-swatch on' : 'look-swatch'} style={{ background: v }} onClick={() => onPick(v)} />
      ))}
    </div>
  )
}

function Chips<T extends string>({ label, values, value, names, onPick }: { label: string; values: readonly T[]; value: T; names: Record<T, string>; onPick: (v: T) => void }) {
  return (
    <div className="look-row" role="radiogroup" aria-label={label}>
      {values.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} className={v === value ? 'look-chip on' : 'look-chip'} onClick={() => onPick(v)}>
          {names[v]}
        </button>
      ))}
    </div>
  )
}

export default function LookEditor() {
  const { name, look, editing, setName, setLook, setEditing } = useMe()
  const zoomBefore = useRef(view.zoom)
  useEffect(() => {
    if (!editing) return
    zoomBefore.current = view.zoom
    view.zoom = 115
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditing(false) }
    window.addEventListener('keydown', close)
    return () => { view.zoom = zoomBefore.current; window.removeEventListener('keydown', close) }
  }, [editing, setEditing])

  const edit = (patch: Partial<AvatarLook>) => setLook({ ...look, ...patch })
  if (!editing) {
    return <button type="button" className="look-open" onClick={() => setEditing(true)}>Customise look</button>
  }
  const roles = new Set(bodyOf(look.body).meshes.map((m) => m.role))
  return (
    <aside className="look-panel" aria-label="Your look">
      <header>
        <h2>Your look</h2>
        <button type="button" className="look-close" aria-label="Close" onClick={() => setEditing(false)}>×</button>
      </header>
      <label className="look-field">
        <span>Name</span>
        <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
      </label>
      <h3>Start from</h3>
      <div className="look-row">
        {LOOK_PRESETS.map((p) => (
          <button key={p.id} type="button" className="look-chip" title={p.role} onClick={() => setLook(p.look)}>{p.name}</button>
        ))}
        <button type="button" className="look-chip" onClick={() => setLook(lookFromSeed(String(Math.random())))}>Surprise me</button>
      </div>
      <h3>Outfit</h3>
      <Chips label="Outfit" values={BODY_IDS} value={look.body} names={OUTFIT} onPick={(body) => edit({ body })} />
      <h3>{look.body === 'casual' ? 'Blouse' : 'Jacket'}</h3>
      <Swatches label="Top" values={CLOTHING} value={look.top} onPick={(top) => edit({ top })} />
      {roles.has('accent') && <>
        <h3>Shirt and tie</h3>
        <Swatches label="Second colour" values={CLOTHING} value={look.accent} onPick={(accent) => edit({ accent })} />
      </>}
      {roles.has('bottom') && <>
        <h3>Trousers</h3>
        <Swatches label="Bottoms" values={CLOTHING} value={look.bottom} onPick={(bottom) => edit({ bottom })} />
      </>}
      <h3>Shoes</h3>
      <Swatches label="Shoes" values={CLOTHING} value={look.shoes} onPick={(shoes) => edit({ shoes })} />
      <label className="look-field">
        <span>Height {look.height.toFixed(2)} m</span>
        <input type="range" min={HEIGHT_RANGE[0]} max={HEIGHT_RANGE[1]} step={0.01} value={look.height}
          onChange={(e) => edit({ height: Number(e.target.value) })} />
      </label>
    </aside>
  )
}
