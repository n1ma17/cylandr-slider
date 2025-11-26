<script setup>
import * as THREE from 'three'
import { onMounted, onBeforeUnmount, ref } from 'vue'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const props = defineProps({
  texts: {
    type: Array,
    default: () => ['TEXT ONE', 'TEXT TWO', 'TEXT THREE'],
  },
  color: {
    type: String,
    default: '#f1f1f1',
  },
  backgroundColor: {
    type: String,
    default: 'transparent',
  },
  // World height (in scene units) for each text plane
  textHeight: {
    type: Number,
    default: 2.2,
  },
  // Start/target Z positions (relative to camera at z=0)
  startZ: {
    type: Number,
    default: -120,
  },
  endZ: {
    type: Number,
    default: -2,
  },
  // Units per second
  speed: {
    type: Number,
    default: 1,
  },
  // Visual surfaces
  showSurfaces: {
    type: Boolean,
    default: true,
  },
  floorWidth: {
    type: Number,
    default: 15,
  },
  floorDepth: {
    type: Number,
    default: 200,
  },
  floorColor: {
    type: String,
    default: '#1b88ff',
  },
  floorOpacity: {
    type: Number,
    default: 1,
  },
  waterfallHeight: {
    type: Number,
    default: 20,
  },
  waterfallColor: {
    type: String,
    default: '#1b88ff',
  },
  waterfallOpacity: {
    type: Number,
    default: 0.18,
  },
  // Camera follow configuration
  followOffsetZ: {
    type: Number,
    default: 10,
  },
  followOffsetY: {
    type: Number,
    default: 0.2,
  },
  // 0..1 progress threshold to start following third text
  followStartProgress: {
    type: Number,
    default: 3.6,
  },
})

const containerRef = ref(null)
const debugItemRef = ref(null)

let renderer
let scene
let camera
let animationFrameId
let resizeObserver
const textMeshes = []
const disposables = []
let textsGroup
const lookTarget = new THREE.Vector3()
const targetPos = new THREE.Vector3()
const baseCamPos = new THREE.Vector3(0, 6, 8)
const baseLook = new THREE.Vector3(0, 0, 0)
let boxMesh = null
let boxEdgeWorldZ = 0
let baseBoxWidth = 0
// Camera blending: 0 = base camera, 1 = follow last text
const camBlend = { value: 0 }
const camPosBlend = new THREE.Vector3()
const lookBlend = new THREE.Vector3()

function createTextPlane(text, options) {
  const {
    color = '#ffffff',
    backgroundColor = 'transparent',
    textHeight = 2,
    fontFamily = '600 140px Arial, Helvetica, sans-serif',
    padding = 48,
  } = options

  // Draw text on canvas
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  // First pass: measure
  ctx.font = fontFamily
  const metrics = ctx.measureText(text)
  const textWidth = Math.ceil(metrics.width)
  const textHeightPx = 160 // approximate ascent+descent for the font size above

  canvas.width = Math.max(2, nextPowerOfTwo(textWidth + padding * 2))
  canvas.height = Math.max(2, nextPowerOfTwo(textHeightPx + padding * 2))

  // Redraw with correct size
  const ctx2 = canvas.getContext('2d')
  ctx2.clearRect(0, 0, canvas.width, canvas.height)
  if (backgroundColor !== 'transparent') {
    ctx2.fillStyle = backgroundColor
    ctx2.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx2.font = fontFamily
  ctx2.textBaseline = 'middle'
  ctx2.textAlign = 'center'
  ctx2.fillStyle = color
  ctx2.shadowColor = 'rgba(0,0,0,0.35)'
  ctx2.shadowBlur = 8
  ctx2.translate(canvas.width / 2, canvas.height / 2)
  ctx2.fillText(text, 0, 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = 4
  texture.needsUpdate = true

  const aspect = canvas.width / canvas.height
  const planeHeight = textHeight
  const planeWidth = planeHeight * aspect

  const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  // Save dimensions for layout
  mesh.userData.width = planeWidth
  mesh.userData.height = planeHeight

  // Track for disposal
  disposables.push(() => {
    texture.dispose()
    geometry.dispose()
    material.dispose()
  })

  return mesh
}

function nextPowerOfTwo(value) {
  return Math.pow(2, Math.ceil(Math.log2(Math.max(1, value))))
}

function initScene() {
  const container = containerRef.value
  const { clientWidth: width, clientHeight: height } = container

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height, false)
  container.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  scene.background = null

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000)
  camera.position.set(0, 6, 8) // above and a bit forward
  camera.lookAt(0, 0, 0)
  baseCamPos.copy(camera.position)

  // Create three text planes and lay them flat on a horizontal plane (XZ)
  textsGroup = new THREE.Group()
  scene.add(textsGroup)
  props.texts.slice(0, 3).forEach((t) => {
    const mesh = createTextPlane(t, {
      color: props.color,
      backgroundColor: props.backgroundColor,
      textHeight: props.textHeight,
    })
    textMeshes.push(mesh)
    textsGroup.add(mesh)
  })

  // Layout vertically along Z axis ("zire ham"), all lying slightly above Y=0
  const textElevation = 0.05 // lift texts slightly above the box surface
  const gap = props.textHeight * 0.4
  const totalDepth =
    textMeshes.reduce((sum, m) => sum + (m.userData.height || props.textHeight), 0) +
    gap * Math.max(0, textMeshes.length - 1)
  let nearEdge = -totalDepth / 2
  for (const mesh of textMeshes) {
    const d = mesh.userData.height || props.textHeight
    mesh.position.set(0, textElevation, nearEdge + d / 2)
    mesh.rotation.x = -Math.PI / 2 // lie flat on horizontal plane
    nearEdge += d + gap
  }

  // Start far back; will scroll toward camera
  textsGroup.position.set(0, 0, props.startZ)

  // Optional visible surfaces: floor and waterfall plane
  if (props.showSurfaces) {
    buildSurfaces()
  }
}

function animate() {
  // Blend camera from base pose to a follow pose tied to the last text
  if (textMeshes.length) {
    const lastMesh = textMeshes[textMeshes.length - 1]
    lastMesh.getWorldPosition(lookTarget)
    // Desired follow position (in front of the last text)
    targetPos.set(
      lookTarget.x,
      lookTarget.y + props.followOffsetY,
      lookTarget.z + props.followOffsetZ,
    )
    // Blend between base and follow target
    camPosBlend.lerpVectors(baseCamPos, targetPos, camBlend.value)
    lookBlend.lerpVectors(baseLook, lookTarget, camBlend.value)
    // Smoothly ease camera to the blended position
    camera.position.lerp(camPosBlend, 0.15)
    camera.lookAt(lookBlend)
  }
  renderer.render(scene, camera)
  animationFrameId = requestAnimationFrame(animate)
}

function handleResize() {
  const container = containerRef.value
  if (!container) return
  const width = container.clientWidth
  const height = container.clientHeight
  if (!width || !height) return
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, false)
  // Ensure box spans full viewport width after resize
  updateBoxScaleAndPosition()
}

function buildSurfaces() {
  // Build a single box: texts move on top face, third text rotates and slides down front face
  const lastMesh = textMeshes[textMeshes.length - 1]
  const edgeZRel = lastMesh.position.z
  boxEdgeWorldZ = props.endZ + edgeZRel

  const boxWidth = props.floorWidth
  const boxDepth = props.floorDepth
  const boxHeight = props.waterfallHeight

  const boxGeo = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth, 1, 1, 1)
  const boxMat = new THREE.MeshBasicMaterial({
    color: '#0f0f0f',
    transparent: false,
    opacity: 1,
    wireframe: false,
    side: THREE.FrontSide,
  })
  boxMesh = new THREE.Mesh(boxGeo, boxMat)
  // Position box so:
  // - top face (Y = boxHeight/2) is at Y=0 (where texts lie)
  // - front face (Z = boxDepth/2) is at boxEdgeWorldZ (the lip)
  boxMesh.position.set(0, -boxHeight / 2, boxEdgeWorldZ - boxDepth / 2)
  scene.add(boxMesh)
  baseBoxWidth = boxWidth
  // Match box width to current viewport width
  updateBoxScaleAndPosition()
  disposables.push(() => {
    boxGeo.dispose()
    boxMat.dispose()
  })
}

function getViewportWorldHalfWidthAtZ(worldZ) {
  if (!camera) return 0
  // Distance from camera to the target Z (assuming camera looks down -Z)
  const distance = Math.abs(camera.position.z - worldZ)
  const halfFovY = THREE.MathUtils.degToRad(camera.fov * 0.3)
  const halfHeight = Math.tan(halfFovY) * distance
  return halfHeight * camera.aspect
}

function updateBoxScaleAndPosition() {
  if (!boxMesh || !camera) return
  // Compute the viewport width (in world units) around the box front edge depth
  const halfW = getViewportWorldHalfWidthAtZ(boxEdgeWorldZ)
  const desiredWidth = halfW * 2
  if (baseBoxWidth > 0) {
    boxMesh.scale.x = desiredWidth / baseBoxWidth
  }
  // Keep centered horizontally so it covers the entire screen width
  boxMesh.position.x = 0
}

onMounted(() => {
  initScene()
  animationFrameId = requestAnimationFrame(animate)

  // Scroll-driven approach: pin and move texts toward camera,
  // then make the third text stand upright and drop down like a waterfall
  const lastMesh = textMeshes[textMeshes.length - 1]
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: containerRef.value,
      start: 'top top',
      end: '400%  top',
      scrub: 1,
      pin: true,
      markers: true,
    },
  })
  // Phase 1: bring group from far back toward camera
  tl.to(textsGroup.position, { z: props.endZ, ease: 'sine.inOut', duration: 18 })
  // Phase 2: stand last text upright facing camera
  tl.addLabel('uprightStart')
  tl.to(lastMesh.rotation, { x: 0, ease: 'sine.inOut', duration: 8 }, 'uprightStart')
  // Camera blend from base to follow starts exactly with the rotation
  tl.to(camBlend, { value: 1, ease: 'sine.inOut', duration: 4 }, 'uprightStart')
  // Phase 3: drop last text downward along the front face of the box
  // lock its Z slightly forward of the box front edge so it's more visible
  tl.call(() => {
    if (boxMesh) {
      const edgeZRel = boxEdgeWorldZ - props.endZ // local Z at group position endZ
      const forwardOffset = 0.1 // push text slightly forward from box surface
      lastMesh.position.z = edgeZRel + forwardOffset
    }
  })
  tl.to(lastMesh.position, { y: -2, ease: 'power1.in', duration: 6 })

  tl.fromTo(
    debugItemRef.value,
    { opacity: 0, y: '40vh' },
    { opacity: 1, y: '0vh', ease: 'power2.out', duration: 1 },
    '+=0.7',
  )

  // Resize handling
  resizeObserver = new ResizeObserver(() => handleResize())
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  window.removeEventListener('resize', handleResize)
  if (resizeObserver && containerRef.value) {
    resizeObserver.unobserve(containerRef.value)
    resizeObserver.disconnect()
  }
  for (const dispose of disposables) {
    try {
      dispose()
    } catch {
      // ignore
    }
  }
  // Clean scene graph
  for (const mesh of textMeshes) {
    scene.remove(mesh)
  }
  // Remove renderer
  if (renderer) {
    const el = renderer.domElement
    if (el && el.parentNode) el.parentNode.removeChild(el)
    renderer.dispose()
  }
})
</script>

<template>
  <div class="three-flyin-container" ref="containerRef"></div>
  <div class="debug-container" ref="debugItemRef">
    <div class="debug-item">
      <span>Box Edge World Z:</span>
      <span>{{ boxEdgeWorldZ }}</span>
    </div>
  </div>
</template>

<style scoped>
.three-flyin-container {
  width: 100vw;
  height: 100vh;
  display: block;
  position: relative;
  background: radial-gradient(1200px 600px at 50% 50%, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0))
    #212529;
  overflow: hidden;
}

.debug-container {
  background-color: #615151;
  width: 100vw;
  height: 30vh;
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  font-size: 24px;
  font-weight: bold;
  font-family: monospace;
  opacity: 0;
}
</style>
