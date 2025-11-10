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
let activeTweens = new Map() // Track active tweens per layer to prevent spam
let resizeTimeout = null // Debounce resize events
let lastWindowSize = { width: 0, height: 0 } // Track size changes
const ellipseScaleX = 1.5
const scrollDirection = 1 // 1 = left to right, -1 = right to left
const COLOR_WHITE = new THREE.Color('#ffffff')
const COLOR_GRAY = new THREE.Color('#383838')

// Easing function for smooth slow-down at center
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

onMounted(() => {
  initScene()
  animate()
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  if (renderer) {
    renderer.dispose()
  }
  if (removeWheelListener) {
    removeWheelListener()
  }
  // Kill all active tweens
  activeTweens.forEach((tween) => tween.kill())
  activeTweens.clear()
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

// Shared function to update layer positions and colors based on scroll progress
function updateLayersForProgress(progress, startPhaseOffset, useDirectUpdate = false) {
  const t = Math.min(2.999999, progress * 3)
  const segmentIndex = Math.floor(t)
  const a = t - segmentIndex

  // Pre-compute color factors for all text layers (cache calculation)
  const textColorFactors = [0, 0, 0]
  if (segmentIndex >= 0 && segmentIndex < 3) {
    textColorFactors[segmentIndex] = 1 - a
    if (segmentIndex + 1 < 3) {
      textColorFactors[segmentIndex + 1] = a
    }
  }
  if (segmentIndex === 2) {
    textColorFactors[2] = 1
  }

  // Apply global easing based on image count
  const imageCount = textCylinders.filter((l) => typeof l.phase === 'number').length
  let easedProgress = progress

  if (imageCount > 0) {
    // Divide progress into segments, one per image
    const progressPerImage = 1 / imageCount

    // Find which image segment we're in
    const segmentIdx = Math.floor(progress / progressPerImage)
    const localProgress = (progress % progressPerImage) / progressPerImage

    // Apply easing to this segment's local progress
    const easedLocal = easeInOutCubic(localProgress)

    // Reconstruct global eased progress
    easedProgress = (segmentIdx + easedLocal) * progressPerImage
  }

  // Pre-compute common values
  const progressTimesDirection = easedProgress * scrollDirection

  textCylinders.forEach((layer, idx) => {
    let targetX
    if (typeof layer.phase === 'number') {
      // Image layers - use eased progress
      targetX = (startPhaseOffset + layer.phase - easedProgress) * scrollDirection
    } else if (layer.type === 'text') {
      // Text layers with color crossfade - use cached factor
      const factor = textColorFactors[layer.index]
      layer.material.color.copy(COLOR_GRAY).lerp(COLOR_WHITE, factor)
      targetX = progressTimesDirection * layer.speed
    }

    if (useDirectUpdate) {
      // Direct update for ScrollTrigger (no animation needed)
      layer.texture.offset.x = targetX
    } else {
      // Smooth animation for wheel events
      const existingTween = activeTweens.get(idx)
      if (existingTween) {
        existingTween.kill()
      }
      const tween = gsap.to(layer.texture.offset, {
        x: targetX,
        duration: 0.2,
        ease: 'power2.out',
        onComplete: () => {
          activeTweens.delete(idx)
        },
      })
      activeTweens.set(idx, tween)
    }
  })
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
        updateLayersForProgress(currentScrollProgress, startPhaseOffset, true)
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
    updateLayersForProgress(currentScrollProgress, startPhaseOffset, false)
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
  // Debounce resize events (300ms)
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }

  resizeTimeout = setTimeout(() => {
    const currentWidth = window.innerWidth
    const currentHeight = window.innerHeight

    // Only update if size actually changed
    if (currentWidth === lastWindowSize.width && currentHeight === lastWindowSize.height) {
      return
    }

    lastWindowSize.width = currentWidth
    lastWindowSize.height = currentHeight

    camera.aspect = currentWidth / currentHeight
    camera.updateProjectionMatrix()
    renderer.setSize(currentWidth, currentHeight)

    // Update shared geometry and apply to all text cylinders
    const cylinderHeight = currentHeight
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
  }, 300)
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
