import * as THREE from 'three'

/**
 * Helper to load images
 */
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

/**
 * Build separate cylinder layers for each image (all with the same speed)
 * @param {THREE.CylinderGeometry} geometry - Shared cylinder geometry
 * @param {number} ellipseScaleX - Scale factor for ellipse effect
 * @param {number} speed - Speed for all image layers (default: 0.28)
 * @returns {Promise<Array>} Promise resolving to array of image layer objects
 */
export async function createImageCylinders(geometry, ellipseScaleX = 1.5, speed = 0.28) {
  // Image paths
  const paths = [
    '/images/slide1.png',
    '/images/slide2.png',
    '/images/slide3.png',
    '/images/slide4.png',
    '/images/slide5.png',
    '/images/slide6.png',
  ]
  try {
    const imgs = await Promise.all(paths.map((p) => loadImage(p)))
    console.log('Loaded images:', imgs.length)

    const layers = []

    // Create one layer per image with centered drawing; angular placement is controlled via texture offset
    imgs.forEach((img, idx) => {
      // Build a texture from the original image (no wide cylinder canvas)
      const canvas = document.createElement('canvas')
      // Keep high-res but bounded canvas for crisp textures
      const maxTexWidth = 1024
      const maxTexHeight = 1024
      const scale = Math.min(maxTexWidth / img.width, maxTexHeight / img.height, 1)
      const texW = Math.max(2, Math.floor(img.width * scale))
      const texH = Math.max(2, Math.floor(img.height * scale))
      canvas.width = texW
      canvas.height = texH
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, texW, texH)
      ctx.drawImage(img, 0, 0, texW, texH)

      const texture = new THREE.CanvasTexture(canvas)
      texture.wrapS = THREE.ClampToEdgeWrapping
      texture.wrapT = THREE.ClampToEdgeWrapping
      texture.minFilter = THREE.LinearMipmapLinearFilter
      texture.generateMipmaps = true

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.FrontSide, // Planes will face toward the camera (center)
        transparent: true,
        depthWrite: false,
        depthTest: false,
      })

      // Create a flat plane for each image maintaining aspect ratio
      // Choose a reasonable world size; tweak if needed
      const baseWidth = 380
      const aspect = texH > 0 ? texW / texH : 1
      const planeWidth = baseWidth
      const planeHeight = Math.max(50, Math.floor(planeWidth / Math.max(0.01, aspect)))
      const plane = new THREE.PlaneGeometry(planeWidth, planeHeight)
      const mesh = new THREE.Mesh(plane, material)

      // Alternate slight vertical offsets to reduce overlap
      const cylinderHeight = window.innerHeight
      const yOffset = idx % 2 === 0 ? -cylinderHeight * 0.12 : cylinderHeight * 0.12

      layers.push({
        mesh,
        texture,
        speed,
        phase: idx / imgs.length,
        yOffset,
        isPlane: true,
      })
    })

    return layers
  } catch (err) {
    console.warn('Failed to load image slides:', err)
    return []
  }
}
