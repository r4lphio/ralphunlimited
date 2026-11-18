import * as T from 'three'
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js'

function finishMap(file) {
  const map = new T.TextureLoader().load(new URL('../assets/' + file, import.meta.url).href)
  map.wrapS = map.wrapT = T.RepeatWrapping
  map.anisotropy = 4
  return map
}
const paint = finishMap('airframe.webp'),
  regolith = finishMap('regolith.webp')
const armor = new T.MeshStandardMaterial({
  vertexColors: true,
  map: paint,
  flatShading: true,
  metalness: 0.26,
  roughness: 0.55,
})
const stone = new T.MeshStandardMaterial({
  vertexColors: true,
  map: regolith,
  bumpMap: regolith,
  bumpScale: 0.13,
  roughness: 0.98,
  flatShading: true,
})
const glass = new T.MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  metalness: 0.48,
  roughness: 0.18,
})
const lamp = new T.MeshBasicMaterial({ vertexColors: true })
const palette = {
  hull: 0xcfd1c7,
  light: 0xf6efdb,
  grey: 0x76828a,
  metal: 0x39444d,
  dark: 0x1b232c,
  orange: 0xfa681e,
  amber: 0xffa83f,
  ice: 0x88f7ff,
}
const { hull, light, grey, metal, dark, orange, amber, ice } = palette
const cache = new Map()
function memo(key, make) {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key)
}
function triangles(points, faces) {
  const g = new T.BufferGeometry()
  g.setAttribute(
    'position',
    new T.Float32BufferAttribute(
      faces.flatMap((f) => f.flatMap((i) => points[i])),
      3,
    ),
  )
  g.computeVertexNormals()
  return g
}
// Longitudinal stations are [z, half-width, half-height, center-height].
function loft(stations) {
  const points = [],
    faces = []
  for (const [z, w, h, y] of stations) {
    for (const [px, py] of [
      [-0.54, 1],
      [0.54, 1],
      [1, 0.32],
      [0.88, -0.58],
      [0.44, -1],
      [-0.44, -1],
      [-0.88, -0.58],
      [-1, 0.32],
    ])
      points.push([px * w, y + py * h, z])
  }
  for (let k = 1; k < stations.length; k++)
    for (let i = 0; i < 8; i++) {
      const a = (k - 1) * 8 + i,
        b = (k - 1) * 8 + ((i + 1) % 8),
        c = a + 8,
        d = b + 8
      faces.push([a, c, b], [b, c, d])
    }
  for (let i = 1; i < 7; i++) {
    const j = (stations.length - 1) * 8
    faces.push([0, i, i + 1], [j, j + i + 1, j + i])
  }
  return outward(points, faces)
}
function outward(points, faces) {
  // Convex panels are wound relative to their centroid.
  const center = new T.Vector3()
  for (const p of points) center.add(new T.Vector3(...p))
  center.divideScalar(points.length)
  for (const f of faces) {
    const [a, b, c] = f.map((i) => new T.Vector3(...points[i]))
    if (b.sub(a).cross(c.sub(a)).dot(a.sub(center)) < 0) f.reverse()
  }
  return triangles(points, faces)
}
function plate(points, y, h) {
  const count = points.length,
    cx = points.reduce((s, p) => s + p[0], 0) / count,
    cz = points.reduce((s, p) => s + p[1], 0) / count
  const p = [],
    f = []
  for (const [s, dy] of [
    [0.94, 0],
    [1, h * 0.38],
    [0.93, h],
  ])
    for (const [x, z] of points) p.push([cx + (x - cx) * s, y + dy, cz + (z - cz) * s])
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < count; i++) {
      const a = j * count + i,
        b = j * count + ((i + 1) % count)
      f.push([a, b, a + count], [b, b + count, a + count])
    }
  for (let i = 1; i < count - 1; i++) f.push([0, i, i + 1], [2 * count, 2 * count + i, 2 * count + i + 1])
  return outward(p, f)
}
class Assembly {
  constructor() {
    this.parts = new Map()
  }
  add(geom, color, x = 0, y = 0, z = 0, mat = armor) {
    const g = geom.index ? geom.toNonIndexed() : geom
    g.translate(x, y, z)
    const uv = [],
      p = g.attributes.position,
      n = g.attributes.normal
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)),
        ay = Math.abs(n.getY(i)),
        az = Math.abs(n.getZ(i))
      uv.push(
        (ax > ay && ax > az ? p.getZ(i) : p.getX(i)) * 0.52,
        (ay > ax && ay > az ? p.getZ(i) : p.getY(i)) * 0.52,
      )
    }
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
    const c = new T.Color(color),
      arr = new Float32Array(g.attributes.position.count * 3)
    for (let i = 0; i < arr.length; i += 3) c.toArray(arr, i)
    g.setAttribute('color', new T.BufferAttribute(arr, 3))
    if (!this.parts.has(mat)) this.parts.set(mat, [])
    this.parts.get(mat).push(g)
  }
  box(x, y, z, w, h, l, color, mat) {
    this.add(new T.BoxGeometry(w, h, l), color, x, y, z, mat)
  }
  tube(x, y, z, front, back, len, col, mat, sides = 12) {
    const g = new T.CylinderGeometry(back, front, len, sides).rotateX(Math.PI / 2)
    this.add(g, col, x, y, z, mat)
  }
  finish() {
    const group = new T.Group()
    for (const [mat, items] of this.parts) group.add(new T.Mesh(mergeGeometries(items), mat))
    return group
  }
}
function cruiserShell() {
  const a = new Assembly()
  a.add(
    loft([
      [-5, 0.1, 0.12, 0.0],
      [-3.3, 0.59, 0.34, 0.02],
      [-0.65, 1.12, 0.6, 0.06],
      [1.65, 1.08, 0.64, 0.06],
      [3.22, 0.74, 0.42, 0.0],
    ]),
    metal,
  )
  a.add(
    loft([
      [-5.15, 0.06, 0.07, 0.1],
      [-3.45, 0.53, 0.23, 0.23],
      [-1.48, 0.8, 0.32, 0.36],
      [0.52, 0.82, 0.33, 0.46],
      [2.85, 0.62, 0.22, 0.41],
    ]),
    hull,
  )
  a.add(
    loft([
      [-3.24, 0.12, 0.06, 0.47],
      [-2.49, 0.51, 0.26, 0.51],
      [-1.21, 0.68, 0.38, 0.59],
      [-0.27, 0.52, 0.34, 0.66],
      [-0.03, 0.42, 0.1, 0.69],
    ]),
    0x264b5a,
    0,
    0,
    0,
    glass,
  )
  a.add(
    loft([
      [-1.35, 0.69, 0.38, 0.6],
      [-1.25, 0.69, 0.39, 0.6],
    ]),
    grey,
  )
  a.add(
    loft([
      [0.15, 0.45, 0.14, 0.78],
      [1.25, 0.5, 0.26, 0.78],
      [2.45, 0.34, 0.14, 0.65],
    ]),
    orange,
  )
  for (let j = 0; j < 6; j++) a.box(0, 0.98, 1.0 + j * 0.14, 0.55, 0.07, 0.065, dark)
  for (const s of [-1, 1]) {
    const panel = (pts, y, h, c) =>
      a.add(
        plate(
          pts.map(([x, z]) => [s * x, z]),
          y,
          h,
        ),
        c,
      )
    panel(
      [
        [0.55, -2.25],
        [1.18, -1.7],
        [4.73, 1.0],
        [4.92, 2.31],
        [3.94, 2.74],
        [1.0, 1.99],
      ],
      -0.25,
      0.38,
      metal,
    )
    panel(
      [
        [0.78, -2.0],
        [1.37, -1.45],
        [4.64, 1.13],
        [4.67, 1.96],
        [3.91, 2.3],
        [1.01, 1.72],
      ],
      0.07,
      0.11,
      hull,
    )
    panel(
      [
        [2.51, -0.58],
        [3.11, -0.05],
        [3.43, 2.11],
        [2.82, 1.96],
      ],
      0.182,
      0.018,
      orange,
    )
    panel(
      [
        [3.29, 0.04],
        [3.49, 0.21],
        [3.84, 2.2],
        [3.63, 2.17],
      ],
      0.182,
      0.018,
      dark,
    )
    panel(
      [
        [4.19, 0.75],
        [4.66, 1.11],
        [4.72, 2.01],
        [4.39, 2.14],
      ],
      0.184,
      0.025,
      grey,
    )
    // Separate flaps, tip lamps, bolt heads, and overwing service panels.
    panel(
      [
        [2.1, 1.89],
        [3.95, 2.32],
        [3.72, 2.82],
        [2.29, 2.4],
      ],
      -0.08,
      0.14,
      grey,
    )
    panel(
      [
        [4.62, 1.19],
        [4.77, 1.29],
        [4.8, 1.74],
        [4.65, 1.72],
      ],
      0.19,
      0.025,
      ice,
    )
    panel(
      [
        [1.94, 0.28],
        [2.22, 0.46],
        [2.38, 1.45],
        [2.1, 1.38],
      ],
      0.184,
      0.022,
      metal,
    )
    for (let j = 0; j < 5; j++) a.box(s * (2.11 + j * 0.022), 0.22, 0.61 + j * 0.14, 0.22, 0.028, 0.041, grey)
    for (let j = 0; j < 4; j++)
      a.box(s * (2.55 + j * 0.33), 0.21, 1.63 + j * 0.07, 0.065, 0.026, 0.075, metal)
    a.add(
      loft([
        [-2.2, 0.17, 0.21, 0.1],
        [-1.43, 0.47, 0.45, 0.14],
        [1.8, 0.58, 0.55, 0.18],
        [3.32, 0.47, 0.46, 0.18],
      ]),
      dark,
      s * 1.62,
    )
    a.add(
      loft([
        [-1.96, 0.18, 0.12, 0.34],
        [-1.12, 0.43, 0.27, 0.38],
        [1.37, 0.49, 0.33, 0.43],
        [2.12, 0.42, 0.17, 0.48],
      ]),
      hull,
      s * 1.62,
    )
    a.add(
      loft([
        [-1.19, 0.43, 0.28, 0.39],
        [-0.72, 0.45, 0.29, 0.4],
      ]),
      orange,
      s * 1.62,
    )
    a.add(
      loft([
        [1.54, 0.43, 0.23, 0.48],
        [2.54, 0.44, 0.23, 0.42],
        [3.1, 0.38, 0.13, 0.39],
      ]),
      metal,
      s * 1.62,
    )
    // Canted twin vertical stabilizers.
    const fin = plate(
      [
        [0, -0.49],
        [0.93, 0.66],
        [1.03, 1.7],
        [0, 1.29],
      ],
      0,
      0.13,
    )
    fin.rotateZ(1.17)
    fin.scale(s, 1, 1)
    a.add(fin, grey, s * 1.65, 0.59, 1.08)
    for (let j = 0; j < 6; j++) a.box(s * 1.62, 0.68, 1.6 + j * 0.17, 0.61, 0.1, 0.078, dark)
    a.tube(s * 1.62, 0.12, 2.89, 0.54, 0.56, 0.8, dark)
    for (let j = 0; j < 4; j++) a.tube(s * 1.62, 0.12, 2.68 + j * 0.2, 0.55, 0.54, 0.085, grey)
    a.tube(s * 1.62, 0.12, 3.38, 0.53, 0.49, 0.25, metal)
    a.tube(s * 1.62, 0.12, 3.52, 0.41, 0.41, 0.05, 0x28bccf, lamp)
    a.tube(s * 1.62, 0.12, 3.56, 0.26, 0.29, 0.06, 0xe1ffff, lamp)
    // Twin stepped rail cannons on their own pylons.
    a.add(
      loft([
        [-2.87, 0.15, 0.13, 0.16],
        [-2.4, 0.26, 0.23, 0.14],
        [0.85, 0.27, 0.22, 0.11],
        [1.46, 0.14, 0.1, 0.1],
      ]),
      grey,
      s * 3.17,
    )
    a.tube(s * 3.17, 0.16, -3.08, 0.12, 0.19, 1.1, dark)
    a.tube(s * 3.17, 0.16, -3.68, 0.18, 0.18, 0.4, metal)
    a.tube(s * 3.17, 0.16, -3.89, 0.105, 0.105, 0.03, ice, lamp)
    for (let j = 0; j < 3; j++) a.box(s * 3.17, 0.36, -1.57 + j * 0.22, 0.4, 0.055, 0.09, orange)
  }
  return a.finish()
}
function marking() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#283039'
  ctx.font = 'italic bold 91px Arial'
  ctx.fillText('09', 15, 88)
  ctx.fillRect(19, 99, 104, 5)
  ctx.font = 'bold 19px monospace'
  ctx.fillText('VC / STRIKE', 136, 107)
  const tex = new T.CanvasTexture(c)
  tex.colorSpace = T.SRGBColorSpace
  const mesh = new T.Mesh(
    new T.PlaneGeometry(1.06, 0.55),
    new T.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(-3.69, 0.213, 1.37)
  return mesh
}
export function glow() {
  return memo('glow', () => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d'),
      g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    for (const [t, a] of [
      [0, 1],
      [0.12, 0.88],
      [0.35, 0.34],
      [0.7, 0.075],
      [1, 0],
    ])
      g.addColorStop(t, 'rgba(255,255,255,' + a + ')')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
    return new T.CanvasTexture(c)
  })
}
export function halo(color, size) {
  const sprite = new T.Sprite(
    memo(
      'halo' + color,
      () => new T.SpriteMaterial({ map: glow(), color, blending: T.AdditiveBlending, depthWrite: false }),
    ),
  )
  sprite.scale.setScalar(size)
  return sprite
}
export function makeCruiser() {
  const body = memo('cruiser', cruiserShell).clone()
  body.add(memo('mark', marking).clone())
  const jets = []
  for (const s of [-1, 1]) {
    const g = new T.Group()
    g.position.set(s * 1.62, 0.12, 3.55)
    for (const [r, len, col, alpha] of [
      [0.43, 3.05, 0x239dff, 0.68],
      [0.28, 2.04, 0x6de9ff, 0.93],
      [0.17, 1.04, 0xf5ffff, 0.98],
    ]) {
      const profile = [
        [0.76, 0],
        [1, 0.085],
        [0.7, 0.28],
        [0.71, 0.38],
        [0.35, 0.62],
        [0.32, 0.7],
        [0.012, 1],
      ]
      const geom = new T.LatheGeometry(
        profile.map(([radius, z]) => new T.Vector2(radius * r, z * len)),
        18,
      ).rotateX(Math.PI / 2)
      const material = new T.ShaderMaterial({
        uniforms: { tint: { value: new T.Color(col) }, alpha: { value: alpha } },
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        vertexShader:
          'varying vec2 coord; void main(){coord=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:
          'uniform vec3 tint;uniform float alpha;varying vec2 coord;void main(){float bands=.86+.14*cos(coord.y*34.);gl_FragColor=vec4(tint,alpha*pow(1.-coord.y,.76)*bands);}',
      })
      g.add(new T.Mesh(geom, material))
    }
    const h = halo(0x31cfff, 2.05)
    h.position.z = 0.24
    g.add(h)
    body.add(g)
    jets.push(g)
  }
  const scorch = new T.Mesh(
    plate(
      [
        [-0.9, 0.24],
        [-0.2, 0.38],
        [-0.53, 1.62],
        [-0.98, 1.36],
      ],
      0.7,
      0.02,
    ),
    new T.MeshBasicMaterial({ color: 0x492f28 }),
  )
  body.add(scorch)
  scorch.visible = false
  return { body, jets, scorch }
}
function hash(x, y, z, seed) {
  const n = Math.sin(x * 17.1 + y * 57.7 + z * 114.8 + seed * 15.77) * 43758.545
  return n - Math.floor(n)
}
function rockGeo(seed, hot) {
  const geo = new T.IcosahedronGeometry(1, 3),
    p = geo.attributes.position,
    color = []
  const pits = Array.from({ length: 7 }, (_, i) =>
    new T.Vector3(
      hash(i, 0, 0, seed) - 0.5,
      hash(0, i, 0, seed + 2) - 0.5,
      hash(0, 0, i, seed + 4) - 0.5,
    ).normalize(),
  )
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i)
    let r =
      0.98 +
      0.12 * Math.sin(x * 4.7 + seed) * Math.sin(z * 5.2 + y * 2) +
      0.15 * hash(Math.round(x * 900), Math.round(y * 900), Math.round(z * 900), seed)
    for (const v of pits) {
      const d = 1 - v.dot(new T.Vector3(x, y, z))
      r -= 0.25 * Math.exp(-d * 28)
      r += 0.07 * Math.exp(-((d - 0.055) ** 2) * 1700)
    }
    p.setXYZ(i, x * r * (1.08 + 0.19 * Math.sin(seed)), y * r * 0.81, z * r * (0.93 + 0.22 * Math.cos(seed)))
  }
  for (let i = 0; i < p.count; i += 3) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      vein = Math.sin(5 * x + seed + Math.sin(z * 5.2)) + Math.cos(4 * y - z)
    const c = new T.Color(hot && Math.abs(vein) < 0.28 ? 0xff772a : seed % 3 === 0 ? 0x897363 : 0x777879)
    c.multiplyScalar(0.71 + 0.39 * hash(x, y, z, seed) + 0.08 * Math.sin(y * 10))
    for (let j = 0; j < 3; j++) color.push(c.r, c.g, c.b)
  }
  geo.setAttribute('color', new T.Float32BufferAttribute(color, 3))
  geo.computeVertexNormals()
  return geo
}
export function rock(seed, hot = false) {
  const idx = Math.abs(seed | 0) % 9
  return new T.Mesh(
    memo('rock' + idx + hot, () => rockGeo(idx + 1, hot)),
    stone,
  )
}
export function drone(elite = false) {
  const g = memo('drone' + elite, () => {
    const a = new Assembly(),
      red = elite ? 0xff973a : 0xff4049
    a.add(
      loft([
        [-1.35, 0.17, 0.17, 0],
        [-0.38, 0.7, 0.55, 0],
        [0.82, 0.69, 0.48, 0],
        [1.11, 0.42, 0.32, 0.04],
      ]),
      dark,
    )
    a.add(
      loft([
        [-0.75, 0.23, 0.05, 0.4],
        [-0.14, 0.55, 0.15, 0.46],
        [0.79, 0.45, 0.12, 0.36],
      ]),
      0xb25249,
    )
    a.tube(0, 0.02, 1.13, 0.43, 0.32, 0.22, grey)
    a.tube(0, 0.02, 1.28, 0.27, 0.27, 0.08, red, lamp)
    for (const s of [-1, 1]) {
      const w = (pts, y, h, c) =>
        a.add(
          plate(
            pts.map(([x, z]) => [x * s, z]),
            y,
            h,
          ),
          c,
        )
      w(
        [
          [0.3, -0.68],
          [1.68, -1.29],
          [2.28, -0.83],
          [1.63, 1.34],
          [1.25, 1.79],
          [1.38, 0.02],
          [0.48, 0.4],
        ],
        -0.17,
        0.35,
        metal,
      )
      w(
        [
          [0.74, -0.71],
          [1.68, -1.18],
          [2.12, -0.8],
          [1.79, 0.3],
          [1.4, -0.14],
        ],
        0.13,
        0.16,
        0xb45949,
      )
      w(
        [
          [1.56, 0.11],
          [1.9, -0.18],
          [1.59, 1.24],
          [1.29, 1.57],
        ],
        0.12,
        0.06,
        red,
      )
      // Folded outer shields give the patrol craft a deep frontal silhouette.
      const shield = plate(
        [
          [1.24, -0.63],
          [2.09, -0.88],
          [2.18, 0.02],
          [1.62, 1.19],
          [1.34, 1.28],
        ],
        0,
        0.19,
      )
      shield.translate(-1.25, 0, 0).rotateZ(0.84)
      if (s < 0) shield.rotateY(Math.PI)
      a.add(shield, elite ? 0xd87939 : 0xa13e3a, s * 1.25, 0.13, 0)
      a.add(
        loft([
          [-0.5, 0.14, 0.19, -0.05],
          [0.18, 0.28, 0.38, -0.09],
          [0.9, 0.17, 0.29, -0.1],
        ]),
        grey,
        s * 1.02,
        -0.21,
        0,
      )
      a.tube(s * 1.56, 0, 0.56, 0.14, 0.16, 1.07, dark)
      a.tube(s * 1.56, 0, 1.11, 0.1, 0.1, 0.05, red, lamp)
      if (elite)
        a.add(
          plate(
            [
              [0, -0.9],
              [0.24, -0.52],
              [0.16, 1.2],
              [0, 1.4],
            ],
            0.0,
            0.2,
          ),
          amber,
          s * 1.96,
        )
    }
    return a.finish()
  }).clone()
  const light = halo(elite ? 0xff9727 : 0xff273c, 2.15)
  light.position.z = 1.3
  g.add(light)
  return g
}
export function cell(type) {
  const colors = { fuel: 0x58f4d0, repair: 0x86f177, weapon: 0xffbd4d }
  return memo(type, () => {
    const a = new Assembly(),
      c = colors[type]
    a.add(new T.OctahedronGeometry(0.74), c, 0, 0, 0, lamp)
    for (const y of [-0.54, 0.54]) a.add(new T.CylinderGeometry(0.57, 0.64, 0.25, 6), hull, 0, y, 0)
    for (const x of [-0.55, 0.55]) a.box(x, 0, 0, 0.14, 0.96, 0.25, metal)
    const group = a.finish()
    group.add(halo(c, 2.7))
    const ring = new T.Mesh(new T.TorusGeometry(1.02, 0.035, 4, 6), new T.MeshBasicMaterial({ color: c }))
    group.add(ring)
    return group
  }).clone()
}
export function extractionGate() {
  return memo('gate', () => {
    const a = new Assembly()
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6,
        x = Math.cos(angle) * 8,
        y = Math.sin(angle) * 8
      a.add(new T.BoxGeometry(1.12, 3.74, 1.7).rotateZ(angle), metal, x, y, -0.22)
      a.add(new T.BoxGeometry(0.27, 3.32, 0.22).rotateZ(angle), 0x58f4d0, x * 0.946, y * 0.946, 0.75, lamp)
      a.add(new T.BoxGeometry(1.34, 0.34, 1.88).rotateZ(angle), orange, x, y, 0.12)
    }
    return a.finish()
  }).clone()
}
