import { useProgress } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import { LOADING_FADE_MS, loadingCopy, useLoading } from './loading'

/**
 * What a visitor sees while the office loads, instead of a blank floor: the name, a real
 * progress bar (every model and texture goes through three's default loading manager, which
 * drei's `useProgress` reads) and the step. It sits on the scene's own background, covers the
 * panels until the floor has rendered, then fades out and unmounts.
 */
export default function LoadingScreen() {
  const loaded = useProgress((s) => s.loaded)
  const total = useProgress((s) => s.total)
  const shown = useLoading((s) => s.shown)
  const gone = useLoading((s) => s.gone)
  // New loads can join the queue (the total grows): the bar never moves backwards.
  const peak = useRef(0)
  if (total > 0) peak.current = Math.max(peak.current, (loaded / total) * 100)

  useEffect(() => {
    if (!shown) return
    const timer = window.setTimeout(() => useLoading.setState({ gone: true }), LOADING_FADE_MS)
    return () => window.clearTimeout(timer)
  }, [shown])

  if (gone) return null
  const { step, pct } = loadingCopy(peak.current, total, shown)
  return (
    <div className={shown ? 'office-loading leaving' : 'office-loading'} data-testid="office-loading">
      <div className="office-loading-body">
        <p className="office-loading-name">Commonplace</p>
        <div
          className="office-loading-track"
          role="progressbar"
          aria-label="Loading the office"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <span style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <p className="office-loading-step" role="status" aria-live="polite">
          <span>{step}</span>
          <span className="office-loading-pct">{pct}%</span>
        </p>
      </div>
    </div>
  )
}
