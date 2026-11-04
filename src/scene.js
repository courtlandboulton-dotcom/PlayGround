// ---------------------------------------------------------------------------
// DYNO LAB — 3D garage, car, dyno and cutaway engine
// ---------------------------------------------------------------------------

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { TURBO_LEVELS, INTERCOOLERS, EXHAUSTS, clamp } from './data.js'

const TAU = Math.PI * 2

function canvasTexture(renderer, width, height, draw, { srgb = true, repeat = null } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  draw(ctx, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(repeat[0], repeat[1])
  }
  return { texture, canvas, ctx, draw }
}

function addTextRedraw(queue, item) {
  queue.push(item)
}

function concreteDraw(ctx, w, h, seed = 1) {
  let s = seed
  const rnd = () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
  ctx.fillStyle = '#262b2f'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 4200; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const a = rnd() * 0.13
    const tone = rnd() > 0.5 ? 255 : 0
    ctx.fillStyle = `rgba(${tone},${tone},${tone},${a})`
    const r = rnd() * 2.2 + 0.4
    ctx.fillRect(x, y, r, r)
  }
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${0.06 + rnd() * 0.1})`
    ctx.lineWidth = 1 + rnd() * 3
    ctx.beginPath()
    let x = rnd() * w
    let y = rnd() * h
    ctx.moveTo(x, y)
    for (let j = 0; j < 5; j++) {
      x += (rnd() - 0.5) * 90
      y += (rnd() - 0.5) * 60
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  for (let i = 0; i < 14; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const r = 30 + rnd() * 90
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(0,0,0,${0.05 + rnd() * 0.08})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
  }
}

function box(w, h, d, material, x = 0, y = 0, z = 0, radius = null) {
  let geometry
  if (radius) geometry = new RoundedBoxGeometry(w, h, d, 3, radius)
  else geometry = new THREE.BoxGeometry(w, h, d)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, y, z)
  return mesh
}

function cyl(radiusTop, radiusBottom, height, segments, material, axis = 'y') {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material)
  if (axis === 'x') mesh.rotation.z = Math.PI / 2
  if (axis === 'z') mesh.rotation.x = Math.PI / 2
  return mesh
}

export function createGarage(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const gl = renderer.getContext()
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
  const gpuName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : ''
  const software = /swiftshader|llvmpipe|software|mesa offscreen/i.test(gpuName)
  if (software) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1))

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#05080b')
  scene.fog = new THREE.FogExp2('#05080b', 0.018)

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 90)

  // studio environment for paint and chrome
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envRT = pmrem.fromScene(new RoomEnvironment(renderer), 0.04)
  scene.environment = envRT.texture
  pmrem.dispose()

  const redrawQueue = []
  const tex = (w, h, draw, opts) => {
    const item = canvasTexture(renderer, w, h, draw, opts)
    addTextRedraw(redrawQueue, item)
    return item.texture
  }

  // -------------------------------------------------------------------------
  // materials
  // -------------------------------------------------------------------------
  const concreteMap = tex(512, 512, (ctx, w, h) => concreteDraw(ctx, w, h, 11), { repeat: [5, 4] })
  const wallMap = tex(512, 512, (ctx, w, h) => concreteDraw(ctx, w, h, 29), { repeat: [6, 2] })
  const floorMat = new THREE.MeshStandardMaterial({ map: concreteMap, color: '#7f858a', roughness: 0.78, metalness: 0.08 })
  const wallMat = new THREE.MeshStandardMaterial({ map: wallMap, color: '#6c7277', roughness: 0.92, metalness: 0.02 })
  const ceilingMat = new THREE.MeshStandardMaterial({ color: '#14181c', roughness: 0.9 })
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#23282d', metalness: 0.8, roughness: 0.38 })
  const steel = new THREE.MeshStandardMaterial({ color: '#7f8b92', metalness: 0.92, roughness: 0.28 })
  const darkSteel = new THREE.MeshStandardMaterial({ color: '#3b4248', metalness: 0.75, roughness: 0.4 })
  const carbon = new THREE.MeshPhysicalMaterial({ color: '#0c0e10', metalness: 0.45, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.3 })
  const rubber = new THREE.MeshStandardMaterial({ color: '#0e1012', roughness: 0.92, metalness: 0.02 })
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#071016', metalness: 0.35, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.04,
    envMapIntensity: 1.7, transparent: true, opacity: 0.96
  })
  const paint = new THREE.MeshPhysicalMaterial({
    color: '#b84b1f', metalness: 0.62, roughness: 0.27, clearcoat: 1, clearcoatRoughness: 0.055,
    envMapIntensity: 1.35
  })
  const accentMat = new THREE.MeshStandardMaterial({ color: '#ff7a2d', emissive: '#ff5a12', emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.5 })
  const headlightMat = new THREE.MeshStandardMaterial({ color: '#eaffff', emissive: '#bff6ff', emissiveIntensity: 4.5, toneMapped: false })
  const tailMat = new THREE.MeshStandardMaterial({ color: '#ff2d42', emissive: '#ff1d33', emissiveIntensity: 3.2, toneMapped: false })
  const neonCyan = new THREE.MeshBasicMaterial({ color: '#43e8d0', toneMapped: false })
  const neonOrange = new THREE.MeshBasicMaterial({ color: '#ff7a2d', toneMapped: false })
  const whiteLight = new THREE.MeshBasicMaterial({ color: '#e8f6ff', toneMapped: false })
  const toolboxMat = new THREE.MeshStandardMaterial({ color: '#a5312c', metalness: 0.5, roughness: 0.42 })
  const woodMat = new THREE.MeshStandardMaterial({ color: '#5b4130', roughness: 0.85 })
  const yellowMat = new THREE.MeshStandardMaterial({ color: '#d8a52b', roughness: 0.6, metalness: 0.1 })
  const chrome = new THREE.MeshStandardMaterial({ color: '#c9d4da', metalness: 1, roughness: 0.18 })
  const copper = new THREE.MeshStandardMaterial({ color: '#8d5c3a', metalness: 0.9, roughness: 0.35 })

  // -------------------------------------------------------------------------
  // room
  // -------------------------------------------------------------------------
  const room = new THREE.Group()
  scene.add(room)

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 21), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  room.add(floor)

  // floor decal
  const decalTex = tex(1024, 640, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(216,165,43,.62)'
    ctx.lineWidth = 5
    ctx.strokeRect(48, 42, w - 96, h - 84)
    ctx.strokeStyle = 'rgba(255,255,255,.09)'
    ctx.lineWidth = 2
    ctx.strokeRect(66, 60, w - 132, h - 120)
    // corner ticks
    ctx.strokeStyle = 'rgba(255,138,61,.8)'
    ctx.lineWidth = 8
    const c = 52
    for (const [x, y, dx, dy] of [[48, 42, 1, 1], [w - 48, 42, -1, 1], [48, h - 42, 1, -1], [w - 48, h - 42, -1, -1]]) {
      ctx.beginPath()
      ctx.moveTo(x + dx * c, y)
      ctx.lineTo(x, y)
      ctx.lineTo(x, y + dy * c)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(230,242,246,.54)'
    ctx.font = '700 66px Orbitron, Arial Black, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('BAY 01', w / 2, h / 2 + 20)
    ctx.font = '700 22px Rajdhani, Arial, sans-serif'
    ctx.fillStyle = 'rgba(67,232,208,.68)'
    ctx.letterSpacing = '9px'
    ctx.fillText('DYNO LAB · CHASSIS DYNO', w / 2, h / 2 + 62)
    // hazard blocks at the bottom edge
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(216,165,43,.7)' : 'rgba(20,23,25,.6)'
      ctx.save()
      ctx.translate(90 + i * 56, h - 34)
      ctx.rotate(-0.45)
      ctx.fillRect(0, 0, 42, 12)
      ctx.restore()
    }
  })
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(8.2, 5.1),
    new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, opacity: 0.85, depthWrite: false })
  )
  decal.rotation.x = -Math.PI / 2
  decal.position.set(0, 0.012, -0.25)
  room.add(decal)

  const backWall = box(24, 7.2, 0.3, wallMat, 0, 3.4, -9.8)
  backWall.receiveShadow = true
  room.add(backWall)
  const leftWall = box(0.3, 7.2, 21, wallMat, -10.4, 3.4, 0)
  leftWall.receiveShadow = true
  room.add(leftWall)
  const rightWall = box(0.3, 7.2, 21, wallMat, 10.4, 3.4, 0)
  rightWall.receiveShadow = true
  room.add(rightWall)
  const ceiling = box(24, 0.3, 21, ceilingMat, 0, 7.1, 0)
  room.add(ceiling)

  // wall panel seams
  const seamMat = new THREE.MeshStandardMaterial({ color: '#111519', roughness: 0.8 })
  for (let i = -4; i <= 4; i++) {
    room.add(box(0.05, 6.9, 0.06, seamMat, i * 2.6, 3.4, -9.62))
  }
  // ceiling trusses
  for (let z = -8; z <= 8; z += 4) {
    room.add(box(22, 0.18, 0.18, darkSteel, 0, 6.8, z))
    room.add(box(0.18, 0.55, 0.18, darkSteel, -10, 6.5, z))
    room.add(box(0.18, 0.55, 0.18, darkSteel, 10, 6.5, z))
  }
  for (let x = -8; x <= 8; x += 4) {
    room.add(box(0.16, 0.16, 20, darkSteel, x, 6.86, 0))
  }

  // strip lights
  const stripMat = new THREE.MeshBasicMaterial({ color: '#d9efff', toneMapped: false })
  for (const z of [-6, -2, 2, 6]) {
    const strip = box(7.2, 0.06, 0.12, stripMat, 0, 6.55, z)
    room.add(strip)
    const housing = box(7.5, 0.1, 0.28, darkMetal, 0, 6.61, z)
    room.add(housing)
  }

  // pendant lamps
  const shadeMat = new THREE.MeshStandardMaterial({ color: '#2e353b', metalness: 0.8, roughness: 0.35 })
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#fff3da', toneMapped: false })
  for (const [x, z, h] of [[-2.9, -2.8, 4.9], [-2.9, 2.6, 4.9], [3.1, 1.2, 5.4]]) {
    const lamp = new THREE.Group()
    lamp.position.set(x, h, z)
    lamp.add(box(0.04, 1.5, 0.04, darkMetal, 0, 1.4, 0))
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.34, 20, 1, true), shadeMat)
    shade.position.y = 0.62
    shade.rotation.x = Math.PI
    lamp.add(shade)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), bulbMat)
    bulb.position.y = 0.5
    lamp.add(bulb)
    room.add(lamp)
  }

  // neon wall strip
  room.add(box(20.4, 0.035, 0.04, neonCyan, 0, 0.36, -9.62))
  room.add(box(0.04, 0.035, 18.5, neonOrange, -10.22, 0.36, 0))
  room.add(box(20.4, 0.02, 0.02, neonOrange, 0, 6.22, -9.6))

  // neon sign
  const signTex = tex(1024, 300, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = '#43e8d0'
    ctx.shadowBlur = 38
    ctx.strokeStyle = 'rgba(190,255,247,.92)'
    ctx.lineWidth = 3
    ctx.font = '800 118px Orbitron, Arial Black, sans-serif'
    ctx.strokeText('DYNO LAB', w / 2, h / 2 - 8)
    ctx.fillStyle = 'rgba(43,255,229,.24)'
    ctx.fillText('DYNO LAB', w / 2, h / 2 - 8)
    ctx.shadowBlur = 14
    ctx.fillStyle = 'rgba(196,255,247,.95)'
    ctx.font = '600 28px Rajdhani, Arial, sans-serif'
    ctx.letterSpacing = '12px'
    ctx.fillText('PERFORMANCE CENTER · BAY 01', w / 2, h / 2 + 84)
    ctx.shadowColor = '#ff7a2d'
    ctx.shadowBlur = 18
    ctx.fillStyle = 'rgba(255,138,61,.8)'
    ctx.fillRect(w / 2 - 210, h / 2 + 52, 420, 2)
  })
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 1.38), signMat)
  sign.position.set(-1.9, 4.45, -9.63)
  room.add(sign)

  // garage roller door, back right
  const door = new THREE.Group()
  door.position.set(7.2, 0, -9.6)
  const doorPanelMat = new THREE.MeshStandardMaterial({ color: '#2b3238', metalness: 0.55, roughness: 0.5 })
  for (let i = 0; i < 16; i++) {
    const panel = box(4.6, 0.22, 0.06, doorPanelMat, 0, 0.28 + i * 0.24, 0)
    door.add(panel)
    if (i < 15) door.add(box(4.6, 0.018, 0.03, seamMat, 0, 0.4 + i * 0.24, -0.02))
  }
  door.add(box(0.12, 4.2, 0.1, darkMetal, -2.34, 2.1, 0.02))
  door.add(box(0.12, 4.2, 0.1, darkMetal, 2.34, 2.1, 0.02))
  room.add(door)

  // tool chest
  const chest = new THREE.Group()
  chest.position.set(-6.5, 0, -8.9)
  chest.add(box(2.3, 1.3, 0.75, toolboxMat, 0, 0.75, 0, 0.04))
  for (let i = 0; i < 5; i++) {
    chest.add(box(2.16, 0.02, 0.06, darkMetal, 0, 0.3 + i * 0.22, 0.39))
    chest.add(box(0.5, 0.03, 0.03, chrome, 0, 0.24 + i * 0.22, 0.42))
  }
  chest.add(box(2.35, 0.05, 0.8, steel, 0, 1.42, 0))
  for (const x of [-0.9, 0.9]) for (const z of [-0.26, 0.26]) {
    const wheel = cyl(0.11, 0.11, 0.08, 12, rubber, 'z')
    wheel.position.set(x, 0.08, z)
    chest.add(wheel)
  }
  room.add(chest)

  // tire stacks
  const tireMat = new THREE.MeshStandardMaterial({ color: '#15181a', roughness: 0.95 })
  for (const [x, z, n] of [[-8.7, -6.7, 4], [-7.7, -7.4, 3], [7.8, -7.3, 3]]) {
    for (let i = 0; i < n; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.14, 8, 18), tireMat)
      t.rotation.x = -Math.PI / 2
      t.position.set(x, 0.16 + i * 0.28, z)
      t.castShadow = true
      room.add(t)
    }
  }

  // workbench, right wall
  const bench = new THREE.Group()
  bench.position.set(9.5, 0, -2.2)
  bench.rotation.y = -Math.PI / 2
  bench.add(box(4.5, 0.12, 1.0, woodMat, 0, 0.92, 0))
  for (const x of [-1.9, 1.9]) for (const z of [-0.36, 0.36]) {
    bench.add(box(0.08, 0.9, 0.08, darkMetal, x, 0.45, z))
  }
  bench.add(box(4.3, 0.05, 0.85, darkMetal, 0, 0.78, 0))
  // small parts on the bench
  bench.add(box(0.65, 0.22, 0.35, darkMetal, -1.1, 1.1, 0))
  bench.add(box(0.4, 0.3, 0.3, toolboxMat, 0.8, 1.12, 0))
  const benchVice = box(0.3, 0.22, 0.4, steel, 1.7, 1.12, 0)
  bench.add(benchVice)
  room.add(bench)

  // pegboard
  const pegTex = tex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3b3028'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(0,0,0,.25)'
    for (let x = 10; x < w; x += 16) for (let y = 10; y < h; y += 16) {
      ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill()
    }
  }, { repeat: [2.2, 1.2] })
  const peg = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.4), new THREE.MeshStandardMaterial({ map: pegTex, roughness: 0.85 }))
  peg.position.set(-5.9, 2.5, -9.61)
  room.add(peg)
  // tools on the board
  for (let i = 0; i < 7; i++) {
    const tool = box(0.06, 0.7 + (i % 3) * 0.2, 0.035, darkSteel, -7.7 + i * 0.62, 2.55, -9.56)
    tool.rotation.z = (i % 2 ? 1 : -1) * 0.08
    room.add(tool)
  }

  // wall shelves, back right
  const shelf = new THREE.Group()
  shelf.position.set(7.8, 2.2, -9.5)
  shelf.add(box(3.1, 0.07, 0.5, darkMetal, 0, 0, 0))
  shelf.add(box(3.1, 0.07, 0.5, darkMetal, 0, 0.72, 0))
  shelf.add(box(3.1, 0.07, 0.5, darkMetal, 0, 1.44, 0))
  for (let i = 0; i < 5; i++) {
    const b = box(0.4 + (i % 2) * 0.2, 0.3, 0.32, i > 2 ? toolboxMat : darkMetal, -1.15 + i * 0.58, 0.22 + (i % 3) * 0.72, 0.06)
    shelf.add(b)
  }
  room.add(shelf)

  // rolling cart
  const cart = new THREE.Group()
  cart.position.set(4.4, 0, -4.6)
  cart.rotation.y = 0.3
  cart.add(box(1.1, 0.08, 0.7, toolboxMat, 0, 0.9, 0))
  cart.add(box(1.1, 0.08, 0.7, toolboxMat, 0, 1.2, 0))
  for (const x of [-0.48, 0.48]) for (const z of [-0.28, 0.28]) {
    cart.add(box(0.05, 0.88, 0.05, darkMetal, x, 0.48, z))
    const w = cyl(0.08, 0.08, 0.06, 10, rubber, 'z')
    w.position.set(x, 0.08, z)
    cart.add(w)
  }
  cart.add(box(0.7, 0.18, 0.4, darkMetal, 0, 1.38, 0))
  room.add(cart)

  // compressed air hose / detail on back wall
  const hoseMat = new THREE.MeshStandardMaterial({ color: '#c25a2a', roughness: 0.7 })
  const hoseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-9.7, 4.9, -9.4),
    new THREE.Vector3(-9.2, 4.4, -9.2),
    new THREE.Vector3(-9.65, 4.0, -9.3),
    new THREE.Vector3(-9.1, 3.5, -9.1),
    new THREE.Vector3(-9.55, 3.1, -9.25)
  ])
  const hose = new THREE.Mesh(new THREE.TubeGeometry(hoseCurve, 24, 0.035, 6, false), hoseMat)
  room.add(hose)

  // -------------------------------------------------------------------------
  // lighting
  // -------------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight('#b9d7e8', '#14100c', 0.55))

  const key = new THREE.SpotLight('#ffe8cf', 320, 24, 0.68, 0.62, 1.3)
  key.position.set(0.5, 6.4, 2.4)
  key.target.position.set(0, 0.4, -0.8)
  key.castShadow = true
  key.shadow.mapSize.set(software ? 1024 : 2048, software ? 1024 : 2048)
  key.shadow.camera.near = 1
  key.shadow.camera.far = 18
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  scene.add(key)
  scene.add(key.target)

  const fillCyan = new THREE.PointLight('#48d8ff', 55, 18, 1.8)
  fillCyan.position.set(-7, 3.5, 3.5)
  scene.add(fillCyan)

  const fillWarm = new THREE.PointLight('#ff8a3d', 45, 15, 1.8)
  fillWarm.position.set(7.5, 3.2, -5)
  scene.add(fillWarm)

  const ceilingWash = new THREE.PointLight('#d7efff', 42, 16, 1.8)
  ceilingWash.position.set(0, 6, -3)
  scene.add(ceilingWash)

  const underglow = new THREE.PointLight('#43e8d0', 9, 4.2, 2)
  underglow.position.set(0, 0.3, 0)
  scene.add(underglow)

  // -------------------------------------------------------------------------
  // car
  // -------------------------------------------------------------------------
  const car = new THREE.Group()
  car.position.set(0, 0.14, 0)
  scene.add(car)

  const bodyShape = new THREE.Shape()
  bodyShape.moveTo(-2.28, 0.3)
  bodyShape.lineTo(-2.35, 0.56)
  bodyShape.quadraticCurveTo(-2.31, 0.76, -2.06, 0.83)
  bodyShape.lineTo(-1.45, 0.87)
  bodyShape.quadraticCurveTo(-1.03, 0.93, -0.79, 1.19)
  bodyShape.quadraticCurveTo(-0.58, 1.37, -0.1, 1.39)
  bodyShape.quadraticCurveTo(0.3, 1.39, 0.56, 1.2)
  bodyShape.quadraticCurveTo(0.88, 0.98, 1.47, 0.88)
  bodyShape.lineTo(2.06, 0.81)
  bodyShape.quadraticCurveTo(2.31, 0.73, 2.37, 0.56)
  bodyShape.lineTo(2.31, 0.31)
  bodyShape.lineTo(1.86, 0.25)
  bodyShape.lineTo(-1.86, 0.25)
  bodyShape.closePath()

  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 1.82, bevelEnabled: true, bevelThickness: 0.055, bevelSize: 0.06, bevelSegments: 4, curveSegments: 16
  })
  bodyGeo.translate(0, 0, -0.91)
  bodyGeo.rotateY(-Math.PI / 2)
  const body = new THREE.Mesh(bodyGeo, paint)
  body.castShadow = true
  body.receiveShadow = true
  car.add(body)

  const canopyShape = new THREE.Shape()
  canopyShape.moveTo(0.64, 0.8)
  canopyShape.lineTo(0.29, 1.36)
  canopyShape.quadraticCurveTo(0.03, 1.43, -0.35, 1.39)
  canopyShape.lineTo(-0.72, 1.16)
  canopyShape.lineTo(-1.02, 0.87)
  canopyShape.lineTo(-0.98, 0.8)
  canopyShape.closePath()
  const canopyGeo = new THREE.ExtrudeGeometry(canopyShape, {
    depth: 1.56, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 12
  })
  canopyGeo.translate(0, 0, -0.78)
  canopyGeo.rotateY(-Math.PI / 2)
  const canopy = new THREE.Mesh(canopyGeo, glass)
  canopy.position.y = 0.01
  canopy.castShadow = true
  car.add(canopy)

  // roof rail accent
  car.add(box(1.58, 0.035, 0.06, carbon, 0, 1.48, -0.06))
  // side skirts
  for (const x of [-0.93, 0.93]) {
    car.add(box(0.09, 0.1, 2.5, carbon, x, 0.27, 0))
  }
  // front splitter
  car.add(box(1.9, 0.045, 0.52, carbon, 0, 0.2, 2.17))
  car.add(box(0.14, 0.12, 0.5, carbon, -0.93, 0.25, 2.15))
  car.add(box(0.14, 0.12, 0.5, carbon, 0.93, 0.25, 2.15))
  // rear diffuser + fins
  car.add(box(1.78, 0.09, 0.48, carbon, 0, 0.24, -2.18))
  for (let i = -2; i <= 2; i++) {
    car.add(box(0.045, 0.13, 0.4, carbon, i * 0.3, 0.22, -2.16))
  }
  // ducktail
  car.add(box(0.07, 0.2, 0.08, carbon, -0.62, 1.03, -1.98))
  car.add(box(0.07, 0.2, 0.08, carbon, 0.62, 1.03, -1.98))
  const wing = box(1.72, 0.045, 0.34, carbon, 0, 1.13, -2.05)
  wing.rotation.x = -0.1
  car.add(wing)
  // hood vents
  for (let i = 0; i < 4; i++) {
    car.add(box(0.4, 0.015, 0.035, carbon, -0.39 + (i % 2) * 0.78, 0.905 + i * 0.002, 1.2 - i * 0.13))
  }
  // headlights
  for (const x of [-0.63, 0.63]) {
    const light = box(0.5, 0.06, 0.05, headlightMat, x, 0.71, 2.31)
    light.rotation.x = -0.14
    car.add(light)
    car.add(box(0.56, 0.13, 0.09, carbon, x, 0.69, 2.29))
  }
  // tail bar
  car.add(box(1.45, 0.055, 0.035, tailMat, 0, 0.83, -2.355))
  // badge
  const badgeTex = tex(128, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(230,255,250,.95)'
    ctx.font = '800 40px Orbitron, Arial Black, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('DL', w / 2, h / 2 + 14)
  })
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.085), new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true, toneMapped: false }))
  badge.position.set(0, 0.58, 2.39)
  badge.rotation.x = -0.2
  car.add(badge)
  // mirrors
  for (const x of [-1.01, 1.01]) {
    const arm = box(0.12, 0.025, 0.05, carbon, x, 1.05, 0.55)
    car.add(arm)
    const mirror = box(0.2, 0.1, 0.12, paint, x + Math.sign(x) * 0.08, 1.07, 0.53, 0.03)
    car.add(mirror)
  }
  // exhaust tips
  const exhaustTips = []
  for (const x of [-0.34, 0.34]) {
    const tipGroup = new THREE.Group()
    const tip = cyl(0.075, 0.085, 0.24, 16, chrome, 'z')
    tip.position.z = 0.05
    tipGroup.add(tip)
    tipGroup.add(cyl(0.095, 0.095, 0.06, 16, darkMetal, 'z'))
    tipGroup.position.set(x, 0.37, -2.36)
    car.add(tipGroup)
    exhaustTips.push(tipGroup)
  }
  // underglow strip
  car.add(box(1.55, 0.02, 2.7, neonCyan, 0, 0.115, 0))

  // wheels
  const wheelSpinGroups = []
  function makeWheel(x, z) {
    const wheel = new THREE.Group()
    wheel.position.set(x, 0.42, z)
    const spin = new THREE.Group()
    const tire = cyl(0.42, 0.42, 0.3, 28, rubber, 'x')
    tire.castShadow = true
    spin.add(tire)
    const rim = cyl(0.268, 0.268, 0.312, 22, chrome, 'x')
    spin.add(rim)
    const barrel = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.022, 8, 22), chrome)
    barrel.rotation.y = Math.PI / 2
    spin.add(barrel)
    for (let i = 0; i < 5; i++) {
      const spoke = box(0.035, 0.5, 0.06, chrome, 0, 0, 0)
      spoke.rotation.x = (i / 5) * Math.PI
      spin.add(spoke)
    }
    const hub = cyl(0.075, 0.075, 0.33, 14, darkMetal, 'x')
    spin.add(hub)
    const disc = cyl(0.22, 0.22, 0.022, 22, darkSteel, 'x')
    spin.add(disc)
    wheel.add(spin)
    const caliper = box(0.05, 0.16, 0.08, accentMat, 0, 0.17, -0.02)
    caliper.position.x = Math.sign(x) * 0.03
    wheel.add(caliper)
    car.add(wheel)
    wheelSpinGroups.push(spin)
    return wheel
  }
  makeWheel(-0.89, 1.42)
  makeWheel(0.89, 1.42)
  makeWheel(-0.89, -1.42)
  makeWheel(0.89, -1.42)

  // dyno platform
  const dyno = new THREE.Group()
  dyno.position.set(0, 0, 0)
  const platform = box(5.2, 0.12, 4.4, darkSteel, 0, 0.07, -1.35)
  platform.receiveShadow = true
  dyno.add(platform)
  for (let i = 0; i < 18; i++) {
    dyno.add(box(0.28, 0.12, 0.1, i % 2 ? yellowMat : carbon, -2.6 + i * 0.3, 0.08, 0.83))
  }
  // roller cradles
  const rollerMeshes = []
  for (const z of [-0.88, -1.92]) {
    const roller = cyl(0.2, 0.2, 2.5, 22, steel, 'x')
    roller.position.set(0, 0.25, z)
    roller.castShadow = true
    dyno.add(roller)
    for (let i = -3; i <= 3; i++) {
      const groove = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.012, 6, 18), darkMetal)
      groove.rotation.y = Math.PI / 2
      groove.position.set(i * 0.34, 0.25, z)
      dyno.add(groove)
    }
    // bearing blocks
    for (const x of [-1.35, 1.35]) {
      dyno.add(box(0.22, 0.28, 0.34, darkMetal, x, 0.2, z))
    }
    rollerMeshes.push(roller)
  }
  // tie-down straps
  for (const [x, z, rot] of [[-1.1, -1.3, 0.42], [1.1, -1.3, -0.42], [-1.05, 1.25, 0.3], [1.05, 1.25, -0.3]]) {
    const strap = box(0.08, 0.018, 1.8, new THREE.MeshStandardMaterial({ color: '#1b2024', roughness: 0.8 }), x, 0.32, z)
    strap.rotation.z = rot
    strap.rotation.x = 0.18
    dyno.add(strap)
    dyno.add(box(0.16, 0.04, 0.2, yellowMat, x * 1.5, 0.15, z))
  }
  dyno.add(box(0.36, 0.18, 1.0, darkMetal, -0.89, 0.13, -1.42))
  dyno.add(box(0.36, 0.18, 1.0, darkMetal, 0.89, 0.13, -1.42))
  scene.add(dyno)
  const rollers = rollerMeshes

  // chassis dyno mast + monitor
  const mast = new THREE.Group()
  mast.position.set(3.5, 0, -3.2)
  mast.add(box(0.12, 2.4, 0.12, darkMetal, 0, 1.2, 0))
  mast.add(box(0.9, 0.12, 0.7, darkMetal, 0, 2.45, 0))
  mast.add(box(0.16, 0.5, 0.16, darkMetal, 0, 2.1, 0))
  const mastScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.42), new THREE.MeshBasicMaterial({ color: '#0a1b1c' }))
  mastScreen.position.set(0, 2.18, 0.36)
  mastScreen.rotation.x = -0.1
  mast.add(mastScreen)
  scene.add(mast)

  // cooling fan, front left
  const fan = new THREE.Group()
  fan.position.set(-2.8, 0, 3.55)
  fan.rotation.y = -0.45
  fan.add(box(0.1, 0.18, 1.4, darkMetal, 0, 0.3, 0))
  fan.add(box(1.2, 0.1, 0.1, darkMetal, 0, 0.3, 0.8))
  const fanRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 32), darkSteel)
  fanRing.position.set(0, 1.2, 0)
  fan.add(fanRing)
  const fanBlades = new THREE.Group()
  fanBlades.position.set(0, 1.2, 0)
  for (let i = 0; i < 6; i++) {
    const blade = box(0.42, 0.05, 0.16, darkSteel, 0.3, 0, 0)
    blade.rotation.z = (i / 6) * TAU
    fanBlades.add(blade)
  }
  fan.add(fanBlades)
  const fanHub = cyl(0.13, 0.13, 0.12, 12, steel, 'z')
  fanHub.position.set(0, 1.2, -0.03)
  fan.add(fanHub)
  scene.add(fan)

  // wall-mounted dyno screen
  const dynScreenCanvas = document.createElement('canvas')
  dynScreenCanvas.width = 640
  dynScreenCanvas.height = 360
  const dynCtx = dynScreenCanvas.getContext('2d')
  const dynTexture = new THREE.CanvasTexture(dynScreenCanvas)
  dynTexture.colorSpace = THREE.SRGBColorSpace
  const dynScreenMat = new THREE.MeshBasicMaterial({ map: dynTexture, toneMapped: false })
  const dynScreen = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.74), dynScreenMat)
  dynScreen.position.set(3.0, 3.55, -9.6)
  room.add(dynScreen)
  room.add(box(3.3, 1.94, 0.09, darkMetal, 3.0, 3.55, -9.68))
  room.add(box(0.22, 0.22, 0.05, neonCyan, 3.0, 4.6, -9.6))

  // -------------------------------------------------------------------------
  // cutaway engine on a stand
  // -------------------------------------------------------------------------
  const engine = buildEngine()
  engine.position.set(-4.9, 0, 1.8)
  engine.rotation.y = 0.72
  scene.add(engine)

  function buildEngine() {
    const root = new THREE.Group()
    const stand = new THREE.Group()
    stand.add(box(2.7, 0.12, 1.2, darkSteel, 0, 0.16, 0))
    stand.add(box(0.12, 1.0, 0.12, darkSteel, -1.05, 0.65, -0.35))
    stand.add(box(0.12, 1.0, 0.12, darkSteel, 1.05, 0.65, -0.35))
    stand.add(box(0.12, 1.0, 0.12, darkSteel, -1.05, 0.65, 0.46))
    stand.add(box(0.12, 1.0, 0.12, darkSteel, 1.05, 0.65, 0.46))
    stand.add(box(2.5, 0.09, 0.95, darkMetal, 0, 1.06, 0))
    for (const x of [-1.1, 1.1]) for (const z of [-0.38, 0.38]) {
      const caster = cyl(0.1, 0.1, 0.08, 10, rubber, 'z')
      caster.position.set(x, 0.06, z)
      stand.add(caster)
    }
    root.add(stand)

    // brass plaque
    const plaqueTex = tex(512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#0a0c0e'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(67,232,208,.5)'
      ctx.lineWidth = 3
      ctx.strokeRect(8, 8, w - 16, h - 16)
      ctx.fillStyle = '#dffdf8'
      ctx.font = '700 34px Orbitron, Arial Black, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('DYNO LAB', w / 2, 54)
      ctx.fillStyle = 'rgba(67,232,208,.9)'
      ctx.font = '600 22px Rajdhani, Arial, sans-serif'
      ctx.letterSpacing = '5px'
      ctx.fillText('2.0L I4 TURBO · CUTAWAY', w / 2, 92)
    })
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), new THREE.MeshBasicMaterial({ map: plaqueTex, transparent: true, toneMapped: false }))
    plaque.position.set(0, 0.62, 0.7)
    plaque.rotation.x = -0.22
    root.add(plaque)

    const eng = new THREE.Group()
    eng.position.set(0, 1.62, 0)
    root.add(eng)

    // block & bedplate
    const block = box(2.0, 0.64, 0.72, new THREE.MeshStandardMaterial({ color: '#2b3035', metalness: 0.8, roughness: 0.42 }), 0, 0.05, 0, 0.05)
    block.castShadow = true
    eng.add(block)
    eng.add(box(2.08, 0.24, 0.78, darkMetal, 0, -0.37, 0))
    eng.add(box(2.12, 0.06, 0.84, darkSteel, 0, -0.24, 0))

    // four cylinder sleeves
    const sleeveMat = new THREE.MeshStandardMaterial({ color: '#777f85', metalness: 0.95, roughness: 0.24 })
    const pistonMat = new THREE.MeshStandardMaterial({ color: '#d8e1e6', metalness: 0.92, roughness: 0.2 })
    const rodMat = new THREE.MeshStandardMaterial({ color: '#9aa6ad', metalness: 0.9, roughness: 0.26 })
    const pistons = []
    const rods = []
    const chambers = []
    for (let i = 0; i < 4; i++) {
      const x = -0.69 + i * 0.46
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.52, 18, 1, true), sleeveMat)
      sleeve.position.set(x, 0.38, 0)
      eng.add(sleeve)
      const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.16, 16), pistonMat)
      piston.position.set(x, 0.25, 0)
      piston.castShadow = true
      eng.add(piston)
      pistons.push(piston)
      const rod = box(0.045, 0.4, 0.055, rodMat, x, 0.01, 0)
      rods.push(rod)
      eng.add(rod)
      // combustion chamber glow
      const chamber = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.24), new THREE.MeshBasicMaterial({ color: '#ff7a2d', transparent: true, opacity: 0.0, toneMapped: false }))
      chamber.position.set(x, 0.68, 0)
      eng.add(chamber)
      chambers.push(chamber)
    }

    // crank
    const crank = new THREE.Group()
    crank.position.set(0, -0.2, 0)
    const shaft = cyl(0.07, 0.07, 2.1, 16, steel, 'x')
    crank.add(shaft)
    for (let i = 0; i < 4; i++) {
      const disc = cyl(0.16, 0.16, 0.07, 18, darkSteel, 'x')
      disc.position.x = -0.7 + i * 0.46
      crank.add(disc)
      const throwArm = box(0.08, 0.3, 0.08, steel, -0.7 + i * 0.46, 0.14, 0)
      crank.add(throwArm)
    }
    eng.add(crank)

    // head + valve cover
    eng.add(box(2.06, 0.18, 0.8, new THREE.MeshStandardMaterial({ color: '#aeb7bd', metalness: 0.85, roughness: 0.3 }), 0, 0.55, 0, 0.02))
    for (let i = 0; i < 4; i++) {
      eng.add(box(0.4, 0.07, 0.7, darkMetal, -0.69 + i * 0.46, 0.66, 0))
    }
    const cover = box(1.98, 0.22, 0.62, new THREE.MeshStandardMaterial({ color: '#8f2626', metalness: 0.65, roughness: 0.35 }), 0, 0.78, 0, 0.04)
    eng.add(cover)
    const coverTex = tex(512, 160, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(235,250,250,.9)'
      ctx.font = '700 30px Orbitron, Arial Black, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('DYNO LAB', w / 2, 62)
      ctx.fillStyle = 'rgba(67,232,208,.9)'
      ctx.font = '600 19px Rajdhani, Arial, sans-serif'
      ctx.letterSpacing = '6px'
      ctx.fillText('2.0 TURBO', w / 2, 106)
    })
    const coverLabel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.31), new THREE.MeshBasicMaterial({ map: coverTex, transparent: true, toneMapped: false }))
    coverLabel.rotation.x = -Math.PI / 2
    coverLabel.position.set(0, 0.895, 0)
    eng.add(coverLabel)

    // intake manifold
    const intakeMat = new THREE.MeshStandardMaterial({ color: '#8d979d', metalness: 0.85, roughness: 0.3 })
    const plenum = cyl(0.13, 0.13, 1.85, 14, intakeMat, 'x')
    plenum.position.set(0, 0.5, -0.63)
    eng.add(plenum)
    for (let i = 0; i < 4; i++) {
      const runner = cyl(0.055, 0.065, 0.34, 10, intakeMat, 'z')
      runner.position.set(-0.69 + i * 0.46, 0.49, -0.44)
      eng.add(runner)
    }
    eng.add(box(0.3, 0.18, 0.3, darkMetal, -0.9, 0.5, -0.75))
    // throttle body
    const throttle = cyl(0.1, 0.1, 0.22, 12, steel, 'x')
    throttle.position.set(-1.05, 0.5, -0.63)
    eng.add(throttle)

    // exhaust manifold + turbo
    const exhaustMat = new THREE.MeshStandardMaterial({
      color: '#3a3330', metalness: 0.8, roughness: 0.4, emissive: '#ff4d00', emissiveIntensity: 0
    })
    const exhaustGroup = new THREE.Group()
    const turboGroup = new THREE.Group()
    turboGroup.position.set(1.24, 0.12, 0.46)
    const turboSpin = new THREE.Group()
    const turboWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 18), steel)
    turboWheel.rotation.z = Math.PI / 2
    turboSpin.add(turboWheel)
    for (let i = 0; i < 9; i++) {
      const blade = box(0.02, 0.3, 0.06, steel, 0, 0, 0)
      blade.rotation.x = (i / 9) * Math.PI
      turboSpin.add(blade)
    }
    turboSpin.position.set(0.04, 0, 0)
    turboGroup.add(turboSpin)
    // housings
    const compressorHousing = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.09, 10, 22), new THREE.MeshStandardMaterial({ color: '#7b868d', metalness: 0.9, roughness: 0.32 }))
    compressorHousing.rotation.y = Math.PI / 2
    compressorHousing.position.set(0.04, 0, 0)
    turboGroup.add(compressorHousing)
    const turbineHousing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.08, 10, 20), exhaustMat)
    turbineHousing.rotation.y = Math.PI / 2
    turbineHousing.position.set(0.04, 0, 0.32)
    turboGroup.add(turbineHousing)
    turboGroup.add(box(0.18, 0.18, 0.22, darkMetal, 0.04, 0, 0.16))
    // downpipe
    const downpipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.28, 0.02, 0.82),
      new THREE.Vector3(1.36, -0.25, 0.96),
      new THREE.Vector3(1.5, -0.5, 1.1)
    ]), 18, 0.07, 8, false), exhaustMat)
    exhaustGroup.add(downpipe)
    // manifold runners
    for (let i = 0; i < 4; i++) {
      const x = -0.69 + i * 0.46
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, 0.48, 0.37),
        new THREE.Vector3(x, 0.34, 0.55),
        new THREE.Vector3(x + 0.18, 0.18, 0.66),
        new THREE.Vector3(1.0, 0.13, 0.72)
      ])
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.048, 7, false), exhaustMat)
      exhaustGroup.add(tube)
    }
    eng.add(exhaustGroup)
    eng.add(turboGroup)
    const turboGlow = new THREE.PointLight('#ff5a12', 0, 2.2, 2)
    turboGlow.position.set(1.3, 0.2, 0.6)
    eng.add(turboGlow)

    // intercooler (changes with upgrade)
    const icGroup = new THREE.Group()
    icGroup.position.set(-0.95, 0.1, 0.62)
    const icCore = box(0.95, 0.52, 0.16, new THREE.MeshStandardMaterial({ color: '#646f76', metalness: 0.9, roughness: 0.42 }), 0, 0, 0)
    icGroup.add(icCore)
    for (let i = 0; i < 10; i++) {
      icGroup.add(box(0.04, 0.5, 0.19, darkSteel, -0.43 + i * 0.095, 0, 0))
    }
    icGroup.add(cyl(0.07, 0.07, 0.4, 10, steel, 'x').translateX(-0.62))
    icGroup.add(cyl(0.07, 0.07, 0.4, 10, steel, 'x').translateX(0.62))
    eng.add(icGroup)

    // front accessories / pulleys
    const accessory = new THREE.Group()
    accessory.position.set(-1.08, 0.02, 0)
    const crankPulley = cyl(0.19, 0.19, 0.1, 18, steel, 'x')
    crankPulley.position.set(-0.1, -0.2, 0)
    accessory.add(crankPulley)
    const alt = cyl(0.14, 0.14, 0.34, 16, darkSteel, 'x')
    alt.position.set(-0.18, 0.18, 0.42)
    accessory.add(alt)
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.02, 6, 26), rubber)
    belt.rotation.y = Math.PI / 2
    belt.position.set(-0.18, -0.03, 0.18)
    belt.scale.set(1, 1.25, 1)
    accessory.add(belt)
    eng.add(accessory)

    // ECU + wiring
    const ecu = box(0.4, 0.26, 0.16, darkMetal, 0.55, 0.55, -0.72)
    eng.add(ecu)
    const wireMat = new THREE.MeshStandardMaterial({ color: '#7d2a26', roughness: 0.6 })
    for (let i = 0; i < 4; i++) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.55, 0.55, -0.66),
        new THREE.Vector3(0.3 + i * 0.1, 0.6, -0.72 - i * 0.02),
        new THREE.Vector3(0.1 + i * 0.1, 0.45, -0.5)
      ])
      eng.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.012, 5, false), wireMat))
    }
    // oil cap + dipstick
    eng.add(cyl(0.05, 0.05, 0.06, 10, accentMat, 'y').translateY(0.95).translateX(0.7).translateZ(0.1))
    eng.add(box(0.02, 0.5, 0.02, yellowMat, 0.9, 0.8, 0.3))

    // engine idle glow / status light
    const status = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: '#43e8d0', toneMapped: false }))
    status.position.set(-1.13, 0.7, 0.52)
    eng.add(status)

    root.userData = {
      eng, pistons, rods, crank, turboSpin, turboGroup, turboGlow, exhaustMat, exhaustGroup,
      icGroup, icCore, chambers, cranePulley: crankPulley, status, accessory, engineScale: 1
    }
    return root
  }

  // -------------------------------------------------------------------------
  // particles
  // -------------------------------------------------------------------------
  const smokeCanvas = document.createElement('canvas')
  smokeCanvas.width = smokeCanvas.height = 64
  const smCtx = smokeCanvas.getContext('2d')
  const grad = smCtx.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  smCtx.fillStyle = grad
  smCtx.fillRect(0, 0, 64, 64)
  const smokeTex = new THREE.CanvasTexture(smokeCanvas)

  const P_COUNT = software ? 70 : 140
  const pGeo = new THREE.BufferGeometry()
  const pPos = new Float32Array(P_COUNT * 3)
  const pCol = new Float32Array(P_COUNT * 3)
  const pAlpha = new Float32Array(P_COUNT)
  const pSize = new Float32Array(P_COUNT)
  const pVel = new Float32Array(P_COUNT * 3)
  const pLife = new Float32Array(P_COUNT)
  const pMaxLife = new Float32Array(P_COUNT)
  const pActive = new Uint8Array(P_COUNT)
  for (let i = 0; i < P_COUNT; i++) {
    pPos[i * 3 + 1] = -50
    pSize[i] = 0.3
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
  pGeo.setAttribute('aColor', new THREE.BufferAttribute(pCol, 3))
  pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1))
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1))
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: smokeTex } },
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      attribute vec3 aColor;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vAlpha = aAlpha;
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (800.0 / max(-mv.z, 0.1));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vColor, t.a * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending
  })
  const points = new THREE.Points(pGeo, pMat)
  points.frustumCulled = false
  scene.add(points)
  let pCursor = 0

  function spawnParticle(x, y, z, vx, vy, vz, size, life, r, g, b, a) {
    const i = pCursor
    pCursor = (pCursor + 1) % P_COUNT
    pPos[i * 3] = x
    pPos[i * 3 + 1] = y
    pPos[i * 3 + 2] = z
    pVel[i * 3] = vx
    pVel[i * 3 + 1] = vy
    pVel[i * 3 + 2] = vz
    pLife[i] = life
    pMaxLife[i] = life
    pSize[i] = size
    pCol[i * 3] = r
    pCol[i * 3 + 1] = g
    pCol[i * 3 + 2] = b
    pAlpha[i] = a
    pActive[i] = 1
  }

  // floating dust
  const dustCount = software ? 60 : 140
  const dustGeo = new THREE.BufferGeometry()
  const dustPos = new Float32Array(dustCount * 3)
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 18
    dustPos[i * 3 + 1] = Math.random() * 5.5 + 0.3
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 16
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: '#a7c4d2', size: 0.024, transparent: true, opacity: 0.22, depthWrite: false, sizeAttenuation: true
  }))
  scene.add(dust)

  // -------------------------------------------------------------------------
  // camera controls
  // -------------------------------------------------------------------------
  const presets = {
    intro: { theta: 0.74, phi: 1.18, radius: 9.6, target: new THREE.Vector3(-1.1, 0.95, 0) },
    car: { theta: 0.78, phi: 1.14, radius: 9.1, target: new THREE.Vector3(0, 0.92, -0.15) },
    engine: { theta: 0.78, phi: 1.23, radius: 4.2, target: new THREE.Vector3(-4.85, 1.78, 1.78) },
    dyno: { theta: 2.48, phi: 1.3, radius: 6.3, target: new THREE.Vector3(0, 0.78, -1.1) }
  }
  const cam = {
    theta: presets.intro.theta, phi: presets.intro.phi, radius: presets.intro.radius,
    target: presets.intro.target.clone(), desiredTheta: presets.intro.theta,
    desiredPhi: presets.intro.phi, desiredRadius: presets.intro.radius,
    desiredTarget: presets.intro.target.clone(), preset: 'intro', time: 0, shake: 0
  }
  function applyPreset(name, instant = false) {
    const p = presets[name] || presets.car
    cam.preset = name
    cam.desiredTheta = p.theta
    cam.desiredPhi = p.phi
    cam.desiredRadius = p.radius
    cam.desiredTarget.copy(p.target)
    if (instant) {
      cam.theta = p.theta
      cam.phi = p.phi
      cam.radius = p.radius
      cam.target.copy(p.target)
    }
  }
  applyPreset('intro', true)

  let dragging = false
  let lastPX = 0
  let lastPY = 0
  const pointerCache = new Map()
  let pinchDist = 0
  let interacted = false
  const rotateHint = document.getElementById('rotateHint')

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return
    pointerCache.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointerCache.size === 1) {
      dragging = true
      lastPX = e.clientX
      lastPY = e.clientY
      canvas.setPointerCapture?.(e.pointerId)
    } else if (pointerCache.size === 2) {
      const pts = [...pointerCache.values()]
      pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    }
    if (!interacted) {
      interacted = true
      if (rotateHint) rotateHint.classList.add('hidden')
    }
  })
  canvas.addEventListener('pointermove', (e) => {
    if (pointerCache.has(e.pointerId)) pointerCache.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointerCache.size === 2) {
      const pts = [...pointerCache.values()]
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (pinchDist) cam.desiredRadius = clamp(cam.desiredRadius * (pinchDist / d), 3.4, 16)
      pinchDist = d
      return
    }
    if (!dragging) return
    const dx = e.clientX - lastPX
    const dy = e.clientY - lastPY
    lastPX = e.clientX
    lastPY = e.clientY
    cam.desiredTheta -= dx * 0.006
    cam.desiredPhi = clamp(cam.desiredPhi - dy * 0.0045, 0.38, 1.46)
  })
  const endPointer = (e) => {
    pointerCache.delete(e.pointerId)
    if (pointerCache.size === 0) dragging = false
    pinchDist = 0
  }
  canvas.addEventListener('pointerup', endPointer)
  canvas.addEventListener('pointercancel', endPointer)
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    cam.desiredRadius = clamp(cam.desiredRadius + e.deltaY * 0.005, 3.4, 16)
  }, { passive: false })

  function updateCamera(dt) {
    const k = 1 - Math.exp(-8 * dt)
    cam.theta += (cam.desiredTheta - cam.theta) * k
    cam.phi += (cam.desiredPhi - cam.phi) * k
    cam.radius += (cam.desiredRadius - cam.radius) * k
    cam.target.lerp(cam.desiredTarget, k)
    const sinPhi = Math.sin(cam.phi)
    const x = cam.target.x + cam.radius * sinPhi * Math.sin(cam.theta)
    const y = cam.target.y + cam.radius * Math.cos(cam.phi)
    const z = cam.target.z + cam.radius * sinPhi * Math.cos(cam.theta)
    const shake = cam.shake
    cam.shake *= Math.exp(-7 * dt)
    const sx = (Math.random() - 0.5) * shake
    const sy = (Math.random() - 0.5) * shake
    camera.position.set(x + sx, Math.max(0.35, y + sy), z)
    camera.lookAt(cam.target)
    camera.fov = 38 + (cam.preset === 'engine' ? 2 : 0)
    camera.updateProjectionMatrix()
  }

  // -------------------------------------------------------------------------
  // render pipeline
  // -------------------------------------------------------------------------
  let composer = null
  let bloomPass = null
  if (!software) {
    const target = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      type: THREE.HalfFloatType,
      samples: 4
    })
    composer = new EffectComposer(renderer, target)
    composer.addPass(new RenderPass(scene, camera))
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.44, 0.7, 0.82)
    composer.addPass(bloomPass)
    composer.addPass(new OutputPass())
  }

  function resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    if (composer) composer.setSize(w, h)
  }
  window.addEventListener('resize', resize)

  // -------------------------------------------------------------------------
  // painting the in-world dyno screen
  // -------------------------------------------------------------------------
  let screenAccum = 0
  function drawDynoScreen(data) {
    const ctx = dynCtx
    const w = 640
    const h = 360
    ctx.fillStyle = '#050b0d'
    ctx.fillRect(0, 0, w, h)
    // header
    ctx.fillStyle = '#43e8d0'
    ctx.font = '700 18px Orbitron, Arial Black, sans-serif'
    ctx.fillText('DYNO LAB', 24, 32)
    ctx.fillStyle = 'rgba(160,195,208,.75)'
    ctx.font = '600 14px Rajdhani, Arial, sans-serif'
    ctx.fillText('CHASSIS DYNO // LIVE', 24, 52)
    const live = data.running
    ctx.fillStyle = live ? '#ff4d5e' : '#43e8d0'
    ctx.beginPath()
    ctx.arc(552, 28, 5, 0, TAU)
    ctx.fill()
    ctx.fillStyle = 'rgba(200,230,238,.75)'
    ctx.font = '700 12px Rajdhani, Arial, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(live ? 'PULLING' : 'READY', 610, 33)
    ctx.textAlign = 'left'

    // graph
    const gx = 24, gy = 76, gw = 592, gh = 176
    ctx.strokeStyle = 'rgba(120,160,175,.16)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 6; i++) {
      const y = gy + (gh / 6) * i
      ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + gw, y); ctx.stroke()
    }
    for (let i = 0; i <= 8; i++) {
      const x = gx + (gw / 8) * i
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + gh); ctx.stroke()
    }
    const curve = data.curve || []
    if (curve.length) {
      const maxHp = Math.max(100, ...curve.map((p) => p.hp)) * 1.12
      const maxTq = Math.max(100, ...curve.map((p) => p.torque)) * 1.12
      const maxRpm = curve[curve.length - 1].rpm
      const minRpm = curve[0].rpm
      ctx.lineWidth = 3
      ctx.strokeStyle = '#ff8a3d'
      ctx.beginPath()
      curve.forEach((p, i) => {
        const x = gx + ((p.rpm - minRpm) / (maxRpm - minRpm)) * gw
        const y = gy + gh - (p.hp / maxHp) * gh
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.strokeStyle = '#61b8ff'
      ctx.beginPath()
      curve.forEach((p, i) => {
        const x = gx + ((p.rpm - minRpm) / (maxRpm - minRpm)) * gw
        const y = gy + gh - (p.torque / maxTq) * gh
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      // marker
      if (data.running && data.rpm) {
        const t = clamp((data.rpm - minRpm) / (maxRpm - minRpm), 0, 1)
        const x = gx + t * gw
        ctx.strokeStyle = 'rgba(255,255,255,.55)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + gh); ctx.stroke()
        ctx.setLineDash([])
      }
    }
    // bottom numbers
    const big = (text, x, y, color, size = 42) => {
      ctx.fillStyle = color
      ctx.font = `800 ${size}px Orbitron, Arial Black, sans-serif`
      ctx.fillText(text, x, y)
    }
    big(String(Math.round(data.hp || 0)), 26, 316, '#e8f7fb', 46)
    ctx.fillStyle = 'rgba(150,175,185,.7)'
    ctx.font = '700 12px Rajdhani, Arial, sans-serif'
    ctx.fillText('WHP', 26, 334)
    big(String(Math.round(data.torque || 0)), 220, 316, '#61b8ff', 46)
    ctx.fillStyle = 'rgba(150,175,185,.7)'
    ctx.fillText('LB-FT', 220, 334)
    big(String(Math.round(data.rpm || 900)), 420, 316, '#ff8a3d', 46)
    ctx.fillStyle = 'rgba(150,175,185,.7)'
    ctx.fillText('RPM', 420, 334)
    big(`${Math.round(data.egt || 320)}°`, 552, 306, data.egt > 950 ? '#ff4d5e' : '#ffd166', 30)
    ctx.fillStyle = 'rgba(150,175,185,.7)'
    ctx.fillText('EGT', 552, 334)
    dynTexture.needsUpdate = true
  }

  // initial screen
  drawDynoScreen({ hp: 0, torque: 0, rpm: 900, egt: 320, running: false, curve: [] })

  // fonts redraw
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      for (const item of redrawQueue) {
        item.ctx.clearRect(0, 0, item.canvas.width, item.canvas.height)
        item.draw(item.ctx, item.canvas.width, item.canvas.height)
        item.texture.needsUpdate = true
      }
      drawDynoScreen({ hp: 0, torque: 0, rpm: 900, egt: 320, running: false, curve: [] })
    })
  }

  // -------------------------------------------------------------------------
  // state + update
  // -------------------------------------------------------------------------
  let time = 0
  let wheelAngle = 0
  let fanAngle = 0
  let currentData = { running: false, rpm: 900, egt: 320, boost: 0, curve: [], hp: 0, torque: 0 }

  function setUpgrades(upgrades) {
    const turbo = TURBO_LEVELS[clamp(upgrades.turbo, 0, 3)]
    const ic = INTERCOOLERS[clamp(upgrades.intercooler, 0, 3)]
    const ex = EXHAUSTS[clamp(upgrades.exhaust, 0, 3)]
    const ed = engine.userData
    ed.turboGroup.scale.setScalar(turbo.size)
    ed.turboGroup.position.x = 1.24
    ed.icGroup.scale.set(0.85 + ic.eff * 0.6, 0.85 + ic.eff * 0.45, 1)
    ed.icGroup.visible = true
    exhaustTips.forEach((tip, i) => {
      tip.scale.setScalar(0.9 + ex.ve * 8 + i * 0.01)
    })
  }

  function setIdle() {
    applyPreset('car')
    cam.desiredRadius = 9.1
  }

  function update(dt, data) {
    time += dt
    currentData = data
    const running = !!data.running
    const rpm = data.rpm || 900
    const load = clamp(rpm / 8000, 0, 1.1)
    const egt = data.egt || 320
    const boost = data.boost || 0
    const knock = data.knock || 0

    // camera
    if (knock > 0) cam.shake = Math.max(cam.shake, 0.045 + knock * 0.03)
    if (running) cam.shake = Math.max(cam.shake, 0.004 + load * 0.008)
    updateCamera(dt)

    // engine animation
    const ed = engine.userData
    const crankAngle = time * (rpm / 60) * TAU * 0.06
    const phases = [0, Math.PI, Math.PI, 0]
    ed.pistons.forEach((piston, i) => {
      const a = Math.sin(crankAngle + phases[i]) * 0.5 + 0.5
      piston.position.y = 0.16 + a * 0.16
      const rod = ed.rods[i]
      rod.position.y = -0.06 + a * 0.09
      rod.rotation.x = Math.cos(crankAngle + phases[i]) * 0.12
      const chamber = ed.chambers[i]
      chamber.material.opacity = running ? 0.12 + a * 0.35 : 0.02
      chamber.material.color.setStyle(egt > 930 ? '#ff2d1e' : '#ff7a2d')
    })
    ed.crank.rotation.x = crankAngle
    ed.turboSpin.rotation.x += (rpm * 0.02 + boost * 1.2) * dt
    ed.exhaustMat.emissiveIntensity = clamp((egt - 430) / 520, 0, 2.6) * (running ? 1 : 0.22)
    ed.exhaustMat.emissive.setStyle(egt > 980 ? '#ff2d12' : '#ff5a00')
    ed.turboGlow.intensity = clamp((egt - 500) / 420, 0, 1) * 45
    ed.status.material.color.setStyle((data.damage || 0) > 60 ? '#ff4d5e' : '#43e8d0')
    engine.position.x = -4.9 + (running ? Math.sin(time * 60) * 0.003 : 0)

    // car motion
    const wheelSpeed = running ? (rpm / 60) * 0.22 : 0
    wheelAngle += wheelSpeed * dt
    wheelSpinGroups.forEach((w) => { w.rotation.x += wheelSpeed * dt })
    rollers.forEach((r) => { r.rotation.x += wheelSpeed * 1.3 * dt })
    fanAngle += dt * (running ? 7.5 : 1.4)
    fanBlades.rotation.z = fanAngle
    car.position.y = 0.14 + (running ? Math.sin(time * 25) * 0.003 : 0)
    car.rotation.z = running ? Math.sin(time * 32) * 0.0018 : 0
    dyno.position.x = running ? Math.sin(time * 20) * 0.002 : 0

    // particles
    if (running) {
      const spawns = software ? 1 : 2
      for (let s = 0; s < spawns; s++) {
        const hot = clamp((egt - 500) / 600, 0, 1)
        const tip = Math.random() > 0.5 ? 1 : 0
        const baseX = tip ? 0.34 : -0.34
        spawnParticle(
          baseX + (Math.random() - 0.5) * 0.1,
          0.53 + Math.random() * 0.08,
          -2.5 - Math.random() * 0.12,
          (Math.random() - 0.5) * 0.15,
          0.36 + Math.random() * 0.35,
          -1.6 - Math.random() * 0.9,
          0.22 + Math.random() * 0.3,
          1.15 + Math.random() * 0.5,
          0.38 + hot * 0.45,
          0.34 + hot * 0.25,
          0.34 + hot * 0.12,
          0.12 + hot * 0.1
        )
      }
      if (!software && Math.random() < 0.35) {
        spawnParticle(
          -4.3 + (Math.random() - 0.5) * 0.6,
          2.9 + Math.random() * 0.4,
          2.2 + (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.2,
          0.22 + Math.random() * 0.3,
          (Math.random() - 0.5) * 0.2,
          0.2 + Math.random() * 0.3,
          1.3 + Math.random() * 0.6,
          0.5, 0.45, 0.4, 0.07
        )
      }
    } else if (Math.random() < dt * 2.2) {
      spawnParticle(-4.3, 3.05, 2.2, (Math.random() - 0.5) * 0.1, 0.18, 0, 0.18, 1.6, 0.4, 0.42, 0.45, 0.04)
    }
    for (let i = 0; i < P_COUNT; i++) {
      if (!pActive[i]) continue
      pLife[i] -= dt
      if (pLife[i] <= 0) {
        pActive[i] = 0
        pAlpha[i] = 0
        pPos[i * 3 + 1] = -50
        continue
      }
      const t = pLife[i] / pMaxLife[i]
      pPos[i * 3] += pVel[i * 3] * dt
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt
      pVel[i * 3 + 1] += 0.18 * dt
      pVel[i * 3] *= 1 - 0.6 * dt
      pVel[i * 3 + 2] *= 1 - 0.9 * dt
      pAlpha[i] = Math.sin(t * Math.PI) * 0.85 * (0.25 + t * 0.75)
      pSize[i] += dt * 0.25
    }
    pGeo.attributes.position.needsUpdate = true
    pGeo.attributes.aColor.needsUpdate = true
    pGeo.attributes.aAlpha.needsUpdate = true
    pGeo.attributes.aSize.needsUpdate = true

    // dust drift
    dust.rotation.y += dt * 0.006
    dust.position.y = Math.sin(time * 0.2) * 0.12

    // environment flicker
    fillWarm.intensity = 45 + Math.sin(time * 13.7) * 1.6 + Math.sin(time * 7.3) * 1.1
    underglow.intensity = 9 + (running ? Math.sin(time * 17) * 1.5 : Math.sin(time * 2) * 0.6)
    key.intensity = 320 + Math.sin(time * 0.7) * 4

    // in-world screen
    screenAccum += dt
    if (screenAccum > 0.1) {
      screenAccum = 0
      drawDynoScreen({
        hp: data.hp || 0,
        torque: data.torque || 0,
        rpm,
        egt,
        running,
        curve: data.curve || []
      })
    }

    // render
    if (composer) composer.render()
    else renderer.render(scene, camera)
  }

  // initialise engine upgrades and idle
  setUpgrades({ turbo: 0, intercooler: 0, exhaust: 0, internals: 0 })

  return {
    renderer,
    scene,
    camera,
    software,
    gpuName,
    update,
    setUpgrades,
    applyPreset,
    setIdle,
    presets,
    resize,
    get preset() { return cam.preset },
    car,
    engine,
    setIntroCamera: () => applyPreset('intro'),
    setCarCamera: () => applyPreset('car'),
    setEngineCamera: () => applyPreset('engine'),
    setDynoCamera: () => applyPreset('dyno'),
    dispose: () => {
      window.removeEventListener('resize', resize)
      renderer.dispose()
    }
  }
}
