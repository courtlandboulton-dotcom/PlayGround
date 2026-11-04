// ---------------------------------------------------------------------------
// DYNO LAB — game data
// All power figures are wheel horsepower / wheel torque unless labelled.
// ---------------------------------------------------------------------------

export const TURBO_LEVELS = [
  {
    id: 'ihi',
    name: 'Stock IHI',
    short: 'IHI',
    maxBoost: 18,
    spool: 2450,
    top: 1.0,
    size: 1.0,
    cost: 0,
    desc: 'Factory journal-bearing turbo. Quick spool, runs out of breath up top.'
  },
  {
    id: 's1',
    name: 'Stage 1 Billet',
    short: 'S1',
    maxBoost: 25,
    spool: 2800,
    top: 1.045,
    size: 1.12,
    cost: 1900,
    desc: 'Billet compressor wheel, 25 psi capable. The value pick.'
  },
  {
    id: 's2',
    name: 'Stage 2 3076',
    short: 'S2',
    maxBoost: 33,
    spool: 3200,
    top: 1.075,
    size: 1.26,
    cost: 5400,
    desc: 'Bigger hotside, 33 psi. Laggy downtown, violent uptown.'
  },
  {
    id: 's3',
    name: 'Stage 3 3584',
    short: 'S3',
    maxBoost: 42,
    spool: 3650,
    top: 1.11,
    size: 1.45,
    cost: 14500,
    desc: 'Race cover, 42 psi. Needs octane and a brave right foot.'
  }
]

export const INTERCOOLERS = [
  { name: 'Stock Side-Mount', eff: 0.55, cost: 0, desc: 'Heat-soaks after one pull.' },
  { name: 'Front-Mount 450', eff: 0.72, cost: 950, desc: 'Bar-and-plate core. Constants improve.' },
  { name: 'Front-Mount 600', eff: 0.84, cost: 2400, desc: 'Race core with cast end tanks.' },
  { name: 'Drag Race Air-to-Water', eff: 0.92, cost: 5600, desc: 'Ice water, near-ambient charge temps.' }
]

export const EXHAUSTS = [
  { name: 'Stock Downpipe', ve: 0, egtDrop: 0, spoolGain: 0, cost: 0, desc: 'Quiet. Restrictive. Fine for now.' },
  { name: '3" Turbo-Back', ve: 0.012, egtDrop: 22, spoolGain: 70, cost: 750, desc: 'Frees backpressure, drops EGT.' },
  { name: '3.5" Race System', ve: 0.024, egtDrop: 45, spoolGain: 140, cost: 1700, desc: 'Loud enough to upset the neighbours.' },
  { name: '4" Titanium Straight', ve: 0.038, egtDrop: 68, spoolGain: 200, cost: 3800, desc: 'Zero restriction. Hearing protection included.' }
]

export const INTERNALS = [
  { name: 'Stock Cast Pistons', knockBonus: 0, safeRev: 7200, cost: 0, desc: 'Keep the limiter sensible.' },
  { name: 'Forged Drop-Ins', knockBonus: 0.5, safeRev: 7800, cost: 1400, desc: 'Forged slugs and ARP studs. 7800 rpm safe.' },
  { name: 'Forged + Rods', knockBonus: 1.1, safeRev: 8400, cost: 3400, desc: 'H-beam rods, balanced crank. 8400 rpm.' },
  { name: 'Billet Race Long Block', knockBonus: 1.9, safeRev: 9000, cost: 7800, desc: 'Billet crank, dry sump. 9000 rpm, 1000+ hp.' }
]

export const FUELS = [
  { id: '91', name: '91', octane: 91, cost: 30, cooling: 0, energy: 43.5, afrScale: 1, eta: 1, color: '#8b93a1' },
  { id: '93', name: '93', octane: 93, cost: 48, cooling: 2, energy: 43.5, afrScale: 1, eta: 1, color: '#62d0a4' },
  { id: '100', name: '100', octane: 100, cost: 95, cooling: 9, energy: 43.2, afrScale: 1, eta: 1.005, color: '#61b8ff' },
  { id: 'e85', name: 'E85', octane: 106, cost: 64, cooling: 26, energy: 29.6, afrScale: 1.31, eta: 1.02, color: '#ffc14d' }
]

export const CONTRACTS = [
  {
    id: 'street',
    name: 'Street Sweep',
    client: 'Maya / weekend warrior',
    tag: 'STREET',
    color: '#4de2c0',
    hp: 300,
    tq: 260,
    maxEgt: 920,
    maxKnock: 0,
    minOctane: 91,
    reward: 3500,
    rep: 150,
    blurb: 'Daily-driven 2.0T. Make it wake up on pump gas without melting the stock downpipe.',
    focus: 'Learn the knock margin. Add boost, then pull timing back until the margin is green.'
  },
  {
    id: 'track',
    name: 'Track Day Special',
    client: 'Rico / time attack',
    tag: 'TRACK',
    color: '#61b8ff',
    hp: 430,
    tq: 340,
    maxEgt: 950,
    maxKnock: 0,
    minOctane: 93,
    reward: 7000,
    rep: 300,
    blurb: 'Twenty-minute sessions, no cooldown laps. It has to make the number and stay together.',
    focus: 'A front-mount intercooler and a real exhaust will keep charge temps and EGT honest.'
  },
  {
    id: 'roll',
    name: 'Mexico Roll',
    client: 'Dee / roll race crew',
    tag: 'STREET',
    color: '#ff9a4d',
    hp: 540,
    tq: 430,
    maxEgt: 1000,
    maxKnock: 1,
    minOctane: 93,
    reward: 12000,
    rep: 480,
    blurb: 'Third-gear pulls against big bikes. One knock event and the internet will know.',
    focus: 'Higher octane buys timing. Rich AFR buys EGT headroom, at a small torque cost.'
  },
  {
    id: 'dyno',
    name: 'Dyno Queen',
    client: 'Sasha / content creator',
    tag: 'SHOW',
    color: '#e47bff',
    hp: 690,
    tq: 525,
    maxEgt: 1030,
    maxKnock: 2,
    minOctane: 100,
    reward: 20000,
    rep: 750,
    blurb: 'A number for the thumbnail. Still has to survive the drive home on a race tune.',
    focus: 'Stage 2+ turbo, race fuel, and a rev limit the valvetrain can actually survive.'
  },
  {
    id: 'club',
    name: 'The 700 Club',
    client: 'Mr. K / anonymous',
    tag: 'LEGEND',
    color: '#ffd166',
    hp: 780,
    tq: 580,
    maxEgt: 1060,
    maxKnock: 0,
    minOctane: 100,
    reward: 35000,
    rep: 1400,
    blurb: 'The shop record. 750 at the wheels, clean, on the dyno sheet. No excuses.',
    focus: 'Everything you own, turned up, with zero margin for a bad decision. Good luck.'
  }
]

export const FREE_RUN = {
  id: 'free',
  name: 'Open Dyno',
  tag: 'FREE',
  color: '#a8b3c2',
  blurb: 'No target. No pressure. Cash is paid for a clean, knock-free pull.'
}

export const DEFAULT_UPGRADES = { turbo: 0, intercooler: 0, exhaust: 0, internals: 0 }

export const DEFAULT_TUNE = {
  boost: 12,
  timing: 17,
  afr: 12.2,
  cam: 0,
  revLimit: 7000
}

export const TIPS = [
  'Add ignition timing until the KNOCK MARGIN bar just turns green, then stop.',
  'Richer AFR (11.5–12.0) cools EGT and suppresses knock. Leaner (12.8+) makes slightly more torque but gets hot.',
  'Boost is the big power knob. More boost always needs more octane, more intercooler, or less timing.',
  'Cam advance shifts the torque curve down; retard shifts it up. Match the curve to the job.',
  'A rev limiter above the valvetrain rating causes valve float. Check the internals spec.',
  'Damaged engines make less power and knock sooner. Repair in the UPGRADES tab.',
  'E85 tolerates huge timing and boost, but needs 31% more fuel mass to make the same energy.',
  'Torque wins races. Horsepower sells dyno sheets. A contract may ask for both.'
]

export const money = (value) =>
  '$' + Math.round(value).toLocaleString('en-US')

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
