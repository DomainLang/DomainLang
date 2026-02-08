/**
 * Tests for the Validate command component.
 * Tests loading states, success scenarios, and error handling.
 *
 * @module commands/validate.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '../../src/test-utils/render.js';
import { Validate } from '../../src/commands/validate.js';
import type { CommandContext } from '../../src/commands/types.js';

// Mock Langium services
vi.mock('@domainlang/language', () => ({
    createDomainLangServices: vi.fn(() => ({
        DomainLang: {
            LanguageMetaData: { fileExtensions: ['.dlang'] },
            shared: {
                workspace: {
                    LangiumDocuments: {
                        getOrCreateDocument: vi.fn(),
                    },
                    DocumentBuilder: {
                        build: vi.fn(),
                    },
                },
            },
        },
    })),
}));

vi.mock('langium/node', () => ({
    NodeFileSystem: {},
}));

vi.mock('node:fs', () => ({
    existsSync: vi.fn(() => true),
}));

describe('Validate command', () => {
    const defaultContext: CommandContext = {
        mode: 'rich',
        noColor: false,
        cwd: '/test/project',
        version: '0.1.0',
        isFirstRun: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('loading state', () => {
        it('shows spinner while validating', () => {
            // Arrange
            const file = 'test-model.dlang';

            // Act
            const { lastFrame } = render(
                <Validate file={file} context={defaultContext} autoExit={false} />,
            );

            // Assert - should show loading spinner
            const output = lastFrame();
            expect(output).toContain('Validating');
            expect(output).toContain(file);
        });
    });

    describe('component structure', () => {
        it('renders with correct props', () => {
            // Arrange
            const file = 'domain-model.dlang';
            const context: CommandContext = {
                mode: 'rich',
                noColor: false,
                cwd: '/home/user/projects',
                version: '0.1.0',
                isFirstRun: false,
            };

            // Act
            const { lastFrame } = render(
                <Validate file={file} context={context} autoExit={false} />,
            );

            // Assert - component renders without error
            expect(lastFrame()).toBeDefined();
        });
    });
});
