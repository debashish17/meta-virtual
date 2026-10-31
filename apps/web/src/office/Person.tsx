import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import { BODIES, bodyOf, type AvatarLook, type Move } from '@office/shared'
import { keepHandsOnDesk } from './deskReach'

/**
 * One person in the office: a Mixamo character (apps/web/scripts/people/bake.mjs) at the look's
 * height, its clothes in the look's colours (face, skin and hair keep their textures), playing the
 * Mixamo moves, which share the characters' skeleton and so play exactly as made (seated, the
 * hands are kept on the desk: deskReach.ts). `motion` is
 * written by whoever moves the person and read every frame: a pose, and the speed while walking so
 * the stride matches the ground covered.
 */

export type Pose = 'stand' | 'walk' | 'jog' | 'talk' | 'phone' | 'interact' | 'sit' | 'sit_talk' | 'type' | 'sit_down' | 'stand_up'
export type Motion = { pose: Pose; speed: number }

// sitting down and standing up are blends between the standing and the seated moves
const CLIP: Record<Pose, Move> = {
  stand: 'idle', walk: 'walk', jog: 'jog', talk: 'talk', phone: 'phone', interact: 'interact',
  sit: 'sit', sit_talk: 'sit_talk', type: 'type', sit_down: 'sit', stand_up: 'idle',
}
const FADE = 0.25        // seconds to blend from one move to the next
const SIT_FADE = 0.8     // ... between standing and sitting
const ONCE = new Set<Move>(['interact'])
const SEATED = new Set<Pose>(['sit', 'sit_talk', 'type', 'sit_down'])

for (const b of BODIES.bodies) useGLTF.preload(b.url)
useGLTF.preload(BODIES.moves.url)

export default function Person({ look, motion, seed = 0 }: { look: AvatarLook; motion: Motion; seed?: number }) {
  const body = bodyOf(look.body)
  const model = useGLTF(body.url)
  const clips = useGLTF(BODIES.moves.url).animations

  // a private copy of the body; clothing pieces get their own flat-coloured materials
  const { root, clothes } = useMemo(() => {
    const copy = SkeletonUtils.clone(model.scene)
    const own = new Map<string, { role: string; material: THREE.MeshStandardMaterial }>()
    copy.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh
      if (!mesh.isMesh) return
      // skinned bounds do not follow the pose: a generous sphere round the bind pose lets people
      // off screen be skipped without clipping a raised arm or a stride
      if (mesh.isSkinnedMesh) {
        mesh.geometry.computeBoundingSphere()
        mesh.boundingSphere = mesh.geometry.boundingSphere!.clone()
        mesh.boundingSphere.radius *= 1.6
      }
      const role = body.meshes.find((m) => m.name === mesh.name)?.role ?? 'fixed'
      if (role === 'fixed') return
      const material = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 })
      mesh.material = material
      own.set(mesh.name, { role, material })
    })
    return { root: copy, clothes: own }
  }, [model, body])

  useEffect(() => {
    const colour: Record<string, string> = { top: look.top, accent: look.accent, bottom: look.bottom, shoes: look.shoes }
    for (const { role, material } of clothes.values()) material.color.set(colour[role] ?? '#ffffff')
  }, [look, clothes])

  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root])
  const actions = useMemo(() => Object.fromEntries(clips.map((c) => {
    const action = mixer.clipAction(c)
    if (ONCE.has(c.name as Move)) {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    }
    return [c.name, action]
  })), [clips, mixer])
  const current = useRef<{ action: THREE.AnimationAction; pose: Pose } | null>(null)
  // stopped on unmount (and on React's dev double-mount), so the next frame starts the move afresh
  useEffect(() => () => { mixer.stopAllAction(); current.current = null }, [mixer])
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const people = ((window as unknown as { __officePeople?: Set<unknown> }).__officePeople ??= new Set())
    const entry = { look, motion, root, actions }
    people.add(entry)   // for checking poses from the console
    return () => { people.delete(entry) }
  }, [look, motion, root, actions])

  const scale = look.height / body.height
  useFrame((_, dt) => {
    const name = motion.pose === 'talk' && seed % 2 ? 'talk_2' : CLIP[motion.pose]
    const next = actions[name]
    const was = current.current
    if (next && next !== was?.action) {
      next.reset().play()
      if (was) next.crossFadeFrom(was.action, SEATED.has(motion.pose) !== SEATED.has(was.pose) ? SIT_FADE : FADE, false)
      else if (!ONCE.has(name)) next.time = (seed * 7.31) % next.getClip().duration   // people do not all move in step
      current.current = { action: next, pose: motion.pose }
    } else if (was) was.pose = motion.pose
    if (next && (motion.pose === 'walk' || motion.pose === 'jog')) {
      next.timeScale = motion.speed / ((BODIES.moves.metresPerSecond[motion.pose] ?? 1.4) * scale)
    } else if (next) next.timeScale = 1
    mixer.update(Math.min(dt, 0.1))
    if (SEATED.has(motion.pose) || motion.pose === 'stand_up') keepHandsOnDesk(root, root.parent ?? root)   // seated poses are at a desk
  })

  return <primitive object={root} scale={scale} />
}
