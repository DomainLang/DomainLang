/**
 * SDK bootstrap — single point of coupling to the DI module.
 *
 * All SDK files that need `createDomainLangServices` or the
 * `DomainLangServices` type import from HERE rather than
 * directly from `../domain-lang-module.js`. This makes the
 * cross-layer dependency explicit and contained.
 *
 * @module sdk/bootstrap
 */

export { createDomainLangServices } from '../domain-lang-module.js';
export type { DomainLangServices } from '../domain-lang-module.js';
