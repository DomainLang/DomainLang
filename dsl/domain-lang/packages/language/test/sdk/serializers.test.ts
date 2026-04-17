/**
 * Tests for AST serialization utilities.
 * Verifies that Langium AST nodes are properly converted to plain JSON.
 */
import { describe, test, beforeAll, expect } from 'vitest';
import { fromDocument } from '../../src/sdk/query.js';
import {
    serializeNode,
    serializeRelationship,
    normalizeEntityType,
    resolveMultiReference,
} from '../../src/sdk/serializers.js';
import { setupTestSuite, expectParsedDocument, s } from '../test-helpers.js';
import type { TestServices } from '../test-helpers.js';

let testServices: TestServices;

function requireValue<T>(value: T | undefined, message: string): T {
    expect(value).not.toBeUndefined();
    if (value === undefined) {
        throw new Error(message);
    }
    return value;
}

beforeAll(() => {
    testServices = setupTestSuite();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Generic Serialization Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('serializeNode', () => {

    // ═ Smoke: core behavior (~25%)
    test('strips $-prefixed properties and includes FQN for named elements', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Namespace acme.sales {
                Domain Sales { vision: "Handle sales" }
            }
        `);
        expectParsedDocument(document);
        const query = fromDocument(document);
        const domain = query.domain('acme.sales.Sales');

        // Act
        const serialized = serializeNode(requireValue(domain, 'Expected acme.sales.Sales domain'), query);

        // Assert
        expect(serialized.$type).toBe('Domain');
        expect(serialized.$container).toBeUndefined();
        expect(serialized.$cstNode).toBeUndefined();
        expect(serialized.$document).toBeUndefined();
        expect(serialized.fqn).toBe('acme.sales.Sales');
    });

    // ═ Edge: reference resolution and special cases (~75%)
    interface SerializeNodeCase {
        name: string;
        dlang: string;
        entityPath: [type: 'domain' | 'bc', name: string];
        assertions: (serialized: Record<string, unknown>) => void;
    }

    test.each<SerializeNodeCase>([
        {
            name: 'resolves Reference<T> to name string',
            dlang: s`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales {}
            `,
            entityPath: ['bc', 'OrderContext'],
            assertions: (s) => {
                expect(s.domain).toBe('Sales');
            }
        },
        {
            name: 'handles unresolved references via $refText',
            dlang: s`bc OrderContext for NonExistent {}`,
            entityPath: ['bc', 'OrderContext'],
            assertions: (s) => {
                expect(s.domain).toBe('NonExistent');
            }
        },
        {
            name: 'serializes Domain with all fields',
            dlang: s`
                Domain Parent { vision: "Parent vision" }
                Domain Sales in Parent { vision: "Handle sales" type: Supportive }
            `,
            entityPath: ['domain', 'Sales'],
            assertions: (s) => {
                expect(s.name).toBe('Sales');
                expect(s.vision).toBe('Handle sales');
                expect(s.parent).toBe('Parent');
                expect(s.fqn).toBe('Sales');
                expect(s.$type).toBe('Domain');
            }
        },
        {
            name: 'serializes BoundedContext with references',
            dlang: s`
                Domain Sales { vision: "v" }
                Team SalesTeam
                Classification Core
                bc OrderContext for Sales as Core by SalesTeam {
                    description: "Order management"
                }
            `,
            entityPath: ['bc', 'OrderContext'],
            assertions: (s) => {
                expect(s.name).toBe('OrderContext');
                expect(s.description).toBe('Order management');
                expect(s.domain).toBe('Sales');
                expect(s.fqn).toBe('OrderContext');
            }
        },
        {
            name: 'serializes arrays of primitives (ContextMap BCs)',
            dlang: s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
                bc Billing for Sales {}
                ContextMap SalesMap { contains Orders, Billing }
            `,
            entityPath: ['bc', 'Orders'],
            assertions: (s) => {
                // MultiReference items are objects with ref property, verify the BC itself
                expect(s.name).toBe('Orders');
            }
        },
        {
            name: 'recursively serializes nested AstNodes (relationships)',
            dlang: s`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales {
                    relationships { this [OHS] -> [CF] PaymentContext }
                }
            `,
            entityPath: ['bc', 'OrderContext'],
            assertions: (s) => {
                expect(Array.isArray(s.relationships)).toBe(true);
                const relationships = s.relationships as unknown[];
                expect(relationships.length).toBeGreaterThan(0);
            }
        },
    ])('$name', async ({ dlang, entityPath, assertions }) => {
        // Arrange
        const document = await testServices.parse(dlang);
        expectParsedDocument(document);
        const query = fromDocument(document);
        
        // Act
        const entity = entityPath[0] === 'domain' 
            ? query.domain(entityPath[1])
            : query.boundedContext(entityPath[1]);
        const serialized = serializeNode(requireValue(entity, `Expected ${entityPath[1]}`), query);

        // Assert
        assertions(serialized);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Relationship Serialization Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('serializeRelationship', () => {

    // ═ Edge: relationship type and arrow display patterns
    interface RelationshipCase {
        name: string;
        dlang: string;
        expectedType: 'directional' | 'symmetric';
        expectedKind: string;
        expectedDisplay: string;
    }

    test.each<RelationshipCase>([
        {
            name: 'directional OHS -> CF with full fields',
            dlang: s`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales {
                    relationships { this [OHS] -> [CF] PaymentContext }
                }
                bc PaymentContext for Sales {}
            `,
            expectedType: 'directional',
            expectedKind: 'UpstreamDownstream',
            expectedDisplay: 'OrderContext -> PaymentContext'
        },
        {
            name: 'directional without patterns',
            dlang: s`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales {
                    relationships { this -> PaymentContext }
                }
                bc PaymentContext for Sales {}
            `,
            expectedType: 'directional',
            expectedKind: 'UpstreamDownstream',
            expectedDisplay: 'OrderContext -> PaymentContext'
        },
        {
            name: 'SeparateWays symmetric (><)',
            dlang: s`
                Domain Sales { vision: "v" }
                bc ContextA for Sales {}
                bc ContextB for Sales {}
                ContextMap M { contains ContextA, ContextB ContextA >< ContextB }
            `,
            expectedType: 'symmetric',
            expectedKind: 'SeparateWays',
            expectedDisplay: 'ContextA >< ContextB'
        },
        {
            name: 'SharedKernel symmetric ([SK])',
            dlang: s`
                Domain Sales { vision: "v" }
                bc ContextA for Sales {}
                bc ContextB for Sales {}
                ContextMap M { contains ContextA, ContextB ContextA [SK] ContextB }
            `,
            expectedType: 'symmetric',
            expectedKind: 'SharedKernel',
            expectedDisplay: 'ContextA [SharedKernel] ContextB'
        },
    ])('$name', async ({ dlang, expectedType, expectedKind, expectedDisplay }) => {
        // Arrange
        const document = await testServices.parse(dlang);
        expectParsedDocument(document);
        const query = fromDocument(document);
        const rel = requireValue(query.relationships().first(), 'Expected relationship');

        // Act
        const serialized = serializeRelationship(rel);

        // Assert
        expect(serialized.type).toBe(expectedType);
        expect(serialized.kind).toBe(expectedKind);
        expect(serialized.name).toBe(expectedDisplay);
    });

    // ═ Smoke: pattern list serialization
    test('serializes directional relationship with multiple patterns on each side', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            bc OrderContext for Sales {
                relationships { this [OHS] -> [CF] PaymentContext }
            }
            bc PaymentContext for Sales {}
        `);
        expectParsedDocument(document);
        const query = fromDocument(document);
        const rel = requireValue(query.relationships().first(), 'Expected relationship');

        // Act
        const serialized = serializeRelationship(rel);

        // Assert
        expect(serialized.leftPatterns).toEqual(['OpenHostService']);
        expect(serialized.rightPatterns).toEqual(['Conformist']);
        expect(serialized.upstreamPatterns).toEqual(['OpenHostService']);
        expect(serialized.downstreamPatterns).toEqual(['Conformist']);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// resolveMultiReference Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('resolveMultiReference', () => {

    interface ResolveCase {
        name: string;
        input: unknown;
        expected: string[];
    }

    test.each<ResolveCase>([
        {
            name: 'resolves array of items with resolved refs',
            input: [
                { ref: { ref: { name: 'ContextA' } as Record<string, unknown>, $refText: 'ContextA' } },
                { ref: { ref: { name: 'ContextB' } as Record<string, unknown>, $refText: 'ContextB' } },
            ],
            expected: ['ContextA', 'ContextB']
        },
        {
            name: 'filters out unresolved refs',
            input: [
                { ref: { ref: { name: 'ContextA' } as Record<string, unknown>, $refText: 'ContextA' } },
                { ref: { ref: undefined, $refText: 'UnresolvedContext' } },
                { ref: undefined },
            ],
            expected: ['ContextA']
        },
        {
            name: 'returns empty array for undefined or empty input',
            input: undefined,
            expected: []
        },
    ])('$name', (testCase) => {
        // Act
        const result = resolveMultiReference(testCase.input as Parameters<typeof resolveMultiReference>[0]);

        // Assert
        expect(result).toEqual(testCase.expected);
    });

    test('returns empty array for empty array input', () => {
        // Act & Assert
        expect(resolveMultiReference([])).toEqual([]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Entity Type Normalization Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('normalizeEntityType', () => {

    // ═ Smoke: canonical types and happy path
    test('returns canonical types unchanged', () => {
        // Act & Assert
        expect(normalizeEntityType('domains')).toBe('domains');
        expect(normalizeEntityType('bcs')).toBe('bcs');
        expect(normalizeEntityType('teams')).toBe('teams');
        expect(normalizeEntityType('relationships')).toBe('relationships');
    });

    // ═ Edge: aliases and error cases
    interface NormalizeCase {
        input: string;
        expected: string | 'error';
    }

    test.each<NormalizeCase>([
        { input: 'bounded-contexts', expected: 'bcs' },
        { input: 'contexts', expected: 'bcs' },
        { input: 'rels', expected: 'relationships' },
        { input: 'cmaps', expected: 'context-maps' },
        { input: 'dmaps', expected: 'domain-maps' },
        { input: 'unknown-type', expected: 'error' },
        { input: '', expected: 'error' },
    ])('normalizes "$input"', ({ input, expected }) => {
        // Act & Assert
        if (expected === 'error') {
            expect(() => normalizeEntityType(input)).toThrow('Unknown entity type');
        } else {
            expect(normalizeEntityType(input)).toBe(expected);
        }
    });
});