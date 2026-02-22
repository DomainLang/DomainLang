# Examples

Real-world DomainLang models to learn from and adapt to your own domain.

## Featured examples

### Banking system

A comprehensive banking domain with regulatory compliance, fraud detection, and complex integration patterns.

[View banking system example →](/examples/banking-system)

**Highlights:**

- Multi-level domain hierarchy
- Regulatory classifications (HighlyRegulated, MissionCritical)
- Rich terminology for financial concepts
- Integration patterns between core banking and compliance

### Healthcare system

A hospital management system with clinical care, patient records, HIPAA compliance, and pharmacy management.

[View healthcare system example →](/examples/healthcare-system)

**Highlights:**

- HIPAA compliance classifications
- Clinical terminology (diagnoses, encounters, treatments)
- Integration between clinical and administrative contexts
- Patient safety decision documentation

## Quick snippets

### Minimal model

```dlang
Domain Sales { description: "Sales" }
BoundedContext Orders for Sales { description: "Order lifecycle" }
```

### With teams and classifications

```dlang
Classification CoreDomain
Team SalesTeam

Domain Sales { description: "Sales" }

BoundedContext Orders for Sales as CoreDomain by SalesTeam {
    description: "Order lifecycle"
}
```

### Context map with patterns

```dlang
ContextMap Integration {
    contains Orders, Payments, Shipping
    
    Orders [OHS] -> [CF] Payments
    Orders [OHS] -> [ACL] Shipping
}
```

### Multi-file structure

```text
project/
├── model.yaml
├── index.dlang
├── shared/
│   ├── teams.dlang
│   └── classifications.dlang
└── domains/
    ├── sales.dlang
    └── shipping.dlang
```

## More examples

- [Customer-Facing](https://github.com/DomainLang/DomainLang/blob/main/dsl/domain-lang/examples/customer-facing.dlang)
- [Metadata Examples](https://github.com/DomainLang/DomainLang/blob/main/dsl/domain-lang/examples/metadata-local-definition.dlang)
- [Multi-File Project](https://github.com/DomainLang/DomainLang/tree/main/dsl/domain-lang/examples/multi-file-project)
