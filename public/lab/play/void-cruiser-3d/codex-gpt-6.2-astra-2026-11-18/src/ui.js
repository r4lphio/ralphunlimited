import { Vector3 } from 'three'
import { FINISH } from './game.js'
const $ = (id) => document.getElementById(id)
const format = (n) => String(Math.floor(n)).padStart(6, '0')
export function read(key, fallback) {
  try {
    return localStorage.getItem('vc09.' + key) ?? fallback
  } catch {
    return fallback
  }
}
export function save(key, value) {
  try {
    localStorage.setItem('vc09.' + key, String(value))
  } catch {}
}
export class Interface {
  constructor(world) {
    this.world = world
    this.best = Number(read('best', 0)) || 0
    $('best').textContent = format(this.best)
    this.nodes = Object.fromEntries([...document.querySelectorAll('[id]')].map((el) => [el.id, el]))
    this.last = {}
  }
  write(id, value) {
    if (this.last[id] === value) return
    this.last[id] = value
    this.nodes[id].textContent = value
  }
  begin(reset = true) {
    document.body.classList.add('flying')
    this.close()
    $('hud').hidden = false
    $('pause').hidden = false
    $('online').textContent = 'FLIGHT ACTIVE'
    if (reset) {
      $('effects').replaceChildren()
      this.message('')
      $('flash').style.opacity = 0
    }
  }
  title() {
    document.body.classList.remove('flying')
    $('hud').hidden = true
    $('pause').hidden = true
    $('online').textContent = 'SYSTEM ONLINE'
    $('effects').replaceChildren()
    $('flash').style.opacity = 0
    this.close()
  }
  close() {
    document.body.classList.remove('modal-open')
    $('modal').hidden = true
  }
  dialog(kicker, title, body, actions) {
    document.body.classList.add('modal-open')
    $('modal-kicker').textContent = kicker
    $('modal-title').textContent = title
    $('modal-body').innerHTML = body
    $('modal-actions').replaceChildren()
    for (const [i, [label, fn]] of actions.entries()) {
      const btn = document.createElement('button')
      btn.className = i === 0 ? 'primary' : 'manual'
      btn.textContent = label
      btn.onclick = fn
      $('modal-actions').append(btn)
    }
    $('modal').hidden = false
    $('modal-actions').firstChild.focus({ preventScroll: true })
  }
  manual() {
    this.dialog(
      'PILOT HANDBOOK',
      'Flight manual',
      '<p>Reach the green extraction ring. Hold fire to cut through rocks and patrols. Orange ore bursts into shrapnel.</p><dl><dt>Steer</dt><dd>WASD / ARROWS</dd><dt>Fire plasma</dt><dd>HOLD SPACE</dd><dt>Mouse flight + fire</dt><dd>HOLD + DRAG</dd><dt>Afterburner</dt><dd>HOLD SHIFT</dd><dt>Pause / mute</dt><dd>P / M</dd></dl><p>Boost doubles plasma damage and pulls in cells. Teal cells refuel, green cells repair, and gold cells fit a triple cannon for 12 seconds.</p>',
      [
        ['LAUNCH RUN', () => this.game.start()],
        [
          'Back to flight deck',
          () => {
            this.game.mode = 'title'
            this.close()
            $('launch').focus()
          },
        ],
      ],
    )
  }
  paused() {
    this.dialog('FLIGHT SUSPENDED', 'Paused', '<p>Your run is on hold.</p>', [
      ['RESUME FLIGHT', () => this.game.resume()],
      ['Restart run', () => this.game.start()],
      ['Flight deck', () => this.onTitle()],
    ])
  }
  end(g, win) {
    const previous = this.best,
      record = g.score > previous
    this.best = Math.max(this.best, g.score)
    save('best', this.best)
    $('best').textContent = format(this.best)
    $('pause').hidden = true
    $('online').textContent = 'FLIGHT COMPLETE'
    const tip = win
      ? 'Fewer hull hits keep the score multiplier high.'
      : g.fuel < 12
        ? 'Bring a fuel reserve for the last patrol.'
        : g.bestChain > 1
          ? 'Aim for orange ore to beat your ' + g.bestChain + '-kill chain.'
          : 'Break an orange boulder inside a patrol to start a chain.'
    this.dialog(
      record ? 'PERSONAL BEST  /  FLIGHT REPORT' : 'VC-09  /  FLIGHT REPORT',
      win ? 'Extracted' : 'Cruiser lost',
      '<p>' +
        (win ? 'The cruiser cleared the blockade.' : g.endReason) +
        '</p><dl><dt>Run score</dt><dd>' +
        format(g.score) +
        '</dd><dt>Personal best</dt><dd>' +
        format(this.best) +
        '</dd><dt>Targets destroyed</dt><dd>' +
        g.kills +
        '</dd><dt>Longest chain</dt><dd>' +
        g.bestChain +
        '</dd><dt>Distance flown</dt><dd>' +
        Math.min(18.6, g.travel / 100).toFixed(1) +
        ' KM</dd></dl><p>' +
        tip +
        '</p>',
      [
        ['RETRY RUN  [ENTER]', () => g.start()],
        ['Flight deck', () => this.onTitle()],
      ],
    )
  }
  update(g) {
    this.write('sector', ['', '01 / OUTER BELT', '02 / LANCER PATROL', '03 / BLOCKADE'][g.sector])
    this.write('score', format(g.score))
    this.write('combo', '×' + g.multiplier + ' MULTIPLIER')
    this.write('distance', (Math.max(0, FINISH - g.travel) / 100).toFixed(1) + ' KM')
    this.nodes.progress.style.width = Math.min(100, (g.travel / FINISH) * 100) + '%'
    for (const [id, field, txt] of [
      ['hull', 'hull', 'hval'],
      ['fuel', 'fuel', 'fval'],
    ]) {
      const value = Math.ceil(g[field])
      this.write(txt, value + '%')
      this.nodes[id].style.width = value + '%'
      this.nodes[id].style.backgroundColor = value < 25 ? '#ff6355' : ''
    }
    this.markContacts(g)
    this.write(
      'weapon',
      g.upgrade > 0
        ? 'TRIDENT / ' + Math.ceil(g.upgrade) + 's'
        : g.boost
          ? 'OVERDRIVE'
          : g.fuel < 0.3
            ? 'LIMP DRIVE'
            : 'TWIN PLASMA',
    )
    this.nodes.flash.style.opacity = g.damageFlash * 0.9
  }
  markContacts(g) {
    let prize = null,
      threat = null
    for (const e of g.actors) {
      if (e.dead || e.p.z > -0.9 || e.p.z < -46) continue
      if (['fuel', 'repair', 'weapon', 'gate'].includes(e.kind)) {
        if (!prize || e.kind === 'gate' || (prize.kind !== 'gate' && e.p.z > prize.p.z)) prize = e
      } else if (
        ['rock', 'volatile', 'lancer', 'drone', 'plasma', 'fragment'].includes(e.kind) &&
        e.p.z > -23
      ) {
        const eta = -e.p.z / (18 + (g.boost ? 18 : 0) + e.v.z)
        const dx = e.p.x + e.v.x * eta - g.player.x,
          dy = e.p.y + e.v.y * eta - g.player.y
        if (Math.hypot(dx, dy) < e.r + 1.05 && (!threat || e.p.z > threat.p.z)) threat = e
      }
    }
    for (const [el, contact] of [
      [this.nodes.hazard, threat],
      [this.nodes.prize, prize],
    ]) {
      el.hidden = !contact
      if (!contact) continue
      const pt = this.world.project(contact.p)
      el.style.left = pt.x + '%'
      el.style.top = pt.y + '%'
    }
    if (prize)
      this.write(
        'prize',
        { fuel: 'FUEL CELL', repair: 'HULL REPAIR', weapon: 'TRIDENT', gate: 'EXTRACT' }[prize.kind],
      )
  }
  aim(target, p) {
    const aim = this.nodes.aim
    const point = this.world.project(target ? target.p : new Vector3(p.x, p.y, -37))
    aim.style.left = point.x + '%'
    aim.style.top = point.y + '%'
    aim.classList.toggle('lock', !!target)
  }
  popup(pos, text) {
    const el = document.createElement('span'),
      point = this.world.project(pos)
    if (point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) return
    el.className = 'popup'
    el.textContent = text
    el.style.left = point.x + '%'
    el.style.top = point.y + '%'
    if (/FUEL|HULL|TRIDENT/.test(text)) el.style.color = '#9effdf'
    if (this.nodes.effects.children.length > 20) this.nodes.effects.firstChild.remove()
    this.nodes.effects.append(el)
    el.addEventListener('animationend', () => el.remove(), { once: true })
  }
  message(text) {
    $('notice').textContent = text
  }
}
