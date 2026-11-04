// ---------------------------------------------------------------------------
// DYNO LAB — engine simulation
//
// A deliberately readable, physically-shaped model:
//   air mass -> fuel mass -> combustion energy -> torque -> wheel power
// with knock, ignition retard, charge heating, turbo spool, and EGT.
// It is not a CFD solver, but every gauge moves for a reason you can tune.
// ---------------------------------------------------------------------------

import {
  TURBO_LEVELS,
  INTERCOOLERS,
  EXHAUSTS,
  INTERNALS,
  FUELS,
  DEFAULT_UPGRADES,
  DEFAULT_TUNE,
  clamp
} from './data.js'

const DISPLACEMENT_L = 2.0
const STOICH_GAS = 14.7
const AMBIENT_C = 26
const CYCLE_RAD = 4 * Math.PI // four-stroke work per crank revolution pair

// Naturally aspirated volumetric efficiency shape, before cam & boost effects.
const VE_RPM = [900, 1500, 2200, 3000, 3800, 4600, 5400, 6200, 7000, 7800, 8600]
const VE_VAL = [0.72, 0.82, 0.91, 0.98, 1.0, 0.985, 0.955, 0.91, 0.85, 0.77, 0.66]

function lerpTable(rpm) {
  const r = clamp(rpm, VE_RPM[0], VE_RPM[VE_RPM.length - 1])
  for (let i = 1; i < VE_RPM.length; i++) {
    if (r <= VE_RPM[i]) {
      const t = (r - VE_RPM[i - 1]) / (VE_RPM[i] - VE_RPM[i - 1])
      return VE_VAL[i - 1] + (VE_VAL[i] - VE_VAL[i - 1]) * t
    }
  }
  return VE_VAL[VE_VAL.length - 1]
}

export function resolveSpec(upgrades = DEFAULT_UPGRADES, fuelId = '93', damage = 0) {
  const turbo = TURBO_LEVELS[clamp(upgrades.turbo | 0, 0, TURBO_LEVELS.length - 1)]
  const intercooler = INTERCOOLERS[clamp(upgrades.intercooler | 0, 0, INTERCOOLERS.length - 1)]
  const exhaust = EXHAUSTS[clamp(upgrades.exhaust | 0, 0, EXHAUSTS.length - 1)]
  const internals = INTERNALS[clamp(upgrades.internals | 0, 0, INTERNALS.length - 1)]
  const fuel = FUELS.find((f) => f.id === fuelId) || FUELS[1]
  return {
    turbo,
    intercooler,
    exhaust,
    internals,
    fuel,
    damage: clamp(damage, 0, 100),
    maxBoost: turbo.maxBoost,
    maxRev: internals.safeRev,
    healthFactor: 1 - clamp(damage, 0, 100) * 0.0016
  }
}

export function normalizedTune(tune, spec) {
  return {
    boost: clamp(Number(tune.boost) || 0, 0, spec.maxBoost),
    timing: clamp(Number(tune.timing) || 0, 0, 34),
    afr: clamp(Number(tune.afr) || 12.2, 10.6, 14.5),
    cam: clamp(Number(tune.cam) || 0, -9, 10),
    revLimit: clamp(Number(tune.revLimit) || 7000, 5000, 9000)
  }
}

/**
 * One operating point of the engine. No time, no randomness.
 * `heatSoak` is extra intake heat accumulated during a pull.
 */
export function enginePoint({ rpm, tune, spec, knockRetard = 0, heatSoak = 0, egt = null }) {
  const t = normalizedTune(tune, spec)
  const turbo = spec.turbo
  const exhaust = spec.exhaust
  const ic = spec.intercooler
  const fuel = spec.fuel

  // ---- turbo spool --------------------------------------------------------
  const spoolRpm = turbo.spool - exhaust.spoolGain
  const spool = 1 / (1 + Math.exp(-(rpm - spoolRpm) / 390))
  // A trace of boost below the spool threshold keeps the gauge alive.
  const boostPsi = clamp(t.boost, 0, spec.maxBoost) * spool * 0.985
  const mapKpa = (14.7 + boostPsi) * 6.89476

  // ---- charge temperature -------------------------------------------------
  const pressureRatio = (14.7 + boostPsi) / 14.7
  const compressorDelta =
    ((Math.pow(pressureRatio, 0.286) - 1) * (AMBIENT_C + 273.15)) / 0.72
  const iatC = clamp(
    AMBIENT_C + compressorDelta * (1 - ic.eff) - fuel.cooling + heatSoak,
    -10,
    190
  )
  const densityGL = (mapKpa * 1000) / (287.05 * (iatC + 273.15))

  // ---- airflow & fuel -----------------------------------------------------
  const camGain = 1 + t.cam * 0.0055 * ((rpm - 4000) / 2000)
  const speedDensity = clamp(1.0 - Math.max(0, rpm - 6800) * 0.000014, 0.95, 1)
  const ve = clamp(
    (lerpTable(rpm) * camGain + exhaust.ve) * speedDensity,
    0.42,
    1.24
  )
  const topEnd = 1 + (turbo.top - 1) * clamp((rpm - 4200) / 2600, 0, 1)
  const airG = ve * DISPLACEMENT_L * densityGL * topEnd
  const fuelG = (airG / t.afr) * fuel.afrScale
  const energyJ = fuelG * fuel.energy * 1000

  // ---- ignition -----------------------------------------------------------
  const timingEff = Math.max(0, t.timing - knockRetard)
  const mbt = 24 - Math.max(0, rpm - 4200) * 0.0009
  const delta = timingEff - mbt
  const timingFactor = clamp(
    delta >= 0 ? 1 + 0.008 * delta - 0.0009 * delta * delta : 1 + 0.009 * delta,
    0.62,
    1.04
  )
  const afrFactor = clamp(1 - 0.052 * Math.abs(t.afr - 12.2), 0.78, 1.01)
  const rpmFactor = clamp(0.94 + (rpm / 7000) * 0.07, 0.9, 1.02)

  // ---- torque -------------------------------------------------------------
  let efficiency =
    0.388 *
    timingFactor *
    afrFactor *
    rpmFactor *
    spec.healthFactor *
    fuel.eta
  // Heat soak / extreme EGT pulls a little timing out of the combo.
  const liveEgt = egt == null ? estimateEgtTarget({ rpm, tune: t, spec, timingEff, iatC, boostPsi, knockRetard }) : egt
  if (liveEgt > 990) efficiency *= clamp(1 - (liveEgt - 990) * 0.00055, 0.82, 1)

  const friction = 7 + rpm * 0.0017
  const crankTorqueNm = Math.max(0, (energyJ * efficiency) / CYCLE_RAD - friction)
  const wheelTorqueNm = crankTorqueNm * 0.87
  const hp = (wheelTorqueNm * rpm) / 7127
  const torqueLbFt = wheelTorqueNm * 0.73756

  // ---- knock --------------------------------------------------------------
  const knockLimit = knockLimitAt({ rpm, spec, t, iatC, boostPsi, afr: t.afr })
  const knockMargin = knockLimit - timingEff
  const load = clamp(boostPsi / 10, 0, 2.2)
  const knockRisk = knockMargin < 0
    ? clamp((-knockMargin) * 0.6 * load + 0.04, 0, 0.98)
    : 0

  return {
    rpm,
    boostPsi,
    mapKpa,
    iatC,
    ve,
    airG,
    fuelG,
    afr: t.afr,
    timing: t.timing,
    timingEff,
    mbt,
    knockLimit,
    knockMargin,
    knockRisk,
    egtTarget: estimateEgtTarget({ rpm, tune: t, spec, timingEff, iatC, boostPsi, knockRetard }),
    torqueNm: wheelTorqueNm,
    torqueLbFt,
    hp: Math.max(0, hp),
    load,
    spool
  }
}

function knockLimitAt({ rpm, spec, t, iatC, boostPsi, afr }) {
  const octaneGain = (spec.fuel.octane - 93) * 0.30
  const richCooling = Math.max(0, 12.2 - afr) * 1.35
  const rpmPenalty = Math.max(0, rpm - 5000) * 0.0006
  const damagePenalty = spec.damage * 0.009
  return (
    31.5 -
    boostPsi * 0.53 -
    (iatC - 30) * 0.072 +
    octaneGain +
    richCooling -
    rpmPenalty +
    spec.internals.knockBonus -
    damagePenalty
  )
}

function estimateEgtTarget({ rpm, tune, spec, timingEff, iatC, boostPsi, knockRetard }) {
  const e85Cooling = spec.fuel.cooling * 2.4
  return clamp(
    500 +
      boostPsi * 11.4 +
      (tune.afr - 12.0) * 54 +
      Math.max(0, 20 - timingEff) * 5.6 +
      (iatC - 30) * 0.45 -
      spec.exhaust.egtDrop -
      e85Cooling +
      knockRetard * 4.5 +
      Math.max(0, rpm - 3000) * 0.018 +
      Math.max(0, rpm - 7000) * 0.03,
    280,
    1280
  )
}

/** Predicted curve for the graph, before pull-time knock chaos. */
export function sampleCurve(tune, upgrades = DEFAULT_UPGRADES, fuelId = '93', damage = 0, points = 44) {
  const spec = resolveSpec(upgrades, fuelId, damage)
  const t = normalizedTune(tune, spec)
  const curve = []
  for (let i = 0; i < points; i++) {
    const rpm = 1400 + (t.revLimit - 1400) * (i / (points - 1))
    const p = enginePoint({ rpm, tune: t, spec, heatSoak: 16 })
    curve.push({
      rpm,
      hp: p.hp,
      torque: p.torqueLbFt,
      boost: p.boostPsi,
      egt: p.egtTarget,
      knockMargin: p.knockMargin,
      timing: p.timing
    })
  }
  return curve
}

export function summarizeCurve(curve) {
  let peakHP = 0
  let peakTQ = 0
  let peakHPtq = 0
  let peakTQrpm = 0
  let hpRpm = 0
  for (const p of curve) {
    if (p.hp > peakHP) {
      peakHP = p.hp
      hpRpm = p.rpm
    }
    if (p.torque > peakTQ) {
      peakTQ = p.torque
      peakTQrpm = p.rpm
    }
  }
  peakHPtq = peakTQ
  return { peakHP, peakTQ, peakHPtq, hpRpm, peakTQrpm }
}

/** A safe-tune recommendation used by the "AUTO-TUNE" coaching button. */
export function suggestTune(tune, upgrades, fuelId, damage, targetHp) {
  const spec = resolveSpec(upgrades, fuelId, damage)
  let best = null
  for (let boost = 4; boost <= spec.maxBoost; boost += 1) {
    for (let timing = 4; timing <= 30; timing += 1) {
      for (const afr of [11.4, 11.8, 12.2, 12.6]) {
        for (const cam of [-4, 0, 4, 8]) {
          const test = { ...tune, boost, timing, afr, cam, revLimit: Math.min(tune.revLimit, spec.maxRev) }
          const curve = sampleCurve(test, upgrades, fuelId, damage, 20)
          const sum = summarizeCurve(curve)
          const margin = Math.min(...curve.map((p) => p.knockMargin))
          const egt = Math.max(...curve.map((p) => p.egt))
          if (margin < 2.2 || egt > 985) continue
          const score = sum.peakHP + Math.min(sum.peakTQ, 700) * 0.4
          if (!best || score > best.score) best = { score, tune: test, summary: sum, margin, egt }
        }
      }
    }
  }
  if (best) return best
  const safe = { ...tune, boost: Math.min(tune.boost, spec.maxBoost * 0.7), timing: Math.min(tune.timing, 12), afr: 11.9 }
  const curve = sampleCurve(safe, upgrades, fuelId, damage, 20)
  return {
    tune: safe,
    summary: summarizeCurve(curve),
    margin: Math.min(...curve.map((p) => p.knockMargin)),
    egt: Math.max(...curve.map((p) => p.egt)),
    score: 0
  }
}

// ---------------------------------------------------------------------------
// Live dyno pull
// ---------------------------------------------------------------------------

export function createPull(tune, upgrades, fuelId, damage, { startRpm = 1500, duration = null } = {}) {
  const spec = resolveSpec(upgrades, fuelId, damage)
  const t = normalizedTune(tune, spec)
  const pullDuration = duration ?? clamp(4.9 + (t.revLimit - 5000) / 2600, 5.2, 6.8)
  return {
    spec,
    tune: t,
    time: 0,
    duration: pullDuration,
    startRpm,
    rpm: startRpm,
    boost: 0,
    egt: 380,
    iat: enginePoint({ rpm: startRpm, tune: t, spec }).iatC,
    knockRetard: 0,
    heatSoak: 0,
    damage: spec.damage,
    damageStart: spec.damage,
    knocks: 0,
    knockFlash: 0,
    knockCooldown: 0,
    peakHP: 0,
    peakTQ: 0,
    peakEgt: 0,
    peakBoost: 0,
    peakIat: 0,
    avgAfr: 0,
    afrSamples: 0,
    hpRpm: 0,
    tqRpm: 0,
    point: null,
    failed: false,
    failure: null,
    done: false,
    samples: [],
    events: []
  }
}

export function stepPull(state, dt, rng = Math.random) {
  if (state.done) return state
  dt = clamp(dt, 0, 0.05)
  state.time += dt

  const sweep = clamp(state.time / state.duration, 0, 1)
  const eased = Math.pow(sweep, 0.9)
  const limit = Math.min(state.tune.revLimit, state.spec.maxRev + 250)
  state.rpm = state.startRpm + (limit - state.startRpm) * eased

  // heat soak builds across the pull, then cools on the next run
  state.heatSoak = clamp(state.heatSoak + dt * 2.6, 0, 22)

  let p = enginePoint({
    rpm: state.rpm,
    tune: state.tune,
    spec: state.spec,
    knockRetard: state.knockRetard,
    heatSoak: state.heatSoak,
    egt: state.egt
  })

  // ---- knock events -------------------------------------------------------
  state.knockCooldown = Math.max(0, state.knockCooldown - dt)
  const loaded = p.boostPsi > 3 && state.rpm > 2400
  if (loaded && p.knockRisk > 0 && state.knockCooldown <= 0) {
    const chance = 1 - Math.pow(1 - p.knockRisk * 0.55, dt * 60)
    if (rng() < chance) {
      const severity = clamp(-p.knockMargin, 0.5, 9)
      state.knocks += 1
      state.knockRetard = clamp(state.knockRetard + 1.6 + severity * 0.55, 0, 13)
      state.damage = clamp(state.damage + 0.7 + severity * 0.55, 0, 100)
      state.knockFlash = 1
      state.knockCooldown = 0.14
      state.events.push({
        t: state.time,
        rpm: Math.round(state.rpm),
        type: 'knock',
        text: `KNOCK @ ${Math.round(state.rpm)} rpm — ECU pulled ${state.knockRetard.toFixed(1)}°`
      })
      p = enginePoint({
        rpm: state.rpm,
        tune: state.tune,
        spec: { ...state.spec, damage: state.damage },
        knockRetard: state.knockRetard,
        heatSoak: state.heatSoak,
        egt: state.egt
      })
    }
  }

  // ---- thermal inertia ----------------------------------------------------
  state.egt += (p.egtTarget - state.egt) * Math.min(1, dt / 1.05)
  state.iat += (p.iatC - state.iat) * Math.min(1, dt / 0.8)
  state.boost = p.boostPsi

  // ---- heat damage --------------------------------------------------------
  if (state.egt > 1005) {
    state.damage = clamp(state.damage + (state.egt - 1005) * 0.028 * dt, 0, 100)
    if (!state.events.some((e) => e.type === 'heat')) {
      state.events.push({ t: state.time, rpm: Math.round(state.rpm), type: 'heat', text: 'EGT over 1005°C — pistons are unhappy' })
    }
  }

  // ---- limiters -----------------------------------------------------------
  let hp = Math.max(0, p.hp)
  if (state.rpm > state.spec.maxRev) {
    hp *= clamp(1 - (state.rpm - state.spec.maxRev) * 0.0025, 0.55, 1)
    if (state.time > state.duration * 0.85 && state.damage < 100) {
      state.damage = clamp(state.damage + dt * 2.2, 0, 100)
    }
  }
  if (state.egt > 1120) {
    state.damage = clamp(state.damage + 15, 0, 100)
    state.failed = true
    state.failure = 'egt'
    state.events.push({ t: state.time, rpm: Math.round(state.rpm), type: 'fail', text: 'MELTDOWN — exhaust valve let go' })
  }
  if (state.damage >= 100) {
    state.failed = true
    state.failure = 'engine'
    state.events.push({ t: state.time, rpm: Math.round(state.rpm), type: 'fail', text: 'ENGINE FAILURE — rod exited the block' })
  }

  // ---- bookkeeping --------------------------------------------------------
  const torque = p.torqueLbFt * (state.rpm > state.spec.maxRev ? hp / Math.max(p.hp, 1) : 1)
  if (hp > state.peakHP) {
    state.peakHP = hp
    state.hpRpm = state.rpm
  }
  if (torque > state.peakTQ) {
    state.peakTQ = torque
    state.tqRpm = state.rpm
  }
  state.peakEgt = Math.max(state.peakEgt, state.egt)
  state.peakBoost = Math.max(state.peakBoost, state.boost)
  state.peakIat = Math.max(state.peakIat, state.iat)
  state.avgAfr = (state.avgAfr * state.afrSamples + state.tune.afr) / (state.afrSamples + 1)
  state.afrSamples += 1
  state.knockFlash = Math.max(0, state.knockFlash - dt * 2.4)
  state.point = { ...p, hp, torque: p.torqueLbFt }

  if (state.time % 0.1 < dt) {
    state.samples.push({ rpm: state.rpm, hp, torque: p.torqueLbFt })
  }

  if (state.failed || state.time >= state.duration + 0.35) {
    state.done = true
    if (!state.failed) {
      state.events.push({
        t: state.time,
        rpm: Math.round(state.rpm),
        type: 'done',
        text: `Pull complete — ${Math.round(state.peakHP)} whp / ${Math.round(state.peakTQ)} lb-ft`
      })
    }
  }
  return state
}

export function pullResult(state, contract = null) {
  const result = {
    peakHP: state.peakHP,
    peakTQ: state.peakTQ,
    hpRpm: state.hpRpm,
    tqRpm: state.tqRpm,
    peakEgt: state.peakEgt,
    peakBoost: state.peakBoost,
    peakIat: state.peakIat,
    knocks: state.knocks,
    afr: state.avgAfr,
    knockRetard: state.knockRetard,
    damageGained: state.damage - state.damageStart,
    damageEnd: state.damage,
    failed: state.failed,
    failure: state.failure,
    events: state.events,
    samples: state.samples,
    tune: state.tune,
    spec: state.spec
  }
  if (contract) {
    const reasons = []
    if (result.peakHP < contract.hp) reasons.push(`Power short: ${Math.round(result.peakHP)} / ${contract.hp} whp`)
    if (result.peakTQ < contract.tq) reasons.push(`Torque short: ${Math.round(result.peakTQ)} / ${contract.tq} lb-ft`)
    if (result.peakEgt > contract.maxEgt) reasons.push(`EGT over limit: ${Math.round(result.peakEgt)} / ${contract.maxEgt}°C`)
    if (result.knocks > contract.maxKnock) reasons.push(`Knock events: ${result.knocks} / ${contract.maxKnock} allowed`)
    if (result.spec.fuel.octane < contract.minOctane) reasons.push(`Fuel octane too low: needs ${contract.minOctane}`)
    if (result.failed) reasons.push(result.failure === 'egt' ? 'Engine melted down' : 'Engine failure')
    result.passed = reasons.length === 0
    result.reasons = reasons
    let stars = 0
    if (result.passed) {
      stars = 1
      if (result.peakHP >= contract.hp * 1.05 && result.peakTQ >= contract.tq * 1.02) stars = 2
      if (
        result.peakHP >= contract.hp * 1.1 &&
        result.peakTQ >= contract.tq * 1.04 &&
        result.knocks === 0 &&
        result.peakEgt <= contract.maxEgt - 25
      ) stars = 3
    }
    result.stars = stars
    result.payout = result.passed ? Math.round(contract.reward * (0.8 + stars * 0.12)) : 0
  }
  return result
}

/** Simple deterministic RNG so tests can exercise knock paths. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const engineMath = { AMBIENT_C, STOICH_GAS, DISPLACEMENT_L }
