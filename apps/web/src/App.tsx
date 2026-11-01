import AuthGate from './auth/AuthGate'
import OfficeScene from './office/OfficeScene'

/**
 * The app is the office. The asset library's review sheet, where kit builds are approved and
 * reviews.json is exported, is a static page the asset pipeline writes:
 * /assets/catalogue/review.html (linked from the office's HUD in development).
 */
export default function App() {
  return (
    <AuthGate>
      <OfficeScene />
    </AuthGate>
  )
}
