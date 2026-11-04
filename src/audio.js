// ---------------------------------------------------------------------------
// DYNO LAB — synthesized garage audio (no sample files)
// ---------------------------------------------------------------------------

export function createAudio() {
  let ctx = null
  let master = null
  let engine = null
  let noiseBuffer = null
  let muted = false
  let started = false

  function makeNoise(seconds = 2) {
    const length = Math.floor(ctx.sampleRate * seconds)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.2 + white * 0.3
    }
    return buffer
  }

  function init() {
    if (ctx) return true
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    try {
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : 0.55
      master.connect(ctx.destination)
      noiseBuffer = makeNoise(2)

      const out = ctx.createGain()
      out.gain.value = 0.0
      out.connect(master)

      // main engine tone
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 700
      filter.Q.value = 3.5
      filter.connect(out)

      const o1 = ctx.createOscillator()
      o1.type = 'sawtooth'
      o1.frequency.value = 60
      const g1 = ctx.createGain()
      g1.gain.value = 0.22
      o1.connect(g1).connect(filter)

      const o2 = ctx.createOscillator()
      o2.type = 'square'
      o2.frequency.value = 30
      o2.detune.value = 7
      const g2 = ctx.createGain()
      g2.gain.value = 0.12
      o2.connect(g2).connect(filter)

      const sub = ctx.createOscillator()
      sub.type = 'sine'
      sub.frequency.value = 28
      const gs = ctx.createGain()
      gs.gain.value = 0.34
      sub.connect(gs).connect(filter)

      // intake / wind noise
      const noise = ctx.createBufferSource()
      noise.buffer = noiseBuffer
      noise.loop = true
      const nFilter = ctx.createBiquadFilter()
      nFilter.type = 'bandpass'
      nFilter.frequency.value = 900
      nFilter.Q.value = 0.7
      const nGain = ctx.createGain()
      nGain.gain.value = 0.016
      noise.connect(nFilter).connect(nGain).connect(out)

      // turbo whistle
      const turbo = ctx.createOscillator()
      turbo.type = 'sine'
      turbo.frequency.value = 2100
      const turboGain = ctx.createGain()
      turboGain.gain.value = 0.0
      turbo.connect(turboGain).connect(master)

      // dyno roller hum
      const roller = ctx.createOscillator()
      roller.type = 'sawtooth'
      roller.frequency.value = 54
      const rollerFilter = ctx.createBiquadFilter()
      rollerFilter.type = 'lowpass'
      rollerFilter.frequency.value = 150
      const rollerGain = ctx.createGain()
      rollerGain.gain.value = 0.02
      roller.connect(rollerFilter).connect(rollerGain).connect(master)

      o1.start(); o2.start(); sub.start(); noise.start(); turbo.start(); roller.start()

      engine = { out, filter, o1, o2, sub, nGain, nFilter, turbo, turboGain, roller, rollerGain, gs, g1, g2 }
      return true
    } catch {
      ctx = null
      return false
    }
  }

  function start() {
    if (!init()) return
    started = true
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    if (engine) engine.out.gain.setTargetAtTime(0.06, ctx.currentTime, 0.4)
  }

  function setMuted(value) {
    muted = !!value
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.05)
  }

  function update({ rpm = 900, boost = 0, running = false, load = 0 }) {
    if (!engine || !ctx || !started) return
    const now = ctx.currentTime
    const firing = Math.max(18, (rpm / 60) * 2)
    const targetFilter = 380 + rpm * 0.16 + boost * 20
    engine.o1.frequency.setTargetAtTime(firing * 2, now, 0.03)
    engine.o2.frequency.setTargetAtTime(firing, now, 0.03)
    engine.sub.frequency.setTargetAtTime(firing * 0.5, now, 0.03)
    engine.filter.frequency.setTargetAtTime(Math.min(5200, targetFilter), now, 0.05)
    engine.filter.Q.setTargetAtTime(running ? 2.2 : 3.6, now, 0.1)
    const gain = running ? 0.2 + load * 0.16 : 0.075
    engine.out.gain.setTargetAtTime(gain, now, 0.08)
    engine.nGain.gain.setTargetAtTime(running ? 0.02 + load * 0.045 : 0.012, now, 0.1)
    engine.turbo.frequency.setTargetAtTime(900 + boost * 105 + rpm * 0.08, now, 0.08)
    engine.turboGain.gain.setTargetAtTime(running ? Math.min(0.022, boost * 0.0009) : 0.0008, now, 0.12)
    engine.rollerGain.gain.setTargetAtTime(running ? 0.03 + load * 0.02 : 0.012, now, 0.15)
    engine.roller.frequency.setTargetAtTime(running ? 40 + rpm * 0.014 : 46, now, 0.1)
  }

  function burst({ duration = 0.08, frequency = 1800, q = 1.2, gain = 0.22, type = 'highpass', sweep = null }) {
    if (!ctx || !started) return
    try {
      const src = ctx.createBufferSource()
      src.buffer = noiseBuffer
      const filter = ctx.createBiquadFilter()
      filter.type = type
      filter.frequency.value = frequency
      filter.Q.value = q
      const g = ctx.createGain()
      const now = ctx.currentTime
      g.gain.setValueAtTime(gain, now)
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration)
      if (sweep) filter.frequency.exponentialRampToValueAtTime(sweep, now + duration)
      src.connect(filter).connect(g).connect(master)
      src.start(now)
      src.stop(now + duration + 0.02)
    } catch {}
  }

  function knock() {
    burst({ duration: 0.06, frequency: 2400, q: 0.9, gain: 0.24, type: 'bandpass' })
    burst({ duration: 0.12, frequency: 720, q: 2, gain: 0.12, type: 'bandpass' })
  }

  function backfire() {
    burst({ duration: 0.18, frequency: 420, q: 0.7, gain: 0.2, type: 'lowpass', sweep: 90 })
  }

  function click() {
    if (!ctx || !started) return
    try {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      const now = ctx.currentTime
      o.type = 'sine'
      o.frequency.setValueAtTime(820, now)
      o.frequency.exponentialRampToValueAtTime(320, now + 0.06)
      g.gain.setValueAtTime(0.07, now)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)
      o.connect(g).connect(master)
      o.start(now)
      o.stop(now + 0.09)
    } catch {}
  }

  return { start, update, setMuted, knock, backfire, click, get muted() { return muted } }
}
