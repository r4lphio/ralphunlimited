// Decode the short samples once. Long music streams from the local build.
export class AudioRack {
  constructor(muted) {
    this.muted = muted
    this.buffers = {}
    this.music = new Audio('./assets/overdrive.ogg')
    this.music.loop = true
    this.music.volume = 0.27
    this.music.muted = muted
  }
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.75
      const limiter = this.ctx.createDynamicsCompressor()
      limiter.threshold.value = -8
      limiter.ratio.value = 10
      limiter.attack.value = 0.003
      this.master.connect(limiter).connect(this.ctx.destination)
      for (const file of ['fire2.ogg', 'explode2.ogg', 'boost.ogg'])
        fetch('./assets/' + file)
          .then((r) => r.arrayBuffer())
          .then((b) => this.ctx.decodeAudioData(b))
          .then((b) => (this.buffers[file] = b))
          .catch(() => {})
    }
    this.ctx.resume().catch(() => {})
  }
  mute() {
    this.muted = !this.muted
    this.music.muted = this.muted
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.75, this.ctx.currentTime, 0.015)
    return this.muted
  }
  play(restart = false) {
    this.unlock()
    if (restart) this.music.currentTime = 0
    this.music.play().catch(() => {})
  }
  pause() {
    this.music.pause()
    if (this.ctx) this.ctx.suspend().catch(() => {})
  }
  sample(file, volume, rate = 1) {
    if (!this.ctx || !this.buffers[file] || this.muted) return
    const src = this.ctx.createBufferSource(),
      g = this.ctx.createGain()
    src.buffer = this.buffers[file]
    src.playbackRate.value = rate
    g.gain.value = volume
    src.connect(g).connect(this.master)
    src.start()
    src.onended = () => {
      src.disconnect()
      g.disconnect()
    }
  }
  tone(freq, to, duration, type, volume, delay = 0) {
    if (!this.ctx || this.muted) return
    const ctx = this.ctx,
      t = ctx.currentTime + delay,
      o = ctx.createOscillator(),
      g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(to, t + duration)
    g.gain.setValueAtTime(volume, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + duration)
    o.onended = () => {
      o.disconnect()
      g.disconnect()
    }
  }
  fire(over) {
    this.sample('fire2.ogg', over ? 0.2 : 0.14, 0.96 + Math.random() * 0.14)
    this.tone(over ? 160 : 280, 65, 0.105, 'sawtooth', 0.055)
  }
  boom(big) {
    this.sample('explode2.ogg', big ? 0.58 : 0.32, big ? 0.68 : 1.15)
    this.tone(big ? 100 : 146, 29, big ? 0.32 : 0.2, 'triangle', 0.4)
  }
  startBoost() {
    this.sample('boost.ogg', 0.32, 1.15)
    this.tone(45, 165, 0.38, 'sawtooth', 0.12)
  }
  hit() {
    this.boom(true)
    this.tone(270, 100, 0.28, 'square', 0.12)
    this.tone(270, 120, 0.18, 'square', 0.08, 0.25)
  }
  pickup() {
    this.tone(494, 640, 0.13, 'sine', 0.22)
    this.tone(740, 990, 0.23, 'sine', 0.18, 0.07)
  }
}
