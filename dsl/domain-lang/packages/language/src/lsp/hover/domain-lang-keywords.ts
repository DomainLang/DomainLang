/**
 * Keyword explanations for DomainLang hover documentation.
 * 
 * This dictionary provides concise hover content for all DomainLang keywords,
 * DDD patterns, and special symbols. Uses exact casing from grammar.
 * 
 * @see https://domainlang.net/reference/language for full documentation
 */

// Documentation links
const DOMAIN_LINK = '\n\n[Read more](https://domainlang.net/guide/domains)';
const BC_LINK = '\n\n[Read more](https://domainlang.net/guide/bounded-contexts)';
const TEAM_LINK = '\n\n[Read more](https://domainlang.net/guide/teams-classifications)';
const MAP_LINK = '\n\n[Read more](https://domainlang.net/guide/context-maps)';
const REL_LINK = '\n\n[Read more](https://domainlang.net/guide/context-maps#relationships)';
const IMPORT_LINK = '\n\n[Read more](https://domainlang.net/guide/imports)';
const NS_LINK = '\n\n[Read more](https://domainlang.net/guide/namespaces)';
const TERM_LINK = '\n\n[Read more](https://domainlang.net/reference/language#terminology)';
const DECISION_LINK = '\n\n[Read more](https://domainlang.net/reference/language#decisions-policies-rules)';
const METADATA_LINK = '\n\n[Read more](https://domainlang.net/reference/language#metadata)';
const SYNTAX_LINK = '\n\n[Read more](https://domainlang.net/reference/language)';

export const keywordExplanations: Record<string, string> = {
    // ========================================================================
    // Primary Constructs
    // ========================================================================
    domain: `**Domain** - A sphere of knowledge or activity. Can be nested to show subdomain hierarchy.${DOMAIN_LINK}`,
    dom: `**Domain** - A sphere of knowledge or activity. Can be nested to show subdomain hierarchy.${DOMAIN_LINK}`,
    boundedcontext: `**BoundedContext** - A boundary where a domain model is defined. Central DDD pattern for managing complexity.${BC_LINK}`,
    bc: `**BoundedContext** - A boundary where a domain model is defined. Central DDD pattern for managing complexity.${BC_LINK}`,
    team: `**Team** - A group responsible for one or more bounded contexts.${TEAM_LINK}`,
    classification: `**Classification** - Reusable label for categorizing elements (e.g., Core, Supporting, Generic).${TEAM_LINK}`,
    metadata: `**Metadata** - Defines a key that can be used in metadata blocks.${METADATA_LINK}`,
    meta: `**Metadata** - Defines a key that can be used in metadata blocks.${METADATA_LINK}`,

    // ========================================================================
    // Maps
    // ========================================================================
    contextmap: `**ContextMap** - Shows relationships between bounded contexts.${MAP_LINK}`,
    cmap: `**ContextMap** - Shows relationships between bounded contexts.${MAP_LINK}`,
    domainmap: `**DomainMap** - Visualizes domains and their subdomain structure.${MAP_LINK}`,
    dmap: `**DomainMap** - Visualizes domains and their subdomain structure.${MAP_LINK}`,
    contains: `**contains** - Specifies which elements are part of a map.${MAP_LINK}`,

    // ========================================================================
    // Bounded Context & Domain Properties
    // ========================================================================
    for: `**for** - Associates a bounded context with its parent domain.${BC_LINK}`,
    as: `**as** - Assigns a classification to an element.${BC_LINK}`,
    by: `**by** - Assigns a team responsible for an element.${BC_LINK}`,
    in: `**in** - Specifies parent domain for subdomain nesting.${DOMAIN_LINK}`,
    description: `**description** - Human-readable explanation of the element's purpose.${SYNTAX_LINK}`,
    vision: `**vision** - Strategic vision statement for a domain.${DOMAIN_LINK}`,
    type: `**type** - Assigns a classification type to a domain or relationship.${DOMAIN_LINK}`,
    businessmodel: `**businessModel** - Revenue or engagement model for a context.${BC_LINK}`,
    evolution: `**evolution** - Maturity stage (Genesis, Custom, Product, Commodity).${BC_LINK}`,
    archetype: `**archetype** - Behavioral role (Gateway, Execution, etc.).${BC_LINK}`,
    relationships: `**relationships** - Block defining integration patterns with other contexts.${REL_LINK}`,
    integrations: `**integrations** - Block defining integration patterns with other contexts.${REL_LINK}`,

    // ========================================================================
    // Terminology & Glossary
    // ========================================================================
    terminology: `**terminology** - Block defining domain-specific terms and definitions.${TERM_LINK}`,
    glossary: `**glossary** - Block defining domain-specific terms and definitions.${TERM_LINK}`,
    term: `**Term** - Defines a domain term with its meaning.${TERM_LINK}`,
    aka: `**aka** - Alternative names (also known as) for a term.${TERM_LINK}`,
    synonyms: `**synonyms** - Alternative names (also known as) for a term.${TERM_LINK}`,
    examples: `**examples** - Example usage of a term.${TERM_LINK}`,
    meaning: `**meaning** - The definition or explanation of a term.${TERM_LINK}`,

    // ========================================================================
    // Decisions, Policies & Rules
    // ========================================================================
    decisions: `**decisions** - Block containing architectural decisions or business rules.${DECISION_LINK}`,
    rules: `**rules** - Block containing architectural decisions or business rules.${DECISION_LINK}`,
    decision: `**Decision** - An architectural or domain decision.${DECISION_LINK}`,
    policy: `**Policy** - A business policy or organizational rule.${DECISION_LINK}`,
    rule: `**Rule** - A business rule or constraint (also BusinessRule).${DECISION_LINK}`,

    // ========================================================================
    // Import System
    // ========================================================================
    import: `**Import** - Imports definitions from an external model or file.${IMPORT_LINK}`,

    // ========================================================================
    // Namespaces
    // ========================================================================
    namespace: `**Namespace** - Groups elements under a qualified name.${NS_LINK}`,
    ns: `**Namespace** - Groups elements under a qualified name.${NS_LINK}`,

    // ========================================================================
    // Assignment Operators
    // ========================================================================
    ':': `**:** - Assignment operator (property: value).${SYNTAX_LINK}`,
    is: `**is** - Assignment operator (property is value).${SYNTAX_LINK}`,
    '=': `**=** - Assignment operator (property = value).${SYNTAX_LINK}`,

    // ========================================================================
    // Context Reference
    // ========================================================================
    this: `**this** - References the current bounded context in relationships.${REL_LINK}`,

    // ========================================================================
    // DDD Integration Patterns
    // ========================================================================
    acl: `**ACL** - Anti-Corruption Layer. Protects from external models by translating between domains.${REL_LINK}`,
    anticorruptionlayer: `**AntiCorruptionLayer** - Protects from external models by translating between domains.${REL_LINK}`,
    ohs: `**OHS** - Open Host Service. Provides a well-documented API for integration.${REL_LINK}`,
    openhostservice: `**OpenHostService** - Provides a well-documented API for integration.${REL_LINK}`,
    pl: `**PL** - Published Language. Documented language for inter-context communication.${REL_LINK}`,
    publishedlanguage: `**PublishedLanguage** - Documented language for inter-context communication.${REL_LINK}`,
    cf: `**CF** - Conformist. Adopts upstream model without translation.${REL_LINK}`,
    conformist: `**Conformist** - Adopts upstream model without translation.${REL_LINK}`,
    p: `**P** - Partnership. Two teams with mutual dependency and shared goals.${REL_LINK}`,
    partnership: `**Partnership** - Two teams with mutual dependency and shared goals.${REL_LINK}`,
    sk: `**SK** - Shared Kernel. Shared code/data requiring careful coordination.${REL_LINK}`,
    sharedkernel: `**SharedKernel** - Shared code/data requiring careful coordination.${REL_LINK}`,
    bbom: `**BBoM** - Big Ball of Mud. Legacy area without clear boundaries.${REL_LINK}`,
    bigballofmud: `**BigBallOfMud** - Legacy area without clear boundaries.${REL_LINK}`,

    // ========================================================================
    // Relationship Types
    // ========================================================================
    customersupplier: `**CustomerSupplier** - Downstream depends on upstream with influence over priorities.${REL_LINK}`,
    upstreamdownstream: `**UpstreamDownstream** - One context depends on another's model.${REL_LINK}`,
    separateways: `**SeparateWays** - Contexts with no integration, solving problems independently.${REL_LINK}`,

    // ========================================================================
    // Relationship Arrows
    // ========================================================================
    '->': `**->** - Unidirectional dependency (upstream to downstream).${REL_LINK}`,
    '<->': `**<->** - Bidirectional dependency (mutual).${REL_LINK}`,
    '<-': `**<-** - Reverse unidirectional dependency (downstream to upstream).${REL_LINK}`,
    '><': `**><** - Separate Ways (no integration).${REL_LINK}`,
};
