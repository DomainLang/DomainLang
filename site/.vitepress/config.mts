/// <reference types="node" />
import { defineConfig } from 'vitepress'
import type { LanguageRegistration } from 'shiki'

// Custom DomainLang syntax highlighting grammar
const domainLangGrammar: LanguageRegistration = {
  name: 'dlang',
  scopeName: 'source.domain-lang',
  aliases: ['domain-lang', 'domainlang'],
  patterns: [
    { include: '#comments' },
    {
      name: 'keyword.control.domain-lang',
      match: String.raw`\b(ACL|AntiCorruptionLayer|BBoM|BigBallOfMud|BoundedContext|CF|Classification|Conformist|ContextMap|CustomerSupplier|Decision|Domain|DomainMap|Import|Metadata|Namespace|OHS|OpenHostService|P|PL|Partnership|Policy|PublishedLanguage|Rule|SK|SeparateWays|SharedKernel|Team|Term|UpstreamDownstream|aka|archetype|as|bc|businessModel|by|classification|cmap|contains|decision|decisions|description|dmap|dom|evolution|examples|for|glossary|import|in|integrations|is|meta|metadata|ns|policy|relationships|rule|rules|synonyms|team|term|terminology|this|type|vision)\b`
    },
    {
      name: 'string.quoted.double.domain-lang',
      begin: '"',
      end: '"',
      patterns: [{ include: '#string-character-escape' }]
    },
    {
      name: 'string.quoted.single.domain-lang',
      begin: "'",
      end: "'",
      patterns: [{ include: '#string-character-escape' }]
    }
  ],
  repository: {
    comments: {
      patterns: [
        {
          name: 'comment.block.domain-lang',
          begin: String.raw`/\*`,
          end: String.raw`\*/`
        },
        {
          name: 'comment.line.domain-lang',
          begin: '//',
          end: '(?=$)'
        }
      ]
    },
    'string-character-escape': {
      name: 'constant.character.escape.domain-lang',
      match: String.raw`\\.`
    }
  }
}

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'DomainLang',
  description: 'Domain-Driven Design, as code. Define, validate, and evolve your DDD models in version-controlled text files.',
  
  // Base URL — defaults to '/' for domainlang.net (Cloudflare).
  // Set VITEPRESS_BASE=/domainlang/ when building for GitHub Pages.
  base: process.env.VITEPRESS_BASE ?? '/',
  
  // Clean URLs without .html extension
  cleanUrls: true,
  
  // Last updated timestamps
  lastUpdated: true,
  
  // Head tags for metadata
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['link', { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#027fff' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'DomainLang' }],
    ['meta', { property: 'og:description', content: 'Domain-Driven Design, as code. Define, validate, and evolve your DDD models in version-controlled text files.' }],
    ['meta', { property: 'og:url', content: 'https://domainlang.net/' }],
  ],
  
  // Theme configuration
  themeConfig: {
    // Logo
    logo: '/logo.svg',
    
    // Site title in nav
    siteTitle: 'DomainLang',
    
    // Navigation bar
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/language' },
      {
        text: 'Resources',
        items: [
          { text: 'Examples', link: '/examples/' },
          { text: 'Standard library', link: '/guide/standard-library' },
          { text: 'Roadmap', link: '/roadmap' },
          { text: 'VS Code Extension', link: 'https://marketplace.visualstudio.com/items?itemName=DomainLang.vscode-domainlang' },
          {
            text: 'npm Packages',
            items: [
              { text: '@domainlang/cli', link: 'https://www.npmjs.com/package/@domainlang/cli' },
              { text: '@domainlang/language', link: 'https://www.npmjs.com/package/@domainlang/language' },
            ]
          }
        ]
      }
    ],
    
    // Sidebar navigation
    sidebar: {
      '/guide/': [
        {
          text: 'Overview',
          items: [
            { text: 'What is DomainLang?', link: '/guide/what-is-domainlang' },
            { text: 'Getting started', link: '/guide/getting-started' },
          ]
        },
        {
          text: 'Modeling concepts',
          items: [
            { text: 'Domains', link: '/guide/domains' },
            { text: 'Bounded contexts', link: '/guide/bounded-contexts' },
            { text: 'Context maps', link: '/guide/context-maps' },
            { text: 'Teams & classifications', link: '/guide/teams-classifications' },
            { text: 'Namespaces', link: '/guide/namespaces' },
            { text: 'Import system', link: '/guide/imports' },
            { text: 'Standard library', link: '/guide/standard-library' },
          ]
        },
        {
          text: 'Tools & AI',
          items: [
            { text: 'VS Code extension', link: '/guide/vscode-extension' },
            { text: 'AI-powered model tools', link: '/guide/vscode-tools' },
            { text: 'Agent skill', link: '/guide/agent-skill' },
            { text: 'CLI', link: '/guide/cli' },
            { text: 'Model query SDK', link: '/guide/sdk' },
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Language reference', link: '/reference/language' },
            { text: 'Quick reference', link: '/reference/quick-reference' },
            { text: 'Syntax diagrams', link: '/reference/syntax-diagrams' },
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview', link: '/examples/' },
            { text: 'Banking System', link: '/examples/banking-system' },
            { text: 'Healthcare System', link: '/examples/healthcare-system' },
          ]
        }
      ]
    },
    
    // Social links
    socialLinks: [
      { icon: 'github', link: 'https://github.com/DomainLang/DomainLang' }
    ],
    
    // Footer
    footer: {
      message: 'Sponsored by <a href="https://thinkability.dk" target="_blank" rel="noopener noreferrer"><img class="sponsor-logo-light" src="/thinkability-logo-light-theme.svg" alt="thinkability"><img class="sponsor-logo-dark" src="/thinkability-logo-dark-theme.svg" alt="thinkability"></a>',
      copyright: 'Copyright © 2024-2026 <a href="https://github.com/larsbaunwall">Lars Baunwall</a>. Released under the Apache 2.0 License.'
    },
    
    // Edit link
    editLink: {
      pattern: 'https://github.com/DomainLang/DomainLang/edit/main/site/:path',
      text: 'Edit this page on GitHub'
    },
    
    // Search
    search: {
      provider: 'local'
    },
    
    // Outline configuration
    outline: {
      level: [2, 3]
    }
  },
  
  // Markdown configuration
  markdown: {
    lineNumbers: true,
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    languages: [domainLangGrammar]
  }
})
