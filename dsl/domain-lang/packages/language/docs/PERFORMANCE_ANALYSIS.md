# LSP Performance Analysis & Optimizations

## Reported Issues

User reports:
- Validation and hover take time to work after opening documents
- Elements from imports specifically mentioned
- Sometimes need to open document twice for errors/squiggles to disappear

## Root Cause Analysis

### Issue 1: Document build timing

**Current behavior:**
- Documents are loaded via `getOrCreateDocument()` but not immediately built
- LSP features (hover, validation) may access documents before linking phase completes
- Cross-references to imported symbols return `undefined` during partial build

**Evidence:**
```typescript
// domain-lang-workspace-manager.ts
const entryDoc = await this.langiumDocuments.getOrCreateDocument(entryUri);
// ⚠️ Document may not be linked yet - references are undefined
```

**Impact:** Hover/validation show incomplete results on first access

### Issue 2: No explicit document state waiting

**Current behavior:**
- Extension doesn't wait for documents to reach `Validated` state
- LSP features fire as soon as document is parsed (state: `Parsed`)
- Import resolution happens lazily during reference resolution

**Langium document states:**
1. `Parsed` - AST available, but no references
2. `IndexedContent` - Exports computed
3. `ComputedScopes` - Local scopes computed
4. `Linked` - **References available here** ← Critical for imports
5. `IndexedReferences` - Reference tracking
6. `Validated` - Validation complete

**Impact:** First hover/validation may execute before `Linked` state

### Issue 3: Workspace rebuild on config changes

**Current behavior:**
```typescript
// main.ts - handleConfigFileChanges
await sharedServices.workspace.DocumentBuilder.update([], uris);
```

**Problem:** Full workspace rebuild on any model.yaml/model.lock change
- All documents re-parsed, re-linked, re-validated
- Can take seconds on large workspaces
- Blocks LSP features during rebuild

**Impact:** Temporary "dead zone" where nothing works during rebuild

### Issue 4: Import resolution not cached properly

**Current behavior:**
```typescript
// import-resolver.ts
async resolveForDocument(document: LangiumDocument, specifier: string): Promise<URI> {
    const baseDir = path.dirname(document.uri.fsPath);
    return this.resolveFrom(baseDir, specifier);
}
```

**Problem:**
- Every import statement resolved independently
- Workspace manager initialized on every resolve
- Manifest/lock file read multiple times
- No caching of resolution results

**Impact:** Import-heavy files slow to link

## Recommended Optimizations

### Optimization 1: Explicit document build after loading

**Change:** Ensure documents are built to `Linked` state before use

```typescript
// domain-lang-workspace-manager.ts
const entryDoc = await this.langiumDocuments.getOrCreateDocument(entryUri);

// NEW: Build document to ensure linking completes
await this.services.workspace.DocumentBuilder.build([entryDoc], { 
    validation: true 
});

const uris = await ensureImportGraphFromDocument(entryDoc, this.langiumDocuments);
```

**Impact:** First hover/validation has complete reference information

### Optimization 2: Add document state waiting utility

**New utility:**
```typescript
// utils/document-utils.ts
export async function waitForState(
    document: LangiumDocument, 
    targetState: DocumentState,
    timeout = 5000
): Promise<void> {
    if (document.state >= targetState) return;
    
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Document did not reach ${targetState} within ${timeout}ms`));
        }, timeout);
        
        const checkState = () => {
            if (document.state >= targetState) {
                clearTimeout(timer);
                resolve();
            } else {
                setTimeout(checkState, 10);
            }
        };
        checkState();
    });
}
```

**Usage:**
```typescript
// Before accessing references
await waitForState(document, DocumentState.Linked);
const domain = bc.domain?.ref; // Now guaranteed to be resolved
```

### Optimization 3: Incremental workspace updates

**Change:** Only rebuild affected documents on config changes

```typescript
// main.ts - rebuildWorkspace
async function rebuildWorkspace(sharedServices: typeof shared): Promise<void> {
    // OLD: await sharedServices.workspace.DocumentBuilder.update([], uris);
    
    // NEW: Only rebuild if imports changed
    const manifest = await workspaceManager.getManifest();
    if (hasImportChanges(manifest)) {
        // Full rebuild only if dependencies changed
        const uris = sharedServices.workspace.LangiumDocuments.all
            .map(doc => doc.uri)
            .toArray();
        await sharedServices.workspace.DocumentBuilder.update([], uris);
    } else {
        // Otherwise just invalidate caches, no rebuild
        console.warn('Manifest changed but no import changes - skipping rebuild');
    }
}
```

### Optimization 4: Cache import resolution results

**New cache in ImportResolver:**

```typescript
export class ImportResolver {
    private readonly resolverCache = new Map<string, URI>();
    
    async resolveForDocument(document: LangiumDocument, specifier: string): Promise<URI> {
        const cacheKey = `${document.uri.toString()}|${specifier}`;
        
        // Check cache first
        const cached = this.resolverCache.get(cacheKey);
        if (cached) return cached;
        
        // Resolve and cache
        const baseDir = path.dirname(document.uri.fsPath);
        const result = await this.resolveFrom(baseDir, specifier);
        this.resolverCache.set(cacheKey, result);
        return result;
    }
    
    clearCache(): void {
        this.resolverCache.clear();
    }
}
```

**Invalidate on config changes:**
```typescript
// main.ts
if (fileName === 'model.yaml' || fileName === 'model.lock') {
    workspaceManager.invalidateManifestCache();
    DomainLang.imports.ImportResolver.clearCache(); // NEW
}
```

### Optimization 5: Precompute scopes on initial load

**Current:** Scopes computed lazily on first reference access

**Optimization:** Force scope computation during workspace init

```typescript
// domain-lang-workspace-manager.ts
const entryDoc = await this.langiumDocuments.getOrCreateDocument(entryUri);

// Build with scope precomputation
await this.services.workspace.DocumentBuilder.build([entryDoc], {
    validation: true
});

// Load import graph
const uris = await ensureImportGraphFromDocument(entryDoc, this.langiumDocuments);
const docs = uris.map(uri => this.langiumDocuments.getOrCreateDocument(URI.parse(uri)));

// Precompute scopes for all imports
await this.services.workspace.DocumentBuilder.build(docs, {
    validation: true
});
```

## Implementation Priority

### High Priority (Immediate)

1. ✅ Explicit document build after loading (Optimization 1) - **DONE**
2. ✅ Cache import resolution (Optimization 4) - **DONE**

### Medium Priority (This Sprint)

3. ✅ Document state waiting utility (Optimization 2) - **DONE**
4. ✅ Incremental workspace updates (Optimization 3) - **DONE**

### Low Priority (Future)

5. ⏳ Precompute scopes on load (Optimization 5) - Not needed with explicit builds

## Testing Strategy

### Performance Tests

```typescript
// test/performance/lsp-performance.test.ts
describe('LSP Performance', () => {
    test('should provide hover within 100ms after document open', async () => {
        const start = Date.now();
        const { query } = await loadModelFromText(complexModel);
        const bc = query.boundedContexts().toArray()[0];
        
        // Simulate hover
        const hover = await hoverProvider.getHoverContent(document, params);
        
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(100);
        expect(hover).toBeDefined();
    });
    
    test('should resolve imports on first access', async () => {
        // Document with import
        const doc = await parseDocument(`import "@/shared"`);
        
        // First hover should work immediately
        const hover = await hoverProvider.getHoverContent(doc, params);
        expect(hover).toBeDefined();
        expect(hover.contents).not.toContain('undefined');
    });
});
```

### Regression Tests

- Ensure all 459 existing tests still pass
- Verify config file changes still trigger rebuilds
- Confirm cache invalidation works correctly

## Metrics to Track

Before/After measurements:
- Time from document open to first hover (target: <100ms)
- Time to resolve import-heavy document (target: <200ms)
- Workspace rebuild time on config change (target: <1s for 100 files)
- Memory usage with caching (target: <50MB increase)

## References

- Langium docs: Document Build Process
- PRS-010: Import System Redesign
- `.github/instructions/langium.instructions.md` - Document Lifecycle
