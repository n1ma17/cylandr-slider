<script setup>
import { onMounted, ref } from 'vue'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const container = ref(null)
const textSectionRef = ref(null)
const lastTextRef = ref(null)

onMounted(() => {
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: container.value,
      start: 'top top',
      end: '+=350%', // Scroll distance
      scrub: 1,
      pin: true,
      // markers: true // for debugging
    },
  })
  // Text animation: Street effect
  tl.fromTo(
    textSectionRef.value,
    {
      y: -900, // Start high/far
      z: -5000, // Far away
      transform: 'rotateX(80deg)', // Tilted back as requested
      opacity: 0,
    },
    {
      y: -50,
      z: 500, // Move closer
      opacity: 1,
      ease: 'sine.inOut',
      duration: 5,
    },
  )
  tl.fromTo(
    lastTextRef.value,
    {
      y: -900, // Start high/far
      z: -5000, // Far away
      transform: 'rotateX(0deg)', // Tilted back as requested
      opacity: 0,
    },
    {
      y: -50,
      z: 500, // Move closer
      opacity: 1,
      ease: 'sine.inOut',
      duration: 5,
    },
  )

  // Animate lastText rotateX to 0 after main animation
  tl.to(lastTextRef.value, {
    transform: 'rotateX(100deg)',
    ease: 'sine.inOut',
    duration: 3,
  })
})
</script>

<template>
  <div class="main-wrapper" ref="container">
    <div class="perspective-container">
      <div class="crawl-content" ref="textSectionRef">
        <div class="title" ref="textSection">
          <p>Episode IV</p>
          <h1>A NEW HOPE</h1>
        </div>
        <div class="title" ref="textSection">
          <p>Episode IV</p>
          <h1>A NEW HOPE</h1>
        </div>
      </div>
      <div class="crawl-content">
        <div class="title" ref="lastTextRef">
          <p>Episode IV</p>
          <h1>A NEW HOPE</h1>
        </div>

      </div>
    </div>
    <div class="scroll-instruction">
      <span>SCROLL TO WARP</span>
      <div class="arrow">↓</div>
    </div>
  </div>
</template>

<style>
:root {
  --crawl-color: #feda4a;
}

body {
  margin: 0;
  padding: 0;
  background-color: #000;
  overflow-x: hidden;
  font-family: 'Pathway Gothic One', sans-serif;
  color: var(--crawl-color);
}

.main-wrapper {
  height: 100vh;
  width: 100%;
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

.perspective-container {
  perspective: 3500px; /* The magic number for the slant */
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  z-index: 10;
}

.crawl-content {
  width: 80%;
  max-width: 800px;
  text-align: justify;
  font-size: 3rem; /* Large text */
  line-height: 1.5;
  font-weight: 700;
  transform-origin: 50% 50%;
  /* transform: rotateX(25deg); Removed to let GSAP handle it */
  position: absolute;
  /* bottom: -10%; Removed */
}

.title {
  text-align: center;
  margin-bottom: 50px;
}

.title h1 {
  margin: 0;
  font-size: 5rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
}

.title p {
  margin: 0;
  font-size: 2rem;
  letter-spacing: 0.15em;
}

.scroll-instruction {
  position: absolute;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  color: white;
  font-family: sans-serif;
  font-size: 0.8rem;
  opacity: 0.5;
  text-align: center;
  z-index: 20;
  animation: fadeOut 1s forwards;
  animation-delay: 2s; /* Fade out after a bit */
}

/* Hide scroll instruction when scrolling starts (optional, handled by opacity) */
</style>
