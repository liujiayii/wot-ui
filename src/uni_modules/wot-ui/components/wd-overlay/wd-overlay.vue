<template>
  <wd-transition
    :show="show"
    name="fade"
    :custom-class="`wd-overlay ${customClass}`"
    :duration="duration"
    :custom-style="`z-index: ${zIndex}; ${overlayStyle}${customStyle}`"
    :disable-touch-move="lockScroll"
    @before-enter="emit('before-enter')"
    @enter="emit('enter')"
    @after-enter="emit('after-enter')"
    @before-leave="emit('before-leave')"
    @leave="emit('leave')"
    @after-leave="emit('after-leave')"
    @click="handleClick"
  >
    <slot></slot>
  </wd-transition>
</template>
<script lang="ts">
export default {
  name: 'wd-overlay',
  options: {
    // #ifndef MP-TOUTIAO
    virtualHost: true,
    // #endif
    addGlobalClass: true,
    styleIsolation: 'shared'
  }
}
</script>

<script lang="ts" setup>
import { computed } from 'vue'
import wdTransition from '../wd-transition/wd-transition.vue'
import { overlayProps } from './types'
// #ifdef H5
import { useLockScroll } from '../../composables/useLockScroll'
// #endif

const props = defineProps(overlayProps)

const emit = defineEmits(['click', 'before-enter', 'enter', 'after-enter', 'before-leave', 'leave', 'after-leave'])

/**
 * 抖音端样式隔离不支持 styleIsolation: shared，
 * .wd-overlay 定位样式写在组件 ttss 中无法命中由 wd-transition 渲染的节点，
 * 因此抖音端将定位与背景以内联方式写入（内联样式不受样式隔离限制），
 * 其余平台返回空串、走 ttss。
 */
const overlayStyle = computed(() => {
  let style = ''
  // #ifdef MP-TOUTIAO
  style = 'position:fixed;left:0;top:0;right:0;bottom:0;background:var(--wot-overlay-bg, #0000008C);'
  // #endif
  return style
})

function handleClick() {
  emit('click')
}

// #ifdef H5
useLockScroll(() => props.show && props.lockScroll)
// #endif
</script>

<style lang="scss">
@use './index.scss';
</style>
