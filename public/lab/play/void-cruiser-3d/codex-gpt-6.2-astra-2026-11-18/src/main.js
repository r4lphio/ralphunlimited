import { World } from './world.js'
import { Game } from './game.js'
import { Interface, read, save } from './ui.js'
import { AudioRack } from './audio.js'
const $ = (id) => document.getElementById(id)
const world = new World($('space')),
  audio = new AudioRack(read('mute', '0') === '1'),
  ui = new Interface(world),
  game = new Game(world, audio, ui)
ui.game = game
ui.onTitle = () => {
  game.mode = 'title'
  game.clearInput()
  audio.pause()
  world.clearFX()
  world.ship.body.visible = true
  world.title(0)
  ui.title()
  $('launch').focus()
}
$('launch').onclick = () => game.start()
$('manual').onclick = () => {
  game.mode = 'manual'
  ui.manual()
}
$('pause').onclick = () => (game.mode === 'pause' ? game.resume() : game.pause())
function showSound() {
  const label = audio.muted ? 'Unmute audio' : 'Mute audio'
  $('audio').setAttribute('aria-label', label)
  $('audio').setAttribute('aria-pressed', String(audio.muted))
  $('audio').title = label + ' (M)'
  $('audio')
    .querySelector('use')
    .setAttribute('href', audio.muted ? '#silent' : '#sound')
}
function mute() {
  audio.mute()
  save('mute', audio.muted ? '1' : '0')
  showSound()
}
$('audio').onclick = mute
showSound()
$('fullscreen').onclick = () => {
  ;(document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen()
  ).catch(() => {})
}
const flightKeys = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ShiftLeft',
  'ShiftRight',
])
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (e.code === 'KeyM' && !e.repeat) {
    mute()
    return
  }
  if (game.mode === 'play') {
    if (flightKeys.has(e.code)) {
      e.preventDefault()
      game.keys.add(e.code)
    }
    if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) {
      e.preventDefault()
      game.pause()
    }
  } else if (!e.repeat) {
    if (game.mode === 'pause' && ['Escape', 'KeyP'].includes(e.code)) {
      e.preventDefault()
      game.resume()
    } else if (game.mode === 'manual' && e.code === 'Escape') {
      ui.onTitle()
    } else if (
      (e.code === 'Enter' || (e.code === 'KeyR' && game.mode === 'end')) &&
      (!e.target.closest?.('button') || e.target === document.body || e.code === 'KeyR')
    ) {
      if (['title', 'end', 'manual'].includes(game.mode)) {
        e.preventDefault()
        game.start()
      } else if (game.mode === 'pause') {
        e.preventDefault()
        game.resume()
      }
    } else if (e.code === 'Space' && game.mode === 'title' && !e.target.closest?.('button')) {
      e.preventDefault()
      game.start()
    }
  }
})
addEventListener('keyup', (e) => game.keys.delete(e.code))
function point(e) {
  const r = $('stage').getBoundingClientRect()
  game.pointer = {
    x: ((e.clientX - r.left) / r.width - 0.5) * 25,
    y: (0.5 - (e.clientY - r.top) / r.height) * 13,
  }
}
$('stage').addEventListener('pointerdown', (e) => {
  if (game.mode === 'play' && e.button === 0) {
    e.preventDefault()
    $('stage').setPointerCapture(e.pointerId)
    game.keys.add('Mouse0')
    point(e)
  }
})
$('stage').addEventListener('pointermove', (e) => {
  if (game.mode === 'play' && game.keys.has('Mouse0')) point(e)
})
for (const evt of ['pointerup', 'pointercancel', 'lostpointercapture'])
  $('stage').addEventListener(evt, () => {
    game.keys.delete('Mouse0')
    game.pointer = null
  })
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause()
})
window.addEventListener('blur', () => {
  game.pause()
  game.clearInput()
})
let last = performance.now()
function frame(now) {
  const dt = Math.min(0.085, (now - last) / 1000)
  last = now
  if (game.mode === 'title' || game.mode === 'manual') world.title(document.hidden ? 0 : dt)
  else if (game.mode === 'play') {
    // Substeps keep collisions and steering stable on slower displays.
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)))
    for (let i = 0; i < steps; i++) game.step(dt / steps)
  }
  if (!document.hidden) world.render()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
