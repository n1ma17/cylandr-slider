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
      const canvas = document.createElement('canvas')
      canvas.width = 4096
      canvas.height = 1024
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

      // Horizontal position: draw at center; position around cylinder via texture.offset.x
      const x = Math.floor(canvas.width / 2 - w / 2)

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
        side: THREE.BackSide, // Camera is inside cylinder, only render back faces
        transparent: true,
        depthWrite: false, // Optimize transparent rendering
        depthTest: false, // Reduce depth buffer operations
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.scale.x = ellipseScaleX

      layers.push({ mesh, texture, speed, phase: idx / imgs.length })
    })

    return layers
  } catch (err) {
    console.warn('Failed to load image slides:', err)
    return []
  }
}
