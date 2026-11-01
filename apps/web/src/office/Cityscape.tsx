import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { WORLD } from '@office/shared'
import { CITY, EXTENT, ROAD_Y, ROADS, WALK_Y, type Building, type FacadeStyle, type Rect } from './city'
import { PALETTE } from './palette'

/**
 * The city around the office (city.ts): streets, pavements, parks and buildings, seen through the
 * east windows and past the cut-away walls. Static, so it is merged or instanced into a few dozen
 * draw calls. Near the camera it takes part in the sun's shadows, except the towers, whose long
 * shadows would reach the office (and the block across from the windows is kept low for that). Buildings have shopfront ground floors darkened towards the pavement, podiums and
 * setbacks; trees have clustered crowns; cars have rounded bodies and wheels. Haze grows with
 * distance from the office, so the far city melts into the sky colour.
 */

const { width: W, depth: D } = WORLD
const FLOOR = 3.6      // storey height on the facades
const BAY = 3          // facade bay width
const SHOP = 4.2       // ground-floor shopfront height
const TEX = 512        // facade and paving texture size
const TOWER = 40       // taller than this, a building casts no sun shadow (it would reach the office)

// ---------------------------------------------------------------- haze

const HAZE = new THREE.Color(PALETTE.background)
/** The city shaders' clock: cloud shadows drift and tree crowns sway with it. */
const CLOCK = { value: 0 }

const NOISE = `
  float cityHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float cityNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(cityHash(i), cityHash(i + vec2(1.0, 0.0)), f.x), mix(cityHash(i + vec2(0.0, 1.0)), cityHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }`

/** Haze with distance from the office (colour drains, then fades into the sky), soft cloud
 * shadows drifting over everything, and, for tree crowns, a gentle sway. */
function hazed<T extends THREE.Material>(material: T, sway = false): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hazeColour = { value: HAZE }
    shader.uniforms.cityTime = CLOCK
    let vertex = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHazeWorld;\nuniform float cityTime;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 hazePoint = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          hazePoint = instanceMatrix * hazePoint;
        #endif
        vHazeWorld = (modelMatrix * hazePoint).xyz;`)
    if (sway) {
      vertex = vertex.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float swayPhase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.61;
        #else
          float swayPhase = 0.0;
        #endif
        float swayAmount = clamp(position.y + 0.6, 0.0, 1.6) * 0.03;
        transformed.x += sin(cityTime * 1.3 + swayPhase) * swayAmount;
        transformed.z += cos(cityTime * 1.1 + swayPhase * 1.3) * swayAmount * 0.6;`)
    }
    shader.vertexShader = vertex
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vHazeWorld;\nuniform vec3 hazeColour;\nuniform float cityTime;\n${NOISE}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        vec2 cloudAt = vHazeWorld.xz + vHazeWorld.y * vec2(-0.6, -0.4);
        float cloud = 0.65 * cityNoise(cloudAt * 0.018 + cityTime * vec2(0.010, 0.004)) + 0.35 * cityNoise(cloudAt * 0.05 + cityTime * vec2(0.016, 0.007));
        gl_FragColor.rgb *= 1.0 - 0.14 * smoothstep(0.52, 0.78, cloud);
        vec2 hazeOut = max(vec2(0.0), max(-vHazeWorld.xz, vHazeWorld.xz - vec2(${W.toFixed(1)}, ${D.toFixed(1)})));
        float haze = clamp(0.92 * smoothstep(30.0, 140.0, length(hazeOut)) + 0.12 * smoothstep(20.0, 120.0, vHazeWorld.y), 0.0, 0.97);
        float hazeLuma = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(hazeLuma), 0.35 * haze);   // colour drains first, then it fades
        gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColour, haze);`)
  }
  return material
}

// ---------------------------------------------------------------- textures

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
}

function texture(size: number, draw: (g: CanvasRenderingContext2D, s: number, rand: () => number) => void, seed = 7) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  draw(canvas.getContext('2d')!, size, rng(seed))
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** Fine grain: many faint dots, light and dark. */
function grain(g: CanvasRenderingContext2D, s: number, rand: () => number, n: number, dark: number, light: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${dark * rand()})` : `rgba(255,255,255,${light * rand()})`
    const r = 0.6 + rand() * 1.4
    g.fillRect(rand() * s, rand() * s, r, r)
  }
}

/** 8 m of asphalt: grain, a few darker patches and a faint crack. */
const asphalt = () => texture(TEX, (g, s, rand) => {
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, s, s)
  for (let i = 0; i < 18; i++) {
    const x = rand() * s, y = rand() * s, r = 30 + rand() * 90
    const patch = g.createRadialGradient(x, y, 0, x, y, r)
    patch.addColorStop(0, `rgba(0,0,0,${0.03 + rand() * 0.04})`)
    patch.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = patch
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  grain(g, s, rand, 26000, 0.16, 0.5)
  g.strokeStyle = 'rgba(0,0,0,0.12)'
  g.lineWidth = 1
  for (let i = 0; i < 3; i++) {
    let x = rand() * s, y = rand() * s
    g.beginPath(); g.moveTo(x, y)
    for (let k = 0; k < 8; k++) { x += (rand() - 0.5) * 40; y += rand() * 18; g.lineTo(x, y) }
    g.stroke()
  }
}, 9)

/** 2.4 m of pavement: 0.6 m slabs, each a slightly different tone, with joints. */
const paving = () => texture(TEX, (g, s, rand) => {
  const slab = s / 4
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const k = 236 + Math.round((rand() - 0.5) * 16)
    g.fillStyle = `rgb(${k},${k - 1},${k - 4})`
    g.fillRect(i * slab, j * slab, slab, slab)
  }
  grain(g, s, rand, 14000, 0.08, 0.5)
  g.strokeStyle = 'rgba(90,84,76,0.32)'
  g.lineWidth = 2
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * slab, 0); g.lineTo(i * slab, s); g.stroke()
    g.beginPath(); g.moveTo(0, i * slab); g.lineTo(s, i * slab); g.stroke()
  }
}, 17)

const grass = () => texture(256, (g, s, rand) => {
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, s, s)
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rand() < 0.55 ? `rgba(40,70,25,${0.25 * rand()})` : `rgba(255,255,220,${0.35 * rand()})`
    g.fillRect(rand() * s, rand() * s, 1, 2 + rand() * 2)
  }
}, 23)

/** Glass: a vertical gradient with a soft diagonal reflection. */
function glass(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tone = 1) {
  const grad = g.createLinearGradient(x, y, x, y + h)
  grad.addColorStop(0, `rgba(${Math.round(120 * tone)},${Math.round(140 * tone)},${Math.round(156 * tone)},1)`)
  grad.addColorStop(1, `rgba(${Math.round(52 * tone)},${Math.round(64 * tone)},${Math.round(76 * tone)},1)`)
  g.fillStyle = grad
  g.fillRect(x, y, w, h)
  g.save()
  g.beginPath(); g.rect(x, y, w, h); g.clip()
  g.fillStyle = 'rgba(255,255,255,0.12)'
  g.beginPath()
  g.moveTo(x + w * 0.15, y + h); g.lineTo(x + w * 0.55, y); g.lineTo(x + w * 0.75, y); g.lineTo(x + w * 0.35, y + h)
  g.fill()
  g.restore()
}

/** One bay by one storey of facade; white where the wall takes the building's colour. */
const facade = (style: FacadeStyle) => texture(TEX, (g, s, rand) => {
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, s, s)
  grain(g, s, rand, 6000, 0.05, 0.3)
  const frame = (x: number, y: number, w: number, h: number, width: number) => {
    g.fillStyle = '#7e868c'
    g.fillRect(x, y, w, width); g.fillRect(x, y + h - width, w, width)
    g.fillRect(x, y, width, h); g.fillRect(x + w - width, y, width, h)
  }
  if (style === 'ribbon') {
    const y = s * 0.2, h = s * 0.52
    glass(g, 0, y, s, h)
    for (let i = 0; i < 3; i++) frame(i * s / 3, y, s / 3, h, 5)
    g.fillStyle = 'rgba(0,0,0,0.22)'
    g.fillRect(0, y + h, s, 6)                                     // shadow under the band
    g.fillStyle = 'rgba(0,0,0,0.06)'
    g.fillRect(0, s * 0.97, s, s * 0.03)                           // panel joint
  } else if (style === 'grid') {
    const x = s * 0.2, y = s * 0.2, w = s * 0.6, h = s * 0.52
    g.fillStyle = 'rgba(0,0,0,0.28)'
    g.fillRect(x - 2, y - 2, w + 4, h + 4)                         // reveal
    glass(g, x + 8, y + 8, w - 16, h - 16)
    frame(x + 4, y + 4, w - 8, h - 8, 8)
    g.fillStyle = '#7e868c'
    g.fillRect(x + w / 2 - 3, y + 4, 6, h - 8)
    g.fillStyle = 'rgba(255,255,255,0.7)'
    g.fillRect(x - 10, y + h + 2, w + 20, 7)                       // sill
    g.fillStyle = 'rgba(0,0,0,0.15)'
    g.fillRect(x - 10, y + h + 9, w + 20, 4)
  } else {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) glass(g, i * s / 2, j * s * 0.42, s / 2, s * 0.42, 1.1 + rand() * 0.25)
    g.fillStyle = '#56646e'
    g.fillRect(0, s * 0.84, s, s * 0.16)                           // spandrel
    for (const x of [0, s / 2]) g.fillRect(x, 0, 6, s)
    g.fillRect(0, 0, s, 5); g.fillRect(0, s * 0.42, s, 4)
  }
}, { ribbon: 31, grid: 37, glass: 41 }[style])

/** One bay of ground-floor shopfront: tall glazing in dark frames under a fascia. */
const shopfront = () => texture(TEX, (g, s) => {
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, s, s)
  g.fillStyle = '#3a3f45'
  g.fillRect(0, 0, s, s * 0.16)                                    // fascia
  glass(g, s * 0.04, s * 0.2, s * 0.92, s * 0.76, 0.95)
  g.fillStyle = '#30353a'
  for (const x of [s * 0.02, s * 0.5 - 4, s * 0.94]) g.fillRect(x, s * 0.18, 10, s * 0.8)
  g.fillRect(0, s * 0.18, s, 8)
  g.fillRect(0, s * 0.96, s, s * 0.04)
  g.fillStyle = 'rgba(255,236,200,0.18)'                           // warm interior glow
  g.fillRect(s * 0.06, s * 0.55, s * 0.88, s * 0.38)
}, 47)

// ---------------------------------------------------------------- geometry

type Colours = THREE.Color | [THREE.Color, THREE.Color, THREE.Color, THREE.Color]

/** Accumulates quads with normals, uvs and colours into one BufferGeometry. */
class Mesher {
  private pos: number[] = []
  private nor: number[] = []
  private uv: number[] = []
  private col: number[] = []

  /** Quad a-b-c-d (counter-clockwise seen from its front); colours per corner or one for all. */
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], uv: number[][], colour: Colours) {
    const cs = Array.isArray(colour) ? colour : [colour, colour, colour, colour]
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.pos.push(...[a, b, c, d][i])
      this.nor.push(...n)
      this.uv.push(...uv[i])
      this.col.push(cs[i].r, cs[i].g, cs[i].b)
    }
  }

  /** A box's four sides and top. Side uvs are (along, up) / scale, the top's (x, z) / scale. */
  box(r: Rect, y0: number, y1: number, colour: THREE.Color, scale: [number, number] = [1, 1], top = true, sides = true) {
    const { x0, z0, x1, z1 } = r
    const [su, sv] = scale
    if (sides) {
      const v0 = 0, v1 = (y1 - y0) / sv
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[x0 / su, v0], [x1 / su, v0], [x1 / su, v1], [x0 / su, v1]], colour)
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[-x1 / su, v0], [-x0 / su, v0], [-x0 / su, v1], [-x1 / su, v1]], colour)
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[z0 / su, v0], [z1 / su, v0], [z1 / su, v1], [z0 / su, v1]], colour)
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[-z1 / su, v0], [-z0 / su, v0], [-z0 / su, v1], [-z1 / su, v1]], colour)
    }
    if (top) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[x0 / su, z1 / su], [x1 / su, z1 / su], [x1 / su, z0 / su], [x0 / su, z0 / su]], colour)
  }

  /** The four walls of a footprint from y0 to y1, uvs in bays across and storeys up; `low`, if
   * given, is the colour at y0 (for darkening towards the ground). */
  walls(r: Rect, y0: number, y1: number, colour: THREE.Color, low = colour, v0 = 0, storey = FLOOR) {
    const { x0, z0, x1, z1 } = r
    const v1 = v0 + (y1 - y0) / storey
    const c: [THREE.Color, THREE.Color, THREE.Color, THREE.Color] = [low, low, colour, colour]
    const along = (a: number, b: number) => [[0, v0], [(b - a) / BAY, v0], [(b - a) / BAY, v1], [0, v1]]
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], along(x0, x1), c)
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], along(x0, x1), c)
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], along(z0, z1), c)
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], along(z0, z1), c)
  }

  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.computeBoundingSphere()
    return g
  }
}

const colour = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k)
const WHITE = new THREE.Color('#ffffff')

const AWNINGS = ['#b5654a', '#3f7f7a', '#c99a3d', '#34495e', '#7d3a45', '#7d9a7a']

/** Canvas awnings over the shopfronts on the faces the camera sees (south and west): one per
 * 2.4 m bay, 0.9 m deep, with a front valance. */
function awnings(t: Rect, y: number, hex: string, into: Mesher) {
  const c = colour(hex), shade = colour(hex, 0.8)
  for (let x = t.x0 + 0.6; x + 2.4 <= t.x1 - 0.4; x += 3) {
    into.box({ x0: x, z0: t.z1, x1: x + 2.4, z1: t.z1 + 0.9 }, y, y + 0.06, c)
    into.box({ x0: x, z0: t.z1 + 0.86, x1: x + 2.4, z1: t.z1 + 0.9 }, y - 0.25, y, shade)
  }
  for (let z = t.z0 + 0.6; z + 2.4 <= t.z1 - 0.4; z += 3) {
    into.box({ x0: t.x0 - 0.9, z0: z, x1: t.x0, z1: z + 2.4 }, y, y + 0.06, c)
    into.box({ x0: t.x0 - 0.9, z0: z, x1: t.x0 - 0.86, z1: z + 2.4 }, y - 0.25, y, shade)
  }
}

const DECK: Record<Building['roof']['kind'], string> = { gravel: '#bdb7ac', membrane: '#7b8087', green: '#bdb7ac', solar: '#8a8f95' }

function addBuilding(b: Building, walls: Mesher, shops: Mesher, roofs: Mesher) {
  const tint = new THREE.Color(b.colour)
  const parapet = tint.clone().multiplyScalar(0.92)
  const band = b.style === 'glass' ? colour('#56646e') : tint.clone().multiplyScalar(0.86)
  const coping = colour('#e7e3dc')
  b.tiers.forEach((t, i) => {
    const y0 = WALK_Y + t.y0, y1 = WALK_Y + t.y1
    const shopfront = i === 0 && t.y1 > SHOP + 2
    if (shopfront) {
      shops.walls(t, y0, y0 + SHOP, WHITE, colour('#ffffff', 0.62), 0, SHOP)       // darker where it meets the pavement
      awnings(t, y0 + SHOP - 0.5, AWNINGS[Math.floor((b.h * 13) % AWNINGS.length)], roofs)
      roofs.walls({ x0: t.x0 - 0.12, z0: t.z0 - 0.12, x1: t.x1 + 0.12, z1: t.z1 + 0.12 }, y0 + SHOP, y0 + SHOP + 0.25, parapet)   // band over the shops
      walls.walls(t, y0 + SHOP + 0.25, y1, tint, tint, (SHOP + 0.25) / FLOOR)
    } else walls.walls(t, y0, y1, tint, i === 0 ? tint.clone().multiplyScalar(0.7) : tint)
    // floor slabs standing proud of the two faces the camera sees, for relief and shadow lines
    for (let y = (shopfront ? y0 + SHOP + 0.25 : y0) + FLOOR; y < y1 - 1; y += FLOOR) {
      roofs.box({ x0: t.x0 - 0.1, z0: t.z1 - 0.02, x1: t.x1, z1: t.z1 + 0.1 }, y - 0.09, y + 0.09, band)
      roofs.box({ x0: t.x0 - 0.1, z0: t.z0, x1: t.x0 + 0.02, z1: t.z1 + 0.1 }, y - 0.09, y + 0.09, band)
    }
    roofs.box(t, y1, y1 + 0.01, colour(DECK[b.roof.kind], 0.96 + (b.h % 5) * 0.015), [1, 1], true, false)
    const rim = 0.3
    for (const r of [{ ...t, z1: t.z0 + rim }, { ...t, z0: t.z1 - rim }, { ...t, x1: t.x0 + rim }, { ...t, x0: t.x1 - rim }]) {
      roofs.box(r, y1, y1 + 0.7, parapet)
      roofs.box({ x0: r.x0 - 0.04, z0: r.z0 - 0.04, x1: r.x1 + 0.04, z1: r.z1 + 0.04 }, y1 + 0.7, y1 + 0.78, coping)
    }
  })
  const top = WALK_Y + b.h
  const roof = b.roof
  for (const u of b.units) {
    roofs.box(u, top, top + 0.9 + ((u.x0 * 7) % 1) * 1.1, colour('#c8cccf'))
    roofs.box({ x0: u.x0 + 0.15, z0: u.z1 - 0.01, x1: u.x1 - 0.15, z1: u.z1 + 0.01 }, top + 0.2, top + 0.7, colour('#8a9096'))   // grille
  }
  if (roof.core) {
    roofs.box(roof.core, top, top + 2.8, tint.clone().multiplyScalar(0.95))
    roofs.box({ x0: roof.core.x0 - 0.05, z0: roof.core.z0 - 0.05, x1: roof.core.x1 + 0.05, z1: roof.core.z1 + 0.05 }, top + 2.8, top + 2.9, coping)
  }
  for (const k of roof.skylights) roofs.box(k, top, top + 0.35, colour('#a9c6d4'))
  for (const p of roof.panels) {
    roofs.box({ ...p, x0: p.x0 + 0.1, x1: p.x1 - 0.1 }, top, top + 0.25, colour('#5b6168'))                     // frame
    roofs.box(p, top + 0.25, top + 0.33, colour('#2c3a4d'))
  }
  for (const g of roof.beds) {
    roofs.box(g, top, top + 0.3, colour('#9a9a94'))
    roofs.box({ x0: g.x0 + 0.1, z0: g.z0 + 0.1, x1: g.x1 - 0.1, z1: g.z1 - 0.1 }, top + 0.3, top + 0.34, colour('#8faf6a'))
  }
}

function useCityGeometry() {
  return useMemo(() => {
    const walls: Record<FacadeStyle, Mesher> = { ribbon: new Mesher(), grid: new Mesher(), glass: new Mesher() }
    const towers: Record<FacadeStyle, Mesher> = { ribbon: new Mesher(), grid: new Mesher(), glass: new Mesher() }
    const shops = new Mesher(), roofs = new Mesher(), towerRoofs = new Mesher(), pavements = new Mesher(), parks = new Mesher(), kerbs = new Mesher()
    const marks = new Mesher(), street = new Mesher()
    const kerbStone = colour('#dedcd6')

    for (const b of CITY.blocks) {
      pavements.box(b, ROAD_Y, WALK_Y, WHITE, [2.4, 2.4])
      const k = 0.3                                                       // granite kerb round the block
      for (const r of [{ ...b, z1: b.z0 + k }, { ...b, z0: b.z1 - k }, { ...b, x1: b.x0 + k }, { ...b, x0: b.x1 - k }]) {
        kerbs.box(r, ROAD_Y, WALK_Y + 0.005, kerbStone)
      }
      for (const p of b.park) parks.box(p, WALK_Y, WALK_Y + 0.12, WHITE, [3, 3])
      for (const bd of b.buildings) {
        if (bd.h > TOWER) addBuilding(bd, towers[bd.style], shops, towerRoofs)
        else addBuilding(bd, walls[bd.style], shops, roofs)
      }
    }
    // the office's plinth under its floor
    kerbs.box({ x0: -0.25, z0: -0.25, x1: W + 0.25, z1: D + 0.25 }, ROAD_Y, -0.004, colour('#d9d6cf'))

    // a darker gutter along every kerb, and manhole covers in the lanes
    const gutter = colour('#4c5157'), cover = colour('#3f4348')
    for (const b of CITY.blocks) {
      const g = 0.35
      for (const r of [{ x0: b.x0 - g, z0: b.z0 - g, x1: b.x1 + g, z1: b.z0 }, { x0: b.x0 - g, z0: b.z1, x1: b.x1 + g, z1: b.z1 + g },
        { x0: b.x0 - g, z0: b.z0, x1: b.x0, z1: b.z1 }, { x0: b.x1, z0: b.z0, x1: b.x1 + g, z1: b.z1 }]) {
        marks.box(r, ROAD_Y, ROAD_Y + 0.006, gutter, [1, 1], true, false)
      }
    }
    for (const [a, b] of ROADS.x) for (let z = EXTENT.z0 + 11; z < EXTENT.z1; z += 23) {
      const x = (a + b) / 2 + (Math.floor(z) % 2 ? 1.6 : -1.6)
      marks.box({ x0: x - 0.35, z0: z - 0.35, x1: x + 0.35, z1: z + 0.35 }, ROAD_Y, ROAD_Y + 0.01, cover, [1, 1], true, false)
    }
    for (const [a, b] of ROADS.z) for (let x = EXTENT.x0 + 7; x < EXTENT.x1; x += 23) {
      const z = (a + b) / 2 + (Math.floor(x) % 2 ? 1.6 : -1.6)
      marks.box({ x0: x - 0.35, z0: z - 0.35, x1: x + 0.35, z1: z + 0.35 }, ROAD_Y, ROAD_Y + 0.01, cover, [1, 1], true, false)
    }
    // centre dashes on every road between junctions, zebra crossings around the office's block
    const dash = colour('#ebe8df')
    for (const [a, b] of ROADS.x) for (const [z0, z1] of ROADS.cells(ROADS.z, EXTENT.z0, EXTENT.z1)) {
      const x = (a + b) / 2
      for (let z = z0 + 2; z < z1 - 3; z += 6) marks.box({ x0: x - 0.08, z0: z, x1: x + 0.08, z1: z + 3 }, ROAD_Y, ROAD_Y + 0.012, dash, [1, 1], true, false)
    }
    for (const [a, b] of ROADS.z) for (const [x0, x1] of ROADS.cells(ROADS.x, EXTENT.x0, EXTENT.x1)) {
      const z = (a + b) / 2
      for (let x = x0 + 2; x < x1 - 3; x += 6) marks.box({ x0: x, z0: z - 0.08, x1: x + 3, z1: z + 0.08 }, ROAD_Y, ROAD_Y + 0.012, dash, [1, 1], true, false)
    }
    const BANDS: [number, number][] = [[-5.4, -2.8], [W + 3.2, W + 5.8]]
    for (const [x0, x1] of [[-18, -6], [70, 82]]) for (const [z0, z1] of [[-5.4, -2.8], [D + 3.2, D + 5.8]]) {
      for (let x = x0 + 0.6; x < x1 - 0.4; x += 1.1) marks.box({ x0: x, z0, x1: x + 0.55, z1 }, ROAD_Y, ROAD_Y + 0.012, dash, [1, 1], true, false)
    }
    for (const [z0, z1] of [[-18, -6], [46, 58]]) for (const [x0, x1] of BANDS) {
      for (let z = z0 + 0.6; z < z1 - 0.4; z += 1.1) marks.box({ x0, z0: z, x1, z1: z + 0.55 }, ROAD_Y, ROAD_Y + 0.012, dash, [1, 1], true, false)
    }

    // the office's pavements: planted beds and benches by the window, knee-high planters on the camera side
    const wood = colour('#b98a5c'), soil = colour('#5b4a3b'), concrete = colour('#cfcbc3'), metal = colour('#3a3d42')
    for (const bed of CITY.beds) {
      kerbs.box(bed, WALK_Y, WALK_Y + 0.2, concrete)
      parks.box({ x0: bed.x0 + 0.12, z0: bed.z0 + 0.12, x1: bed.x1 - 0.12, z1: bed.z1 - 0.12 }, WALK_Y, WALK_Y + 0.22, WHITE, [3, 3])
    }
    for (const b of CITY.benches) {
      street.box(b, WALK_Y + 0.38, WALK_Y + 0.45, wood)
      for (const z of [b.z0 + 0.15, b.z1 - 0.25]) street.box({ x0: b.x0 + 0.05, z0: z, x1: b.x1 - 0.05, z1: z + 0.1 }, WALK_Y, WALK_Y + 0.38, metal)
    }
    // the way in: a granite apron from the doors to the kerb, and bike hoops beside it
    const way = entranceX()
    kerbs.box({ x0: way - 2.6, z0: D + 0.25, x1: way + 2.6, z1: D + 5.7 }, WALK_Y, WALK_Y + 0.02, colour('#e4e1da'), [1, 1])
    for (let i = 0; i < 4; i++) {
      const x = way + 3.6 + i * 0.75
      for (const dx of [-0.3, 0.3]) street.box({ x0: x + dx - 0.03, z0: D + 2.97, x1: x + dx + 0.03, z1: D + 3.03 }, WALK_Y, WALK_Y + 0.8, metal)
      street.box({ x0: x - 0.33, z0: D + 2.97, x1: x + 0.33, z1: D + 3.03 }, WALK_Y + 0.74, WALK_Y + 0.8, metal)
    }
    for (const p of CITY.planters) {                                     // their shrubs are in the tree instances
      street.box(p, WALK_Y, WALK_Y + 0.55, concrete)
      street.box({ x0: p.x0 + 0.06, z0: p.z0 + 0.06, x1: p.x1 - 0.06, z1: p.z1 - 0.06 }, WALK_Y + 0.55, WALK_Y + 0.57, soil)
    }
    // traffic lights at the junctions round the office's block, lamps facing the camera
    const red = colour('#d9534a'), amber = colour('#e8b04a'), green = colour('#5cb36a'), black = colour('#24272b')
    for (const [x, z] of [[-5.5, -5.5], [W + 5.5, -5.5], [-5.5, D + 5.5], [W + 5.5, D + 5.5], [82.5, -5.5], [82.5, D + 5.5]]) {   // pavement corners
      street.box({ x0: x - 0.07, z0: z - 0.07, x1: x + 0.07, z1: z + 0.07 }, WALK_Y, WALK_Y + 3.4, black)
      street.box({ x0: x - 0.16, z0: z - 0.16, x1: x + 0.16, z1: z + 0.16 }, WALK_Y + 2.6, WALK_Y + 3.5, black)
      for (const [k, light] of [[0, red], [1, amber], [2, green]] as const) {
        const ly = WALK_Y + 3.32 - k * 0.27
        street.box({ x0: x - 0.08, z0: z + 0.16, x1: x + 0.08, z1: z + 0.19 }, ly - 0.08, ly + 0.08, k === 2 ? green : light.clone().multiplyScalar(0.45))
        street.box({ x0: x - 0.19, z0: z - 0.08, x1: x - 0.16, z1: z + 0.08 }, ly - 0.08, ly + 0.08, k === 2 ? green : light.clone().multiplyScalar(0.45))
      }
    }
    {
      // bus shelter on the far pavement, facing the office's windows
      const [x0, z0] = [82.4, 17], glassTint = colour('#9fb4c2')
      street.box({ x0, z0, x1: x0 + 1.5, z1: z0 + 4 }, WALK_Y + 2.45, WALK_Y + 2.55, black)                      // roof
      for (const z of [z0 + 0.05, z0 + 3.85]) street.box({ x0: x0 + 1.35, z0: z, x1: x0 + 1.45, z1: z + 0.1 }, WALK_Y, WALK_Y + 2.45, black)
      street.box({ x0: x0 + 1.38, z0: z0 + 0.15, x1: x0 + 1.42, z1: z0 + 3.85 }, WALK_Y + 0.3, WALK_Y + 2.3, glassTint)   // back pane
      street.box({ x0: x0 + 0.9, z0: z0 + 0.6, x1: x0 + 1.3, z1: z0 + 2.6 }, WALK_Y + 0.42, WALK_Y + 0.48, wood)       // bench
      street.box({ x0: x0 + 0.2, z0: z0 + 3.92, x1: x0 + 1.4, z1: z0 + 4.0 }, WALK_Y + 0.2, WALK_Y + 2.2, colour('#f2efe6')) // lit advert panel
    }
    // street lamps: pole, arm over the road, head
    for (const l of CITY.lamps) {
      street.box({ x0: l.x - 0.06, z0: l.z - 0.06, x1: l.x + 0.06, z1: l.z + 0.06 }, WALK_Y, WALK_Y + 5.6, metal)
      const [ax, az] = l.along === 'x' ? [0, l.out] : [l.out, 0]
      const end = { x: l.x + ax * 1.3, z: l.z + az * 1.3 }
      street.box({ x0: Math.min(l.x, end.x) - 0.04, z0: Math.min(l.z, end.z) - 0.04, x1: Math.max(l.x, end.x) + 0.04, z1: Math.max(l.z, end.z) + 0.04 }, WALK_Y + 5.5, WALK_Y + 5.6, metal)
      street.box({ x0: end.x - 0.25, z0: end.z - 0.14, x1: end.x + 0.25, z1: end.z + 0.14 }, WALK_Y + 5.38, WALK_Y + 5.52, metal)
    }
    return {
      walls: Object.fromEntries(Object.entries(walls).map(([k, m]) => [k, m.build()])) as Record<FacadeStyle, THREE.BufferGeometry>,
      towers: Object.fromEntries(Object.entries(towers).map(([k, m]) => [k, m.build()])) as Record<FacadeStyle, THREE.BufferGeometry>,
      shops: shops.build(), roofs: roofs.build(), towerRoofs: towerRoofs.build(), pavements: pavements.build(), parks: parks.build(), kerbs: kerbs.build(),
      marks: marks.build(), street: street.build(),
    }
  }, [])
}

/** Centre of the way in: the door gap in the office's south wall. */
function entranceX() {
  const south = WORLD.walls.find((w) => w.id === 'south')!
  const door = south.doors[0]
  return Math.min(south.from[0], south.to[0]) + door.at + door.width / 2
}

/** A dark sign monolith beside the path, its name on the face towards the street. */
function EntranceSign() {
  const parts = useMemo(() => {
    const [w, h] = [512, 256]
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const g = canvas.getContext('2d')!
    g.fillStyle = '#2b2f34'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#c9803f'
    g.fillRect(48, 70, 10, 116)
    g.fillStyle = '#f1efe9'
    g.font = '600 64px system-ui, "Segoe UI", sans-serif'
    g.fillText('NORTHWIND', 78, 136)
    g.fillStyle = '#9aa0a6'
    g.font = '28px system-ui, "Segoe UI", sans-serif'
    g.fillText('Software  ·  Level 1', 80, 180)
    const face = new THREE.CanvasTexture(canvas)
    face.colorSpace = THREE.SRGBColorSpace
    face.anisotropy = 8
    const body = hazed(new THREE.MeshStandardMaterial({ color: '#2b2f34', roughness: 0.6 }))
    const front = hazed(new THREE.MeshStandardMaterial({ map: face, roughness: 0.5 }))
    return { geometry: new THREE.BoxGeometry(1.6, 1.4, 0.24), materials: [body, body, body, body, front, body] }
  }, [])
  return <mesh geometry={parts.geometry} material={parts.materials} position={[entranceX() - 3.8, WALK_Y + 0.7, D + 3.4]} castShadow />
}

// ---------------------------------------------------------------- instanced trees and cars

function useInstances(mesh: React.RefObject<THREE.InstancedMesh | null>, matrices: THREE.Matrix4[], colours?: THREE.Color[]) {
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    matrices.forEach((x, i) => m.setMatrixAt(i, x))
    colours?.forEach((c, i) => m.setColorAt(i, c))
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [mesh, matrices, colours])
}

const at = (x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(sx, sy, sz))

const LEAVES = ['#5f8a4f', '#719a59', '#84a865', '#4e7446', '#678f52']
const AUTUMN = '#a8975a'

/** A crown of overlapping lobes, about one unit across, shaded darker underneath. */
function crownGeometry() {
  const lobes: [number, number, number, number][] = [[0, 0.12, 0, 0.78], [0.5, -0.08, 0.18, 0.56], [-0.42, -0.04, -0.28, 0.6], [0.1, -0.16, -0.5, 0.52], [-0.22, 0.42, 0.12, 0.5], [0.28, 0.34, -0.22, 0.46]]
  const shade = rng(5)
  const g = mergeGeometries(lobes.map(([x, y, z, r]) => {
    const lobe = new THREE.IcosahedronGeometry(r, 2).translate(x, y, z)
    const pos = lobe.getAttribute('position') as THREE.BufferAttribute
    const tone = 0.9 + shade() * 0.2
    const c: number[] = []
    for (let i = 0; i < pos.count; i++) {
      const k = tone * (0.62 + 0.38 * THREE.MathUtils.smoothstep(pos.getY(i), -0.7, 0.8))   // darker underneath
      c.push(k, k, k)
    }
    lobe.setAttribute('color', new THREE.Float32BufferAttribute(c, 3))
    return lobe
  }))
  return g.scale(1.05, 0.92, 1.05)
}

function Trees({ material }: { material: Record<string, THREE.Material> }) {
  const trunks = useRef<THREE.InstancedMesh>(null)
  const crowns = useRef<THREE.InstancedMesh>(null)
  const shadows = useRef<THREE.InstancedMesh>(null)
  const data = useMemo(() => {
    const t = CITY.trees
    return {
      trunks: t.map((tr) => at(tr.x, WALK_Y, tr.z, 1, tr.trunk + tr.crown * 0.3, 1)),
      crowns: t.map((tr, i) => at(tr.x, WALK_Y + tr.trunk + tr.crown * 0.62, tr.z, tr.crown, tr.crown, tr.crown, i * 1.7)),
      colours: t.map((tr) => new THREE.Color(tr.tint > 0.975 ? AUTUMN : LEAVES[Math.floor(tr.tint * LEAVES.length) % LEAVES.length])),
      shadows: t.map((tr) => at(tr.x + 0.4, WALK_Y + 0.02, tr.z + 0.3, tr.crown * 3.1, 1, tr.crown * 3.1)),
    }
  }, [])
  useInstances(trunks, data.trunks)
  useInstances(crowns, data.crowns, data.colours)
  useInstances(shadows, data.shadows)
  const geometry = useMemo(() => ({
    trunk: new THREE.CylinderGeometry(0.09, 0.15, 1, 10).translate(0, 0.5, 0),
    crown: crownGeometry(),
    shadow: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  }), [])
  const n = CITY.trees.length
  return (
    <>
      <instancedMesh ref={shadows} args={[geometry.shadow, material.blob, n]} renderOrder={1} />
      <instancedMesh ref={trunks} args={[geometry.trunk, material.trunk, n]} castShadow />
      <instancedMesh ref={crowns} args={[geometry.crown, material.crown, n]} castShadow receiveShadow />
    </>
  )
}

/** Car parts in metres, the car pointing along +x. */
function carGeometry() {
  const body = new RoundedBoxGeometry(4.3, 0.66, 1.8, 3, 0.16).translate(0, 0.62, 0)
  const cabin = new RoundedBoxGeometry(2.3, 0.56, 1.62, 3, 0.16)
  const pos = cabin.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {                                         // taper the roof in
    if (pos.getY(i) > 0) { pos.setX(i, pos.getX(i) * 0.82 - 0.1); pos.setZ(i, pos.getZ(i) * 0.9) }
  }
  cabin.computeVertexNormals()
  cabin.translate(-0.25, 1.2, 0)
  const roof = new RoundedBoxGeometry(1.75, 0.08, 1.4, 2, 0.04).translate(-0.33, 1.49, 0)
  const wheels = mergeGeometries([[-1.35, 0.82], [-1.35, -0.82], [1.35, 0.82], [1.35, -0.82]].map(([x, z]) =>
    new THREE.CylinderGeometry(0.33, 0.33, 0.24, 16).rotateX(Math.PI / 2).translate(x, 0.33, z)))
  return { body: mergeGeometries([body, roof]), cabin, wheels, shadow: new THREE.PlaneGeometry(5.4, 2.6).rotateX(-Math.PI / 2).translate(0, 0.02, 0) }
}

/** Cars. Parked ones are static and cast sun shadows; the traffic drives along its lanes, wrapping
 * round at the edge of the city, and keeps to its soft contact shadow (the sun's shadow map is
 * only redrawn when the view moves). */
function Cars({ material, driving }: { material: Record<string, THREE.Material>; driving: boolean }) {
  const bodies = useRef<THREE.InstancedMesh>(null)
  const cabins = useRef<THREE.InstancedMesh>(null)
  const wheels = useRef<THREE.InstancedMesh>(null)
  const shadows = useRef<THREE.InstancedMesh>(null)
  const cars = useMemo(() => CITY.cars.filter((c) => (c.speed !== undefined) === driving), [driving])
  const data = useMemo(() => ({
    place: cars.map((car) => at(car.x, ROAD_Y, car.z, 1, 1, 1, car.along === 'x' ? 0 : Math.PI / 2)),
    colours: cars.map((car) => new THREE.Color(car.colour)),
  }), [cars])
  useInstances(bodies, data.place, data.colours)
  useInstances(cabins, data.place)
  useInstances(wheels, data.place)
  useInstances(shadows, data.place)
  const geometry = useMemo(carGeometry, [])
  const moved = useMemo(() => new THREE.Matrix4(), [])
  useFrame((state) => {
    if (!driving) return
    const t = state.clock.elapsedTime
    cars.forEach((car, i) => {
      const [lo, hi] = car.along === 'z' ? [EXTENT.z0, EXTENT.z1] : [EXTENT.x0, EXTENT.x1]
      const span = hi - lo
      const along = lo + ((((car.along === 'z' ? car.z : car.x) - lo + car.speed! * t) % span) + span) % span
      const yaw = car.along === 'x' ? (car.speed! > 0 ? 0 : Math.PI) : (car.speed! > 0 ? -Math.PI / 2 : Math.PI / 2)
      moved.copy(car.along === 'z' ? at(car.x, ROAD_Y, along, 1, 1, 1, yaw) : at(along, ROAD_Y, car.z, 1, 1, 1, yaw))
      for (const mesh of [bodies, cabins, wheels, shadows]) mesh.current?.setMatrixAt(i, moved)
    })
    for (const mesh of [bodies, cabins, wheels, shadows]) if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true
  })
  const n = cars.length
  return (
    <>
      <instancedMesh ref={shadows} args={[geometry.shadow, material.carShadow, n]} renderOrder={1} frustumCulled={!driving} />
      <instancedMesh ref={wheels} args={[geometry.wheels, material.carBase, n]} frustumCulled={!driving} />
      <instancedMesh ref={bodies} args={[geometry.body, material.carBody, n]} castShadow={!driving} frustumCulled={!driving} />
      <instancedMesh ref={cabins} args={[geometry.cabin, material.carGlass, n]} frustumCulled={!driving} />
    </>
  )
}

// ---------------------------------------------------------------- assembled

/** Drives the city shaders' clock. */
function Clock() {
  useFrame((state) => { CLOCK.value = state.clock.elapsedTime })
  return null
}

export default function Cityscape() {
  const geometry = useCityGeometry()
  const material = useMemo(() => {
    const std = (p: THREE.MeshStandardMaterialParameters) => hazed(new THREE.MeshStandardMaterial({ roughness: 0.92, ...p }))
    const road = asphalt(), slabs = paving(), lawn = grass()
    road.repeat.set(1 / 8, 1 / 8)
    const soft = (rgb: string, a: number) => texture(64, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
      r.addColorStop(0, `rgba(${rgb},${a})`)
      r.addColorStop(1, `rgba(${rgb},0)`)
      g.fillStyle = r
      g.fillRect(0, 0, s, s)
    })
    return {
      road: std({ color: '#5e636a', map: road }),
      pavement: std({ color: '#cbc5ba', map: slabs, vertexColors: true }),
      park: std({ color: '#8db35f', map: lawn, vertexColors: true }),
      kerb: std({ vertexColors: true }),
      mark: std({ vertexColors: true, roughness: 0.8 }),
      street: std({ vertexColors: true, roughness: 0.8 }),
      roof: std({ vertexColors: true }),
      shop: std({ map: shopfront(), vertexColors: true, roughness: 0.6 }),
      ribbon: std({ map: facade('ribbon'), vertexColors: true, roughness: 0.8 }),
      grid: std({ map: facade('grid'), vertexColors: true, roughness: 0.85 }),
      glass: std({ map: facade('glass'), vertexColors: true, roughness: 0.5, metalness: 0.1 }),
      trunk: std({ color: '#6b5a4a' }),
      crown: hazed(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, vertexColors: true }), true),
      blob: hazed(new THREE.MeshBasicMaterial({ map: soft('30,36,30', 0.4), transparent: true, depthWrite: false })),
      carShadow: hazed(new THREE.MeshBasicMaterial({ map: soft('20,22,26', 0.5), transparent: true, depthWrite: false })),
      carBody: std({ color: '#ffffff', roughness: 0.35, metalness: 0.25 }),
      carGlass: std({ color: '#26303a', roughness: 0.15, metalness: 0.3 }),
      carBase: std({ color: '#1c1e21', roughness: 0.8 }),
    }
  }, [])
  const ground = useMemo(() => {
    const w = EXTENT.x1 - EXTENT.x0 + 400, d = EXTENT.z1 - EXTENT.z0 + 400
    const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d)   // metres, so the asphalt tiles every 8 m
    return g.translate((EXTENT.x0 + EXTENT.x1) / 2, ROAD_Y, (EXTENT.z0 + EXTENT.z1) / 2)
  }, [])
  return (
    <group>
      <mesh geometry={ground} material={material.road} receiveShadow />
      <mesh geometry={geometry.pavements} material={material.pavement} receiveShadow />
      <mesh geometry={geometry.parks} material={material.park} receiveShadow />
      <mesh geometry={geometry.kerbs} material={material.kerb} receiveShadow castShadow />
      <mesh geometry={geometry.marks} material={material.mark} receiveShadow />
      <mesh geometry={geometry.street} material={material.street} receiveShadow castShadow />
      <mesh geometry={geometry.roofs} material={material.roof} receiveShadow castShadow />
      <mesh geometry={geometry.towerRoofs} material={material.roof} receiveShadow />
      <mesh geometry={geometry.shops} material={material.shop} receiveShadow castShadow />
      {(['ribbon', 'grid', 'glass'] as const).map((s) => <mesh key={s} geometry={geometry.walls[s]} material={material[s]} receiveShadow castShadow />)}
      {(['ribbon', 'grid', 'glass'] as const).map((s) => <mesh key={`tower-${s}`} geometry={geometry.towers[s]} material={material[s]} receiveShadow />)}
      <Trees material={material} />
      <Cars material={material} driving={false} />
      <Cars material={material} driving />
      <Clock />
      <EntranceSign />
    </group>
  )
}
