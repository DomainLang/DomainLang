<script setup lang="ts">
/**
 * RailroadDiagram - Display a single railroad diagram with zoom/pan controls
 * 
 * Features:
 * - Loads individual SVG diagrams by rule name
 * - Zoom controls (buttons + mouse wheel + keyboard)
 * - Pan via drag
 * - Theme-aware (light/dark mode)
 * - Clickable non-terminal references
 */
import { ref, computed, onMounted, watch, nextTick } from 'vue'

interface RuleInfo {
  name: string
  category: string
  file: string
  description: string
  references: string[]
}

interface Manifest {
  categories: Record<string, string[]>
  rules: Record<string, RuleInfo>
}

const props = defineProps<{
  rule: string
  showControls?: boolean
}>()

const emit = defineEmits<{
  navigate: [rule: string]
}>()

const svgContent = ref('')
const currentZoom = ref(1)
const container = ref<HTMLElement | null>(null)
const manifest = ref<Manifest | null>(null)
const ruleInfo = computed(() => manifest.value?.rules[props.rule])
const isLoading = ref(true)
const error = ref<string | null>(null)

let isDragging = false
let startX = 0
let startY = 0
let scrollLeft = 0
let scrollTop = 0

// Load manifest once
onMounted(async () => {
  try {
    const response = await fetch('/railroad/manifest.json')
    if (!response.ok) throw new Error('Failed to load manifest')
    manifest.value = await response.json()
  } catch (err) {
    console.error('Failed to load railroad manifest:', err)
  }
})

// Load SVG when rule changes
watch(() => props.rule, loadSvg, { immediate: true })

async function loadSvg() {
  if (!props.rule) return
  
  isLoading.value = true
  error.value = null
  
  try {
    const response = await fetch(`/railroad/${props.rule}.svg`)
    if (!response.ok) {
      throw new Error(`Diagram not found: ${props.rule}`)
    }
    let svg = await response.text()
    
    // Add click handlers for non-terminal boxes (rectangles with text)
    svg = makeNonTerminalsClickable(svg)
    
    svgContent.value = svg
    currentZoom.value = 1
    
    // Reset scroll position
    await nextTick()
    if (container.value) {
      container.value.scrollTo(0, 0)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load diagram'
    svgContent.value = ''
  } finally {
    isLoading.value = false
  }
}

/**
 * Make non-terminal references clickable by wrapping them in anchor-like groups
 */
function makeNonTerminalsClickable(svg: string): string {
  if (!manifest.value) return svg
  
  const knownRules = new Set(Object.keys(manifest.value.rules))
  
  // Find rect + text pairs and make them clickable
  // The SVG structure is: <rect>...</rect><text>RuleName</text>
  return svg.replaceAll(
    /<rect([^>]*)><\/rect>\s*<text([^>]*)>([^<]+)<\/text>/g,
    (match, rectAttrs, textAttrs, ruleName) => {
      const trimmedName = ruleName.trim()
      if (knownRules.has(trimmedName) && trimmedName !== props.rule) {
        // Make it clickable
        return `<g class="clickable-rule" data-rule="${trimmedName}" tabindex="0" role="link">` +
               `<rect${rectAttrs}></rect><text${textAttrs}>${ruleName}</text></g>`
      }
      return match
    }
  )
}

function handleSvgClick(event: MouseEvent) {
  const target = event.target as Element
  const clickableGroup = target.closest('.clickable-rule') as HTMLElement | null
  if (clickableGroup?.dataset?.['rule']) {
    emit('navigate', clickableGroup.dataset['rule'])
  }
}

function handleSvgKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  if (target.classList.contains('clickable-rule') && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    if (target.dataset?.['rule']) {
      emit('navigate', target.dataset['rule'])
    }
  }
}

function zoomIn() {
  currentZoom.value = Math.min(currentZoom.value + 0.25, 3)
}

function zoomOut() {
  currentZoom.value = Math.max(currentZoom.value - 0.25, 0.5)
}

function resetZoom() {
  currentZoom.value = 1
  if (container.value) {
    container.value.scrollTo(0, 0)
  }
}

function onWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    if (e.deltaY < 0) zoomIn()
    else zoomOut()
  }
}

function onMouseDown(e: MouseEvent) {
  if (!container.value) return
  isDragging = true
  startX = e.pageX - container.value.offsetLeft
  startY = e.pageY - container.value.offsetTop
  scrollLeft = container.value.scrollLeft
  scrollTop = container.value.scrollTop
  container.value.style.cursor = 'grabbing'
}

function onMouseUp() {
  isDragging = false
  if (container.value) {
    container.value.style.cursor = 'grab'
  }
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging || !container.value) return
  e.preventDefault()
  const x = e.pageX - container.value.offsetLeft
  const y = e.pageY - container.value.offsetTop
  container.value.scrollLeft = scrollLeft - (x - startX)
  container.value.scrollTop = scrollTop - (y - startY)
}
</script>

<template>
  <div class="railroad-wrapper">
    <!-- Header with rule info -->
    <div v-if="ruleInfo" class="diagram-header">
      <span class="rule-category">{{ ruleInfo.category }}</span>
      <span v-if="ruleInfo.description" class="rule-description">{{ ruleInfo.description }}</span>
    </div>
    
    <!-- Loading state -->
    <div v-if="isLoading" class="diagram-loading">
      Loading diagram...
    </div>
    
    <!-- Error state -->
    <div v-else-if="error" class="diagram-error">
      {{ error }}
    </div>
    
    <!-- Diagram container with zoom controls inside -->
    <div v-else class="diagram-viewport">
      <div
        ref="container"
        class="diagram-container"
        @wheel="onWheel"
        @mousedown="onMouseDown"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
        @mousemove="onMouseMove"
      >
        <div 
          class="diagram-content" 
          :style="{ transform: `scale(${currentZoom})` }"
          v-html="svgContent"
          @click="handleSvgClick"
          @keydown="handleSvgKeydown"
        ></div>
      </div>
      
      <!-- Zoom controls positioned in bottom-right of viewport -->
      <div v-if="showControls !== false" class="zoom-controls">
        <button class="zoom-btn" @click.stop="zoomOut" title="Zoom out (-)">−</button>
        <span class="zoom-level">{{ Math.round(currentZoom * 100) }}%</span>
        <button class="zoom-btn" @click.stop="zoomIn" title="Zoom in (+)">+</button>
        <button class="zoom-btn reset-btn" @click.stop="resetZoom" title="Reset zoom (0)">⟲</button>
      </div>
    </div>
    
    <!-- References -->
    <div v-if="ruleInfo?.references?.length" class="rule-references">
      <span class="references-label">References:</span>
      <button 
        v-for="ref in ruleInfo.references" 
        :key="ref" 
        class="reference-link"
        @click="emit('navigate', ref)"
      >
        {{ ref }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.railroad-wrapper {
  margin: 1rem 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  outline: none;
  background: var(--vp-c-bg-soft);
}

.diagram-header {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  padding: 0.5rem 1rem;
  background: var(--vp-c-bg);
  border-bottom: 1px solid var(--vp-c-divider);
}

.rule-category {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
}

.rule-description {
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.diagram-viewport {
  position: relative;
  overflow: visible;
}

.diagram-container {
  overflow: auto;
  max-height: 400px;
  padding: 1rem;
  padding-bottom: 3rem;
  cursor: grab;
  scrollbar-width: thin;
  scrollbar-color: var(--vp-c-divider) transparent;
  user-select: none;
  -webkit-user-select: none;
}

.diagram-container:active {
  cursor: grabbing;
}

.diagram-content {
  transform-origin: top left;
  transition: transform 0.1s ease-out;
  width: max-content;
  user-select: none;
  -webkit-user-select: none;
  pointer-events: auto;
}

.zoom-controls {
  position: absolute;
  bottom: 0.75rem;
  right: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.5rem;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 100;
  pointer-events: auto;
}

.zoom-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  transition: all 0.15s;
}

.zoom-btn:hover {
  background: var(--vp-c-bg-elv);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.zoom-btn.reset-btn {
  font-size: 16px;
  margin-left: 0.125rem;
}

.zoom-level {
  min-width: 2.75rem;
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
}

.diagram-loading,
.diagram-error {
  padding: 2rem;
  text-align: center;
  color: var(--vp-c-text-2);
}

.diagram-error {
  color: var(--vp-c-danger-1);
}

.rule-references {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: center;
  padding: 0.5rem 1rem;
  background: var(--vp-c-bg);
  border-top: 1px solid var(--vp-c-divider);
}

.references-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vp-c-text-3);
  margin-right: 0.25rem;
}

.reference-link {
  font-size: 12px;
  padding: 0.125rem 0.5rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  cursor: pointer;
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
  transition: all 0.15s;
}

.reference-link:hover {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

/* SVG theming */
:deep(.railroad-svg) {
  background: transparent !important;
  display: block;
  overflow: visible;
}

:deep(.railroad-svg path) {
  stroke-width: 2.5;
  stroke: var(--vp-c-text-3);
  fill: none;
}

:deep(.railroad-svg text) {
  font: bold 13px var(--vp-font-family-mono);
  fill: var(--vp-c-text-1);
  text-anchor: middle;
}

:deep(.railroad-svg text.label) {
  text-anchor: start;
}

:deep(.railroad-svg text.comment) {
  font: italic 11px var(--vp-font-family-mono);
  fill: var(--vp-c-text-2);
}

:deep(.railroad-svg rect) {
  stroke-width: 2;
  stroke: var(--vp-c-brand-1);
  fill: var(--vp-c-brand-soft);
}

:deep(.railroad-svg circle) {
  stroke: var(--vp-c-text-3);
  fill: var(--vp-c-text-3);
}

/* Clickable rules styling */
:deep(.clickable-rule) {
  cursor: pointer;
  outline: none;
}

:deep(.clickable-rule:hover rect),
:deep(.clickable-rule:focus rect) {
  stroke: var(--vp-c-brand-2);
  stroke-width: 3;
  fill: var(--vp-c-brand-1);
}

:deep(.clickable-rule:hover text),
:deep(.clickable-rule:focus text) {
  fill: white;
}

/* Dark mode adjustments */
.dark :deep(.railroad-svg rect) {
  fill: var(--vp-c-brand-soft);
}

.dark :deep(.clickable-rule:hover rect),
.dark :deep(.clickable-rule:focus rect) {
  fill: var(--vp-c-brand-2);
}
</style>
