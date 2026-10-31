import * as THREE from 'three'
import { DESK_TOP } from '@office/shared'

/**
 * Keeps seated people's hands on the desk instead of through it. Mixamo's seated moves were made
 * for a lower desk set further away (wrists 0.72 m up, 0.4 m ahead of the hips); ours stand 0.75 m
 * high with their edge 0.15 m ahead of the seat. After the move is applied each frame, any wrist
 * that would sink into the desktop is raised to just above it, and the arm is bent to reach it
 * (two-bone IK in the plane the arm already bends in). The hand keeps its own orientation, so the
 * typing fingers still move as made; hands resting below the desk (on the lap) are left alone.
 */

// the chair stands 0.5 m from the middle of a 0.7 m deep desk (layouts/helpers place()): its edge
// is 0.15 m in front of the seat
export const DESK = { edge: 0.15, top: DESK_TOP }
const CLEAR = 0.035      // wrist above the desktop: the forearm's half thickness
const BELOW = 0.14       // a wrist further below the top than this is resting under the desk; leave it

const ARMS = [['LeftArm', 'LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm', 'RightHand']] as const
const bonesOf = new WeakMap<THREE.Object3D, (THREE.Object3D | undefined)[][]>()

const v = { s: new THREE.Vector3(), e: new THREE.Vector3(), w: new THREE.Vector3(), t: new THREE.Vector3(), d: new THREE.Vector3(), p: new THREE.Vector3(), e2: new THREE.Vector3() }
const q = { a: new THREE.Quaternion(), b: new THREE.Quaternion(), hand: new THREE.Quaternion(), parent: new THREE.Quaternion() }

/** Turn `bone` in world space by `turn`, keeping its children attached. */
function rotateWorld(bone: THREE.Object3D, turn: THREE.Quaternion) {
  bone.getWorldQuaternion(q.b)
  q.b.premultiply(turn)
  bone.parent!.getWorldQuaternion(q.parent)
  bone.quaternion.copy(q.parent.invert().multiply(q.b))
  bone.updateMatrixWorld(true)
}

/**
 * `root` is the person's model (already posed by the mixer this frame), `frame` the object whose
 * local space is the seat: origin under the hips, +z towards the desk, metres.
 */
export function keepHandsOnDesk(root: THREE.Object3D, frame: THREE.Object3D, desk = DESK) {
  let arms = bonesOf.get(root)
  if (!arms) {
    arms = ARMS.map((names) => names.map((n) => root.getObjectByName(n)))
    bonesOf.set(root, arms)
  }
  for (const [upper, fore, hand] of arms) {
    if (!upper || !fore || !hand) continue
    // where the wrist is, in the seat's space (bringing just this arm's chain up to date with the
    // move applied this frame; the rest of the body is left to the renderer)
    hand.updateWorldMatrix(true, false)
    hand.getWorldPosition(v.w)
    frame.worldToLocal(v.t.copy(v.w))
    const lift = desk.top + CLEAR - v.t.y
    if (v.t.z < desk.edge - 0.05 || lift <= 0 || lift > CLEAR + BELOW) continue
    v.t.y += lift
    frame.localToWorld(v.t)                    // target, back in world space
    hand.getWorldQuaternion(q.hand)            // keep the hand's own orientation

    upper.getWorldPosition(v.s)
    fore.getWorldPosition(v.e)
    const a = v.s.distanceTo(v.e), b = v.e.distanceTo(v.w)
    v.d.subVectors(v.t, v.s)
    const reach = THREE.MathUtils.clamp(v.d.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4)
    v.d.normalize()
    // bend in the plane the elbow already points in
    v.p.subVectors(v.e, v.s)
    v.p.addScaledVector(v.d, -v.p.dot(v.d))
    if (v.p.lengthSq() < 1e-8) v.p.set(0, -1, 0)
    v.p.normalize()
    const cos = THREE.MathUtils.clamp((a * a + reach * reach - b * b) / (2 * a * reach), -1, 1)
    v.e2.copy(v.s).addScaledVector(v.d, a * cos).addScaledVector(v.p, a * Math.sqrt(1 - cos * cos))   // the new elbow

    q.a.setFromUnitVectors(v.e.sub(v.s).normalize(), v.e2.clone().sub(v.s).normalize())
    rotateWorld(upper, q.a)
    fore.getWorldPosition(v.e)
    hand.getWorldPosition(v.w)
    q.a.setFromUnitVectors(v.w.sub(v.e).normalize(), v.t.clone().sub(v.e).normalize())
    rotateWorld(fore, q.a)
    fore.getWorldQuaternion(q.parent)
    hand.quaternion.copy(q.parent.invert().multiply(q.hand))
    hand.updateMatrixWorld(true)
  }
}
