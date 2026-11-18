import * as T from 'three'
import { rock, drone, cell, extractionGate } from './models.js'
import { flashModel } from './world.js'

const rand = (a, b) => a + Math.random() * (b - a)
const clamp = T.MathUtils.clamp
const FINISH = 1860
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z)
const boltGeo = new T.CylinderGeometry(0.085, 0.12, 2.5, 5).rotateX(Math.PI / 2)
const plasmaGeo = new T.OctahedronGeometry(0.3)
const wireGeo = new T.CylinderGeometry(1, 1, 1, 8)
const wireMat = new T.MeshBasicMaterial({ color: 0xff5849 })
const wireGlow = new T.MeshBasicMaterial({
  color: 0xff432a,
  transparent: true,
  opacity: 0.21,
  depthWrite: false,
  blending: T.AdditiveBlending,
})
const wireAxis = V(0, 1, 0)
const boltMats = Object.fromEntries(
  Object.entries({ bolt: 0xb3ffff, hotbolt: 0xffce6b, plasma: 0xff5246 }).map(([k, color]) => [
    k,
    new T.MeshBasicMaterial({ color }),
  ]),
)
const isTarget = (e) => ['rock', 'volatile', 'drone', 'lancer', 'fragment'].includes(e.kind)
const isDrone = (e) => e.kind === 'drone' || e.kind === 'lancer'
const isCell = (e) => ['weapon', 'repair', 'fuel'].includes(e.kind)
function segmentHits(a, b, c, r) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dz = b.z - a.z
  const t = clamp(
    ((c.x - a.x) * dx + (c.y - a.y) * dy + (c.z - a.z) * dz) / (dx * dx + dy * dy + dz * dz || 1),
    0,
    1,
  )
  return (a.x + t * dx - c.x) ** 2 + (a.y + t * dy - c.y) ** 2 + (a.z + t * dz - c.z) ** 2 < r * r
}
export class Game {
  constructor(world, audio, ui) {
    this.world = world
    this.audio = audio
    this.ui = ui
    this.actors = []
    this.pool = new Map()
    this.player = V()
    this.velocity = V()
    this.mode = 'title'
    this.keys = new Set()
    this.pointer = null
  }
  borrow(kind) {
    const stash = this.pool.get(kind)
    if (stash?.length) return stash.pop()
    if (isDrone({ kind })) return drone(kind === 'lancer')
    if (isCell({ kind })) return cell(kind)
    if (kind === 'gate') return extractionGate()
    if (kind === 'wire') {
      const beam = new T.Group()
      for (const [size, material] of [
        [0.09, wireMat],
        [0.24, wireGlow],
      ]) {
        const m = new T.Mesh(wireGeo, material)
        m.scale.set(size, 1, size)
        beam.add(m)
      }
      return beam
    }
    if (kind in boltMats) return new T.Mesh(kind === 'plasma' ? plasmaGeo : boltGeo, boltMats[kind])
    return rock(Math.random() * 9, kind === 'volatile')
  }
  spawn(kind, x, y, z, r = 1) {
    if (this.actors.length >= 185) return null
    const mesh = this.borrow(kind)
    mesh.position.set(x, y, z)
    mesh.scale.setScalar(r)
    mesh.rotation.set(0, 0, 0)
    mesh.visible = true
    const e = {
      kind,
      m: mesh,
      p: mesh.position,
      v: V(),
      prev: mesh.position.clone(),
      r,
      hp: 1,
      age: 0,
      dead: false,
      phase: rand(0, 6.28),
      spin: rand(-1.7, 1.7),
      clock: rand(0.65, 1.75),
      flash: 0,
      x0: x,
      y0: y,
    }
    if (kind === 'rock' || kind === 'volatile') {
      e.hp = r > 1.65 ? 3 : r > 1.1 ? 2 : 1
      mesh.rotation.set(e.phase, e.spin, 0)
      e.v.set(rand(-0.62, 0.62), rand(-0.38, 0.38), 0)
    }
    if (isDrone(e)) {
      e.hp = kind === 'lancer' ? 5 : 2
      e.r = r * 1.3
    }
    if (kind === 'fragment') e.hp = 1
    this.actors.push(e)
    this.world.entities.add(mesh)
    return e
  }
  recycle(e) {
    flashModel(e.m, false)
    this.world.entities.remove(e.m)
    if (!this.pool.has(e.kind)) this.pool.set(e.kind, [])
    this.pool.get(e.kind).push(e.m)
  }
  start() {
    for (const e of this.actors) this.recycle(e)
    this.actors = []
    this.keys.clear()
    this.pointer = null
    Object.assign(this, {
      mode: 'play',
      time: 0,
      travel: 0,
      hull: 100,
      fuel: 76,
      score: 0,
      kills: 0,
      streak: 0,
      bestChain: 0,
      chain: 0,
      chainTime: 0,
      upgrade: 0,
      boost: false,
      lockout: 0,
      invuln: 0,
      shake: 0,
      damageFlash: 0,
      hitStop: 0,
      sector: 1,
      spawnTime: 0.6,
      patrolTime: 3.0,
      wireAt: 430,
      wireCount: 0,
      fireTime: 0,
      messageTime: 0,
      gate: null,
      endReason: '',
      nearMisses: 0,
    })
    this.player.set(0, 0, 0)
    this.velocity.set(0, 0, 0)
    this.world.begin()
    this.audio.play(true)
    this.ui.begin()
    // The first rail salvo has a volatile boulder and two neighbors in its path.
    this.spawn('volatile', 0, 0.1, -27, 2.0)
    this.spawn('rock', 2.7, 0.6, -28, 1.14)
    this.spawn('rock', -3.2, -0.6, -27.4, 1.36)
    this.spawn('rock', 1.12, -0.3, -13, 1.2)
    this.spawn('weapon', -0.6, 0, -40, 0.94)
    this.spawn('drone', -5, 1.2, -34, 1)
    this.spawn('drone', 6, 1.5, -42, 1.1)
    this.spawn('fuel', 4, 0.5, -35, 1.0)
    for (let i = 0; i < 20; i++) this.scatter(-rand(36, 123))
    this.world.flight(0, this.player, 0, false, 0, 100)
    this.ui.update(this)
  }
  clearInput() {
    this.keys.clear()
    this.pointer = null
  }
  pause() {
    if (this.mode !== 'play') return
    this.mode = 'pause'
    this.audio.pause()
    this.clearInput()
    this.ui.paused()
  }
  resume() {
    if (this.mode !== 'pause') return
    this.mode = 'play'
    this.audio.play()
    this.clearInput()
    this.ui.begin(false)
  }
  finish(win, reason) {
    if (this.mode !== 'play') return
    this.mode = 'end'
    this.endReason = reason
    this.audio.music.pause()
    this.clearInput()
    this.boost = false
    if (win) {
      this.score += 1000 + Math.round(this.hull * 10)
      this.audio.pickup()
    } else {
      this.audio.boom(true)
      this.world.burst(this.player, 0xff7b31, 90, 18)
      this.world.shock(this.player, 5, 0xff9341)
      this.world.ship.body.visible = false
      this.world.updateFX(0.053, 0)
    }
    this.ui.update(this)
    this.ui.end(this, win)
  }
  message(text, sec = 1.45) {
    this.messageTime = sec
    this.ui.message(text)
  }
  scatter(z) {
    const lane = Math.random() < 0.33
    const x = clamp(lane ? this.player.x + rand(-3.5, 3.5) : rand(-17, 17), -17, 17)
    const y = clamp(lane ? this.player.y + rand(-2.4, 2.4) : rand(-7, 8), -7, 8)
    return this.spawn(Math.random() < 0.16 ? 'volatile' : 'rock', x, y, z, rand(0.88, 2.5))
  }
  patrol() {
    const x = clamp(this.player.x + rand(-5.4, 5.4), -9, 9),
      y = clamp(this.player.y + rand(-2.9, 2.9), -4, 4)
    const z = -rand(70, 89),
      type =
        this.hull < 65 && Math.random() < 0.42
          ? 'repair'
          : this.fuel < 43
            ? 'fuel'
            : Math.random() < 0.38
              ? 'weapon'
              : 'fuel'
    this.spawn(type, x, y, z, 1.13)
    const elite = this.sector > 1 && Math.random() < (this.sector === 3 ? 0.82 : 0.55)
    this.spawn(elite ? 'lancer' : 'drone', x - 2.9, y + 0.4, z + 2.5, elite ? 1.12 : 1)
    this.spawn('drone', x + 2.9, y + 0.4, z + 2.5, 1)
    if (this.sector === 3) this.spawn('volatile', x, y - 2.2, z + 3, 1.5)
  }
  tripwire(vertical = false) {
    const x = clamp(this.player.x, -8, 8),
      y = clamp(this.player.y, -3.8, 3.8),
      z = -64
    const dx = vertical ? 1.0 : 7.5,
      dy = vertical ? 5.8 : 0.65
    const left = this.spawn('lancer', x - dx, y - dy, z, 1.23),
      right = this.spawn('lancer', x + dx, y + dy, z, 1.23)
    const wire = this.spawn('wire', x, y, z, 1)
    if (!wire || !left || !right) {
      if (wire) wire.dead = true
      return
    }
    left.anchor = right.anchor = true
    left.phase = right.phase = 0
    left.hp = right.hp = 3
    Object.assign(wire, { left, right })
    this.spawn('weapon', x + dx * 0.48, y + dy * 0.48 + 0.9, z - 2, 1)
    this.message(vertical ? 'CROSSWIRE  /  BREAK AN ANCHOR' : 'TRIPWIRE  /  BREAK AN ANCHOR', 2)
  }
  target() {
    let best = null,
      weight = Infinity
    for (const e of this.actors) {
      if (e.dead || !isTarget(e) || e.p.z > -2.5 || e.p.z < -100) continue
      const delta = Math.hypot(e.p.x - this.player.x, e.p.y - this.player.y)
      if (delta > e.r + 0.9) continue
      const cost = delta * 0.7 - e.p.z * 0.052
      if (cost < weight) {
        weight = cost
        best = e
      }
    }
    return best
  }
  shoot(target) {
    const over = this.upgrade > 0 || this.boost,
      spread = this.upgrade > 0
    this.fireTime = over ? 0.121 : 0.176
    this.audio.fire(over)
    const goal = target ? target.p.clone() : V(this.player.x, this.player.y, -38)
    if (target) {
      const lead = -target.p.z / 128
      goal.x += target.v.x * lead
      goal.y += target.v.y * lead
    }
    const count = spread ? 3 : 2
    for (let i = 0; i < count; i++) {
      const side = i - (count - 1) / 2
      const { body } = this.world.ship
      const muzzle = V(Math.sign(side) * 3.17, 0.16, side === 0 ? -5.1 : -3.90)
        .multiply(body.scale)
        .applyEuler(body.rotation)
        .add(this.player)
      const b = this.spawn(over ? 'hotbolt' : 'bolt', muzzle.x, muzzle.y, muzzle.z, 0.85)
      if (!b) continue
      b.v.copy(goal).sub(b.p)
      if (spread) {
        b.v.x += side * 1.65
      }
      b.v.normalize().multiplyScalar(112)
      b.m.quaternion.setFromUnitVectors(V(0, 0, -1), b.v.clone().normalize())
      b.damage = over ? 2 : 1
      this.world.burst(b.p, over ? 0xffbc44 : 0x81ffff, 2, 2)
    }
  }
  enemyFire(e) {
    const lead = e.kind === 'lancer' ? 0.37 : 0.15
    for (const offset of e.kind === 'lancer' ? [-2.7, 0, 2.7] : [0]) {
      const b = this.spawn('plasma', e.p.x, e.p.y, e.p.z + 0.95, 0.96)
      if (!b) continue
      b.v
        .set(
          this.player.x + lead * this.velocity.x + offset - e.p.x,
          this.player.y + lead * this.velocity.y - e.p.y,
          -e.p.z,
        )
        .normalize()
        .multiplyScalar(e.kind === 'lancer' ? 22 : 17)
      b.m.scale.set(1.18, 1.18, 3.5)
      this.world.burst(b.p, 0xff5242, 6, 4)
    }
    this.audio.tone(350, 120, 0.14, 'triangle', 0.08)
    e.clock = e.kind === 'lancer' ? 1.36 : 2.15
  }
  damage(amount, reason) {
    if (this.invuln > 0 || this.mode !== 'play') return
    this.hull = Math.max(0, this.hull - amount)
    this.streak = 0
    this.chain = 0
    this.invuln = 1.05
    this.damageFlash = 1
    this.shake = 0.39
    this.hitStop = 0.052
    this.world.burst(this.player, 0xffba5f, 27, 9)
    this.audio.hit()
    this.message('HULL HIT  /  −' + amount, 1.1)
    if (this.hull === 0) this.finish(false, reason)
  }
  get multiplier() {
    return 1 + Math.min(4, Math.floor(this.streak / 4))
  }
  hit(e, points, byFragment = false) {
    if (e.dead) return
    e.hp -= points
    if (e.hp > 0) {
      e.flash = 0.072
      flashModel(e.m, true)
      this.world.burst(e.p, 0xffac58, 7, 5)
      this.audio.tone(isDrone(e) ? 950 : 270, 95, 0.055, 'triangle', 0.11)
      if (!isDrone(e)) e.m.scale.multiplyScalar(0.96)
      return
    }
    const big = e.kind === 'volatile',
      fragment = e.kind === 'fragment'
    e.dead = true
    this.kills++
    this.streak++
    this.chain = this.chainTime > 0 ? this.chain + 1 : 1
    this.chainTime = 1.1
    this.bestChain = Math.max(this.bestChain, this.chain)
    const reward =
      (isDrone(e) ? 180 : fragment ? 25 : big ? 140 : 75) * this.multiplier + (byFragment ? 75 : 0)
    this.score += reward
    this.ui.popup(e.p, (byFragment ? 'CHAIN ' : '') + '+' + reward)
    this.world.burst(
      e.p,
      big ? 0xff762e : isDrone(e) ? 0xff594e : 0xffbc70,
      big ? 55 : fragment ? 10 : 27,
      big ? 16 : 10,
    )
    this.audio.boom(big)
    this.shake = Math.max(this.shake, big ? 0.19 : 0.07)
    this.hitStop = Math.max(this.hitStop, big ? 0.041 : 0.021)
    if (!fragment) {
      this.world.shock(e.p, big ? 7.6 : 3.2, big ? 0xff952d : 0xffda97)
      for (let i = 0; i < (big ? 7 : isDrone(e) ? 1 : e.r > 1.4 ? 4 : 2); i++) {
        const angle = e.phase + i * 2.4,
          dir = V(Math.cos(angle), Math.sin(angle), rand(-0.48, 0.48)).normalize()
        const f = this.spawn(
          'fragment',
          e.p.x + dir.x * e.r * 0.6,
          e.p.y + dir.y * e.r * 0.6,
          e.p.z + dir.z * e.r * 0.6,
          rand(0.29, 0.61),
        )
        if (!f) break
        f.v.copy(dir).multiplyScalar(big ? 13 : 8)
        f.armed = 0.055
      }
      if (Math.random() < (big ? 0.74 : isDrone(e) ? 0.45 : 0.135)) {
        const type =
          this.fuel < 45
            ? 'fuel'
            : this.hull < 64 && Math.random() < 0.4
              ? 'repair'
              : isDrone(e) && Math.random() < 0.4
                ? 'weapon'
                : 'fuel'
        const prize = this.spawn(type, e.p.x, e.p.y, Math.min(-3, e.p.z), 0.95)
        if (prize) prize.v.set(rand(-1.4, 1.4), rand(-0.75, 0.75), 0)
      }
      for (const other of [...this.actors]) {
        if (other === e || other.dead || !isTarget(other) || other.kind === 'fragment') continue
        const dir = other.p.clone().sub(e.p),
          d = dir.length()
        if (d > (big ? 8 : 3.7) || d === 0) continue
        other.v.addScaledVector(dir.normalize(), (big ? 10 : 5) / (1 + d * 0.3))
        if (big && d < 5.1) this.hit(other, 2, true)
      }
    }
  }
  collect(e) {
    e.dead = true
    let label
    if (e.kind === 'weapon') {
      this.upgrade = 12
      label = 'TRIDENT ONLINE'
      this.message('TRIDENT  /  TRIPLE PLASMA', 1.8)
    } else if (e.kind === 'repair') {
      this.hull = Math.min(100, this.hull + 26)
      label = 'HULL +26'
    } else {
      this.fuel = Math.min(100, this.fuel + 21)
      label = 'FUEL +21'
    }
    this.ui.popup(e.p, label)
    this.score += 50 * this.multiplier
    this.audio.pickup()
    this.world.burst(e.p, 0x80ffe1, 16, 6)
  }
  move(e, dt, speed) {
    e.prev.copy(e.p)
    e.age += dt
    if (e.flash > 0) {
      e.flash -= dt
      if (e.flash <= 0) flashModel(e.m, false)
    }
    const kind = e.kind
    if (kind === 'wire') {
      const { left, right } = e
      if (
        left.dead ||
        right.dead ||
        !this.world.entities.children.includes(left.m) ||
        !this.world.entities.children.includes(right.m)
      ) {
        e.dead = true
        return
      }
      const delta = right.p.clone().sub(left.p)
      e.p.copy(left.p).lerp(right.p, 0.5)
      e.m.quaternion.setFromUnitVectors(wireAxis, delta.clone().normalize())
      e.m.scale.set(1, delta.length(), 1)
      e.m.children[1].scale.x = 0.25 + 0.065 * Math.sin(e.age * 38)
      return
    }
    if (isDrone(e)) {
      const lancer = kind === 'lancer',
        frequency = lancer ? 2.5 : 1.45
      e.v.x = T.MathUtils.damp(
        e.v.x,
        (e.x0 + Math.sin(e.age * frequency + e.phase) * (lancer ? 3.4 : 1.7) - e.p.x) * 2.4,
        4,
        dt,
      )
      e.v.y = (e.y0 + Math.cos(e.age * 1.24 + e.phase) * (lancer ? 1.65 : 0.88) - e.p.y) * 2.3
      if (e.anchor) {
        e.v.x = 0
        e.v.y = (e.y0 + 0.55 * Math.sin(e.age * 1.6) - e.p.y) * 3
      }
      e.m.rotation.z = -e.v.x * 0.1
      e.m.rotation.y = Math.sin(e.phase + e.age) * 0.18
      e.clock -= dt
      const light = e.m.children.at(-1)
      light.scale.setScalar(e.clock < 0.45 ? 3.8 + Math.sin(e.age * 30) * 0.75 : 1.9)
      if (e.clock <= 0 && e.p.z > -59 && e.p.z < -6) this.enemyFire(e)
    } else if (isCell(e)) {
      e.m.rotation.y += dt * 1.85
      e.m.rotation.z = Math.sin(e.age * 2) * 0.18
      if (
        e.p.z > -(this.boost ? 14 : 7) &&
        e.p.z < 2.2 &&
        Math.hypot(e.p.x - this.player.x, e.p.y - this.player.y) < (this.boost ? 4.85 : 2.65)
      ) {
        e.p.x = T.MathUtils.damp(e.p.x, this.player.x, this.boost ? 8 : 5, dt)
        e.p.y = T.MathUtils.damp(e.p.y, this.player.y, 6, dt)
      }
    } else if (kind === 'rock' || kind === 'volatile' || kind === 'fragment') {
      e.m.rotation.x += e.spin * dt * (kind === 'fragment' ? 2 : 0.32)
      e.m.rotation.y += dt * 0.33
    } else if (kind === 'gate') {
      e.m.rotation.z += dt * 0.26
    }
    e.p.addScaledVector(e.v, dt)
    if (kind !== 'bolt' && kind !== 'hotbolt') e.p.z += speed * dt
  }
  collisions(e) {
    const kind = e.kind
    if (kind === 'wire') {
      if (e.left.dead || e.right.dead) {
        e.dead = true
        return
      }
      if (Math.min(e.p.z, e.prev.z) <= 0.7 && Math.max(e.p.z, e.prev.z) >= -0.7) {
        const a = e.left.p.clone(),
          b = e.right.p.clone()
        a.z = b.z = 0
        if (segmentHits(a, b, this.player, 1.15)) this.damage(29, 'A patrol tripwire cut through the hull.')
      }
      return
    }
    if (kind === 'bolt' || kind === 'hotbolt' || kind === 'fragment') {
      if (kind === 'fragment' && e.age < e.armed) return
      // Use relative swept segments so fast bolts still hit crossing targets.
      for (const t of this.actors) {
        if (t === e || t.dead || !isTarget(t) || (kind === 'fragment' && t.kind === 'fragment')) continue
        const a = e.prev.clone().add(t.p).sub(t.prev)
        if (segmentHits(a, e.p, t.p, t.r + (kind === 'fragment' ? e.r : 0.18))) {
          this.hit(t, kind === 'fragment' ? 2 : e.damage, kind === 'fragment')
          e.dead = true
          return
        }
      }
    }
    if (isCell(e) && segmentHits(e.prev, e.p, this.player, 1.85)) this.collect(e)
    else if (
      (isTarget(e) || kind === 'plasma') &&
      segmentHits(e.prev, e.p, this.player, (kind === 'plasma' ? 0.5 : e.r * 0.85) + 0.91)
    ) {
      if (kind === 'plasma' || kind === 'fragment') e.dead = true
      if (!this.invuln) {
        this.damage(
          kind === 'plasma' ? 14 : kind === 'fragment' ? 9 : 22,
          kind === 'plasma' ? 'Patrol plasma breached your hull.' : 'Impact in the asteroid belt.',
        )
        e.dead = true
      }
    } else if (
      isTarget(e) &&
      e.prev.z <= 1 &&
      e.p.z > 1 &&
      Math.hypot(e.p.x - this.player.x, e.p.y - this.player.y) < e.r + 2.0
    ) {
      this.score += 35 * this.multiplier
      this.nearMisses++
      this.ui.popup(e.p, 'GRAZE +' + 35 * this.multiplier)
    }
    if (kind === 'gate' && e.p.z >= 0)
      this.finish(
        Math.hypot(this.player.x - e.p.x, this.player.y - e.p.y) < 7.0,
        'Missed the extraction aperture.',
      )
  }
  step(dt) {
    if (this.mode !== 'play') return
    if (this.hitStop > 0) {
      this.hitStop -= dt
      return
    }
    const k = this.keys,
      p = this.player
    this.time += dt
    this.fireTime -= dt
    this.upgrade = Math.max(0, this.upgrade - dt)
    this.lockout = Math.max(0, this.lockout - dt)
    this.chainTime -= dt
    this.invuln = Math.max(0, this.invuln - dt)
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.4)
    this.shake *= Math.exp(-dt * 9)
    if (this.messageTime > 0) {
      this.messageTime -= dt
      if (this.messageTime <= 0) this.ui.message('')
    }
    const boosting = (k.has('ShiftLeft') || k.has('ShiftRight')) && this.fuel > 0.3 && this.lockout === 0
    if (boosting && !this.boost) this.audio.startBoost()
    this.boost = boosting
    this.fuel = Math.max(0, this.fuel - dt * (boosting ? 11.6 : 0.68))
    if (this.fuel < 0.3) {
      if (!this.lockout) this.message('TANK DRY  /  FIND A TEAL CELL', 2.1)
      this.lockout = 0.5
      if (!this.invuln && this.hull > 0) {
        this.hull = Math.max(0, this.hull - dt * 2)
        if (this.hull === 0) {
          this.finish(false, 'The dry reactor lost containment.')
          return
        }
      }
    }
    const speed = (this.fuel < 0.3 ? 10 : 16) + this.sector * 1.4 + (this.boost ? 18 : 0)
    this.travel += dt * speed
    let mx = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'))
    let my = Number(k.has('KeyW') || k.has('ArrowUp')) - Number(k.has('KeyS') || k.has('ArrowDown'))
    if (this.pointer && !mx && !my) {
      mx = clamp((this.pointer.x - p.x) * 0.42, -1, 1)
      my = clamp((this.pointer.y - p.y) * 0.52, -1, 1)
    }
    if (mx && my && !this.pointer) {
      mx *= 0.707
      my *= 0.707
    }
    const handling = boosting ? 15 : this.fuel < 0.3 ? 7.2 : 11.7
    this.velocity.x = T.MathUtils.damp(this.velocity.x, mx * handling, 10, dt)
    this.velocity.y = T.MathUtils.damp(this.velocity.y, my * handling * 0.78, 10, dt)
    p.x = clamp(p.x + this.velocity.x * dt, -11, 11)
    p.y = clamp(p.y + this.velocity.y * dt, -5.2, 5.2)
    const ship = this.world.ship.body
    ship.rotation.z = T.MathUtils.damp(ship.rotation.z, -mx * 0.52, 8, dt)
    ship.rotation.x = T.MathUtils.damp(ship.rotation.x, my * 0.145, 8, dt)
    ship.rotation.y = T.MathUtils.damp(ship.rotation.y, -mx * 0.13, 7, dt)
    flashModel(ship, this.invuln > 0.3 && Math.floor(this.invuln * 12) % 2 === 0)
    const sector = this.travel < 560 ? 1 : this.travel < 1160 ? 2 : 3
    if (sector !== this.sector) {
      this.sector = sector
      this.message(sector === 2 ? 'SECTOR 02  /  LANCERS INBOUND' : 'SECTOR 03  /  BLOCKADE', 2.3)
      this.patrol()
    }
    if (!this.gate) {
      this.spawnTime -= (dt * speed) / 18
      this.patrolTime -= (dt * speed) / 18
      if (this.spawnTime <= 0) {
        this.scatter(-rand(88, 125))
        this.scatter(-rand(69, 122))
        this.spawnTime = rand(0.54, 0.95)
      }
      if (this.patrolTime <= 0) {
        this.patrol()
        this.patrolTime = rand(3.2, 4.8)
      }
      if (this.travel >= this.wireAt) {
        this.tripwire(this.sector === 3 && this.wireCount % 2 === 0)
        this.wireCount++
        this.wireAt += this.sector === 3 ? 118 : 205
      }
      if (this.travel >= FINISH - 110) {
        this.gate = this.spawn('gate', 2.5, 0.5, -110, 1)
        this.message('EXTRACTION  /  ENTER THE RING', 4)
      }
    }
    const target = this.target()
    if (this.fireTime <= 0 && (k.has('Space') || k.has('Mouse0'))) this.shoot(target)
    const frame = this.actors.slice()
    for (const e of frame) if (!e.dead) this.move(e, dt, speed)
    for (const e of frame) if (!e.dead && this.mode === 'play') this.collisions(e)
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const e = this.actors[i]
      if (e.dead || e.p.z > 4.6 || e.p.z < -145 || (e.kind === 'fragment' && e.age > 3.3)) {
        this.recycle(e)
        this.actors.splice(i, 1)
      }
    }
    if (this.mode !== 'play') return
    this.world.flight(dt, p, speed, boosting, this.shake, this.hull)
    this.ui.aim(target?.dead ? null : target, p)
    this.ui.update(this)
  }
}
export { FINISH }
