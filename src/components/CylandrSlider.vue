<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const container = ref(null)
let scene, camera, renderer
let animationId
let removeWheelListener
let textCylinders = [] // { mesh, texture, speed }
let sharedGeometry
const ellipseScaleX = 1.5
const scrollDirection = -1 // invert to change movement direction

onMounted(() => {
  initScene()
  setupScrollAnimation()
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
    container.value.innerHTML = `
      <div style="color: white; text-align: center; padding: 50px; font-family: Arial;">
        <h2>WebGL is not available</h2>
        <p>Please enable hardware acceleration in your browser settings or try a different browser.</p>
        <p><a href="https://get.webgl.org/" target="_blank" style="color: #4CAF50;">Test WebGL Support</a></p>
      </div>
    `
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

  // Lines and per-line speeds
  const textLines = [
    'INTERIOR   EXTERIOR   AERIAL    360° PANORAMA   AI    UNREAL ENGINE PRODUCTION    LUXURY VR SHOWCASE EXPERIENCES',
    'TOUCHSCREEN     LED WALL    ON-SITE IMMERSIVE SALES CENTER    IMMEDIATE VISUALIZATION     REAL-TIME UPGRADES',
    'REAL-WORLD OVERLAY DESIGN & PRE-CONSTRUCTION VISUALIZATION      LUXURY SALES CENTER INSTALLATIONS     ARCHITECTURAL STORYTELLING',
  ]
  const speeds = [0.1, 0.07, 0.086]

  // Image speeds - faster than text
  const imageSpeeds = [0.28, 0.28, 0.28, 0.28, 0.28, 0.28]

  // Compute common font size to fit the longest line
  const measureCanvas = document.createElement('canvas')
  measureCanvas.width = 8192
  measureCanvas.height = 4096
  const measureCtx = measureCanvas.getContext('2d')
  const padX = Math.floor(measureCanvas.width * 0.12)
  const drawableWidth = measureCanvas.width - padX * 2
  const baseFontSize = 100
  measureCtx.font = `bold ${baseFontSize}px Arial`
  const maxLineWidth = textLines.reduce((m, t) => Math.max(m, measureCtx.measureText(t).width), 0)
  const scale = Math.min(1, drawableWidth / Math.max(1, maxLineWidth))
  const fontSize = Math.max(232, Math.floor(baseFontSize * scale))

  // Build one cylinder per line
  textCylinders = []
  textLines.forEach((line, idx) => {
    const canvas = document.createElement('canvas')
    canvas.width = measureCanvas.width
    canvas.height = measureCanvas.height / 2
    const ctx = canvas.getContext('2d')

    // Transparent background tile
    ctx.fillStyle = 'rgba(255,255,255,0)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Text style
    ctx.fillStyle = '#383838'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${fontSize}px Arial`

    // Mirror horizontally for inside view
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)

    // Vertical placement (top/middle/bottom)
    const lineSpacing = Math.round(fontSize * 1.35)
    const y = Math.round(canvas.height / 2 + (idx - 1) * lineSpacing)
    ctx.fillText(line, Math.round(canvas.width / 2), y)

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.repeat.set(1, 1)

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
    })

    const mesh = new THREE.Mesh(sharedGeometry, material)
    mesh.scale.x = ellipseScaleX
    scene.add(mesh)

    textCylinders.push({ mesh, texture, speed: speeds[idx] })
  })

  // Add images as separate layers (each with its own speed)
  const imagePaths = [
    '/images/slide1.png',
    '/images/slide2.png',
    '/images/slide3.png',
    '/images/slide4.png',
    '/images/slide5.png',
    '/images/slide6.png',
  ]
  buildImageLayers(imagePaths, imageSpeeds).then((imageLayers) => {
    if (imageLayers && imageLayers.length > 0) {
      imageLayers.forEach((layer) => {
        scene.add(layer.mesh)
        textCylinders.push(layer)
      })
      console.log('Image layers loaded successfully:', imageLayers.length)
    } else {
      console.warn('Image layers failed to load')
    }
  })

  // Add some ambient light
  const light = new THREE.AmbientLight(0xffffff, 1)
  scene.add(light)
}

// Helper to load images
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      console.log('Loaded:', src)
      resolve(img)
    }
    img.onerror = (err) => {
      console.error('Failed to load:', src, err)
      reject(err)
    }
    img.src = src
  })
}

// Build separate cylinder layers for each image (each with its own speed)
async function buildImageLayers(paths, speeds) {
  try {
    const imgs = await Promise.all(paths.map((p) => loadImage(p)))
    console.log('Loaded images:', imgs.length)

    const layers = []

    // Create one layer per image with offset positioning
    imgs.forEach((img, idx) => {
      const canvas = document.createElement('canvas')
      canvas.width = 8192
      canvas.height = 2048
      const ctx = canvas.getContext('2d')

      // Transparent background
      ctx.fillStyle = 'rgba(255,255,255,0)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Mirror for inside view
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)

      // Calculate image size - smaller to avoid overlap
      const maxWidth = canvas.width * 0.08
      const maxHeight = canvas.height * 0.6
      const scale = Math.min(maxWidth / img.width, maxHeight / img.height)
      const w = Math.floor(img.width * scale)
      const h = Math.floor(img.height * scale)

      // Horizontal offset: distribute images across canvas width
      const horizontalSpacing = canvas.width / imgs.length
      const x = Math.floor(horizontalSpacing * idx + horizontalSpacing / 2 - w / 2)

      // Vertical position: alternate top/bottom for more separation
      const verticalOffset = idx % 2 === 0 ? -canvas.height * 0.15 : canvas.height * 0.15
      const y = Math.floor(canvas.height / 2 - h / 2 + verticalOffset)

      ctx.drawImage(img, x, y, w, h)

      const texture = new THREE.CanvasTexture(canvas)
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.ClampToEdgeWrapping
      texture.repeat.set(1, 1)

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true,
      })

      const mesh = new THREE.Mesh(sharedGeometry, material)
      mesh.scale.x = ellipseScaleX

      layers.push({ mesh, texture, speed: speeds[idx] || 0.15 })
    })

    return layers
  } catch (err) {
    console.warn('Failed to load image slides:', err)
    return []
  }
}

function setupScrollAnimation() {
  // ScrollTrigger-based progress mapping (requires scrollable page)
  try {
    ScrollTrigger.create({
      trigger: container.value,
      start: 'top top',
      end: '+=2000',
      scrub: 1,
      onUpdate: (self) => {
        textCylinders.forEach(({ texture, speed }) => {
          texture.offset.x = self.progress * speed * scrollDirection
          texture.needsUpdate = true
        })
      },
    })
  } catch {
    // ignore if ScrollTrigger cannot be created (e.g., no scrollable area)
  }

  // Wheel fallback: moves texture even if page itself doesn't scroll
  const onWheel = (e) => {
    const delta = e.deltaY || 0
    const step = delta * 0.0006 * scrollDirection
    textCylinders.forEach(({ texture, speed }) => {
      gsap.to(texture.offset, {
        x: texture.offset.x + step * speed,
        duration: 0.2,
        ease: 'power2.out',
        onUpdate: () => {
          texture.needsUpdate = true
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
