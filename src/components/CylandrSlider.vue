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
let textCylinders = [] // { mesh, texture, speed } or { mesh, speed, angle, phase }
let sharedGeometry
let activeTweens = new Map() // Track active tweens per layer to prevent spam
let resizeTimeout = null // Debounce resize events
let lastWindowSize = { width: 0, height: 0 } // Track size changes
const ellipseScaleX = 1.5
const cylinderRadius = 665
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
    renderer.sortObjects = true // Enable render order sorting
    container.value.appendChild(renderer.domElement)
  } catch (error) {
    console.error('WebGL not supported:', error)
    return
  }

  // Geometry shared by all text layers (curved cylinders)
  const cylinderHeight = window.innerHeight
  const cylinderSegments = 64
  sharedGeometry = new THREE.CylinderGeometry(
    cylinderRadius,
    cylinderRadius,
    cylinderHeight,
    cylinderSegments,
    1,
    true,
  )

  // Create text cylinders (curved) using the composable
  textCylinders = createTextCylinders(scene, sharedGeometry, ellipseScaleX)

  // Create image planes (flat) using the composable
  createImageCylinders(cylinderRadius, ellipseScaleX).then((imageLayers) => {
    if (imageLayers && imageLayers.length > 0) {
      imageLayers.forEach((layer) => {
        scene.add(layer.mesh)
        textCylinders.push(layer)
      })
      console.log('Image layers loaded successfully:', imageLayers.length)
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
function updateLayersForProgress(
  progress,
  startPhaseOffset,
  useDirectUpdate = false,
  updateImages = true,
) {
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

  textCylinders.forEach((layer, idx) => {
    if (typeof layer.phase === 'number') {
      if (!updateImages) {
        return
      }
      // Image layers (flat planes) - move position on cylinder path
      const targetAngle =
        (startPhaseOffset + layer.phase - easedProgress) * scrollDirection * Math.PI * 2
      const targetX = Math.sin(targetAngle) * layer.cylinderRadius * layer.ellipseScaleX
      const targetZ = -Math.cos(targetAngle) * layer.cylinderRadius

      if (useDirectUpdate) {
        layer.mesh.position.x = targetX
        layer.mesh.position.z = targetZ
        layer.mesh.lookAt(0, layer.mesh.position.y, 0)
        layer.angle = targetAngle
      } else {
        const existingTween = activeTweens.get(idx)
        if (existingTween) {
          existingTween.kill()
        }
        const tween = gsap.to(layer.mesh.position, {
          x: targetX,
          z: targetZ,
          duration: 0.4, // Increased for smoother movement
          ease: 'power2.out',
          onUpdate: () => {
            layer.mesh.lookAt(0, layer.mesh.position.y, 0)
          },
          onComplete: () => {
            activeTweens.delete(idx)
            layer.angle = targetAngle
          },
        })
        activeTweens.set(idx, tween)
      }
    } else if (layer.type === 'text') {
      // Text layers (curved cylinders) - use texture offset
      const factor = textColorFactors[layer.index]
      layer.material.color.copy(COLOR_GRAY).lerp(COLOR_WHITE, factor)
      const targetX = easedProgress * scrollDirection * layer.speed

      if (useDirectUpdate) {
        layer.texture.offset.x = targetX
      } else {
        const existingTween = activeTweens.get(idx)
        if (existingTween) {
          existingTween.kill()
        }
        const tween = gsap.to(layer.texture.offset, {
          x: targetX,
          duration: 0.3, // Increased for smoother text movement
          ease: 'power2.out',
          onComplete: () => {
            activeTweens.delete(idx)
          },
        })
        activeTweens.set(idx, tween)
      }
    }
  })
}

function setupScrollAnimation(imageCount) {
  // Compute total scroll distance sized to number of images (fallback if missing)
  const scrollDistancePerImage = 700
  const totalScrollDistance =
    imageCount && imageCount > 0 ? imageCount * scrollDistancePerImage : 2000
  const startPhaseOffset = imageCount && imageCount > 0 ? 1 / imageCount : 0

  // Create snap points for each image
  const snapPoints = []
  if (imageCount > 0) {
    for (let i = 0; i < imageCount; i++) {
      snapPoints.push(i / imageCount)
    }
  }

  // ScrollTrigger-based progress mapping with snap
  try {
    ScrollTrigger.create({
      trigger: container.value,
      start: 'top top',
      end: `+=${totalScrollDistance}`,
      scrub: 0.5, // Lower value = smoother
      snap: {
        snapTo: snapPoints,
        duration: { min: 0.3, max: 0.6 },
        ease: 'sine.inOut',
      },
      onUpdate: (self) => {
        currentScrollProgress = self.progress
        updateLayersForProgress(currentScrollProgress, startPhaseOffset, true, false)
      },
    })
  } catch {
    // ignore if ScrollTrigger cannot be created (e.g., no scrollable area)
  }

  // Wheel fallback: staged carousel transition with non-uniform speeds
  let isTransitioning = false
  const imageLayers = textCylinders.filter((l) => typeof l.phase === 'number')
  const angleStep = (Math.PI * 2) / Math.max(1, imageCount)

  function normalizeAngle(a) {
    let x = a % (Math.PI * 2)
    if (x > Math.PI) x -= Math.PI * 2
    if (x < -Math.PI) x += Math.PI * 2
    return x
  }

  function updateMeshForLayer(layer) {
    const x = Math.sin(layer.angle) * layer.cylinderRadius * layer.ellipseScaleX
    const z = -Math.cos(layer.angle) * layer.cylinderRadius
    layer.mesh.position.x = x
    layer.mesh.position.z = z
    layer.mesh.lookAt(0, layer.mesh.position.y, 0)
  }

  function findCurrentIndex() {
    let minAbs = Infinity
    let idx = 0
    imageLayers.forEach((layer, i) => {
      const d = Math.abs(normalizeAngle(layer.angle))
      if (d < minAbs) {
        minAbs = d
        idx = i
      }
    })
    return idx
  }

  function performTransition(direction) {
    if (isTransitioning || imageLayers.length === 0) return
    isTransitioning = true

    const prevIndex = findCurrentIndex()
    const targetIndex = (prevIndex + direction + imageLayers.length) % imageLayers.length

    let completed = 0
    const total = imageLayers.length

    imageLayers.forEach((layer, j) => {
      // Compute final angle: rotate whole ring by one step
      // Keep angles unbounded to avoid wrapping across the front (no re-cross)
      const finalAngle = layer.angle - direction * angleStep
      const idxInMixed = textCylinders.indexOf(layer)
      const existing = activeTweens.get(idxInMixed)
      if (existing) existing.kill()

      // Variable durations
      let duration = 0.45
      let delay = 0
      let ease = 'power2.out'

      // Outgoing (current center) leaves FIRST, quick start
      if (j === prevIndex) {
        duration = 0.42
        delay = 0 // start immediately
        ease = 'power3.in' // accelerate out of center
        // Incoming starts SLIGHTLY after outgoing begins
      } else if (j === targetIndex) {
        duration = 0.5 // arrives a bit later
        delay = 0.12 // start after current begins leaving
        ease = 'power3.out' // smooth arrival
      } else {
        // Speed decreases near current image (longer duration when closer)
        let deltaSteps = Math.abs(j - prevIndex)
        deltaSteps = Math.min(deltaSteps, imageLayers.length - deltaSteps)
        const norm = imageLayers.length <= 1 ? 1 : deltaSteps / (imageLayers.length / 2)
        const clamped = Math.max(0, Math.min(1, norm))
        duration = 0.35 + (1 - clamped) * 0.45
        // slight stagger so ring feels organic
        delay = 0.04 * (direction > 0 ? j : imageLayers.length - j)
      }

      const tween = gsap.to(layer, {
        angle: finalAngle,
        duration,
        delay,
        ease,
        onUpdate: () => updateMeshForLayer(layer),
        onComplete: () => {
          activeTweens.delete(idxInMixed)
          completed += 1
          if (completed === total) {
            isTransitioning = false
            // Snap text to new image index
            const progressForText = targetIndex / Math.max(1, imageCount)
            updateLayersForProgress(progressForText, 1 / Math.max(1, imageCount), true, false)
          }
        },
      })
      activeTweens.set(idxInMixed, tween)
    })
  }

  const onWheel = (e) => {
    const delta = e.deltaY || 0
    if (delta === 0) return
    // Determine direction: down => next (+1), up => prev (-1)
    const direction = delta > 0 ? 1 : -1
    performTransition(direction)
  }

  window.addEventListener('wheel', onWheel, { passive: false })
  removeWheelListener = () => {
    window.removeEventListener('wheel', onWheel)
  }
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

    textCylinders.forEach((layer) => {
      if (layer.type === 'text') {
        layer.mesh.geometry.dispose()
        layer.mesh.geometry = sharedGeometry
        layer.mesh.scale.x = ellipseScaleX
      }
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
