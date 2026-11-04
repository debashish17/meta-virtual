import LookEditor from './LookEditor'
import { OVERVIEW } from './state'
import './office.css'

/** The look editor; in development, a link to the asset library's review sheet. The room
 * label lives in the panels' top strip (ZonePill). */
export default function Hud() {
  if (OVERVIEW) return null
  return (
    <>
      <LookEditor />
      {import.meta.env.DEV && <a className="office-asset-review" href="/assets/catalogue/review.html" target="_blank" rel="noreferrer">Asset review</a>}
    </>
  )
}
