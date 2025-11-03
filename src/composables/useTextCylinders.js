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
  const textCylinders = []
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

    const mesh = new THREE.Mesh(geometry, material)
    mesh.scale.x = ellipseScaleX
    scene.add(mesh)

    textCylinders.push({ mesh, texture, speed: speeds[idx] })
  })

  return textCylinders
}
