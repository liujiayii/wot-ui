<template>
  <wd-root-portal v-if="useRootPortal">
    <view class="wd-popup-wrapper">
      <wd-overlay
        v-if="modal"
        :show="modelValue"
        :z-index="zIndex"
        :lock-scroll="lockScroll"
        :duration="duration"
        :custom-style="modalStyle"
        @click="handleClickModal"
        @touchmove="noop"
      />
      <wd-transition
        :lazy-render="lazyRender"
        :custom-class="rootClass"
        :custom-style="style"
        :duration="duration"
        :show="modelValue"
        :name="transitionName"
        :destroy="hideWhenClose"
        @before-enter="emit('before-enter')"
        @enter="emit('enter')"
        @after-enter="emit('after-enter')"
        @before-leave="emit('before-leave')"
        @leave="emit('leave')"
        @after-leave="emit('after-leave')"
      >
        <slot />
        <wd-icon v-if="closable" custom-class="wd-popup__close" :custom-style="closeStyle" name="close" @click="close" />
      </wd-transition>
    </view>
  </wd-root-portal>

  <!-- 非传送模式 -->
  <view v-else class="wd-popup-wrapper">
    <wd-overlay
      v-if="modal"
      :show="modelValue"
      :z-index="zIndex"
      :lock-scroll="lockScroll"
      :duration="duration"
      :custom-style="modalStyle"
      @click="handleClickModal"
      @touchmove="noop"
    />
    <wd-transition
      :lazy-render="lazyRender"
      :custom-class="rootClass"
      :custom-style="style"
      :duration="duration"
      :show="modelValue"
      :name="transitionName"
      :destroy="hideWhenClose"
      @before-enter="emit('before-enter')"
      @enter="emit('enter')"
      @after-enter="emit('after-enter')"
      @before-leave="emit('before-leave')"
      @leave="emit('leave')"
      @after-leave="emit('after-leave')"
    >
      <slot />
      <wd-icon v-if="closable" custom-class="wd-popup__close" :custom-style="closeStyle" name="close" @click="close" />
    </wd-transition>
  </view>
</template>

<script lang="ts">
export default {
  name: 'wd-popup',
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
import { computed, onBeforeMount, ref } from 'vue'
import wdIcon from '../wd-icon/wd-icon.vue'
import wdOverlay from '../wd-overlay/wd-overlay.vue'
import wdTransition from '../wd-transition/wd-transition.vue'
import wdRootPortal from '../wd-root-portal/wd-root-portal.vue'
import { popupProps } from './types'
import type { TransitionName } from '../wd-transition/types'
import { getSystemInfo } from '../../common/util'

const props = defineProps(popupProps)
const emit = defineEmits([
  'update:modelValue',
  'before-enter',
  'enter',
  'before-leave',
  'leave',
  'after-leave',
  'after-enter',
  'click-modal',
  'close'
])

/**
 * 是否通过 root-portal 挂载
 * 抖音端自定义组件内 position:fixed 无法正常工作（官方建议 root-portal 方案），
 * 因此抖音端强制走 root-portal 挂载，其余平台遵循 rootPortal 属性
 */
const useRootPortal = computed(() => {
  let portal = props.rootPortal
  // #ifdef MP-TOUTIAO
  portal = true
  // #endif
  return portal
})

/**
 * 弹出位置
 */
const transitionName = computed<TransitionName | TransitionName[]>(() => {
  if (props.transition) {
    return props.transition
  }
  if (props.position === 'center') {
    return ['zoom-in', 'fade']
  }
  if (props.position === 'left') {
    return 'slide-left'
  }
  if (props.position === 'right') {
    return 'slide-right'
  }
  if (props.position === 'bottom') {
    return 'slide-up'
  }
  if (props.position === 'top') {
    return 'slide-down'
  }
  return 'slide-up'
})

const safeBottom = ref<number>(0)

/**
 * 抖音端样式隔离不支持 styleIsolation: shared，
 * .wd-popup 的定位样式写在 wd-popup 的 ttss 中无法命中由 wd-transition
 * 渲染的节点，因此抖音端将定位与外观关键样式以内联方式写入
 * （内联样式不受样式隔离限制），其余平台返回空串、走 ttss。
 */
const douyinPositionStyle = computed(() => {
  let positionStyle = ''
  // #ifdef MP-TOUTIAO
  const radius = 'var(--wot-popup-radius, 16px)'
  const base = 'position:fixed;max-height:100%;overflow-y:auto;background:var(--wot-popup-bg, #fff);'
  const positionMap: Record<string, string> = {
    center: 'left:50%;top:50%;transform:translate3d(-50%,-50%,0);transform-origin:0 0;',
    left: 'top:0;bottom:0;left:0;',
    right: 'top:0;right:0;bottom:0;',
    top: 'top:0;left:0;right:0;',
    bottom: 'right:0;bottom:0;left:0;'
  }
  const radiusMap: Record<string, string> = {
    center: `border-radius:${radius};`,
    left: `border-radius:0 ${radius} ${radius} 0;`,
    right: `border-radius:${radius} 0 0 ${radius};`,
    top: `border-radius:0 0 ${radius} ${radius};`,
    bottom: `border-radius:${radius} ${radius} 0 0;`
  }
  positionStyle = base + (positionMap[props.position] || '') + (props.round ? radiusMap[props.position] || '' : '')
  // #endif
  return positionStyle
})

const style = computed(() => {
  return `z-index:${props.zIndex}; padding-bottom: ${safeBottom.value}px;${douyinPositionStyle.value}${props.customStyle}`
})

/**
 * 关闭图标样式
 * `.wd-popup .wd-popup__close` 是跨组件作用域的后代选择器（wd-popup 节点由
 * wd-transition 渲染），抖音样式隔离下无法命中，因此抖音端以内联方式写入，
 * 其余平台返回空串、走 ttss。
 */
const closeStyle = computed(() => {
  let style = ''
  // #ifdef MP-TOUTIAO
  style =
    'position:absolute;top:var(--wot-popup-close-margin, 12px);right:var(--wot-popup-close-margin, 12px);color:var(--wot-popup-close-color, var(--wot-icon-auxiliary, #868a9c));font-size:var(--wot-popup-close-size, 24px);'
  // #endif
  return style
})

const rootClass = computed(() => {
  return `wd-popup wd-popup--${props.position} ${!props.transition && props.position === 'center' ? 'is-deep' : ''} ${
    props.round ? 'is-round' : ''
  } ${props.customClass || ''}`
})

onBeforeMount(() => {
  if (props.safeAreaInsetBottom) {
    const { safeArea, screenHeight, safeAreaInsets } = getSystemInfo()

    if (safeArea) {
      // #ifdef MP-WEIXIN
      safeBottom.value = screenHeight - (safeArea!.bottom || 0)
      // #endif
      // #ifndef MP-WEIXIN
      safeBottom.value = safeAreaInsets ? safeAreaInsets.bottom : 0
      // #endif
    } else {
      safeBottom.value = 0
    }
  }
})

function handleClickModal() {
  emit('click-modal')
  if (props.closeOnClickModal) {
    close()
  }
}

function close() {
  emit('close')
  emit('update:modelValue', false)
}
function noop() {}
</script>

<style lang="scss">
@use './index.scss';
</style>
