<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { createTextCylinders } from '../composables/useTextCylinders'
import { createImageCylinders } from '../composables/useImageCylinders'

gsap.registerPlugin(ScrollTrigger)

const container = ref(null)
let scene, camera, renderer
let animationId
let removeWheelListener
let currentScrollProgress = 0
let textCylinders = [] // { mesh, texture, speed }
let sharedGeometry
const ellipseScaleX = 1.5
const scrollDirection = -1 // invert to change movement direction

onMounted(() => {
  initScene()
  animate()
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  if (renderer) {
    renderer.dispose()
  }
  if (removeWheelListener) {
    removeWheelListener()
  }
  if (ScrollTrigger) {
    ScrollTrigger.getAll().forEach((t) => t.kill())
  }
})

function initScene() {
  // Scene
  scene = new THREE.Scene()
  scene.background = null // Transparent to see background image

  // Camera - positioned at the center of the cylinder
  const aspect = window.innerWidth / window.innerHeight
  camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000)
  camera.position.set(0, 0, 0) // Camera at the center

  // Renderer with transparent background
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setClearColor(0x000000, 0) // Transparent
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    container.value.appendChild(renderer.domElement)
  } catch (error) {
    console.error('WebGL not supported:', error)
    return
  }

  // Geometry shared by all text layers
  const cylinderHeight = window.innerHeight
  const cylinderRadius = 665
  const cylinderSegments = 64
  sharedGeometry = new THREE.CylinderGeometry(
    cylinderRadius,
    cylinderRadius,
    cylinderHeight,
    cylinderSegments,
    1,
    true,
  )

  // Create text cylinders using the composable
  textCylinders = createTextCylinders(scene, sharedGeometry, ellipseScaleX)

  // Create image cylinders using the composable
  createImageCylinders(sharedGeometry, ellipseScaleX).then((imageLayers) => {
    if (imageLayers && imageLayers.length > 0) {
      imageLayers.forEach((layer) => {
        scene.add(layer.mesh)
        textCylinders.push(layer)
      })
      console.log('Image layers loaded successfully:', imageLayers.length)
      // Set initial offsets so no image is centered at start
      const startPhaseOffset = 1 / imageLayers.length
      textCylinders.forEach((layer) => {
        if (typeof layer.phase === 'number') {
          layer.texture.offset.x =
            (startPhaseOffset + layer.phase - currentScrollProgress) * scrollDirection
          layer.texture.needsUpdate = true
        }
      })
      // Initialize scroll with distance sized to number of images
      setupScrollAnimation(imageLayers.length)
    } else {
      console.warn('Image layers failed to load')
    }
  })

  // Add some ambient light
  const light = new THREE.AmbientLight(0xffffff, 1)
  scene.add(light)
}

function setupScrollAnimation(imageCount) {
  // Compute total scroll distance sized to number of images (fallback if missing)
  const scrollDistancePerImage = 500
  const totalScrollDistance =
    imageCount && imageCount > 0 ? imageCount * scrollDistancePerImage : 2000
  const startPhaseOffset = imageCount && imageCount > 0 ? 1 / imageCount : 0

  // ScrollTrigger-based progress mapping (requires scrollable page)
  try {
    ScrollTrigger.create({
      trigger: container.value,
      start: 'top top',
      end: `+=${totalScrollDistance}`,
      scrub: 1,
      onUpdate: (self) => {
        currentScrollProgress = self.progress
        textCylinders.forEach((layer) => {
          if (typeof layer.phase === 'number') {
            // Image layers: one-by-one entry; last image reaches center at progress 1
            layer.texture.offset.x =
              (startPhaseOffset + layer.phase - currentScrollProgress) * scrollDirection
          } else {
            // Text layers: continuous scroll
            layer.texture.offset.x = currentScrollProgress * layer.speed * scrollDirection
          }
          layer.texture.needsUpdate = true
        })
      },
    })
  } catch {
    // ignore if ScrollTrigger cannot be created (e.g., no scrollable area)
  }

  // Wheel fallback: emulate progress in [0,1] so scroll ends at last image
  const onWheel = (e) => {
    const delta = e.deltaY || 0
    // Map wheel delta to progress in [0,1] based on total scroll distance
    const progressDelta = delta / totalScrollDistance
    const newProgress = Math.max(0, Math.min(1, currentScrollProgress + progressDelta))
    currentScrollProgress = newProgress

    textCylinders.forEach((layer) => {
      const targetX =
        typeof layer.phase === 'number'
          ? (startPhaseOffset + layer.phase - currentScrollProgress) * scrollDirection
          : currentScrollProgress * layer.speed * scrollDirection
      gsap.to(layer.texture.offset, {
        x: targetX,
        duration: 0.2,
        ease: 'power2.out',
        onUpdate: () => {
          layer.texture.needsUpdate = true
        },
      })
    })
  }
  window.addEventListener('wheel', onWheel, { passive: true })
  removeWheelListener = () => window.removeEventListener('wheel', onWheel)
}

function animate() {
  animationId = requestAnimationFrame(animate)

  // No rotation - static view
  renderer.render(scene, camera)
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)

  // Update shared geometry and apply to all text cylinders
  const cylinderHeight = window.innerHeight
  const cylinderRadius = 665
  const cylinderSegments = 64
  const newGeometry = new THREE.CylinderGeometry(
    cylinderRadius,
    cylinderRadius,
    cylinderHeight,
    cylinderSegments,
    1,
    true,
  )
  if (sharedGeometry) sharedGeometry.dispose()
  sharedGeometry = newGeometry
  textCylinders.forEach(({ mesh }) => {
    mesh.geometry.dispose()
    mesh.geometry = sharedGeometry
    mesh.scale.x = ellipseScaleX
  })
}
</script>

<template>
  <div ref="container" class="cylandr-container"></div>
</template>

<style scoped>
.cylandr-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  margin: 0;
  padding: 0;
  background-color: #000000;
  background-image: url('/images/background.png');

  background-position: center;
  background-repeat: repeat;
}

/* .cylandr-container :deep(canvas) {
  position: relative;
  z-index: 10;
} */
</style>
