# Claude Code Instructions

This document contains Claude Code-specific configuration and guidance.

## gstack

This repository uses [gstack](https://github.com/garrytan/gstack) for enhanced development workflows.

### Web browsing

**IMPORTANT:** Use the `/browse` skill from gstack for all web browsing. NEVER use `mcp__claude-in-chrome__*` tools.

### Available skills

The following gstack skills are available:

| Skill | Purpose |
|-------|---------|
| `/office-hours` | Office hours consultation |
| `/plan-ceo-review` | Plan CEO review session |
| `/plan-eng-review` | Plan engineering review session |
| `/plan-design-review` | Plan design review session |
| `/design-consultation` | Design consultation session |
| `/design-shotgun` | Rapid design iteration |
| `/design-html` | HTML design work |
| `/review` | Code review |
| `/ship` | Ship code changes |
| `/land-and-deploy` | Land changes and deploy |
| `/canary` | Canary deployment |
| `/benchmark` | Performance benchmarking |
| `/browse` | Web browsing (use this for all browsing) |
| `/connect-chrome` | Connect to Chrome browser |
| `/qa` | Quality assurance testing |
| `/qa-only` | QA-only mode |
| `/design-review` | Design review session |
| `/setup-browser-cookies` | Configure browser cookies |
| `/setup-deploy` | Configure deployment |
| `/retro` | Retrospective session |
| `/investigate` | Investigation and debugging |
| `/document-release` | Document release notes |
| `/codex` | Codex reference |
| `/cso` | Chief Security Officer review |
| `/autoplan` | Automatic planning |
| `/careful` | Careful mode (extra validation) |
| `/freeze` | Freeze changes |
| `/guard` | Guard mode |
| `/unfreeze` | Unfreeze changes |
| `/gstack-upgrade` | Upgrade gstack |
| `/learn` | Learning mode |

### Usage

Invoke skills using the slash command syntax:

```
/browse https://example.com
/review
/ship
```

Refer to individual skill documentation in `~/.claude/skills/gstack/` for detailed usage instructions.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
