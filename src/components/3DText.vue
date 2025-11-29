<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const props = defineProps({
  texts: {
    type: Array,
    default: () => ['Continuos Innovation', 'Continuos Innovation', 'Continuos Innovation'],
  },
  textColor: {
    type: String,
    default: '#f1f1f1',
  },
  backgroundColor: {
    type: String,
    default: 'transparent',
  },
  fontFamily: {
    type: String,
    default: '600 140px "Inter", Arial, sans-serif',
  },
  textHeight: {
    type: Number,
    default: 7,
  },
  startZOffset: {
    type: Number,
    default: 20,
  },
  uppercase: {
    type: Boolean,
    default: true,
  },
})

const canvasRef = ref(null)
const CAPTION_FADE_TARGET = 0.75
const COVER_PADDING = 1.5
const SMOOTH_LERP = 0.035
const CYLINDER_RADIUS = 0.04
const CYLINDER_OFFSET_X = 7
const MIDDLE_CYLINDER_COUNT = 4

let scene,
  camera,
  renderer,
  box,
  coverBox,
  cylinderLeft,
  cylinderRight,
  middleCylinders,
  yCylinders,
  animationId,
  controls,
  textPlanes,
  textGroup,
  scrollTimeline,
  smoothTrigger
const textTravel = { start: 0, end: 0 }
const smoothProgress = { current: 0, target: 0 }

const nextPowerOfTwo = (value) => 2 ** Math.ceil(Math.log2(Math.max(1, value)))

const formatLabel = (label) => (props.uppercase ? `${label}`.toUpperCase() : `${label}`)

const createTextPlaneMesh = (label) => {
  const text = formatLabel(label)
  const padding = 64
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = props.fontFamily
  // Build lines: respect explicit newlines; otherwise, split exactly-two-word texts into two lines
  let lines
  if (text.includes('\n')) {
    lines = text.split(/\r?\n/)
  } else {
    const words = text.split(/\s+/).filter(Boolean)
    lines = words.length === 2 ? words : [text]
  }
  // Measure per-line metrics
  const measurements = lines.map((l) => ctx.measureText(l))
  const textWidth = Math.ceil(Math.max(0, ...measurements.map((m) => Math.max(0, m.width || 0))))
  const ascent = Math.ceil(measurements[0]?.actualBoundingBoxAscent || 120)
  const descent = Math.ceil(measurements[0]?.actualBoundingBoxDescent || 40)
  const lineHeightPx = Math.max(1, ascent + descent)
  const lineGapPx = Math.round(lineHeightPx * 0.3)
  const totalLines = Math.max(1, lines.length)
  const totalTextHeightPx = totalLines * lineHeightPx + Math.max(0, totalLines - 1) * lineGapPx

  canvas.width = nextPowerOfTwo(textWidth + padding * 2)
  canvas.height = nextPowerOfTwo(totalTextHeightPx + padding * 2)

  const ctx2 = canvas.getContext('2d')
  ctx2.clearRect(0, 0, canvas.width, canvas.height)
  if (props.backgroundColor !== 'transparent') {
    ctx2.fillStyle = props.backgroundColor
    ctx2.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx2.font = props.fontFamily
  ctx2.textAlign = 'center'
  ctx2.textBaseline = 'middle'
  ctx2.fillStyle = props.textColor
  ctx2.shadowColor = 'rgba(0,0,0,0.45)'
  ctx2.shadowBlur = 18
  ctx2.translate(canvas.width / 2, canvas.height / 2)
  // Draw each line centered, vertically stacked
  const startY = -Math.round((totalTextHeightPx - lineHeightPx) / 2)
  lines.forEach((line, idx) => {
    const y = startY + idx * (lineHeightPx + lineGapPx)
    ctx2.fillText(line, 0, y + 4)
  })

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = 4
  texture.needsUpdate = true

  const aspect = canvas.width / canvas.height
  const planeHeight = props.textHeight
  const planeWidth = Math.max(planeHeight * aspect, planeHeight)

  const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    fog: true,
  })

  const plane = new THREE.Mesh(geometry, material)
  plane.userData.depth = geometry.parameters.height
  return plane
}

const disposeTextPlanes = () => {
  if (textPlanes?.length) {
    textPlanes.forEach((plane) => {
      plane.geometry.dispose()
      plane.material.map?.dispose()
      plane.material.dispose()
    })
  }
  textPlanes = []
  textGroup?.clear()
}

const disposeCoverBox = () => {
  if (!coverBox) {
    return
  }
  coverBox.geometry.dispose()
  coverBox.material.dispose()
  scene.remove(coverBox)
  coverBox = null
}

const buildCoverGeometry = () => {
  if (!box) {
    return null
  }
  const { width = 0.5, height = 0.5, depth = 0.5 } = box.geometry.parameters || {}
  return new THREE.BoxGeometry(
    width + COVER_PADDING - 1.5,
    height + COVER_PADDING - 1.5,
    depth + COVER_PADDING - 1.5,
    8,
    8,
    8,
  )
}

const createCoverBox = () => {
  disposeCoverBox()
  if (!scene || !box) {
    return
  }

  const geometry = buildCoverGeometry()
  if (!geometry) {
    return
  }

  const material = new THREE.MeshBasicMaterial({
    color: '#343a40',
    wireframe: true,
    transparent: true,
    opacity: CAPTION_FADE_TARGET,
  })

  coverBox = new THREE.Mesh(geometry, material)
  coverBox.position.copy(box.position)
  scene.add(coverBox)
}

const updateCoverBox = () => {
  if (!scene || !box) {
    return
  }
  const geometry = buildCoverGeometry()
  if (!geometry) {
    return
  }
  if (!coverBox) {
    createCoverBox()
    return
  }
  coverBox.geometry.dispose()
  coverBox.geometry = geometry
  coverBox.position.copy(box.position)
}

const disposeCylinders = () => {
  if (cylinderLeft) {
    cylinderLeft.geometry.dispose()
    cylinderLeft.material.dispose()
    scene.remove(cylinderLeft)
    cylinderLeft = null
  }
  if (cylinderRight) {
    cylinderRight.geometry.dispose()
    cylinderRight.material.dispose()
    scene.remove(cylinderRight)
    cylinderRight = null
  }
  if (middleCylinders?.length) {
    middleCylinders.forEach((mesh) => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      scene.remove(mesh)
    })
  }
  middleCylinders = []
}

const disposeYCylinders = () => {
  if (yCylinders?.length) {
    yCylinders.forEach((mesh) => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      scene.remove(mesh)
    })
  }
  yCylinders = []
}

const createYCylinders = () => {
  disposeYCylinders()
  if (!scene || !box) {
    return
  }
  const { height = 1 } = box.geometry.parameters || {}
  const boxTopY = height / 2

  const total = MIDDLE_CYLINDER_COUNT + 2
  const leftX = -CYLINDER_OFFSET_X
  const step = (2 * CYLINDER_OFFSET_X) / (total - 1)

  yCylinders = []
  for (let i = 0; i < total; i++) {
    const x = leftX + i * step
    const geo = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, height, 16, 1, false)
    // Anchor top at pivot so growth goes only downward (-Y)
    geo.translate(0, -height / 2, 0)
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
    const mesh = new THREE.Mesh(geo, mat)
    // No rotation needed: Cylinder default axis is Y
    mesh.position.set(x, boxTopY + 0.01, box.position.z - 15)
    mesh.scale.y = 0
    mesh.visible = false
    scene.add(mesh)
    yCylinders.push(mesh)
  }
}

const updateYCylinders = () => {
  if (!scene || !box) {
    return
  }
  const { height = 1 } = box.geometry.parameters || {}
  const total = MIDDLE_CYLINDER_COUNT + 2
  if (!yCylinders || yCylinders.length !== total) {
    createYCylinders()
    return
  }
  const boxTopY = (box.geometry.parameters?.height || 2) / 2
  const leftX = -CYLINDER_OFFSET_X
  const step = (2 * CYLINDER_OFFSET_X) / (total - 1)
  for (let i = 0; i < total; i++) {
    const mesh = yCylinders[i]
    const x = leftX + i * step
    mesh.geometry.dispose()
    const geo = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, height, 16, 1, false)
    geo.translate(0, -height / 2, 0)
    mesh.geometry = geo
    mesh.position.set(x, boxTopY, box.position.z - 15.2)
  }
}

const createCylinders = () => {
  disposeCylinders()
  if (!scene || !box) {
    return
  }

  const { height = 1, depth = 1 } = box.geometry.parameters || {}
  const leftMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const rightMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })

  const leftGeo = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, depth, 8, 1, false)
  leftGeo.translate(0, depth / 2, 0)
  const rightGeo = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, depth, 8, 1, false)
  rightGeo.translate(0, depth / 2, 0)

  cylinderLeft = new THREE.Mesh(leftGeo, leftMat)
  cylinderRight = new THREE.Mesh(rightGeo, rightMat)

  cylinderLeft.rotation.x = Math.PI / 2
  cylinderRight.rotation.x = Math.PI / 2

  const boxTopY = height / 2
  cylinderLeft.position.set(-CYLINDER_OFFSET_X, boxTopY + CYLINDER_RADIUS, box.position.z + 11)
  cylinderRight.position.set(CYLINDER_OFFSET_X, boxTopY + CYLINDER_RADIUS, box.position.z + 11)

  scene.add(cylinderLeft)
  scene.add(cylinderRight)

  // Create 4 middle cylinders evenly spaced between left and right
  middleCylinders = []
  const total = MIDDLE_CYLINDER_COUNT + 2 // include left and right
  const leftX = -CYLINDER_OFFSET_X
  const step = (2 * CYLINDER_OFFSET_X) / (total - 1)
  for (let i = 1; i <= MIDDLE_CYLINDER_COUNT; i++) {
    const geo = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, depth, 16, 1, false)
    geo.translate(0, depth / 2, 0)
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
    const mid = new THREE.Mesh(geo, mat)
    mid.rotation.x = Math.PI / 2
    mid.position.set(leftX + i * step, boxTopY + CYLINDER_RADIUS, box.position.z + 11)
    scene.add(mid)
    middleCylinders.push(mid)
  }

  // Start with zero visible depth (animate scale.y from 0 to 1)
  cylinderLeft.scale.y = 0
  cylinderRight.scale.y = 0
  if (middleCylinders?.length) {
    middleCylinders.forEach((m) => (m.scale.y = 0))
  }
}

const updateCylinders = () => {
  if (!scene || !box) {
    return
  }
  const { height = 1, depth = 1 } = box.geometry.parameters || {}
  if (!cylinderLeft || !cylinderRight) {
    createCylinders()
    return
  }

  cylinderLeft.geometry.dispose()
  {
    const geo = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, depth, 16, 1, false)
    geo.translate(0, depth / 2, 0)
    cylinderLeft.geometry = geo
  }
  cylinderRight.geometry.dispose()
  {
    const geo = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, depth, 16, 1, false)
    geo.translate(0, depth / 2, 0)
    cylinderRight.geometry = geo
  }

  cylinderLeft.rotation.x = Math.PI / 2
  cylinderRight.rotation.x = Math.PI / 2

  const boxTopY = height / 2
  cylinderLeft.position.set(-CYLINDER_OFFSET_X, boxTopY + CYLINDER_RADIUS, box.position.z)
  cylinderRight.position.set(CYLINDER_OFFSET_X, boxTopY + CYLINDER_RADIUS, box.position.z)

  // Ensure and update middle cylinders
  if (!middleCylinders || middleCylinders.length !== MIDDLE_CYLINDER_COUNT) {
    createCylinders()
    return
  }
  const total = MIDDLE_CYLINDER_COUNT + 2
  const leftX = -CYLINDER_OFFSET_X
  const step = (2 * CYLINDER_OFFSET_X) / (total - 1)
  for (let i = 0; i < MIDDLE_CYLINDER_COUNT; i++) {
    const mesh = middleCylinders[i]
    mesh.geometry.dispose()
    {
      const geo = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, depth, 16, 1, false)
      geo.translate(0, depth / 2, 0)
      mesh.geometry = geo
    }
    mesh.rotation.x = Math.PI / 2
    mesh.position.set(leftX + (i + 1) * step, boxTopY + CYLINDER_RADIUS, box.position.z)
  }
}

const createTextPlanes = () => {
  if (!scene || !box || !props.texts?.length) {
    return
  }

  disposeTextPlanes()

  const { height = 2, depth = 20 } = box.geometry.parameters || {}
  const boxTopY = height / 2

  if (!textGroup) {
    textGroup = new THREE.Group()
    scene.add(textGroup)
  } else {
    textGroup.clear()
  }
  textGroup.position.set(0, boxTopY, box.position.z)

  const planes = props.texts
    .filter((text) => typeof text === 'string' && text.trim().length)
    .map((text) => createTextPlaneMesh(text.trim()))

  if (!planes.length) {
    textPlanes = []
    return
  }

  const gap = Math.min(depth / planes.length, props.textHeight * 0.8)
  const totalDepth =
    planes.reduce((sum, plane) => sum + (plane.userData.depth || props.textHeight), 0) +
    gap * Math.max(0, planes.length - 1)
  let cursor = -totalDepth / 2

  textPlanes = planes.map((plane) => {
    const planeDepth = plane.userData.depth || props.textHeight
    plane.position.set(0, 0.05, cursor + planeDepth / 2)
    plane.rotation.set(Math.PI / 2, Math.PI, 0)
    textGroup.add(plane)
    cursor += planeDepth + gap
    return plane
  })

  const halfDepth = depth / 2
  const travelOffset = Math.max(0, halfDepth - totalDepth / 2)
  textTravel.start = travelOffset
  textTravel.end = -travelOffset
  textGroup.position.set(0, boxTopY, box.position.z + textTravel.start + props.startZOffset)
}

const setupScrollAnimation = () => {
  if (!camera || !textGroup) {
    return
  }

  if (scrollTimeline) {
    scrollTimeline.kill()
  }
  if (smoothTrigger) {
    smoothTrigger.kill()
    smoothTrigger = null
  }
  smoothProgress.current = 0
  smoothProgress.target = 0

  const lastPlane = textPlanes?.[0]

  scrollTimeline = gsap.timeline({
    paused: true,
    defaults: {
      ease: 'sine.inOut',
    },
  })
  // Animate cylinders' visible depth from 0 -> full by scaling along local Y (aligned to Z)
  const allCylinderScales = [
    ...(cylinderLeft ? [cylinderLeft.scale] : []),
    ...(middleCylinders?.length ? middleCylinders.map((m) => m.scale) : []),
    ...(cylinderRight ? [cylinderRight.scale] : []),
  ]

  scrollTimeline.to(textPlanes?.[0].position, {
    z: -35,
    duration: 10.6,
  })
  if (allCylinderScales.length) {
    allCylinderScales.forEach((s) => (s.y = 0))
    scrollTimeline.to(
      allCylinderScales,
      {
        y: -0.867,
        duration: 5,
      },
      '<+=0.51',
    )
  }
  scrollTimeline.to(
    textPlanes?.[1].position,
    {
      z: -29,
      duration: 10.6,
    },
    '>',
  )
  scrollTimeline.to(
    textPlanes?.[textPlanes.length - 1].position,
    {
      z: -20,
      duration: 10.6,
    },
    '>',
  )
  // scrollTimeline.to(textGroup.position, {
  //   z: box.position.z + textTravel.end,
  //   duration: 11.6,
  // })

  if (lastPlane) {
    scrollTimeline.to(lastPlane.position, {
      z: -36,
      duration: 13,
    })
    // Reveal Y-axis cylinders here and grow them upward before rotation starts
    if (yCylinders?.length) {
      scrollTimeline.set(
        yCylinders,
        {
          visible: true,
        },
        '<',
      )
    }
    scrollTimeline.to(
      lastPlane.rotation,
      {
        x: -0.01,
        duration: 15,
      },
      '>',
    )

    scrollTimeline.to(
      lastPlane.position,
      {
        y: -1,
        duration: 13,
      },
      '<',
    )

    scrollTimeline.to(
      lastPlane.position,
      {
        y: -14,
        duration: 15,
      },
      '>',
    )
    scrollTimeline.to(
      yCylinders.map((m) => m.scale),
      {
        y: 1,
        duration: 10,
        ease: 'sine.inOut',
      },
      '<',
    )
  }

  scrollTimeline.to(
    camera.position,
    {
      y: 0,
      z: -25,
      duration: 10.6,
    },
    '<',
  )
  scrollTimeline.to(
    camera.rotation,
    {
      x: -Math.PI,
      duration: 11.6,
    },
    '<',
  )

  scrollTimeline.fromTo(
    captionsContainerRef.value,
    {
      opacity: 0,
      y: 124,
    },
    {
      opacity: 1,
      y: 0,
      ease: 'sine.inOut',
      duration: 11.6,
    },
    '>',
  )

  smoothTrigger = ScrollTrigger.create({
    trigger: '.scene-container',
    start: 'top top',
    end: 'bottom bottom',
    markers: false,
    onUpdate: (self) => {
      smoothProgress.target = self.progress
    },
  })
}

// Handle window resize
const handleResize = () => {
  if (camera && renderer && box) {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)

    // Update box width to match new screen width
    const distance = Math.abs(camera.position.z)
    const vFov = (camera.fov * Math.PI) / 180
    const visibleHeight = 2 * Math.tan(vFov / 2) * distance
    const visibleWidth = visibleHeight * camera.aspect

    box.geometry.dispose()
    box.geometry = new THREE.BoxGeometry(visibleWidth, 2, 2)
    updateCoverBox()
    updateCylinders()
    updateYCylinders()
    createTextPlanes()
    setupScrollAnimation()
  }
}

const captionsContainerRef = ref(null)

onMounted(() => {
  // Scene setup
  scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x131316, 0.065)
  scene.background = new THREE.Color('#131316')

  // Camera setup
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.x = 0
  camera.position.y = 24
  camera.position.z = -20
  camera.lookAt(0, 0, 10)

  // Renderer setup
  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
  })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)

  // Calculate visible width at box position
  const distance = Math.abs(camera.position.z)
  const vFov = (camera.fov * Math.PI) / 180
  const visibleHeight = 2 * Math.tan(vFov / 2) * distance
  const visibleWidth = visibleHeight * camera.aspect

  // Create box geometry with width matching screen width
  const geometry = new THREE.BoxGeometry(visibleWidth - 15, visibleHeight + 2, 30)
  const material = new THREE.MeshBasicMaterial({
    color: '#111111',
    side: THREE.FrontSide,
  })
  box = new THREE.Mesh(geometry, material)
  scene.add(box)
  createCoverBox()
  createCylinders()
  createYCylinders()
  createTextPlanes()
  setupScrollAnimation()

  // Animation loop
  const animate = () => {
    animationId = requestAnimationFrame(animate)

    renderer.render(scene, camera)
    if (scrollTimeline && smoothTrigger) {
      smoothProgress.current += (smoothProgress.target - smoothProgress.current) * SMOOTH_LERP
      scrollTimeline.progress(gsap.utils.clamp(0, 1, smoothProgress.current))
    }
  }
  animate()

  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  if (controls) {
    controls.dispose()
  }
  if (renderer) {
    renderer.dispose()
  }
  disposeTextPlanes()
  disposeCoverBox()
  disposeCylinders()
  disposeYCylinders()
  if (textGroup) {
    scene.remove(textGroup)
    textGroup = null
  }
  if (scrollTimeline) {
    scrollTimeline.scrollTrigger?.kill()
    scrollTimeline.kill()
    scrollTimeline = null
  }
  if (smoothTrigger) {
    smoothTrigger.kill()
    smoothTrigger = null
  }
  smoothProgress.current = 0
  smoothProgress.target = 0
  ScrollTrigger.getAll().forEach((trigger) => trigger.kill())
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div class="scene-container">
    <canvas ref="canvasRef"></canvas>
    <div class="text-container" ref="captionsContainerRef">
      <h1>TEXT ONE</h1>
      <h1>TEXT TWO</h1>
      <h1>TEXT THREE</h1>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.scene-container {
  position: relative;
  width: 100%;
  height: 280vh; /* اضافه کردن ارتفاع برای اسکرول */
}

canvas {
  position: fixed;
  top: 0;
  left: 0;
  display: block;
  width: 100%;
  height: 100vh;
}

.text-container {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: fit-content;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-size: 16px;
  font-weight: 300;
  text-align: left;
  color: #f1f1f1;
  opacity: 0;
}
</style>
