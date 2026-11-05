import { defineConfig, type Plugin } from 'vite'

import uni from '@dcloudio/vite-plugin-uni'
import Components from '@uni-helper/vite-plugin-uni-components'

/**
 * 抖音小程序 AppService 环境未提供 globalThis（微信等平台有），
 * zod 等三方库在模块初始化时会裸访问 globalThis，导致 common/vendor.js 求值中断，
 * 连带 vendor 后续导出缺失，出现 "e.ref is not a function" 等连锁报错。
 *
 * app.js 第一行即 require common/vendor.js，因此向 vendor 顶部注入模块级
 * globalThis 兜底是可行的最早执行点。var 声明对整个 vendor 模块作用域可见，
 * 同一文件内所有 globalThis 引用（含 zod）都会命中同一个单例对象。
 *
 * 仅在 mp-toutiao 构建时启用；若未来抖音运行时原生提供 globalThis，可移除本插件。
 */
function douyinGlobalThisPolyfill(): Plugin {
  return {
    name: 'douyin-globalthis-polyfill',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const vendor = bundle['common/vendor.js']
      if (!vendor) {
        return
      }
      // chunk 类型带 code，asset 类型带 source
      const getSource = () => (vendor.type === 'chunk' ? vendor.code : String((vendor as any).source))
      const source = getSource()
      if (!source || source.includes('__douyin_globalthis_polyfill__')) {
        return
      }
      const polyfill =
        '// __douyin_globalthis_polyfill__\n' +
        // 抖音端无 globalThis/global，兜底为共享单例对象，保证同文件内多次访问命中同一引用
        'var globalThis = typeof global !== "undefined" ? global : {};\n'
      // "use strict" 必须保持为文件首条语句，polyfill 插入到指令之后
      const strictPrefix = '"use strict";'
      if (source.startsWith(strictPrefix)) {
        const patched = strictPrefix + '\n' + polyfill + source.slice(strictPrefix.length)
        if (vendor.type === 'chunk') {
          vendor.code = patched
        } else {
          ;(vendor as any).source = patched
        }
      } else {
        if (vendor.type === 'chunk') {
          vendor.code = polyfill + source
        } else {
          ;(vendor as any).source = polyfill + source
        }
      }
    }
  }
}

export default defineConfig({
  base: './',
  plugins: [
    Components(),
    uni(),
    // 仅抖音小程序构建需要 globalThis 兜底（uni 命令行会注入 UNI_PLATFORM 环境变量）
    ...(process.env.UNI_PLATFORM === 'mp-toutiao' ? [douyinGlobalThisPolyfill()] : [])
  ],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        silenceDeprecations: ['legacy-js-api']
      }
    }
  },
  build: {
    target: 'es2015',
    //   关闭生成map文件 可以达到缩小打包体积
    sourcemap: false // 这个生产环境一定要关闭，不然打包的产物会很大
  }
})
