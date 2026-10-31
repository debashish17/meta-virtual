import { Canvas } from '@react-three/fiber'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import WorldScene from './WorldScene'
import AssetGallery from './AssetGallery'
import Interactive3DOffice from './Interactive3DOffice'
import Physics3DOffice from './Physics3DOffice'
import CameraController, { ZoomTrigger } from './CameraController'
import { findPath, OfficeZoneId, Point, WORLD } from './world'
import { answerOfficeQuestion, decideProposal, DemoMemory, loadDemoMemory, MEETING_RECORDS, resetDemoMemory, saveDemoMemory } from './demoMemory'
import MeetingRecordCard from './MeetingRecordCard'
import SnapshotRenderer from './SnapshotRenderer'
import BatchSnapshotRenderer from './BatchSnapshotRenderer'
import { SHARED_HELLO } from '@office/shared'

// Loaded only for ?mode=catalogue, so the office never downloads the catalogue data.
const CatalogueGallery = lazy(() => import('./catalogue/CatalogueGallery'))
// The M1 office scene (?mode=office), being built against DESIGN_SPEC.md; old modes stay until G1.
const OfficeScene = lazy(() => import('./office/OfficeScene'))

type Zone = 'customer' | 'project' | null
export type OfficeMode = 'physics' | '3d' | 'gallery' | 'prototype'

function getInitialMode(): OfficeMode {
  if (typeof window === 'undefined') return 'physics'
  const params = new URLSearchParams(window.location.search)
  if (params.get('gallery') === '1' || params.get('mode') === 'gallery') return 'gallery'
  if (params.get('mode') === 'prototype' || params.get('mode') === 'boxes') return 'prototype'
  if (params.get('mode') === 'static' || params.get('mode') === '3d-static') return '3d'
  return 'physics'
}

const zoneDetails = {
  customer: {
    eyebrow: 'CUSTOMER ROOM · ACME',
    title: 'Integration check-in',
    body: 'One open promise is linked to the project plan.',
    status: 'Call notes ready',
    icon: '↗',
  },
  project: {
    eyebrow: 'PROJECT ROOM · DELIVERY',
    title: 'Acme integration',
    body: '4 tasks · 1 blocker · next milestone Friday',
    status: 'Wall display is up to date',
    icon: '◫',
  },
}

function ModeBar({ mode, onSelectMode }: { mode: OfficeMode; onSelectMode: (m: OfficeMode) => void }) {
  const modes: Array<{ id: OfficeMode; label: string; icon: string }> = [
    { id: 'physics', label: '3D Physics Sim', icon: '⚡' },
    { id: '3d', label: 'Static 3D', icon: '🏢' },
    { id: 'gallery', label: 'Asset Gallery', icon: '📦' },
    { id: 'prototype', label: 'Prototype Boxes', icon: '🏛️' },
  ]

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      background: 'rgba(24, 28, 33, 0.92)',
      backdropFilter: 'blur(16px)',
      padding: '4px',
      borderRadius: '24px',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
      gap: '4px',
    }}>
      {modes.map((m) => {
        const active = mode === m.id
        return (
          <button
            key={m.id}
            onClick={() => onSelectMode(m.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 13px',
              borderRadius: '18px',
              border: active ? '1px solid #5bb381' : '1px solid transparent',
              background: active ? '#2c4a3b' : 'transparent',
              color: active ? '#ffffff' : '#a8b0b8',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function App() {
  const [mode, setModeState] = useState<OfficeMode>(getInitialMode)

  const setMode = (nextMode: OfficeMode) => {
    setModeState(nextMode)
    const url = new URL(window.location.href)
    if (nextMode === 'gallery') {
      url.searchParams.set('gallery', '1')
      url.searchParams.delete('mode')
    } else {
      url.searchParams.delete('gallery')
      url.searchParams.set('mode', nextMode)
    }
    window.history.replaceState({}, '', url.toString())
  }

  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'snapshot') {
    return <SnapshotRenderer />
  }

  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'batch_snapshot') {
    return <BatchSnapshotRenderer />
  }

  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'catalogue') {
    return <Suspense fallback={null}><CatalogueGallery /></Suspense>
  }

  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'office') {
    return <Suspense fallback={null}><OfficeScene /></Suspense>
  }

  if (mode === 'gallery') {
    return (
      <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <div style={{
          position: 'fixed',
          top: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2000,
        }}>
          <ModeBar mode={mode} onSelectMode={setMode} />
        </div>
        <AssetGallery />
      </div>
    )
  }

  const playerPosition = useRef<Point>([WORLD.start[0], WORLD.start[1]])
  const [route, setRoute] = useState<Point[]>([])
  const [currentZone, setCurrentZone] = useState<OfficeZoneId>('open')
  const [targetZone, setTargetZone] = useState<Zone>(null)
  const zone: Zone = currentZone === 'open' ? null : currentZone
  const [notice, setNotice] = useState('Click an open tile to walk')
  const [showGrid, setShowGrid] = useState(false)
  const [arrival, setArrival] = useState('You are in the open office')
  const [memory, setMemory] = useState<DemoMemory>(loadDemoMemory)
  const [showProposal, setShowProposal] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [question, setQuestion] = useState('What is the status of the Acme integration?')
  const [answerShown, setAnswerShown] = useState(false)
  const [isLeftRailOpen, setIsLeftRailOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    const p = new URLSearchParams(window.location.search)
    return p.get('panels') !== '0' && p.get('collapsed') !== '1'
  })
  const [isRightCardOpen, setIsRightCardOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    const p = new URLSearchParams(window.location.search)
    return p.get('panels') !== '0' && p.get('collapsed') !== '1'
  })
  const [recenterCount, setRecenterCount] = useState(0)
  const [zoomTrigger, setZoomTrigger] = useState<ZoomTrigger | null>(null)
  const [zoomPercent, setZoomPercent] = useState(100)
  const [showPhysicsDebug, setShowPhysicsDebug] = useState(() => {
    if (typeof window === 'undefined') return false
    const p = new URLSearchParams(window.location.search)
    return p.get('wireframes') === '1' || p.get('debug') === '1'
  })
  const [physicsResetTrigger, setPhysicsResetTrigger] = useState(0)
  const [dropPropsTrigger, setDropPropsTrigger] = useState(0)
  const officeAnswer = answerOfficeQuestion(question, memory)
  const activeMeeting = zone === 'customer' ? MEETING_RECORDS[0] : zone === 'project' ? MEETING_RECORDS[1] : null

  useEffect(() => { saveDemoMemory(memory) }, [memory])

  const moveTo = useCallback((point: Point, destination?: Zone) => {
    const nextRoute = findPath(playerPosition.current, point)
    if (nextRoute.length === 0) {
      setNotice('That route is blocked. Try another tile.')
      return
    }
    setRoute(nextRoute)
    if (destination) {
      setTargetZone(destination)
      setArrival(destination === 'customer' ? 'Walking to the customer room' : 'Walking to the project wall')
    } else {
      setTargetZone(null)
      setArrival('Walking through the office')
    }
    setNotice('Right-drag to pan · scroll to zoom')
  }, [])

  const visitZone = useCallback((nextZone: Exclude<Zone, null>) => {
    setAskOpen(false)
    setShowProposal(false)
    setAnswerShown(false)
    moveTo(nextZone === 'customer' ? WORLD.customerDoor : WORLD.projectDoor, nextZone)
  }, [moveTo])

  const handlePlayerZoneChange = useCallback((nextZone: OfficeZoneId) => {
    setCurrentZone(nextZone)
    if (nextZone === 'customer') {
      setTargetZone(null)
      setArrival('You are in the customer room')
    } else if (nextZone === 'project') {
      setTargetZone(null)
      setArrival('You are in the project room')
    } else {
      setArrival('You are in the open office')
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || ['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement | null)?.tagName ?? '')) return
      if (mode === 'physics') {
        // In physics mode, PhysicalPlayer directly handles WASD linear velocity.
        // Clear any click-to-move path so pathfinding does not fight direct WASD!
        if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
          setRoute([])
        }
        return
      }
      const directions: Record<string, Point> = {
        w: [0, -0.5], ArrowUp: [0, -0.5],
        s: [0, 0.5], ArrowDown: [0, 0.5],
        a: [-0.5, 0], ArrowLeft: [-0.5, 0],
        d: [0.5, 0], ArrowRight: [0.5, 0],
      }
      const direction = directions[event.key]
      if (!direction) return
      event.preventDefault()
      const current = playerPosition.current
      moveTo([current[0] + direction[0], current[1] + direction[1]])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [moveTo, mode])

  const handleZoomChange = useCallback((zoom: number, fitZoom: number) => {
    setZoomPercent(Math.round((zoom / fitZoom) * 100))
  }, [])

  return (
    <main className="app-shell">
      <div className="scene-layer">
        <Canvas
          shadows
          orthographic
          camera={{ position: [22, 17.1, 21], zoom: 48, near: 0.1, far: 1000 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <CameraController
            isLeftRailOpen={isLeftRailOpen}
            isRightCardOpen={isRightCardOpen}
            recenterTrigger={recenterCount}
            zoomTrigger={zoomTrigger}
            onZoomChange={handleZoomChange}
          />
          <Suspense fallback={null}>
            {mode === 'physics' && (
              <Physics3DOffice
                route={route}
                playerPosition={playerPosition}
                showGrid={showGrid}
                showPhysicsDebug={showPhysicsDebug}
                physicsResetTrigger={physicsResetTrigger}
                dropPropsTrigger={dropPropsTrigger}
                onMove={(point) => moveTo(point)}
                onZone={visitZone}
                onPlayerZoneChange={handlePlayerZoneChange}
              />
            )}
            {mode === '3d' && (
              <Interactive3DOffice
                route={route}
                playerPosition={playerPosition}
                showGrid={showGrid}
                onMove={(point) => moveTo(point)}
                onZone={visitZone}
                onPlayerZoneChange={handlePlayerZoneChange}
              />
            )}
            {mode === 'prototype' && (
              <WorldScene
                route={route}
                playerPosition={playerPosition}
                showGrid={showGrid}
                onMove={(point) => moveTo(point)}
                onZone={visitZone}
                onPlayerZoneChange={handlePlayerZoneChange}
              />
            )}
          </Suspense>
        </Canvas>
      </div>

      <header className="topbar glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="brand-lockup">
          <div className="brand-mark"><span /><span /><span /></div>
          <div>
            <div className="brand-name">commonplace</div>
            <div className="brand-caption">THE VIRTUAL OFFICE</div>
          </div>
        </div>

        {/* Multi-Approach Switcher */}
        <ModeBar mode={mode} onSelectMode={setMode} />

        <button className="icon-button" aria-label="Reset demo" title="Reset demo data" onClick={() => {
          setMemory(resetDemoMemory())
          setTargetZone(null)
          setShowProposal(false)
          setAskOpen(false)
          setAnswerShown(false)
          setNotice('Demo data reset · click an open tile to walk')
        }}>↻</button>
      </header>

      {/* Left Rail (Team & Destinations) */}
      {isLeftRailOpen ? (
        <aside className="left-rail glass-panel">
          <div className="rail-heading">
            <span>YOUR OFFICE <span className="online-count">2 ONLINE</span></span>
            <button className="panel-collapse-btn" title="Collapse left panel" onClick={() => setIsLeftRailOpen(false)}>◀</button>
          </div>
          <div className="person-row active-person">
            <div className="person-avatar avatar-you">A</div>
            <div className="person-copy"><strong>Alex Morgan</strong><span>{arrival}</span></div>
            <span className="person-status" />
          </div>
          <div className="person-row">
            <div className="person-avatar avatar-teammate">J</div>
            <div className="person-copy"><strong>Jamie Lee</strong><span>At their desk</span></div>
            <span className="person-status" />
          </div>

          <div className="rail-divider" />
          <div className="rail-heading">GO SOMEWHERE</div>
          <button className={`destination-button ${targetZone === 'customer' || zone === 'customer' ? 'selected' : ''}`} onClick={() => visitZone('customer')}>
            <span className="destination-icon customer-icon">↗</span>
            <span><strong>Customer room</strong><small>Acme integration</small></span>
            <span className="button-arrow">›</span>
          </button>
          <button className={`destination-button ${targetZone === 'project' || zone === 'project' ? 'selected' : ''}`} onClick={() => visitZone('project')}>
            <span className="destination-icon project-icon">◫</span>
            <span><strong>Project room</strong><small>Delivery status</small></span>
            <span className="button-arrow">›</span>
          </button>

          <div className="rail-divider" />
          <div className="rail-heading">TODAY</div>
          <div className="task-row"><span className="task-check">✓</span><span>Review Acme launch plan</span><time>10:00</time></div>
          <div className="task-row"><span className={`task-check ${memory.proposalStatus === 'approved' ? '' : 'pending'}`}>{memory.proposalStatus === 'approved' ? '✓' : '·'}</span><span>Confirm integration date</span><time>{memory.proposalStatus === 'approved' ? 'DONE' : '11:30'}</time></div>
          <div className="task-row"><span className="task-check pending">·</span><span>Send project update</span><time>14:00</time></div>

          <button className={`grid-toggle ${showGrid ? 'grid-on' : ''}`} onClick={() => setShowGrid((current) => !current)}>
            <span className="grid-toggle-icon">▦</span> {showGrid ? 'Hide walk grid' : 'Show walk grid'}
          </button>
        </aside>
      ) : (
        <button className="panel-expand-pill left" onClick={() => setIsLeftRailOpen(true)} title="Show team and destinations">
          <span>👥 Team</span>
          <span className="online-badge">2</span>
        </button>
      )}

      {/* Right Card (Zone & Office Memory) */}
      {isRightCardOpen ? (
        <section className="right-card glass-panel">
          {askOpen ? (
            <>
              <div className="card-topline">
                <span className="card-kicker">OFFICE MEMORY · ASK ANYTHING</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button className="text-button" onClick={() => setAskOpen(false)}>CLOSE ×</button>
                  <button className="panel-collapse-btn" title="Collapse office card" onClick={() => setIsRightCardOpen(false)}>▶</button>
                </div>
              </div>
              <h1>Ask the office</h1>
              <p>Search grounded commitments across project walls, customer calls, and meeting decisions.</p>
              <div className="ask-box">
                <input value={question} onChange={(event) => { setQuestion(event.target.value); setAnswerShown(false) }} placeholder="Ask about a project, date, or decision..." />
                <button className="ask-submit" onClick={() => setAnswerShown(true)}>Ask</button>
              </div>
              {answerShown && (
                <div className="answer-panel">
                  <div className="answer-badge">ANSWER · GROUNDED</div>
                  <p className="answer-text">{officeAnswer.text}</p>
                  {officeAnswer.sources.map((c) => (
                    <div key={c.label} className="citation-pill"><span>↗</span> {c.label} · {c.detail}</div>
                  ))}
                </div>
              )}
              {!answerShown && <p className="card-footnote">Answers use approved workspace records and link back to their source.</p>}
            </>
          ) : showProposal ? (
            <>
              <div className="card-topline">
                <span className="card-kicker">CUSTOMER CALL · PROPOSED CHANGE</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button className="text-button" onClick={() => setShowProposal(false)}>CLOSE ×</button>
                  <button className="panel-collapse-btn" title="Collapse office card" onClick={() => setIsRightCardOpen(false)}>▶</button>
                </div>
              </div>
              <h1>{memory.proposalStatus === 'approved' ? 'Update approved' : memory.proposalStatus === 'rejected' ? 'Update rejected' : 'Review this update'}</h1>
              <p>{memory.proposalStatus === 'approved' ? 'The customer promise is now reflected in the project plan.' : memory.proposalStatus === 'rejected' ? 'No project or account records were changed.' : 'The call mentioned a delivery date. Review the suggested records before they change.'}</p>
              <div className="diff-card">
                <div className="diff-label">NEW TASK <span>ACME INTEGRATION</span></div>
                <strong>Confirm integration delivery by March 15</strong>
                <small>Owner: Alex Morgan · Linked to milestone: Integration launch</small>
                <div className="diff-divider" />
                <div className="diff-label">ACCOUNT NOTE</div>
                <strong>Customer expects the integration by March 15</strong>
                <small>Source: Acme integration check-in · Today, 10:06 AM</small>
              </div>
              {memory.proposalStatus === 'approved' ? (
                <div className="approved-banner"><span>✓</span> Approved and saved in this browser</div>
              ) : memory.proposalStatus === 'rejected' ? (
                <div className="approved-banner rejected-banner"><span>×</span> Rejected · no records changed</div>
              ) : (
                <div className="proposal-actions">
                  <button className="approve-button" onClick={() => { setMemory((current) => decideProposal(current, 'approved')); setNotice('Approved: the March 15 commitment is now on the project wall') }}>Approve update</button>
                  <button className="reject-button" onClick={() => { setMemory((current) => decideProposal(current, 'rejected')); setNotice('Proposal declined; no records were changed') }}>Reject</button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="card-topline">
                <span className="card-kicker">{zone ? zoneDetails[zone].eyebrow : 'THE OFFICE, AT A GLANCE'}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="card-spark">✳</span>
                  <button className="panel-collapse-btn" title="Collapse office card" onClick={() => setIsRightCardOpen(false)}>▶</button>
                </div>
              </div>
              <h1>{zone ? zoneDetails[zone].title : 'A clearer view\nof the work.'}</h1>
              <p>{zone ? zoneDetails[zone].body : 'Walk into a room to see what is moving, what is stuck, and what needs your attention.'}</p>
              <div className="card-status"><span className="status-icon">{zone ? zoneDetails[zone].icon : '↗'}</span><span>{zone === 'project' && memory.proposalStatus === 'approved' ? 'March 15 commitment · approved' : zone ? zoneDetails[zone].status : 'Customer promise linked to a project task'}</span></div>
              {activeMeeting && <MeetingRecordCard meeting={activeMeeting} memory={memory} />}
              {zone === 'customer' && (
                <button className="secondary-action" onClick={() => setShowProposal(true)}>
                  <span>{memory.proposalStatus === 'approved' ? '✓' : memory.proposalStatus === 'rejected' ? '×' : '↗'}</span> {memory.proposalStatus === 'approved' ? 'View approved call update' : memory.proposalStatus === 'rejected' ? 'View rejected call update' : 'Review 1 proposed call update'}
                </button>
              )}
              {zone === 'project' && (
                <div className="project-commitment"><span className={memory.proposalStatus === 'approved' ? 'commitment-check done' : 'commitment-check'}>{memory.proposalStatus === 'approved' ? '✓' : '!'}</span><span><strong>{memory.proposalStatus === 'approved' ? 'Delivery target: March 15' : 'Waiting on customer call review'}</strong><small>{memory.proposalStatus === 'approved' ? 'From Acme integration check-in' : 'Approve the proposed update in the customer room'}</small></span></div>
              )}
              <button className="ask-button" onClick={() => { setAskOpen(true); setShowProposal(false); setAnswerShown(false) }}>
                <span className="ask-icon">✳</span> Ask the office <span className="ask-shortcut">↵</span>
              </button>
            </>
          )}
        </section>
      ) : (
        <button className="panel-expand-pill right" onClick={() => setIsRightCardOpen(true)} title="Show office details & ask">
          <span>✳ Office Details</span>
        </button>
      )}

      {/* Floating Viewport Recenter & Zoom HUD */}
      <div className="camera-hud glass-panel">
        <button
          className="camera-hud-btn"
          title="Recenter camera to office center"
          onClick={() => setRecenterCount((c) => c + 1)}
        >
          <span>⛶</span>
          <span>Recenter</span>
        </button>
        <div className="hud-divider" />
        <button
          className="camera-hud-btn icon-only"
          title="Zoom out"
          onClick={() => setZoomTrigger({ type: 'out', id: Date.now() })}
        >
          −
        </button>
        <span className="zoom-label">{zoomPercent}%</span>
        <button
          className="camera-hud-btn icon-only"
          title="Zoom in"
          onClick={() => setZoomTrigger({ type: 'in', id: Date.now() })}
        >
          +
        </button>

        {mode === 'physics' && (
          <>
            <div className="hud-divider" />
            <button
              className="camera-hud-btn"
              title="Drop physical office props onto desks"
              onClick={() => setDropPropsTrigger((c) => c + 1)}
            >
              <span>🎈</span>
              <span>Drop Props</span>
            </button>
            <button
              className="camera-hud-btn"
              title="Reset all dynamic physics chairs and props"
              onClick={() => setPhysicsResetTrigger((c) => c + 1)}
            >
              <span>🔄</span>
              <span>Reset Sim</span>
            </button>
            <button
              className="camera-hud-btn"
              title="Toggle Rapier physical collider wireframes"
              onClick={() => setShowPhysicsDebug((d) => !d)}
              style={showPhysicsDebug ? { background: '#2c4a3b', color: '#6be09e' } : undefined}
            >
              <span>⚡</span>
              <span>Wireframes</span>
            </button>
          </>
        )}
      </div>

      <div className="scene-caption glass-panel"><span className="caption-dot" /> {notice}</div>
      <footer className="control-hint glass-panel"><span data-testid="shared-hello" title="shared constant (M0 gate)">{SHARED_HELLO}</span>
        <span><kbd>CLICK</kbd> walk to a spot</span>
        <span><kbd>WASD</kbd> move</span>
        <span><kbd>RIGHT-DRAG</kbd> pan</span>
        <span><kbd>SCROLL</kbd> zoom</span>
      </footer>
      <div className="map-label"><span>✦</span> NORTH STAR OFFICE <i>·</i> 12 × 10 M</div>
    </main>
  )
}

