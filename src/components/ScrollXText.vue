<script setup>
import { onMounted, ref } from 'vue'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const container = ref(null)
const stageRef = ref(null)
const box1Ref = ref(null)
const box2Ref = ref(null)
const box3Ref = ref(null)
const props = defineProps({
  texts: {
    type: Array,
    default: () => ['TEXT ONE', 'TEXT TWO', 'TEXT THREE'],
  },
})

onMounted(() => {
  gsap.to(stageRef.value, {
    scaleX: 4.5,
    rotateX: 0,
    scrollTrigger: {
      trigger: container.value,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1,
      pin: true,
      onComplete: () => {
        gsap.to(box3Ref.value, {
          scaleX: 1,
          rotateX: 0,
          scrollTrigger: {
            trigger: container.value,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 1,
            pin: true,
          },
        })
      },
    },
  })
})
</script>

<template>
  <section class="scroll-x-section" ref="container">
    <div class="stage" ref="stageRef">
      <div class="text-box" ref="box1Ref">{{ props.texts[0] }}</div>
      <div class="text-box" ref="box2Ref">{{ props.texts[1] }}</div>
      <div class="text-box" ref="box3Ref">{{ props.texts[2] }}</div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.scroll-x-section {
  height: 500vh;
  width: 100vw;
  background: linear-gradient(to bottom, #0a0a0a 0%, #1a1a2e 50%, #0f0f23 100%);
  color: #fff;
  font-size: 2rem;
  font-weight: bold;
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  perspective: 2000px;
  perspective-origin: 50% 50%;

  .stage {
    margin-top: 200px;
    width: 300px;
    height: fit-content;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    transform: translateZ(100px) rotateX(32deg) scaleX(1);
    transform-origin: 50% 50%;
  }
}
</style>
