// https://vitepress.dev/guide/custom-theme
import { h } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import './style.css'

// Custom components
import RailroadDiagram from './components/RailroadDiagram.vue'
import SyntaxDiagrams from './components/SyntaxDiagrams.vue'

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
    })
  },
  enhanceApp({ app, router, siteData }) {
    // Register global components
    app.component('RailroadDiagram', RailroadDiagram)
    app.component('SyntaxDiagrams', SyntaxDiagrams)
  }
} satisfies Theme
