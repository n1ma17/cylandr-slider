import * as THREE from 'three'

/**
 * Creates text cylinder layers for the 3D slider
 * @param {THREE.Scene} scene - The THREE.js scene
 * @param {THREE.CylinderGeometry} geometry - Shared cylinder geometry
 * @param {number} ellipseScaleX - Scale factor for ellipse effect
 * @returns {Array} Array of text cylinder objects with mesh, texture, and speed
 */
export function createTextCylinders(scene, geometry, ellipseScaleX = 1.5) {
  // Lines and per-line speeds
  const textLines = [
    'INTERIOR   EXTERIOR   AERIAL    360° PANORAMA   AI    UNREAL ENGINE PRODUCTION    LUXURY VR SHOWCASE EXPERIENCES',
    'TOUCHSCREEN     LED WALL    ON-SITE IMMERSIVE SALES CENTER    IMMEDIATE VISUALIZATION     REAL-TIME UPGRADES',
    'REAL-WORLD OVERLAY DESIGN & PRE-CONSTRUCTION VISUALIZATION      LUXURY SALES CENTER INSTALLATIONS     ARCHITECTURAL STORYTELLING',
  ]
  const speeds = [0.1, 0.07, 0.086]

  // Compute common font size to fit the longest line
  const measureCanvas = document.createElement('canvas')
  measureCanvas.width = 6144
  measureCanvas.height = 3072
  const measureCtx = measureCanvas.getContext('2d')
  const padX = Math.floor(measureCanvas.width * 0.12)
  const drawableWidth = measureCanvas.width - padX * 2
  const baseFontSize = 100
  measureCtx.font = `bold ${baseFontSize}px Arial`
  const maxLineWidth = textLines.reduce((m, t) => Math.max(m, measureCtx.measureText(t).width), 0)
  const scale = Math.min(1, drawableWidth / Math.max(1, maxLineWidth))
  const fontSize = Math.max(232, Math.floor(baseFontSize * scale))

  // Helper to create a texture for a line with a given color
  function buildLineTexture(line, idx, color, fontSize, baseWidth, baseHeight) {
    const canvas = document.createElement('canvas')
    canvas.width = baseWidth
    canvas.height = baseHeight / 2
    const ctx = canvas.getContext('2d')

    // Transparent background tile
    ctx.fillStyle = 'rgba(255,255,255,0)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Text style
    ctx.fillStyle = color
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
    return texture
  }

  // Build one cylinder per line
  const textCylinders = []
  textLines.forEach((line, idx) => {
    // Build a white text texture; we'll tint via material.color for smooth fades
    const activeTexture = buildLineTexture(
      line,
      idx,
      '#ffffff',
      fontSize,
      measureCanvas.width,
      measureCanvas.height,
    )

    // Always use white texture as the map; start colored gray
    const material = new THREE.MeshBasicMaterial({
      map: activeTexture,
      side: THREE.BackSide, // Camera is inside cylinder, only render back faces
      transparent: true,
      depthWrite: false, // Optimize transparent rendering
      depthTest: false, // Reduce depth buffer operations
    })
    material.color = new THREE.Color('#383838')

    const mesh = new THREE.Mesh(geometry, material)
    mesh.scale.x = ellipseScaleX
    mesh.renderOrder = 1 // Text renders first (behind images)
    scene.add(mesh)

    textCylinders.push({
      type: 'text',
      index: idx,
      mesh,
      material,
      texture: activeTexture,
      inactiveTexture: null,
      activeTexture,
      speed: speeds[idx],
    })
  })

  return textCylinders
}
