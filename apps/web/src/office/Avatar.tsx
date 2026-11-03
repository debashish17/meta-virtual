import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { COUNTERS, DESK_SEATS, OFFICE_WALK, TICK_DT, WalkMap, advanceActivity, inTheWay, keepApart, approachOf, findPath, homeDeskSeatId, personKeyForDisplayName, riseOf, type GoToPlace, screenToIntent, secondsOf, startActivity, targetNear, zoneAt, type Activity, type Axis, type Point, type Target, type Zone } from '@office/shared'
import { TAKEN } from './taken'
import ActionChip from './ActionChip'
import { actionFor, phaseOffline, phaseOnline, sameAction } from './action'
import { colleaguesInTheWay } from './Colleagues'
import Person, { type Motion } from './Person'
import { useMe } from './me'
import { avatar, useOfficeUi } from './state'
import { getLastError, getReserved, getSelfSnapshot, isOnline, netSend, syncLook } from '../net/connection'
import { Predictor, followSnapshot } from '../net/predict'
import { useNet } from '../net/store'

/**
 * The local avatar (DESIGN_SPEC 7): a Person in the employee's own look (me.ts), with a
 * walk cycle, grounded by a soft blob shadow (it is not in the sun's shadow map, which only
 * redraws for static geometry), a facing marker and a name pill. WASD / arrow keys walk in screen directions (up walks up the
 * screen); clicking the floor walks there along findPath. Movement goes through the shared
 * WalkMap.step, so it can never enter walls, glass or furniture. Clicking a free desk chair or the
 * tea counter (or pressing E beside one) walks there and sits down to type, or makes a drink
 * (interactions.ts); moving off stands up again.
 *
 * Online (P2-B) the same gestures send inputs to the room instead (`move_intent` at TICK_HZ
 * while held plus once on release, `move_target` per click, `activity_start` / `activity_stop`
 * for chairs and the counter): the avatar predicts with the shared stepPlayer, reconciles
 * against the snapshot's lastSeq, is drawn between its last two prediction ticks (so it moves
 * every frame, not 20 times a second), and is drawn from snapshots while an activity runs.
 * Offline the frame below is exactly as before.
 */

const WALK = 2.3, JOG = WalkMap.MAX_SPEED   // m/s
// screen directions on the floor for the south-west camera
const SCREEN_UP: Point = { x: Math.SQRT1_2, z: -Math.SQRT1_2 }
const SCREEN_RIGHT: Point = { x: Math.SQRT1_2, z: Math.SQRT1_2 }

const KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
}

/** Pending click-to-move route, set by the floor and walked by the avatar. */
export const route: { points: Point[] } = { points: [] }

/** What you are doing besides walking: the chair or counter you are heading for, the activity once
 * there, and where to go once you have stood up. */
const doing: { activity: Activity; pending: Target | null; after: Point | null; standUp: boolean } =
  { activity: { kind: 'free' }, pending: null, after: null, standUp: false }
const SECONDS = { sit_down: secondsOf('sit_down'), stand_up: secondsOf('stand_up'), interact: secondsOf('interact') }
const holding = (): string | null => doing.pending?.id ?? (doing.activity.kind === 'free' ? null : doing.activity.target.id)
function letGo() {
  const id = holding()
  if (id) TAKEN.delete(id)
  doing.pending = null
}

/** Online (multiplayer) driving state. Untouched while offline; the offline path never reads it. */
type OnlineMode = 'free' | 'approach' | 'activity' | 'leaving'
const online = {
  predictor: null as Predictor | null,
  mode: 'free' as OnlineMode,
  acc: 0,
  heldSent: false,
  stopSent: false,
  pendingTarget: null as Point | null,
  pendingActivity: null as string | null,
  pendingStop: false,
  queuedTarget: null as Point | null,
  follow: { x: 0, z: 0, facing: 0 },
  followInit: false,
  dest: null as Point | null,
  lastAcked: -1,
  seenError: 0,
  selfId: null as string | null,
  wasOnline: false,
  /** The chair or counter last asked for, and the ones the room refused (id -> until, ms). */
  requested: null as string | null,
  refused: new Map<string, number>(),
}

const OCCUPIED = 0.4   // metres: someone this near a chair or counter spot is using it
const SEAT_HALO = 0.5  // metres up: just above a desk chair's cushion

/**
 * Chairs and counter spots not to offer or walk to: offline your own reservations; online the
 * room's (synced, colleagues' desks included), the ones someone near you is using right now, and
 * any the room just refused, so E, a click and the chip agree.
 */
function takenNow(): ReadonlySet<string> {
  if (!isOnline()) return TAKEN
  const taken = new Set<string>(getReserved())
  const now = performance.now()
  for (const [id, until] of online.refused) {
    if (until > now) taken.add(id)
    else online.refused.delete(id)
  }
  const net = useNet.getState()
  const people = [...Object.entries(net.players).filter(([id]) => id !== net.selfId).map(([, p]) => p), ...Object.values(net.npcs)]
  for (const p of people) {
    if (Math.hypot(p.x - avatar.x, p.z - avatar.z) > 4) continue
    for (const s of DESK_SEATS) if (Math.hypot(s.x - p.x, s.z - p.z) < OCCUPIED) taken.add(s.id)
    for (const c of COUNTERS) if (Math.hypot(c.x - p.x, c.z - p.z) < OCCUPIED) taken.add(c.id)
  }
  // Your own home desk reads as taken (it is held for you): E, clicks and the halo
  // still offer it; anyone else's never appears.
  const key = personKeyForDisplayName(useMe.getState().name)
  const home = key ? homeDeskSeatId(key) : null
  if (home) taken.delete(home)
  return taken
}

/** Online click: a chair or counter starts an activity there, anywhere else walks there. */
function onlineWalkTo(point: Point) {
  const target = targetNear(point, takenNow())
  if (target) {
    online.pendingActivity = target.id
    online.pendingTarget = null
    online.dest = null
  } else {
    online.pendingTarget = { x: point.x, z: point.z }
    online.pendingActivity = null
    online.dest = { x: point.x, z: point.z }
  }
}

/** One fixed online tick: send the input for it (with a seq) and predict it, keeping clear of
 * `others` (everyone else as last synced) as the room does. */
/**
 * Phase 6: status moves you. Send `go_to` and follow the server there: the room walks
 * the approach and runs the activity, and the snapshots drive the avatar until it is
 * free again. Held keys still cancel the trip, exactly like a clicked one.
 */
export function goToPlace(place: GoToPlace) {
  if (!isOnline()) return
  netSend.goTo(place)
  online.mode = 'approach'
  online.followInit = false
  online.heldSent = false
  online.queuedTarget = null
  online.dest = null
}

/** Test hook: ask the room to start an activity there, exactly as a click would. */
function requestSeat(targetId: string) {
  if (!isOnline()) return
  online.pendingActivity = targetId
  online.pendingTarget = null
  online.dest = null
}

function onlineTick(sx: number, sy: number, run: boolean, others: readonly Point[]) {
  const p = online.predictor
  if (!p) return
  syncLook() // a changed look goes out on the same path as movement
  const resync = () => {
    const s = getSelfSnapshot()
    if (s) p.reset(s.x, s.z, s.facing)
    online.followInit = false
  }
  if (online.pendingStop) {
    online.pendingStop = false
    if (online.mode === 'activity' || online.mode === 'leaving') {
      netSend.activityStop(p.nextSeq())
      online.mode = 'leaving'
      online.queuedTarget = null
    } else if (online.mode === 'approach') {
      netSend.activityStop(p.nextSeq())
      online.mode = 'free'
      resync()
    }
  }
  if (online.pendingActivity) {
    const targetId = online.pendingActivity
    online.pendingActivity = null
    if (sx || sy) { /* held keys win, as offline: the trip is dropped */ } else {
      netSend.activityStart(p.nextSeq(), targetId)
      online.requested = targetId
      online.mode = 'approach'
      online.queuedTarget = null
      online.followInit = false
      online.heldSent = false
    }
    return
  }
  if (online.pendingTarget) {
    const t = online.pendingTarget
    online.pendingTarget = null
    if (sx || sy) { online.dest = null } else if (online.mode === 'free') {
      const seq = p.nextSeq()
      netSend.moveTarget(seq, t.x, t.z)
      p.tick({ kind: 'target', x: t.x, z: t.z }, seq, TICK_DT, others)
      // The click replaces held keys on both sides: a release sent after it would clear the route.
      online.heldSent = false
    } else {
      // The server stands up first and walks there after; predicted on arrival back at free.
      netSend.moveTarget(p.nextSeq(), t.x, t.z)
      online.mode = 'leaving'
      online.queuedTarget = { x: t.x, z: t.z }
    }
    return
  }
  if (sx || sy) {
    const clamp = (n: number): Axis => (n > 0 ? 1 : n < 0 ? -1 : 0)
    const { dx, dz } = screenToIntent(clamp(sx), clamp(sy))
    if (online.mode === 'free') {
      const seq = p.nextSeq()
      netSend.moveIntent(seq, dx, dz, run)
      p.tick({ kind: 'intent', dx, dz, run }, seq, TICK_DT, others)
      online.heldSent = true
      online.dest = null
    } else if (online.mode === 'approach') {
      // Held keys cancel the trip, as offline: the server drops the approach for this input.
      online.mode = 'free'
      resync()
      const seq = p.nextSeq()
      netSend.moveIntent(seq, dx, dz, run)
      p.tick({ kind: 'intent', dx, dz, run }, seq, TICK_DT, others)
      online.heldSent = true
    } else if (!online.stopSent) {
      // Moving out of an activity stands up first: one activity_stop, then intents flow once free.
      netSend.activityStop(p.nextSeq())
      online.stopSent = true
      online.mode = 'leaving'
      online.queuedTarget = null
    }
    return
  }
  if (online.heldSent) {
    online.heldSent = false
    if (online.mode === 'free') {
      const seq = p.nextSeq()
      netSend.moveIntent(seq, 0, 0, false)
      p.tick({ kind: 'intent', dx: 0, dz: 0, run: false }, seq, TICK_DT, others)
    }
  } else if (online.mode === 'free') {
    p.tick(null, null, TICK_DT, others) // keep following the route with nothing to send
  }
}

type FrameRefs = {
  held: { current: Set<string> }
  motion: { current: Motion }
  root: { current: THREE.Group | null }
  marker: { current: THREE.Mesh | null }
}

/** Everyone else in the way as last synced (players and colleagues): the room keeps the same distance. */
function othersOnline(): Point[] {
  const net = useNet.getState()
  const others: Point[] = []
  for (const [id, pl] of Object.entries(net.players)) if (id !== net.selfId && inTheWay(pl.pose)) others.push({ x: pl.x, z: pl.z })
  for (const n of Object.values(net.npcs)) if (inTheWay(n.pose)) others.push({ x: n.x, z: n.z })
  return others
}

/** The online frame: fixed prediction ticks, reconcile, and draw (or follow snapshots). */
function onlineFrame(dt: number, refs: FrameRefs, setZone: (zone: Zone | null) => void) {
  const p = (online.predictor ??= new Predictor({ x: avatar.x, z: avatar.z }, avatar.facing))
  const selfId = useNet.getState().selfId
  if (selfId !== online.selfId) {
    // (Re)joined: predict again from the latest snapshot once it arrives.
    online.selfId = selfId
    online.mode = 'free'
    online.acc = 0
    online.heldSent = false
    online.stopSent = false
    online.lastAcked = -1
    online.followInit = false
    const s = getSelfSnapshot()
    if (s) p.reset(s.x, s.z, s.facing)
  }
  const snap = getSelfSnapshot()
  // Reconcile only on a new lastSeq: between inputs both sides advance deterministically.
  if (snap && online.mode === 'free' && snap.lastSeq !== online.lastAcked) {
    online.lastAcked = snap.lastSeq
    p.reconcile({ x: snap.x, z: snap.z, facing: snap.facing, lastSeq: snap.lastSeq })
  }
  const err = getLastError()
  if (err && err.n !== online.seenError) {
    online.seenError = err.n
    if (err.code === 'target_taken' && online.requested) online.refused.set(online.requested, performance.now() + 30_000)
    if (online.mode === 'approach' && (err.code === 'target_taken' || err.code === 'unwalkable' || err.code === 'no_home_desk')) {
      online.mode = 'free' // the trip is refused: stand where the server says
      if (snap) p.reset(snap.x, snap.z, snap.facing)
    }
  }
  if (snap) {
    if ((online.mode === 'approach' || online.mode === 'free') && snap.activity) {
      online.mode = 'activity'
    } else if ((online.mode === 'activity' || online.mode === 'leaving') && !snap.activity) {
      // Stood up: predict again from the snapshot, picking up the queued click if any.
      online.mode = 'free'
      online.stopSent = false
      p.reset(snap.x, snap.z, snap.facing)
      online.lastAcked = snap.lastSeq
      if (online.queuedTarget) {
        const t = online.queuedTarget
        online.queuedTarget = null
        p.tick({ kind: 'target', x: t.x, z: t.z }, null, TICK_DT, othersOnline())
      }
    }
  }
  let [sx, sy] = [0, 0]
  for (const code of refs.held.current) if (KEYS[code]) { sx += KEYS[code][0]; sy += KEYS[code][1] }
  const run = [...refs.held.current].some((c) => c.startsWith('Shift'))
  const others = othersOnline()
  online.acc = Math.min(online.acc + dt, 0.25)
  while (online.acc >= TICK_DT) {
    online.acc -= TICK_DT
    onlineTick(sx, sy, run, others)
  }
  p.decay(dt)
  const m = refs.motion.current
  if (online.mode === 'free') {
    const pos = p.draw(online.acc / TICK_DT)   // between the last two ticks, every frame
    avatar.x = pos.x
    avatar.z = pos.z
    const delta = Math.atan2(Math.sin(p.sim.facing - avatar.facing), Math.cos(p.sim.facing - avatar.facing))
    avatar.facing += delta * Math.min(1, dt * 12)
    m.pose = p.sim.pose
    m.speed = p.sim.speed
  } else {
    if (snap) {
      if (!online.followInit) {
        online.followInit = true
        online.follow.x = snap.x
        online.follow.z = snap.z
        online.follow.facing = snap.facing
      } else {
        followSnapshot(online.follow, snap, dt)
      }
      m.pose = snap.pose
      m.speed = snap.speed
    }
    avatar.x = online.follow.x
    avatar.z = online.follow.z
    avatar.facing = online.follow.facing
  }
  avatar.pose = m.pose
  refs.root.current?.position.set(avatar.x, 0, avatar.z)
  if (refs.root.current) refs.root.current.rotation.y = avatar.facing
  const dest = online.dest
  if (dest && Math.hypot(dest.x - avatar.x, dest.z - avatar.z) < 0.3) online.dest = null
  if (refs.marker.current) {
    refs.marker.current.visible = online.dest !== null
    if (online.dest) refs.marker.current.position.set(online.dest.x, 0.012, online.dest.z)
  }
  const zone = zoneAt(avatar.x, avatar.z)
  if (zone?.id !== useOfficeUi.getState().zone?.id) setZone(zone)
}

/** Walk to a floor point; or, if it is a free desk chair or counter, go and use it. */
export function walkTo(point: Point) {
  if (isOnline()) { onlineWalkTo(point); return }
  if (doing.activity.kind !== 'free') { doing.after = point; return }   // stand up first, then go
  letGo()
  const target = targetNear(point, TAKEN)
  if (target) {
    TAKEN.add(target.id)
    doing.pending = target
    const at = approachOf(target)
    route.points = findPath({ x: avatar.x, z: avatar.z }, at).slice(1)
    if (!route.points.length && Math.hypot(avatar.x - at.x, avatar.z - at.z) > 0.35) letGo()   // cannot get there
    return
  }
  const goal = OFFICE_WALK.nearestWalkable(point, 1.5)
  route.points = goal ? findPath({ x: avatar.x, z: avatar.z }, goal).slice(1) : []
}

/**
 * Keep the chip under your feet (ActionChip) and the ring on the chair or counter it means in step
 * with what E would do now (action.ts).
 */
function refreshAction(aim: THREE.Mesh | null, t: number) {
  const snap = isOnline() ? getSelfSnapshot() : null
  const phase = isOnline()
    ? phaseOnline(online.mode, snap?.activity?.kind ?? null, avatar.pose)
    : phaseOffline(doing.activity, doing.pending !== null)
  const near = phase === 'free' ? targetNear({ x: avatar.x, z: avatar.z }, takenNow(), 2.2) : null
  const action = actionFor({ phase, near })
  const ui = useOfficeUi.getState()
  if (!sameAction(ui.action, action)) ui.setAction(action)
  if (!aim) return
  const at = action && (action.kind === 'sit' || action.kind === 'drink') ? action.at : null
  aim.visible = at !== null
  if (at) {
    aim.position.set(at.x, action?.kind === 'sit' ? SEAT_HALO : 0.014, at.z)
    aim.scale.setScalar(1 + 0.08 * Math.sin(t * 4))   // a slow pulse
  }
}

/** E: use the chair or counter beside you, or stand up / step away if you are using one. */
function interact() {
  if (isOnline()) {
    if (online.mode === 'free') {
      const target = targetNear({ x: avatar.x, z: avatar.z }, takenNow(), 2.2)
      if (target) onlineWalkTo(target.kind === 'seat' ? target.seat : target.spot)
    } else if (online.mode !== 'leaving') {
      online.pendingStop = true // stand up (or call off the trip); leaving already resolves
    }
    return
  }
  if (doing.activity.kind !== 'free') { doing.standUp = true; return }
  if (doing.pending) { letGo(); route.points = []; return }   // call off the walk there
  const target = targetNear({ x: avatar.x, z: avatar.z }, TAKEN, 2.2)
  if (target) walkTo(target.kind === 'seat' ? target.seat : target.spot)
}

/** The floor under the pointer: a hand over a free chair or the counter, which a click would use. */
export function hoverAt(point: Point | null) {
  const want = point && targetNear(point, takenNow()) ? 'pointer' : ''
  if (document.body.style.cursor !== want) document.body.style.cursor = want
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // test hook for screenshots and manual checks: __officeDebug.teleport(x, z), .walkTo({x, z})
  (window as unknown as Record<string, unknown>).__officeDebug = {
    avatar, walkTo, route, walk: OFFICE_WALK, doing, interact, requestSeat,
    teleport: (x: number, z: number) => {
      // Online the server applies the same coords, but no ack arrives without new
      // inputs — so reset the predictor too, or it keeps the old position and the
      // zone never updates. A rejected target surfaces as an error pill; walk to resync.
      if (isOnline()) {
        netSend.teleport(x, z);
        online.predictor?.reset(x, z, avatar.facing);
        online.mode = 'free';
        online.pendingTarget = null;
        online.queuedTarget = null;
        online.dest = null;
        avatar.x = x; avatar.z = z;
        return;
      }
      letGo(); doing.activity = { kind: 'free' }; avatar.x = x; avatar.z = z; route.points = []
    },
  }
}

function useKeys() {
  const held = useRef(new Set<string>())
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return
      if (e.code === 'KeyE' && !e.repeat) interact()
      if (KEYS[e.code] || e.code.startsWith('Shift')) held.current.add(e.code)
      if (KEYS[e.code]) e.preventDefault()
    }
    const up = (e: KeyboardEvent) => held.current.delete(e.code)
    const clear = () => held.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear) }
  }, [])
  return held
}

export default function Avatar() {
  const root = useRef<THREE.Group>(null)
  const marker = useRef<THREE.Mesh>(null)
  const aim = useRef<THREE.Mesh>(null)
  const held = useKeys()
  const motion = useRef<Motion>({ pose: 'stand', speed: 0 })
  const setZone = useOfficeUi((s) => s.setZone)
  const name = useMe((s) => s.name)
  const look = useMe((s) => s.look)
  const shadowMap = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, 'rgba(0,0,0,0.45)')
    r.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const nowOnline = isOnline()
    if (nowOnline !== online.wasOnline) {
      online.wasOnline = nowOnline
      if (nowOnline) {
        // Entering multiplayer: drop the offline trip and predict from the join snapshot.
        letGo()
        doing.activity = { kind: 'free' }
        doing.after = null
        doing.standUp = false
        route.points = []
        online.predictor = null
        online.selfId = null
      } else {
        // Back to single-player: the avatar stays where it is.
        route.points = []
        online.predictor = null
        online.acc = 0
        online.mode = 'free'
        online.pendingTarget = null
        online.pendingActivity = null
        online.pendingStop = false
        online.queuedTarget = null
        online.dest = null
      }
    }
    if (nowOnline) {
      onlineFrame(dt, { held, motion, root, marker }, setZone)
      refreshAction(aim.current, performance.now() / 1000)
      return
    }
    let [sx, sy] = [0, 0]
    for (const code of held.current) if (KEYS[code]) { sx += KEYS[code][0]; sy += KEYS[code][1] }
    const m = motion.current
    if (doing.activity.kind !== 'free') {
      // sitting, typing, standing up or at the counter: the activity moves you; keys or a click end it
      const using = holding()
      const out = advanceActivity(doing.activity, avatar, dt, !!(sx || sy) || doing.after !== null || doing.standUp, { ...SECONDS, rise: riseOf(look) })
      doing.activity = out.activity
      m.pose = out.pose ?? 'stand'
      avatar.pose = m.pose
      m.speed = out.speed
      if (out.activity.kind === 'free') {
        if (using) TAKEN.delete(using)   // the chair or counter is free again
        doing.standUp = false
        const after = doing.after
        doing.after = null
        if (after) walkTo(after)
      }
      root.current?.position.set(avatar.x, 0, avatar.z)
      if (root.current) root.current.rotation.y = avatar.facing
      if (marker.current) marker.current.visible = false
      refreshAction(aim.current, performance.now() / 1000)
      return
    }
    let dir: Point = { x: 0, z: 0 }
    if (sx || sy) {
      route.points = []
      if (doing.pending) letGo()   // walked off instead
      dir = { x: SCREEN_RIGHT.x * sx + SCREEN_UP.x * sy, z: SCREEN_RIGHT.z * sx + SCREEN_UP.z * sy }
    } else {
      while (route.points.length && Math.hypot(route.points[0].x - avatar.x, route.points[0].z - avatar.z) < 0.06) {
        route.points.shift()   // reached: aim at the next waypoint this same frame
      }
      if (route.points.length) dir = { x: route.points[0].x - avatar.x, z: route.points[0].z - avatar.z }
    }
    const speed = [...held.current].some((c) => c.startsWith('Shift')) ? JOG : WALK
    const before = { x: avatar.x, z: avatar.z }
    const following = !(sx || sy) && route.points.length > 0
    const toWaypoint = following ? Math.hypot(route.points[0].x - before.x, route.points[0].z - before.z) : Infinity
    const walled = OFFICE_WALK.step(before, dir, Math.min(dt, toWaypoint / speed), speed)   // stop on the waypoint
    const next = keepApart(before, walled, colleaguesInTheWay(), OFFICE_WALK)   // and clear of the colleagues
    const moved = Math.hypot(next.x - before.x, next.z - before.z)
    // a wall in the way: give up the route; a colleague in the way: wait for them
    if (following && dt > 0 && Math.hypot(walled.x - before.x, walled.z - before.z) < 1e-5) { route.points = []; letGo() }
    if (doing.pending && !route.points.length) {
      // arrived (or as near as the route goes): start sitting down or using the counter
      const at = approachOf(doing.pending)
      if (Math.hypot(at.x - next.x, at.z - next.z) < 0.35) {
        doing.activity = startActivity(doing.pending)
        doing.pending = null
      } else letGo()
    }
    avatar.x = next.x
    avatar.z = next.z
    if (moved > 1e-4) {
      const want = Math.atan2(next.x - before.x, next.z - before.z)
      const delta = Math.atan2(Math.sin(want - avatar.facing), Math.cos(want - avatar.facing))
      avatar.facing += delta * Math.min(1, dt * 12)
    }
    m.speed += ((dt > 0 ? moved / dt : 0) - m.speed) * Math.min(1, dt * 12)
    m.pose = m.speed < 0.15 ? 'stand' : m.speed > (WALK + JOG) / 2 ? 'jog' : 'walk'
    avatar.pose = m.pose
    if (root.current) {
      root.current.position.set(avatar.x, 0, avatar.z)
      root.current.rotation.y = avatar.facing
    }
    const dest = route.points.at(-1)
    if (marker.current) {
      marker.current.visible = !!dest
      if (dest) marker.current.position.set(dest.x, 0.012, dest.z)
    }
    const zone = zoneAt(avatar.x, avatar.z)
    if (zone?.id !== useOfficeUi.getState().zone?.id) setZone(zone)
    refreshAction(aim.current, performance.now() / 1000)
  })

  return (
    <>
      <group ref={root}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, 0]}>
          <planeGeometry args={[0.8, 0.8]} />
          <meshBasicMaterial map={shadowMap} transparent depthWrite={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.008, 0.36]}>   {/* facing marker */}
          <circleGeometry args={[0.07, 3]} />
          <meshBasicMaterial color={look.top} transparent opacity={0.8} />
        </mesh>
        <Person look={look} motion={motion.current} />
        <Html position={[0, look.height + 0.33, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="office-name">{name}</div>
        </Html>
        <Html position={[0, 0, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <ActionChip onAct={interact} />
        </Html>
      </group>
      {/* the chair or counter E means: a halo round the seat, or a ring on the floor at the counter */}
      <mesh ref={aim} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.34, 0.42, 48]} />
        <meshBasicMaterial color="#c9803f" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh ref={marker} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.18, 0.24, 32]} />
        <meshBasicMaterial color="#c9803f" transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </>
  )
}
