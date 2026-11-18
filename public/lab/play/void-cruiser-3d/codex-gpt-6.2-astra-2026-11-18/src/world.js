import * as T from 'three'
import { makeCruiser, rock, glow } from './models.js'
const rand = (a, b) => a + Math.random() * (b - a)
const white = new T.MeshBasicMaterial({ color: 0xffe9c2 })
export function flashModel(group, on) {
  if (Boolean(group.userData.flashing) === on) return
  group.userData.flashing = on
  group.traverse((m) => {
    if (!m.isMesh) return
    if (on) {
      m.userData.baseMat ??= m.material
      m.material = white
    } else if (m.userData.baseMat) m.material = m.userData.baseMat
  })
}
const sparkGeo = new T.IcosahedronGeometry(1, 0)
export class World {
  constructor(host) {
    this.host = host
    this.renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65))
    this.renderer.setClearColor(0, 0)
    host.append(this.renderer.domElement)
    this.scene = new T.Scene()
    this.scene.fog = new T.FogExp2(0x242c31, 0.0058)
    this.camera = new T.PerspectiveCamera(47, 1, 0.3, 400)
    this.scene.add(new T.HemisphereLight(0xf4f5ef, 0x7d858b, 1.5))
    const key = new T.DirectionalLight(0xffedce, 2.8)
    key.position.set(-7, 11, -3)
    this.scene.add(key)
    const rim = new T.DirectionalLight(0xa9dcff, 1.7)
    rim.position.set(5, 2, 4)
    this.scene.add(rim)
    this.ship = makeCruiser()
    this.scene.add(this.ship.body)
    this.entities = new T.Group()
    this.scene.add(this.entities)
    this.showroom = new T.Group()
    this.scene.add(this.showroom)
    // A small studio sky gives the canopy a reflected horizon at every angle.
    const sky = document.createElement('canvas')
    sky.width = 128
    sky.height = 64
    const ctx = sky.getContext('2d'),
      grad = ctx.createLinearGradient(0, 0, 0, 64)
    for (const [at, col] of [
      [0, '#597586'],
      [0.34, '#9eb6bc'],
      [0.47, '#f3c497'],
      [0.51, '#23323d'],
      [0.55, '#0a1219'],
      [1, '#293033'],
    ])
      grad.addColorStop(at, col)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 128, 64)
    ctx.fillStyle = '#f2f2df'
    ctx.fillRect(75, 12, 12, 14)
    const env = new T.CanvasTexture(sky)
    env.mapping = T.EquirectangularReflectionMapping
    env.colorSpace = T.SRGBColorSpace
    this.scene.environment = env
    this.scene.environmentIntensity = 0.64
    this.clock = 0
    this.titleTime = 0
    this.mode = 'title'
    this.dummy = new T.Object3D()
    this.camTarget = new T.Vector3()
    this.sparks = []
    this.sparkMesh = new T.InstancedMesh(sparkGeo, new T.MeshBasicMaterial({ toneMapped: false }), 500)
    this.sparkMesh.frustumCulled = false
    this.sparkMesh.count = 0
    this.scene.add(this.sparkMesh)
    this.rings = []
    this.ringGeo = new T.RingGeometry(0.88, 1, 32)
    this.lines = new Float32Array(220 * 6)
    this.stars = []
    for (let i = 0; i < this.lines.length / 6; i++)
      this.stars.push({ x: rand(-62, 62), y: rand(-32, 32), z: rand(-176, 9) })
    const lineGeo = new T.BufferGeometry()
    lineGeo.setAttribute('position', new T.BufferAttribute(this.lines, 3).setUsage(T.DynamicDrawUsage))
    this.streaks = new T.LineSegments(
      lineGeo,
      new T.LineBasicMaterial({ color: 0xc0e0eb, transparent: true, opacity: 0.45 }),
    )
    this.streaks.frustumCulled = false
    this.scene.add(this.streaks)
    // These foreground boulders frame the title like a view through the belt.
    const layout = [
      [0.94, -0.64, 1.15],
      [-0.73, -0.77, 0.81],
      [0.08, 0.42, 0.45],
      [0.89, 0.48, 0.61],
      [0.42, 0.74, 0.21],
      [-0.12, -0.54, 0.31],
      [0.09, -0.25, 0.2],
      [-0.87, 0.55, 0.42],
      [0.69, -0.55, 0.26],
      [-0.38, 0.86, 0.18],
    ]
    this.heroRocks = layout.map(([x, y, r], i) => {
      const m = rock(i)
      m.rotation.set(i * 1.8, i * 0.9, i * 0.4)
      this.showroom.add(m)
      return { m, x, y, r, z: -3 - i * 0.35 }
    })
    for (let i = 0; i < 96; i++) {
      const x = rand(-1.15, 1.15),
        y = rand(-0.64, 0.68) + x * 0.17
      const m = rock(i)
      this.showroom.add(m)
      this.heroRocks.push({ m, x, y, r: rand(0.018, 0.095), z: rand(-36, -14) })
    }
    this.fringe = []
    for (let i = 0; i < 38; i++) {
      const m = rock(i)
      m.scale.setScalar(rand(0.65, 4.4))
      m.position.set((i % 2 ? -1 : 1) * rand(17, 46), rand(-14, 16), rand(-145, 2))
      m.rotation.set(i * 0.6, i * 0.4, i)
      this.scene.add(m)
      this.fringe.push(m)
    }
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(host)
    this.resize()
    this.title(0)
  }
  resize() {
    this.w = this.host.clientWidth
    this.h = this.host.clientHeight
    this.renderer.setSize(this.w, this.h, false)
    this.camera.aspect = this.w / this.h
    this.camera.updateProjectionMatrix()
    if (this.mode === 'title') this.title(0)
  }
  title(dt) {
    this.mode = 'title'
    this.titleTime += dt
    const t = this.titleTime
    this.showroom.visible = true
    this.entities.visible = false
    this.streaks.visible = false
    this.fringe.forEach((m) => (m.visible = false))
    this.camera.position.set(0, 0, 17)
    this.camera.rotation.set(0, 0, 0)
    this.camera.fov = 39
    this.camera.updateProjectionMatrix()
    const h = Math.tan(T.MathUtils.degToRad(19.5)) * 17,
      w = h * this.camera.aspect
    const narrow = this.w < 690
    const { body } = this.ship
    body.position.set(w * (narrow ? 0.27 : 0.395), h * (narrow ? 0.35 : -0.1) + 0.07 * Math.sin(t * 0.55), 0)
    const scale = Math.min(w * (narrow ? 0.151 : 0.065), h * 0.223)
    body.scale.setScalar(scale)
    body.rotation.order = 'YXZ'
    body.rotation.set(
      0.42 + 0.032 * Math.sin(t * 0.34),
      -1.05 + 0.04 * Math.sin(t * 0.19),
      -0.65 + 0.03 * Math.cos(t * 0.38),
    )
    flashModel(body, false)
    this.exhaust(1.1 + 0.07 * Math.sin(t * 12))
    this.ship.scorch.visible = false
    for (const { m, x, y, z, r } of this.heroRocks) {
      const halfH = ((17 - z) * h) / 17
      m.position.set(x * halfH * this.camera.aspect, y * halfH, z)
      m.scale.setScalar(r * h * 0.23)
      m.rotation.y += dt * 0.028
    }
  }
  begin() {
    this.mode = 'play'
    this.showroom.visible = false
    this.entities.visible = true
    this.streaks.visible = true
    this.fringe.forEach((m) => (m.visible = true))
    this.ship.body.position.set(0, 0, 0)
    this.ship.body.rotation.set(0, 0, 0)
    this.ship.body.scale.setScalar(0.755)
    this.ship.scorch.visible = false
    this.ship.body.visible = true
    flashModel(this.ship.body, false)
    this.camera.fov = 47
    this.camera.position.set(0, 4.1, 14.2)
    this.clearFX()
  }
  exhaust(power) {
    this.ship.jets.forEach((g, i) => g.scale.set(1, 1, power * (1 + 0.06 * Math.sin(this.clock * 52 + i))))
  }
  flight(dt, player, speed, boost, shake, hull) {
    this.clock += dt
    const { body } = this.ship
    body.position.copy(player)
    const b = boost ? 1 : 0
    this.exhaust((1 + b * 1.65) * (hull < 30 ? 0.78 + 0.22 * Math.sin(this.clock * 29) : 1))
    this.ship.scorch.visible = hull < 75
    if (hull < 45 && Math.random() < dt * 10)
      this.burst(player.clone().add(new T.Vector3(-1.13, 0.16, 2.0)), 0xff952f, 3, 2)
    this.camera.fov = T.MathUtils.damp(this.camera.fov, 47 + b * 10, 5, dt)
    this.camera.position.set(
      player.x * 0.78,
      player.y * 0.8 + 5.35,
      14.2 + b * 0.1 + 0.13 * (this.camera.fov - 47),
    )
    this.camera.position.x += rand(-shake, shake)
    this.camera.position.y += rand(-shake, shake)
    this.camTarget.set(player.x * 0.92, player.y * 0.94 - 0.7, -24)
    this.camera.lookAt(this.camTarget)
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
    for (const m of this.fringe) {
      m.position.z += speed * dt
      if (m.position.z > 8) m.position.z -= 155
      m.rotation.x += dt * 0.08
    }
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i]
      s.z += dt * speed
      if (s.z > 9) s.z -= 185
      this.lines.set([s.x, s.y, s.z, s.x, s.y, s.z - (b ? 4.8 : 0.28)], i * 6)
    }
    this.streaks.geometry.attributes.position.needsUpdate = true
    this.updateFX(dt, speed)
  }
  burst(pos, color, count = 25, power = 9) {
    const col = new T.Color(color)
    for (let i = 0; i < count && this.sparks.length < 500; i++) {
      const v = new T.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1))
        .normalize()
        .multiplyScalar(rand(1, power))
      this.sparks.push({ p: pos.clone(), v, c: col, life: rand(0.19, 0.79), size: rand(0.038, 0.16) })
    }
  }
  shock(pos, radius, color) {
    if (this.rings.length >= 16) return
    const mesh = new T.Mesh(
      this.ringGeo,
      new T.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.DoubleSide,
      }),
    )
    mesh.position.copy(pos)
    const fire = new T.Sprite(
      new T.SpriteMaterial({
        map: glow(),
        color,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    )
    fire.position.copy(pos)
    fire.scale.setScalar(radius * 1.65)
    this.scene.add(mesh, fire)
    this.rings.push({ mesh, fire, radius, age: 0 })
  }
  updateFX(dt, speed) {
    let count = 0
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]
      s.life -= dt
      if (s.life <= 0) {
        this.sparks.splice(i, 1)
        continue
      }
      s.p.addScaledVector(s.v, dt)
      s.p.z += speed * 0.45 * dt
      this.dummy.position.copy(s.p)
      this.dummy.scale
        .set(s.size, s.size * 0.72, s.size * (1 + s.v.length() * 0.2))
        .multiplyScalar(Math.min(1, s.life * 4))
      this.dummy.lookAt(s.p.x + s.v.x, s.p.y + s.v.y, s.p.z + s.v.z)
      this.dummy.updateMatrix()
      this.sparkMesh.setMatrixAt(count, this.dummy.matrix)
      this.sparkMesh.setColorAt(count++, s.c)
    }
    this.sparkMesh.count = count
    this.sparkMesh.instanceMatrix.needsUpdate = true
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]
      r.age += dt
      r.mesh.position.z += speed * dt * 0.7
      r.mesh.scale.setScalar(0.16 + r.radius * r.age * 3)
      r.mesh.material.opacity = Math.max(0, 0.82 - r.age * 2.15)
      r.fire.position.copy(r.mesh.position)
      r.fire.material.opacity = Math.max(0, 0.92 - r.age * 3)
      r.fire.scale.setScalar(r.radius * (1 + r.age * 3))
      if (r.age > 0.39) {
        this.scene.remove(r.mesh, r.fire)
        r.fire.material.dispose()
        r.mesh.material.dispose()
        this.rings.splice(i, 1)
      }
    }
  }
  clearFX() {
    this.sparks.length = 0
    this.sparkMesh.count = 0
    for (const r of this.rings) {
      this.scene.remove(r.mesh, r.fire)
      r.fire.material.dispose()
      r.mesh.material.dispose()
    }
    this.rings.length = 0
  }
  project(v) {
    const p = v.clone().project(this.camera)
    return { x: (p.x + 1) * 50, y: (1 - p.y) * 50 }
  }
  render() {
    this.renderer.render(this.scene, this.camera)
  }
}
