import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Timer } from 'three/addons/misc/Timer.js'
import { Sky } from 'three/addons/objects/Sky.js'
import GUI from 'lil-gui'

/**
 * =====================================================================
 *  СУЧАСНИЙ БУДИНОК ІЗ САДОМ (Three.js)
 *  1 одиниця = 1 метр.  Підлога на рівні y = 0.  Фасад дивиться в бік +z.
 * =====================================================================
 */

/**
 * Базові налаштування
 */
const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

// Усі параметри, якими керують повзунки (значення за замовчуванням = "Ніч")
const params = {
    // Небо
    elevation: -2.2,
    azimuth: 162,
    turbidity: 10,
    rayleigh: 3,
    mieCoefficient: 0.1,
    mieDirectionalG: 0.95,
    exposure: 1,
    // Туман
    fogColor: '#04343f',
    fogDensity: 0.04,
    // Світло
    ambientColor: '#86cdff',
    ambientIntensity: 0.275,
    moonColor: '#86cdff',
    moonIntensity: 1,
    lightElevation: 25,
    doorColor: '#ff7d46',
    doorIntensity: 5,
    doorFlicker: true,
    flickerAmount: 0.25,
    lampColor: '#ffc77a',
    lampIntensity: 3,
    windowGlow: 1.2,
    fireflyIntensity: 3,
    swarmOpacity: 0.9,
    // Матеріали
    floorRepeat: 16,
    floorDisplacementScale: 0.3,
    floorDisplacementBias: -0.19,
    floorColor: '#ffffff',
    wallColor: '#fffaf0',
    wallRepeat: 2,
    roofColor: '#4a4a4f',
    bushColor: '#e8ffe0',
    // Анімація
    fireflySpeed: 1,
    windStrength: 1,
    waterSpeed: 0.25,
    // Звук
    soundVolume: 0.8
}

/**
 * Рендерер і камера (створюємо рано, бо ними користуються інші розділи)
 */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const camera = new THREE.PerspectiveCamera(55, sizes.width / sizes.height, 0.1, 300)
camera.position.set(9.5, 3.8, 15)
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.target.set(0.8, 1.2, 0)
controls.enableDamping = true
controls.minDistance = 3
controls.maxDistance = 30
controls.maxPolarAngle = Math.PI * 0.495 // не даємо камері піти під землю

const maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8)

/**
 * Допоміжні функції
 */
// Генератор "випадкових" чисел із постійним результатом (сцена щоразу однакова)
function createRandom(seed)
{
    return function ()
    {
        seed |= 0
        seed = seed + 0x6D2B79F5 | 0
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
        return ((t ^ t >>> 14) >>> 0) / 4294967296
    }
}
const random = createRandom(2024)
const randomBetween = (min, max) => min + random() * (max - min)

// Створює багато копій однієї геометрії одним викликом відмальовування (швидко!)
function createInstanced(geometry, material, items)
{
    const mesh = new THREE.InstancedMesh(geometry, material, items.length)
    const dummy = new THREE.Object3D()

    items.forEach((item, i) =>
    {
        dummy.position.set(item.x, item.y, item.z)
        dummy.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0)
        dummy.scale.set(item.sx ?? 1, item.sy ?? 1, item.sz ?? 1)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
    })

    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    return mesh
}

/**
 * Текстури
 */
const textureLoader = new THREE.TextureLoader()

function loadTexture(path, repeatX = 1, repeatY = 1, isColor = false)
{
    const texture = textureLoader.load(path)
    texture.repeat.set(repeatX, repeatY)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.anisotropy = maxAnisotropy
    if(isColor)
    {
        texture.colorSpace = THREE.SRGBColorSpace
    }
    return texture
}

// Набір PBR-текстур Poly Haven: diff (колір) + arm (AO/Roughness/Metalness) + nor_gl (нормалі)
function loadPBR(prefix, repeatX = 1, repeatY = 1, withDisplacement = false)
{
    const set = {
        color: loadTexture(`${prefix}_diff_1k.webp`, repeatX, repeatY, true),
        arm: loadTexture(`${prefix}_arm_1k.webp`, repeatX, repeatY),
        normal: loadTexture(`${prefix}_nor_gl_1k.webp`, repeatX, repeatY)
    }
    if(withDisplacement)
    {
        set.displacement = loadTexture(`${prefix}_disp_1k.webp`, repeatX, repeatY)
    }
    return set
}

// Збираємо матеріал із набору текстур
function pbrMaterial(set, extra = {})
{
    return new THREE.MeshStandardMaterial({
        map: set.color,
        aoMap: set.arm,
        roughnessMap: set.arm,
        metalnessMap: set.arm,
        normalMap: set.normal,
        ...extra
    })
}

// Земля (мох + каміння), цегла, дах, світла штукатурка, листя
const floorAlphaTexture = textureLoader.load('./floor/alpha.webp')
const floorTextures = loadPBR('./floor/coast_sand_rocks_02_1k/coast_sand_rocks_02', params.floorRepeat, params.floorRepeat, true)
const brickTextures = loadPBR('./wall/castle_brick_broken_06_1k/castle_brick_broken_06', 0.5, 0.5)
const roofTextures = loadPBR('./roof/roof_slates_02_1k/roof_slates_02', 4, 3)
const plasterTextures = loadPBR('./house/plaster_light', params.wallRepeat, params.wallRepeat * 0.6)
const leavesTextures = loadPBR('./bush/leaves_green', 2, 1)
const rockTextures = loadPBR('./floor/coast_sand_rocks_02_1k/coast_sand_rocks_02', 1.5, 1.5)
const treeLeavesTextures = loadPBR('./bush/leaves_green', 3, 3)

// Двері (окремі карти, як на уроці)
const doorColorTexture = loadTexture('./door/color.webp', 1, 1, true)
const doorAlphaTexture = loadTexture('./door/alpha.webp')
const doorAmbientOcclusionTexture = loadTexture('./door/ambientOcclusion.webp')
const doorHeightTexture = loadTexture('./door/height.webp')
const doorNormalTexture = loadTexture('./door/normal.webp')
const doorMetalnessTexture = loadTexture('./door/metalness.webp')
const doorRoughnessTexture = loadTexture('./door/roughness.webp')

/**
 * Спільні матеріали
 */
const blackMaterial = new THREE.MeshStandardMaterial({ color: '#17181a', roughness: 0.5, metalness: 0.4 })

const wallMaterial = pbrMaterial(plasterTextures, { color: params.wallColor })
const concreteMaterial = pbrMaterial(plasterTextures, { color: '#b9b9b6' })
const roofMaterial = pbrMaterial(roofTextures, { color: params.roofColor })
const pavingMaterial = pbrMaterial(brickTextures, { color: '#bfb7ae' })
const bushMaterial = pbrMaterial(leavesTextures, { color: params.bushColor })
const treeLeavesMaterial = pbrMaterial(treeLeavesTextures, { color: params.bushColor })
const rockMaterial = pbrMaterial(rockTextures, { color: '#c4c9bd' })

const glassMaterial = new THREE.MeshStandardMaterial({
    color: '#8fb4d6',
    roughness: 0.05,
    metalness: 0.6,
    emissive: '#ffb866',
    emissiveIntensity: params.windowGlow
})

// Світний матеріал для ліхтарів (його яскравість керується повзунком)
const lampGlowMaterial = new THREE.MeshStandardMaterial({
    color: '#fff3e0',
    emissive: params.lampColor,
    emissiveIntensity: params.lampIntensity * 0.6
})

/**
 * Підлога (ділянка)
 */
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40, 160, 160),
    new THREE.MeshStandardMaterial({
        alphaMap: floorAlphaTexture,
        transparent: true,
        map: floorTextures.color,
        aoMap: floorTextures.arm,
        roughnessMap: floorTextures.arm,
        metalnessMap: floorTextures.arm,
        normalMap: floorTextures.normal,
        displacementMap: floorTextures.displacement,
        displacementScale: params.floorDisplacementScale,
        displacementBias: params.floorDisplacementBias,
        color: params.floorColor
    })
)
floor.rotation.x = - Math.PI * 0.5
scene.add(floor)

/**
 * Будинок
 */
const house = new THREE.Group()
scene.add(house)

// Головний об'єм
const walls = new THREE.Mesh(new THREE.BoxGeometry(5, 2.8, 4), wallMaterial)
walls.position.y = 1.4

// Прибудований гараж (трохи відсунутий назад — будинок не "кубик")
const garage = new THREE.Mesh(new THREE.BoxGeometry(3, 2.3, 4), wallMaterial)
garage.position.set(4, 1.15, -0.5)

// Плоскі чорні дахи зі свисом
const roof = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.22, 4.7), roofMaterial)
roof.position.y = 2.8 + 0.11

const garageRoof = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.2, 4.7), roofMaterial)
garageRoof.position.set(4.175, 2.3 + 0.1, -0.5)

// Тераса перед входом
const terrace = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 1.82), concreteMaterial)
terrace.position.set(-0.7, 0.06, 2.89)

// Під'їзд до гаража
const driveway = new THREE.Mesh(new THREE.BoxGeometry(3, 0.14, 3.4), concreteMaterial)
driveway.position.set(4, 0.05, 3.2)

// Козирок над входом на двох тонких стійках
const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.12, 1.75), blackMaterial)
canopy.position.set(-0.9, 2.5, 2.875)

const canopyPostGeometry = new THREE.BoxGeometry(0.08, 2.32, 0.08)
const canopyPost1 = new THREE.Mesh(canopyPostGeometry, blackMaterial)
canopyPost1.position.set(-0.9 - 1.3, 0.12 + 1.16, 3.62)
const canopyPost2 = new THREE.Mesh(canopyPostGeometry, blackMaterial)
canopyPost2.position.set(-0.9 + 1.3, 0.12 + 1.16, 3.62)

house.add(walls, garage, roof, garageRoof, terrace, driveway, canopy, canopyPost1, canopyPost2)

// Двері: чорна рамка + площина з текстурою (видима лише частина за alpha-картою)
const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.2, 0.08), blackMaterial)
doorFrame.position.set(-0.9, 0.12 + 1.1, 2.03)

const door = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2, 100, 100),
    new THREE.MeshStandardMaterial({
        map: doorColorTexture,
        color: '#a58f80',
        transparent: true,
        alphaMap: doorAlphaTexture,
        aoMap: doorAmbientOcclusionTexture,
        displacementMap: doorHeightTexture,
        displacementScale: 0.15,
        displacementBias: -0.04,
        normalMap: doorNormalTexture,
        metalnessMap: doorMetalnessTexture,
        roughnessMap: doorRoughnessTexture
    })
)
door.position.set(-0.9, 1.11, 2.08)
house.add(doorFrame, door)

// Гаражні ворота: графітова панель + тонкі горизонтальні шви
const garageDoor = new THREE.Group()
garageDoor.position.set(4, 0, 1.5 + 0.03)
const garagePanel = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 2, 0.06),
    new THREE.MeshStandardMaterial({ color: '#2d3034', roughness: 0.55, metalness: 0.3 })
)
garagePanel.position.y = 1
garageDoor.add(garagePanel)
for(let i = 1; i <= 4; i++)
{
    const line = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.025, 0.07), blackMaterial)
    line.position.y = i * 0.4
    garageDoor.add(line)
}
house.add(garageDoor)

// Вікна
function createWindow(width, height)
{
    const group = new THREE.Group()

    const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.14, height + 0.14, 0.08), blackMaterial)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(width, height), glassMaterial)
    glass.position.z = 0.041

    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.05, height, 0.02), blackMaterial)
    mullion.position.z = 0.05

    const sill = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.05, 0.2), concreteMaterial)
    sill.position.set(0, - height / 2 - 0.1, 0.07)

    group.add(frame, glass, mullion, sill)
    return group
}

function placeWindow(width, height, x, y, z, rotationY)
{
    const windowGroup = createWindow(width, height)
    windowGroup.position.set(x, y, z)
    windowGroup.rotation.y = rotationY
    house.add(windowGroup)
}

// Фасад
placeWindow(1.9, 1.5, 1.15, 1.55, 2, 0)
placeWindow(0.5, 1.8, -2.05, 1.5, 2, 0)
// Ліва стіна
placeWindow(1.2, 1.4, -2.5, 1.5, 0.9, - Math.PI / 2)
placeWindow(1.2, 1.4, -2.5, 1.5, - 0.9, - Math.PI / 2)
// Задня стіна
placeWindow(1.6, 1.3, 0, 1.5, - 2, Math.PI)
// Бічна стіна гаража
placeWindow(1, 0.8, 5.5, 1.5, - 0.5, Math.PI / 2)

// Лампа над дверима (блимає)
const doorBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 16, 16),
    new THREE.MeshStandardMaterial({ color: '#fff3e0', emissive: params.doorColor, emissiveIntensity: 2 })
)
doorBulb.position.set(-0.9, 2.4, 2.75)

const doorLight = new THREE.PointLight(params.doorColor, params.doorIntensity)
doorLight.position.set(-0.9, 2.3, 2.9)
house.add(doorBulb, doorLight)

/**
 * Схема ділянки: де НЕ можна ставити кущі, дерева й каміння
 */
const exclusionRects = [
    { x1: -3.4, x2: 6.6, z1: -3.6, z2: 4.3 },  // будинок + тераса
    { x1: 1.6, x2: 6.4, z1: 4.3, z2: 5.4 },    // під'їзд до гаража
    { x1: -2.9, x2: 1.1, z1: 4.0, z2: 9.6 }    // доріжка
]
const pondCenter = new THREE.Vector3(-6.2, 0, 6.4)
const pondRadius = 1.7

/**
 * Струмок і ставок
 */
const streamCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-8.2, 0, -6.3),
    new THREE.Vector3(-6.6, 0, -4.2),
    new THREE.Vector3(-7.4, 0, -1.8),
    new THREE.Vector3(-5.8, 0, 0.4),
    new THREE.Vector3(-5.4, 0, 2.6),
    new THREE.Vector3(-6.4, 0, 4.6),
    new THREE.Vector3(-6.3, 0, 5.5)
])
const streamPoints = streamCurve.getSpacedPoints(80)

function isFree(x, z, margin = 0)
{
    for(const r of exclusionRects)
    {
        if(x > r.x1 - margin && x < r.x2 + margin && z > r.z1 - margin && z < r.z2 + margin)
        {
            return false
        }
    }
    for(const p of streamPoints)
    {
        if(Math.hypot(p.x - x, p.z - z) < 1.5 + margin)
        {
            return false
        }
    }
    if(Math.hypot(x - pondCenter.x, z - pondCenter.z) < pondRadius + 0.8 + margin)
    {
        return false
    }
    return true
}

// Текстура брижів на воді малюється кодом (canvas) — окремий файл не потрібен
function createWaterTexture()
{
    const size = 256
    const waterCanvas = document.createElement('canvas')
    waterCanvas.width = size
    waterCanvas.height = size
    const ctx = waterCanvas.getContext('2d')
    const rnd = createRandom(7)

    ctx.fillStyle = '#2f7da8'
    ctx.fillRect(0, 0, size, size)

    for(let i = 0; i < 140; i++)
    {
        const x = rnd() * size
        const y = rnd() * size
        const r = 6 + rnd() * 18

        // Малюємо й зі зсувом, щоб текстура безшовно повторювалась
        for(const dx of [- size, 0, size])
        {
            for(const dy of [- size, 0, size])
            {
                const gradient = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r)
                gradient.addColorStop(0, 'rgba(255, 255, 255, 0.35)')
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
                ctx.fillStyle = gradient
                ctx.beginPath()
                ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2)
                ctx.fill()
            }
        }
    }

    const texture = new THREE.CanvasTexture(waterCanvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

const waterTexture = createWaterTexture()
const waterMaterial = new THREE.MeshStandardMaterial({
    map: waterTexture,
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.88,
    emissive: '#0d4a6e',
    emissiveIntensity: 0.35,
    side: THREE.DoubleSide
})

// Стрічка води вздовж кривої
function createRibbon(curve, width, segments, y)
{
    const positions = []
    const uvs = []
    const indices = []
    const up = new THREE.Vector3(0, 1, 0)
    const length = curve.getLength()

    for(let i = 0; i <= segments; i++)
    {
        const t = i / segments
        const point = curve.getPointAt(t)
        const tangent = curve.getTangentAt(t)
        const side = new THREE.Vector3().crossVectors(tangent, up).normalize()
        const half = width * (0.85 + 0.3 * Math.sin(t * 9)) / 2

        positions.push(
            point.x - side.x * half, y, point.z - side.z * half,
            point.x + side.x * half, y, point.z + side.z * half
        )
        uvs.push(0, t * length / 2, 1, t * length / 2)
    }

    for(let i = 0; i < segments; i++)
    {
        const a = i * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
}

const stream = new THREE.Mesh(createRibbon(streamCurve, 0.95, 80, 0.125), waterMaterial)
stream.receiveShadow = true

const pondGeometry = new THREE.CircleGeometry(pondRadius, 40)
const pondUv = pondGeometry.attributes.uv
for(let i = 0; i < pondUv.count; i++)
{
    pondUv.setXY(i, pondUv.getX(i) * 3, pondUv.getY(i) * 3)
}
const pond = new THREE.Mesh(pondGeometry, waterMaterial)
pond.rotation.x = - Math.PI * 0.5
pond.position.set(pondCenter.x, 0.124, pondCenter.z)
pond.receiveShadow = true

scene.add(stream, pond)

/**
 * Каміння (одна геометрія, багато копій)
 */
const rockItems = []

function addRock(x, z, radius, flatten = 0.65)
{
    const sy = radius * (flatten + random() * 0.3)
    rockItems.push({
        x, z,
        y: sy * 0.45,
        rx: random() * Math.PI,
        ry: random() * Math.PI * 2,
        rz: random() * Math.PI,
        sx: radius, sy, sz: radius * (0.8 + random() * 0.4)
    })
}

// Берег струмка
const bankPoints = streamCurve.getSpacedPoints(26)
bankPoints.forEach((p, i) =>
{
    const t = i / 26
    const tangent = streamCurve.getTangentAt(t)
    const side = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize()
    for(const direction of [- 1, 1])
    {
        const offset = 0.58 + random() * 0.25
        addRock(p.x + side.x * offset * direction, p.z + side.z * offset * direction, randomBetween(0.16, 0.34))
    }
})

// Камінці всередині води
for(let i = 0; i < 10; i++)
{
    const p = streamCurve.getPointAt(randomBetween(0.1, 0.95))
    addRock(p.x + randomBetween(- 0.25, 0.25), p.z + randomBetween(- 0.25, 0.25), randomBetween(0.08, 0.16), 1)
}

// Витік струмка: купа каменів
for(let i = 0; i < 9; i++)
{
    const angle = random() * Math.PI * 2
    const dist = random() * 0.7
    addRock(- 8.5 + Math.cos(angle) * dist, - 6.6 + Math.sin(angle) * dist, randomBetween(0.25, 0.5), 0.9)
}

// Кільце каменів навколо ставка (з проходом для струмка)
const inletAngle = Math.atan2(5.5 - pondCenter.z, - 6.3 - pondCenter.x)
for(let i = 0; i < 22; i++)
{
    const angle = (i / 22) * Math.PI * 2

    // Найкоротша різниця між кутами (щоб залишити прохід там, де входить струмок)
    const diff = Math.abs(((angle - inletAngle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI)
    if(diff < 0.45) continue

    const r = pondRadius + 0.1 + random() * 0.25
    addRock(pondCenter.x + Math.cos(angle) * r, pondCenter.z + Math.sin(angle) * r, randomBetween(0.2, 0.42))
}

// Декоративні камені по саду
let rocksPlaced = 0
let tries = 0
while(rocksPlaced < 16 && tries < 600)
{
    tries++
    const x = randomBetween(- 9, 9)
    const z = randomBetween(- 8, 8)
    if(!isFree(x, z, 0.4)) continue
    addRock(x, z, randomBetween(0.15, 0.45))
    rocksPlaced++
}

const rocks = createInstanced(new THREE.DodecahedronGeometry(1, 0), rockMaterial, rockItems)
scene.add(rocks)

/**
 * Доріжка з плиток
 */
const path = new THREE.Group()
const pavingGeometry = new THREE.BoxGeometry(1.3, 0.14, 0.8)
for(let i = 0; i < 5; i++)
{
    const paver = new THREE.Mesh(pavingGeometry, pavingMaterial)
    paver.position.set(- 0.9 + randomBetween(- 0.04, 0.04), 0.05, 4.4 + i * 0.95)
    paver.rotation.y = randomBetween(- 0.03, 0.03)
    paver.castShadow = true
    paver.receiveShadow = true
    path.add(paver)
}
scene.add(path)

/**
 * Ліхтарі вздовж доріжки (3 пари)
 */
const lampLights = []
const lamps = new THREE.Group()
const lampBaseGeometry = new THREE.CylinderGeometry(0.06, 0.07, 0.5, 12)
const lampGlowGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.28, 12)
const lampCapGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12)

function createLamp(x, z)
{
    const lamp = new THREE.Group()
    lamp.position.set(x, 0, z)

    const base = new THREE.Mesh(lampBaseGeometry, blackMaterial)
    base.position.y = 0.25
    const glow = new THREE.Mesh(lampGlowGeometry, lampGlowMaterial)
    glow.position.y = 0.64
    const cap = new THREE.Mesh(lampCapGeometry, blackMaterial)
    cap.position.y = 0.8

    const light = new THREE.PointLight(params.lampColor, params.lampIntensity, 7)
    light.position.y = 0.92

    lamp.add(base, glow, cap, light)
    lampLights.push(light)
    lamps.add(lamp)
}

for(const z of [5, 6.6, 8.2])
{
    createLamp(- 0.9 - 1.15, z)
    createLamp(- 0.9 + 1.15, z)
}
scene.add(lamps)

/**
 * Паркан
 */
const fence = new THREE.Group()
const fenceMaterial = new THREE.MeshStandardMaterial({ color: '#f1eee6', roughness: 0.7 })
const fencePickets = []
const fencePosts = []

function addFence(x1, z1, x2, z2)
{
    const dx = x2 - x1
    const dz = z2 - z1
    const length = Math.hypot(dx, dz)
    const angle = Math.atan2(dz, dx)
    const ux = dx / length
    const uz = dz / length

    // Штахети
    const count = Math.round(length / 0.2)
    const step = length / count
    for(let i = 0; i < count; i++)
    {
        const d = step * (i + 0.5)
        fencePickets.push({ x: x1 + ux * d, y: 0.5, z: z1 + uz * d, ry: - angle })
    }

    // Стовпи
    const postCount = Math.ceil(length / 2.5)
    for(let i = 0; i <= postCount; i++)
    {
        const d = length * i / postCount
        fencePosts.push({ x: x1 + ux * d, y: 0.58, z: z1 + uz * d, ry: - angle })
    }

    // Дві горизонтальні планки з внутрішнього боку
    for(const y of [0.3, 0.8])
    {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.06, 0.035), fenceMaterial)
        const offset = - 0.03
        rail.position.set(
            (x1 + x2) / 2 + Math.sin(- angle) * offset,
            y,
            (z1 + z2) / 2 + Math.cos(- angle) * offset
        )
        rail.rotation.y = - angle
        rail.castShadow = true
        fence.add(rail)
    }
}

// Фасад (з проходом для хвіртки по центру доріжки), права, задня, ліва сторони
addFence(- 10, 9, - 1.8, 9)
addFence(0, 9, 10, 9)
addFence(10, 9, 10, - 9)
addFence(10, - 9, - 10, - 9)
addFence(- 10, - 9, - 10, 9)

fence.add(createInstanced(new THREE.BoxGeometry(0.07, 0.95, 0.025), fenceMaterial, fencePickets))
fence.add(createInstanced(new THREE.BoxGeometry(0.12, 1.15, 0.12), fenceMaterial, fencePosts))

// Стовпи хвіртки зі світними ковпачками
const gatePostGeometry = new THREE.BoxGeometry(0.18, 1.35, 0.18)
const gateCapGeometry = new THREE.BoxGeometry(0.14, 0.06, 0.14)
for(const x of [- 1.8, 0])
{
    const post = new THREE.Mesh(gatePostGeometry, blackMaterial)
    post.position.set(x, 0.675, 9)
    post.castShadow = true
    const cap = new THREE.Mesh(gateCapGeometry, lampGlowMaterial)
    cap.position.set(x, 1.38, 9)
    fence.add(post, cap)
}
scene.add(fence)

/**
 * Дерев'яна табличка біля хвіртки
 */
function createSignTexture(line1, line2)
{
    const signCanvas = document.createElement('canvas')
    signCanvas.width = 512
    signCanvas.height = 192
    const ctx = signCanvas.getContext('2d')
    const rnd = createRandom(99)

    ctx.fillStyle = '#9b7653'
    ctx.fillRect(0, 0, 512, 192)

    // Прожилки дерева
    for(let i = 0; i < 60; i++)
    {
        const y = rnd() * 192
        ctx.strokeStyle = `rgba(60, 35, 15, ${0.06 + rnd() * 0.1})`
        ctx.lineWidth = 1 + rnd() * 2
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.bezierCurveTo(150, y + rnd() * 10 - 5, 350, y + rnd() * 10 - 5, 512, y + rnd() * 8 - 4)
        ctx.stroke()
    }

    ctx.fillStyle = '#2b1a0c'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 56px Georgia, serif'
    ctx.fillText(line1, 256, 72)
    ctx.font = 'italic 40px Georgia, serif'
    ctx.fillText(line2, 256, 132)

    const texture = new THREE.CanvasTexture(signCanvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = maxAnisotropy
    return texture
}

const sign = new THREE.Group()
sign.position.set(1.3, 0, 9.18)

const signPost = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 1.5, 0.1),
    new THREE.MeshStandardMaterial({ color: '#6b4f36', roughness: 0.9 })
)
signPost.position.y = 0.75

const signBoard = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.5, 0.06),
    new THREE.MeshStandardMaterial({ color: '#8c6a49', roughness: 0.9 })
)
signBoard.position.set(0.5, 1.25, 0)

const signText = new THREE.Mesh(
    new THREE.PlaneGeometry(1.22, 0.46),
    new THREE.MeshStandardMaterial({ map: createSignTexture('Ласкаво просимо', 'до нашого саду'), roughness: 0.9 })
)
signText.position.set(0.5, 1.25, 0.032)

sign.add(signPost, signBoard, signText)
scene.add(sign)

/**
 * Рослинність: кущі, туї, дерева
 */
const swayers = [] // об'єкти, що злегка гойдаються на вітрі
const bushGeometry = new THREE.SphereGeometry(1, 20, 20)
const bushes = new THREE.Group()
scene.add(bushes)

function addBush(x, z, size)
{
    const bush = new THREE.Mesh(bushGeometry, bushMaterial)
    bush.scale.set(size, size * 0.8, size)
    bush.position.set(x, size * 0.4, z)
    bush.rotation.x = - 0.75 // ховаємо "дірочку" текстури на полюсі сфери
    bushes.add(bush)
    swayers.push({ object: bush, phase: random() * 6, amp: 0.025, speed: randomBetween(0.7, 1.2) })
}

// Біля будинку та вздовж доріжки
const bushSpots = [
    [- 3.2, 2.2, 0.65], [- 3.0, 0.8, 0.5], [- 3.3, - 1, 0.6], [- 3.1, - 2.4, 0.55],
    [1.95, 2.6, 0.5], [6.1, 4.6, 0.45], [6.2, 0.2, 0.55], [6.1, - 1.8, 0.5],
    [- 3.0, 5.6, 0.5], [1.5, 6.0, 0.45], [- 3.2, 7.4, 0.6], [1.7, 7.9, 0.5]
]
bushSpots.forEach(([x, z, s]) => addBush(x, z, s))

// Випадкові кущі по ділянці
let bushesPlaced = 0
tries = 0
while(bushesPlaced < 22 && tries < 800)
{
    tries++
    const x = randomBetween(- 9.2, 9.2)
    const z = randomBetween(- 8.2, 8.2)
    if(!isFree(x, z, 0.7)) continue
    addBush(x, z, randomBetween(0.35, 0.8))
    bushesPlaced++
}

// Туї (високі колони) біля будинку
const thujas = new THREE.Group()
scene.add(thujas)
for(const [x, z] of [[- 3.6, 3.4], [6.4, 2.9], [6.3, - 3.2], [- 3.4, - 3.4]])
{
    const thuja = new THREE.Mesh(bushGeometry, treeLeavesMaterial)
    thuja.scale.set(0.45, 1.3, 0.45)
    thuja.position.set(x, 1.3, z)
    thujas.add(thuja)
    swayers.push({ object: thuja, phase: random() * 6, amp: 0.012, speed: 0.8 })
}

// Дерева
const trees = new THREE.Group()
scene.add(trees)
const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.2, 1.8, 10)
const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#5b4636', roughness: 0.95 })
const crownGeometry = new THREE.IcosahedronGeometry(1, 2)

function addTree(x, z, scale)
{
    const tree = new THREE.Group()
    tree.position.set(x, 0, z)
    tree.scale.setScalar(scale)

    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial)
    trunk.position.y = 0.9

    const crown1 = new THREE.Mesh(crownGeometry, treeLeavesMaterial)
    crown1.scale.setScalar(1.25)
    crown1.position.set(0, 2.6, 0)

    const crown2 = new THREE.Mesh(crownGeometry, treeLeavesMaterial)
    crown2.scale.setScalar(0.9)
    crown2.position.set(0.8, 2.1, 0.3)

    const crown3 = new THREE.Mesh(crownGeometry, treeLeavesMaterial)
    crown3.scale.setScalar(0.8)
    crown3.position.set(- 0.7, 2.2, - 0.4)

    tree.add(trunk, crown1, crown2, crown3)
    trees.add(tree)
    swayers.push({ object: tree, phase: random() * 6, amp: 0.01, speed: 0.6 })
}

addTree(- 8.9, - 2.9, 1.1)
addTree(7.6, - 6.2, 1.2)
addTree(0.5, - 6.8, 1)
addTree(8.4, 5.8, 0.95)
addTree(- 3.6, - 6.6, 0.9)
addTree(8.6, - 1.5, 1.05)

/**
 * Світлячки: три світні кульки зі світлом + рій дрібних світних точок
 */
const fireflies = []
const fireflyData = [
    { color: '#b6ff6a', rx: 8, rz: 6.2, speed: 0.45, direction: 1, phase: 0 },
    { color: '#ffe38a', rx: 7.1, rz: 5.6, speed: 0.38, direction: - 1, phase: 2 },
    { color: '#8fffd0', rx: 9, rz: 7, speed: 0.23, direction: 1, phase: 4 }
]
const fireflyBulbGeometry = new THREE.SphereGeometry(0.06, 12, 12)

fireflyData.forEach((data) =>
{
    const light = new THREE.PointLight(data.color, params.fireflyIntensity, 6)
    const bulb = new THREE.Mesh(fireflyBulbGeometry, new THREE.MeshBasicMaterial({ color: data.color }))
    light.add(bulb)
    scene.add(light)
    fireflies.push({ ...data, light })
})

// Рій: м'які світні точки
function createGlowTexture()
{
    const glowCanvas = document.createElement('canvas')
    glowCanvas.width = 64
    glowCanvas.height = 64
    const ctx = glowCanvas.getContext('2d')
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.5)')
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(glowCanvas)
}

const swarmCount = 45
const swarmBase = []
const swarmPositions = new Float32Array(swarmCount * 3)
const insideBuilding = (x, z) =>
    (x > - 3.2 && x < 6.4 && z > - 3.4 && z < 4.2)

while(swarmBase.length < swarmCount)
{
    const x = randomBetween(- 9, 9)
    const z = randomBetween(- 8, 8.5)
    if(insideBuilding(x, z)) continue
    swarmBase.push({ x, y: randomBetween(0.5, 2.3), z, phase: random() * 10 })
}

const swarmGeometry = new THREE.BufferGeometry()
swarmGeometry.setAttribute('position', new THREE.BufferAttribute(swarmPositions, 3))
const swarmMaterial = new THREE.PointsMaterial({
    size: 0.25,
    map: createGlowTexture(),
    color: '#e4ff8a',
    transparent: true,
    opacity: params.swarmOpacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
})
const swarm = new THREE.Points(swarmGeometry, swarmMaterial)
swarm.frustumCulled = false
scene.add(swarm)

/**
 * Світло
 */
const ambientLight = new THREE.AmbientLight(params.ambientColor, params.ambientIntensity)
scene.add(ambientLight)

// Місяць / сонце
const moonLight = new THREE.DirectionalLight(params.moonColor, params.moonIntensity)
scene.add(moonLight)

/**
 * Небо
 */
const sky = new Sky()
sky.scale.set(150, 150, 150)
scene.add(sky)

const sunDirection = new THREE.Vector3()

function updateSky()
{
    const phi = THREE.MathUtils.degToRad(90 - params.elevation)
    const theta = THREE.MathUtils.degToRad(params.azimuth)
    sunDirection.setFromSphericalCoords(1, phi, theta)

    const uniforms = sky.material.uniforms
    uniforms['turbidity'].value = params.turbidity
    uniforms['rayleigh'].value = params.rayleigh
    uniforms['mieCoefficient'].value = params.mieCoefficient
    uniforms['mieDirectionalG'].value = params.mieDirectionalG
    uniforms['sunPosition'].value.copy(sunDirection)

    renderer.toneMappingExposure = params.exposure

    // Напрямлене світло йде з того ж боку, що й сонце/місяць
    moonLight.position.setFromSphericalCoords(
        14,
        THREE.MathUtils.degToRad(90 - params.lightElevation),
        theta
    )
}

/**
 * Туман (колір підбираємо під нижню частину неба)
 */
scene.fog = new THREE.FogExp2(params.fogColor, params.fogDensity)

/**
 * Тіні
 */
moonLight.castShadow = true
moonLight.shadow.mapSize.set(2048, 2048)
moonLight.shadow.camera.top = 14
moonLight.shadow.camera.right = 14
moonLight.shadow.camera.bottom = - 14
moonLight.shadow.camera.left = - 14
moonLight.shadow.camera.near = 1
moonLight.shadow.camera.far = 40
moonLight.shadow.normalBias = 0.04

floor.receiveShadow = true

for(const group of [house, bushes, thujas, trees, lamps, sign])
{
    group.traverse((child) =>
    {
        if(child.isMesh)
        {
            child.castShadow = true
            child.receiveShadow = true
        }
    })
}

// Двері та лампочку не змушуємо кидати тінь (прозорі / світні)
door.castShadow = false
doorBulb.castShadow = false

/**
 * Оновлення параметрів зі значень у params
 */
function updateFog()
{
    scene.fog.color.set(params.fogColor)
    scene.fog.density = params.fogDensity
}

function updateLights()
{
    ambientLight.color.set(params.ambientColor)
    ambientLight.intensity = params.ambientIntensity

    moonLight.color.set(params.moonColor)
    moonLight.intensity = params.moonIntensity

    doorLight.color.set(params.doorColor)
    doorBulb.material.emissive.set(params.doorColor)

    lampLights.forEach((light) =>
    {
        light.color.set(params.lampColor)
        light.intensity = params.lampIntensity
    })
    lampGlowMaterial.emissive.set(params.lampColor)
    lampGlowMaterial.emissiveIntensity = params.lampIntensity * 0.6

    glassMaterial.emissiveIntensity = params.windowGlow

    fireflies.forEach((firefly) => { firefly.light.intensity = params.fireflyIntensity })
    swarmMaterial.opacity = params.swarmOpacity
}

function updateMaterials()
{
    // Підлога
    floor.material.color.set(params.floorColor)
    floor.material.displacementScale = params.floorDisplacementScale
    floor.material.displacementBias = params.floorDisplacementBias
    Object.values(floorTextures).forEach((t) => t.repeat.set(params.floorRepeat, params.floorRepeat))

    // Стіни
    wallMaterial.color.set(params.wallColor)
    Object.values(plasterTextures).forEach((t) => t.repeat.set(params.wallRepeat, params.wallRepeat * 0.6))

    // Дах і рослини
    roofMaterial.color.set(params.roofColor)
    bushMaterial.color.set(params.bushColor)
    treeLeavesMaterial.color.set(params.bushColor)
}

function updateAll()
{
    updateSky()
    updateFog()
    updateLights()
    updateMaterials()
}

/**
 * Звук струмка: шум генерується кодом (без аудіофайлу!)
 */
const listener = new THREE.AudioListener()
camera.add(listener)

function createWaterBuffer(context)
{
    const rate = context.sampleRate
    const length = rate * 6
    const fade = Math.floor(rate * 0.1)
    const generated = new Float32Array(length + fade)

    let low = 0
    let slow = 0
    let modulation = 0

    for(let i = 0; i < generated.length; i++)
    {
        const white = Math.random() * 2 - 1
        low += 0.3 * (white - low)           // прибираємо найвищі частоти
        slow += 0.01 * (white - slow)        // прибираємо найнижчі гудіння
        modulation += 0.0008 * ((Math.random() * 2 - 1) - modulation)
        generated[i] = (low - slow) * Math.max(0.2, 0.7 + modulation * 25) // "булькання"
    }

    const buffer = context.createBuffer(1, length, rate)
    const data = buffer.getChannelData(0)
    let peak = 0
    for(let i = 0; i < length; i++)
    {
        // Плавний шов, щоб при зациклюванні не було клацання
        data[i] = i < fade
            ? generated[i] * (i / fade) + generated[length + i] * (1 - i / fade)
            : generated[i]
        peak = Math.max(peak, Math.abs(data[i]))
    }
    for(let i = 0; i < length; i++) data[i] = data[i] / peak * 0.8

    return buffer
}

const streamSound = new THREE.PositionalAudio(listener)
streamSound.setBuffer(createWaterBuffer(listener.context))
streamSound.setLoop(true)
streamSound.setRefDistance(3)
streamSound.setRolloffFactor(1.4)
streamSound.setVolume(params.soundVolume)

const soundSource = new THREE.Object3D()
soundSource.position.copy(streamCurve.getPointAt(0.5))
soundSource.position.y = 0.3
soundSource.add(streamSound)
scene.add(soundSource)

const soundButton = document.getElementById('soundButton')
soundButton.addEventListener('click', async () =>
{
    // Браузер дозволяє звук лише після кліку користувача
    if(listener.context.state === 'suspended')
    {
        await listener.context.resume()
    }

    if(streamSound.isPlaying)
    {
        streamSound.pause()
        soundButton.textContent = '🔇 Увімкнути звук струмка'
    }
    else
    {
        streamSound.play()
        soundButton.textContent = '🔊 Вимкнути звук струмка'
    }
})

/**
 * Налаштування (lil-gui)
 */
const gui = new GUI({ title: 'Налаштування сцени', width: 320 })

const presets = {
    night: {
        elevation: - 2.2, azimuth: 162, lightElevation: 25,
        turbidity: 10, rayleigh: 3, mieCoefficient: 0.1, mieDirectionalG: 0.95, exposure: 1,
        fogColor: '#04343f', fogDensity: 0.04,
        ambientColor: '#86cdff', ambientIntensity: 0.275,
        moonColor: '#86cdff', moonIntensity: 1,
        doorIntensity: 5, lampIntensity: 3, windowGlow: 1.2,
        fireflyIntensity: 3, swarmOpacity: 0.9
    },
    day: {
        elevation: 32, azimuth: 35, lightElevation: 35,
        turbidity: 3, rayleigh: 1.2, mieCoefficient: 0.005, mieDirectionalG: 0.8, exposure: 0.65,
        fogColor: '#bfd6e6', fogDensity: 0.012,
        ambientColor: '#dbe7ff', ambientIntensity: 1.5,
        moonColor: '#fff2dc', moonIntensity: 4,
        doorIntensity: 0.6, lampIntensity: 0, windowGlow: 0.05,
        fireflyIntensity: 0, swarmOpacity: 0
    }
}

function applyPreset(preset)
{
    Object.assign(params, preset)
    updateAll()
    gui.controllersRecursive().forEach((controller) => controller.updateDisplay())
}

const presetButtons = {
    night: () => applyPreset(presets.night),
    day: () => applyPreset(presets.day)
}
gui.add(presetButtons, 'night').name('🌙 Ніч')
gui.add(presetButtons, 'day').name('☀️ День')

const skyFolder = gui.addFolder('Небо')
skyFolder.add(params, 'elevation').min(- 10).max(90).step(0.1).name('Висота сонця').onChange(updateAll)
skyFolder.add(params, 'azimuth').min(- 180).max(180).step(0.1).name('Азимут').onChange(updateAll)
skyFolder.add(params, 'turbidity').min(0).max(20).step(0.1).name('Каламутність').onChange(updateAll)
skyFolder.add(params, 'rayleigh').min(0).max(4).step(0.001).name('Релей').onChange(updateAll)
skyFolder.add(params, 'mieCoefficient').min(0).max(0.1).step(0.001).name('Мі: коефіцієнт').onChange(updateAll)
skyFolder.add(params, 'mieDirectionalG').min(0).max(1).step(0.001).name('Мі: напрямок').onChange(updateAll)
skyFolder.add(params, 'exposure').min(0.1).max(2).step(0.01).name('Експозиція').onChange(updateAll)
skyFolder.close()

const fogFolder = gui.addFolder('Туман')
fogFolder.addColor(params, 'fogColor').name('Колір').onChange(updateAll)
fogFolder.add(params, 'fogDensity').min(0).max(0.15).step(0.001).name('Щільність').onChange(updateAll)
fogFolder.close()

const lightFolder = gui.addFolder('Світло')
lightFolder.addColor(params, 'ambientColor').name('Ambient: колір').onChange(updateAll)
lightFolder.add(params, 'ambientIntensity').min(0).max(3).step(0.001).name('Ambient: сила').onChange(updateAll)
lightFolder.addColor(params, 'moonColor').name('Місяць/сонце: колір').onChange(updateAll)
lightFolder.add(params, 'moonIntensity').min(0).max(6).step(0.01).name('Місяць/сонце: сила').onChange(updateAll)
lightFolder.add(params, 'lightElevation').min(5).max(80).step(1).name('Місяць/сонце: висота').onChange(updateAll)
lightFolder.addColor(params, 'doorColor').name('Лампа входу: колір').onChange(updateAll)
lightFolder.add(params, 'doorIntensity').min(0).max(15).step(0.1).name('Лампа входу: сила').onChange(updateAll)
lightFolder.add(params, 'doorFlicker').name('Лампа входу блимає')
lightFolder.add(params, 'flickerAmount').min(0).max(1).step(0.01).name('Сила миготіння')
lightFolder.addColor(params, 'lampColor').name('Ліхтарі: колір').onChange(updateAll)
lightFolder.add(params, 'lampIntensity').min(0).max(10).step(0.1).name('Ліхтарі: сила').onChange(updateAll)
lightFolder.add(params, 'windowGlow').min(0).max(4).step(0.01).name('Світіння вікон').onChange(updateAll)
lightFolder.add(params, 'fireflyIntensity').min(0).max(10).step(0.1).name('Світлячки: сила').onChange(updateAll)
lightFolder.add(params, 'swarmOpacity').min(0).max(1).step(0.01).name('Рій світлячків').onChange(updateAll)
lightFolder.close()

const materialFolder = gui.addFolder('Матеріали й текстури')
materialFolder.add(params, 'floorRepeat').min(2).max(40).step(1).name('Земля: повтор').onChange(updateAll)
materialFolder.add(params, 'floorDisplacementScale').min(0).max(1).step(0.001).name('Земля: зміщення').onChange(updateAll)
materialFolder.add(params, 'floorDisplacementBias').min(- 1).max(1).step(0.001).name('Земля: bias').onChange(updateAll)
materialFolder.addColor(params, 'floorColor').name('Земля: відтінок').onChange(updateAll)
materialFolder.addColor(params, 'wallColor').name('Стіни: колір').onChange(updateAll)
materialFolder.add(params, 'wallRepeat').min(0.5).max(8).step(0.1).name('Стіни: повтор').onChange(updateAll)
materialFolder.addColor(params, 'roofColor').name('Дах: колір').onChange(updateAll)
materialFolder.addColor(params, 'bushColor').name('Кущі: відтінок').onChange(updateAll)
materialFolder.close()

const animationFolder = gui.addFolder('Анімація')
animationFolder.add(params, 'fireflySpeed').min(0).max(4).step(0.01).name('Швидкість світлячків')
animationFolder.add(params, 'windStrength').min(0).max(4).step(0.01).name('Вітер (гойдання)')
animationFolder.add(params, 'waterSpeed').min(0).max(1).step(0.01).name('Швидкість води')
animationFolder.close()

const soundFolder = gui.addFolder('Звук')
soundFolder.add(params, 'soundVolume').min(0).max(1).step(0.01).name('Гучність струмка').onChange(() =>
{
    streamSound.setVolume(params.soundVolume)
})
soundFolder.close()

updateAll()

/**
 * Зміна розміру вікна
 */
window.addEventListener('resize', () =>
{
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Анімація
 */
const timer = new Timer()

const tick = () =>
{
    timer.update()
    const elapsedTime = timer.getElapsed()
    const deltaTime = timer.getDelta()

    // Світлячки-лампи літають еліпсами навколо будинку (кілька синусів = "непередбачуваний" рух)
    fireflies.forEach((firefly) =>
    {
        const angle = firefly.phase + elapsedTime * firefly.speed * firefly.direction * params.fireflySpeed
        firefly.light.position.x = 0.8 + Math.cos(angle) * firefly.rx
        firefly.light.position.z = 0.5 + Math.sin(angle) * firefly.rz
        firefly.light.position.y = 1.4 + Math.sin(angle) * Math.sin(angle * 2.34) * Math.sin(angle * 3.45) * 0.9
    })

    // Рій світлячків
    const t = elapsedTime * params.fireflySpeed
    for(let i = 0; i < swarmCount; i++)
    {
        const base = swarmBase[i]
        swarmPositions[i * 3 + 0] = base.x + Math.sin(t * 0.5 + base.phase) * 0.7
        swarmPositions[i * 3 + 1] = base.y + Math.sin(t * 0.9 + base.phase * 2) * 0.4
        swarmPositions[i * 3 + 2] = base.z + Math.cos(t * 0.4 + base.phase) * 0.7
    }
    swarmGeometry.attributes.position.needsUpdate = true

    // Лампа над дверима блимає
    let flicker = 1
    if(params.doorFlicker)
    {
        const noise = Math.sin(elapsedTime * 12) * Math.sin(elapsedTime * 7.3) * 0.5 + Math.sin(elapsedTime * 31) * 0.25
        flicker = 1 + noise * params.flickerAmount

        // Короткі "збої" приблизно кожні 3 секунди
        const cycle = (elapsedTime * 0.35) % 1
        if(cycle > 0.94)
        {
            flicker *= 0.2 + 0.8 * Math.abs(Math.sin(elapsedTime * 50))
        }
    }
    doorLight.intensity = params.doorIntensity * flicker
    doorBulb.material.emissiveIntensity = 2 * flicker

    // Кущі й дерева гойдаються
    swayers.forEach((s) =>
    {
        s.object.rotation.z = Math.sin(elapsedTime * s.speed + s.phase) * s.amp * params.windStrength
    })

    // Вода тече вздовж струмка
    waterTexture.offset.y -= deltaTime * params.waterSpeed

    controls.update()
    renderer.render(scene, camera)
    window.requestAnimationFrame(tick)
}

tick()
