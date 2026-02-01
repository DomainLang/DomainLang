<script setup lang="ts">
/**
 * SyntaxDiagrams - Full syntax diagrams explorer
 * 
 * Features:
 * - Organized by grammar category
 * - Expandable/collapsible sections
 * - Search filter
 * - Navigable between related rules
 * - Smooth scrolling to rules
 */
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import RailroadDiagram from './RailroadDiagram.vue'

interface RuleInfo {
  name: string
  category: string
  file: string
  description: string
  references: string[]
}

interface Manifest {
  generatedAt: string
  categoryOrder: string[]
  categoryDescriptions: Record<string, string>
  categories: Record<string, string[]>
  rules: Record<string, RuleInfo>
}

const manifest = ref<Manifest | null>(null)
const searchQuery = ref('')
const expandedCategories = ref<Set<string>>(new Set())
const currentRule = ref<string | null>(null)
const isLoading = ref(true)

// Sorted categories based on manifest's categoryOrder
const sortedCategories = computed(() => {
  if (!manifest.value) return []
  
  const categories = Object.keys(manifest.value.categories)
  const order = manifest.value.categoryOrder || []
  
  return categories.sort((a, b) => {
    const indexA = order.indexOf(a)
    const indexB = order.indexOf(b)
    if (indexA === -1 && indexB === -1) return a.localeCompare(b)
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })
})

// Get description for a category
function getCategoryDescription(category: string): string {
  return manifest.value?.categoryDescriptions?.[category] || ''
}

// Filtered rules based on search
const filteredRules = computed(() => {
  if (!manifest.value) return {}
  
  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return manifest.value.categories
  
  const result: Record<string, string[]> = {}
  
  for (const [category, rules] of Object.entries(manifest.value.categories)) {
    const matchingRules = rules.filter(ruleName => {
      const rule = manifest.value!.rules[ruleName]
      return (
        ruleName.toLowerCase().includes(query) ||
        rule.description.toLowerCase().includes(query) ||
        category.toLowerCase().includes(query)
      )
    })
    
    if (matchingRules.length > 0) {
      result[category] = matchingRules
    }
  }
  
  return result
})

// Stats
const totalRules = computed(() => {
  if (!manifest.value) return 0
  return Object.keys(manifest.value.rules).length
})

onMounted(async () => {
  try {
    const response = await fetch('/railroad/manifest.json')
    if (!response.ok) throw new Error('Failed to load manifest')
    manifest.value = await response.json()
    
    // Expand all categories by default
    if (manifest.value?.categories) {
      expandedCategories.value = new Set(Object.keys(manifest.value.categories))
    }
    
    // Check URL hash for direct navigation
    const hash = globalThis.location?.hash?.slice(1)
    if (hash && manifest.value?.rules?.[hash]) {
      currentRule.value = hash
      await nextTick()
      scrollToRule(hash)
    }
  } catch (err) {
    console.error('Failed to load manifest:', err)
  } finally {
    isLoading.value = false
  }
})

// Watch for search query changes - expand matching categories
watch(searchQuery, (query) => {
  if (query.trim()) {
    // Expand all categories that have matches
    expandedCategories.value = new Set(Object.keys(filteredRules.value))
  }
})

function toggleCategory(category: string) {
  if (expandedCategories.value.has(category)) {
    expandedCategories.value.delete(category)
  } else {
    expandedCategories.value.add(category)
  }
  // Force reactivity update
  expandedCategories.value = new Set(expandedCategories.value)
}

function expandAll() {
  if (manifest.value) {
    expandedCategories.value = new Set(Object.keys(manifest.value.categories))
  }
}

function collapseAll() {
  expandedCategories.value = new Set()
}

async function navigateToRule(ruleName: string) {
  currentRule.value = ruleName
  
  // Update URL hash
  globalThis.history?.replaceState(null, '', `#${ruleName}`)
  
  // Ensure category is expanded
  const rule = manifest.value?.rules[ruleName]
  if (rule) {
    expandedCategories.value.add(rule.category)
    expandedCategories.value = new Set(expandedCategories.value)
  }
  
  await nextTick()
  scrollToRule(ruleName)
}

function scrollToRule(ruleName: string) {
  const element = document.getElementById(`rule-${ruleName}`)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function clearSearch() {
  searchQuery.value = ''
}
</script>

<template>
  <div class="syntax-diagrams">
    <!-- Header controls -->
    <div class="controls-bar">
      <div class="search-box">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search rules..."
          class="search-input"
        />
        <button v-if="searchQuery" class="clear-btn" @click="clearSearch" title="Clear search">
          ×
        </button>
      </div>
      
      <div class="control-buttons">
        <button class="control-btn" @click="expandAll">Expand all</button>
        <button class="control-btn" @click="collapseAll">Collapse all</button>
      </div>
      
      <div v-if="manifest" class="stats">
        {{ totalRules }} rules in {{ sortedCategories.length }} categories
      </div>
    </div>
    
    <!-- Loading state -->
    <div v-if="isLoading" class="loading-state">
      Loading syntax diagrams...
    </div>
    
    <!-- No results -->
    <div v-else-if="Object.keys(filteredRules).length === 0" class="no-results">
      No rules match "{{ searchQuery }}"
    </div>
    
    <!-- Categories and rules -->
    <div v-else class="categories">
      <div
        v-for="category in sortedCategories"
        v-show="filteredRules[category]"
        :key="category"
        class="category"
      >
        <button 
          class="category-header"
          :class="{ expanded: expandedCategories.has(category) }"
          @click="toggleCategory(category)"
        >
          <span class="expand-icon">{{ expandedCategories.has(category) ? '▼' : '▶' }}</span>
          <span class="category-info">
            <span class="category-name">{{ category }}</span>
            <span v-if="getCategoryDescription(category)" class="category-description">{{ getCategoryDescription(category) }}</span>
          </span>
          <span class="category-count">{{ filteredRules[category]?.length || 0 }} rules</span>
        </button>
        
        <div v-show="expandedCategories.has(category)" class="category-content">
          <div
            v-for="ruleName in filteredRules[category]"
            :key="ruleName"
            :id="`rule-${ruleName}`"
            class="rule-section"
            :class="{ highlighted: currentRule === ruleName }"
          >
            <h3 class="rule-title">
              <a :href="`#${ruleName}`" class="rule-anchor">#</a>
              {{ ruleName }}
            </h3>
            
            <RailroadDiagram
              :rule="ruleName"
              @navigate="navigateToRule"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.syntax-diagrams {
  margin: 1rem 0;
}

.controls-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 200px;
  max-width: 300px;
}

.search-input {
  width: 100%;
  padding: 0.5rem 2rem 0.5rem 0.75rem;
  font-size: 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--vp-c-brand-1);
}

.search-input::placeholder {
  color: var(--vp-c-text-3);
}

.clear-btn {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vp-c-bg-soft);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  color: var(--vp-c-text-2);
  transition: all 0.15s;
}

.clear-btn:hover {
  background: var(--vp-c-divider);
  color: var(--vp-c-text-1);
}

.control-buttons {
  display: flex;
  gap: 0.5rem;
}

.control-btn {
  padding: 0.375rem 0.75rem;
  font-size: 13px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  cursor: pointer;
  color: var(--vp-c-text-2);
  transition: all 0.15s;
}

.control-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.stats {
  font-size: 13px;
  color: var(--vp-c-text-3);
  margin-left: auto;
}

.loading-state,
.no-results {
  padding: 2rem;
  text-align: center;
  color: var(--vp-c-text-2);
}

.categories {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.category {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
}

.category-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: var(--vp-c-bg-soft);
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s;
}

.category-header:hover {
  background: var(--vp-c-bg-elv);
}

.expand-icon {
  font-size: 10px;
  color: var(--vp-c-text-3);
  transition: transform 0.15s;
  flex-shrink: 0;
}

.category-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.category-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.category-description {
  font-size: 12px;
  color: var(--vp-c-text-3);
  font-weight: 400;
}

.category-count {
  font-size: 12px;
  color: var(--vp-c-text-3);
  margin-left: auto;
  padding: 0.125rem 0.5rem;
  background: var(--vp-c-bg);
  border-radius: 4px;
  flex-shrink: 0;
}

.category-content {
  padding: 1rem;
  background: var(--vp-c-bg);
}

.rule-section {
  padding: 1rem;
  margin-bottom: 1rem;
  border-radius: 8px;
  transition: background-color 0.3s;
}

.rule-section:last-child {
  margin-bottom: 0;
}

.rule-section.highlighted {
  background: var(--vp-c-brand-soft);
}

.rule-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.75rem 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.rule-anchor {
  color: var(--vp-c-text-3);
  text-decoration: none;
  opacity: 0;
  transition: opacity 0.15s;
}

.rule-section:hover .rule-anchor,
.rule-anchor:focus {
  opacity: 1;
}

.rule-anchor:hover {
  color: var(--vp-c-brand-1);
}

@media (max-width: 640px) {
  .controls-bar {
    flex-direction: column;
    align-items: stretch;
  }
  
  .search-box {
    max-width: none;
  }
  
  .stats {
    margin-left: 0;
    text-align: center;
  }
}
</style>
