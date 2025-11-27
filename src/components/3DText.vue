<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const props = defineProps({
  texts: {
    type: Array,
    default: () => ['TEXT ONE', 'TEXT TWO', 'TEXT THREE'],
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
    default: 1.6,
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

let scene,
  camera,
  renderer,
  box,
  coverBox,
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
  const metrics = ctx.measureText(text)
  const textWidth = Math.ceil(metrics.width || 0)
  const textHeightPx =
    Math.ceil(
      (metrics.actualBoundingBoxAscent || 120) + (metrics.actualBoundingBoxDescent || 40),
    ) || 160

  canvas.width = nextPowerOfTwo(textWidth + padding * 2)
  canvas.height = nextPowerOfTwo(textHeightPx + padding * 2)

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
  ctx2.fillText(text, 0, 4)

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
    .map((text, index) => {
      const mesh = createTextPlaneMesh(text.trim())
      if (index === 1) {
        mesh.material.opacity = 0.5
      } else if (index === 2) {
        mesh.material.opacity = 0.25
      }
      return mesh
    })

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
  textGroup.position.set(0, boxTopY, box.position.z + textTravel.start)
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

  scrollTimeline.to(textGroup.position, {
    z: box.position.z + textTravel.end,
    duration: 11.6,
  })

  if (lastPlane) {
    scrollTimeline.to(lastPlane.position, {
      z: -4,
      duration: 11,
    })
    scrollTimeline.to(lastPlane.rotation, {
      x: -0.15,
      duration: 20,
    })
    scrollTimeline.to(
      lastPlane.position,
      {
        y: -1,
        duration: 20,
      },
      '>',
    )
    scrollTimeline.to(lastPlane.position, {
      y: -10,
      duration: 20,
    })
  }

  scrollTimeline.to(
    camera.position,
    {
      y: 0,
      z: -15,
      duration: 20.6,
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
    createTextPlanes()
    setupScrollAnimation()
  }
}

const captionsContainerRef = ref(null)

onMounted(() => {
  // Scene setup
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a2e)

  // Camera setup
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.x = 0
  camera.position.y = 15
  camera.position.z = -15
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
  const geometry = new THREE.BoxGeometry(visibleWidth, visibleHeight + 2, 20)
  const material = new THREE.MeshBasicMaterial({
    color: '#212529',
    side: THREE.FrontSide,
  })
  box = new THREE.Mesh(geometry, material)
  scene.add(box)
  createCoverBox()
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
