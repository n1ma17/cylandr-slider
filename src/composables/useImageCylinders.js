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
 * Build separate plane layers for each image (all with the same speed)
 * @param {number} cylinderRadius - Radius of the cylinder path
 * @param {number} ellipseScaleX - Scale factor for ellipse effect
 * @param {number} speed - Speed for all image layers (default: 0.28)
 * @returns {Promise<Array>} Promise resolving to array of image layer objects
 */
export async function createImageCylinders(cylinderRadius = 665, ellipseScaleX = 1.5, speed = 0.28) {
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

    // Create one plane per image
    imgs.forEach((img, idx) => {
      // Calculate aspect ratio and size for plane
      const aspectRatio = img.width / img.height
      const planeHeight = 400
      const planeWidth = planeHeight * aspectRatio

      // Create plane geometry
      const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight)

      const texture = new THREE.Texture(img)
      texture.needsUpdate = true

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.renderOrder = 10 // Images render last (in front of text)

      // Vertical position: alternate top/bottom for more separation
      const verticalOffset = idx % 2 === 0 ? -150 : 150
      mesh.position.y = verticalOffset

      // Initial angle position around the cylinder
      const angleOffset = (idx / imgs.length) * Math.PI * 2
      const x = Math.sin(angleOffset) * cylinderRadius * ellipseScaleX
      const z = -Math.cos(angleOffset) * cylinderRadius
      mesh.position.set(x, mesh.position.y, z)
      
      // Make plane face the center (camera)
      mesh.lookAt(0, mesh.position.y, 0)

      layers.push({ 
        mesh, 
        speed, 
        phase: idx / imgs.length,
        cylinderRadius,
        ellipseScaleX,
        angle: angleOffset,
      })
    })

    return layers
  } catch (err) {
    console.warn('Failed to load image slides:', err)
    return []
  }
}
