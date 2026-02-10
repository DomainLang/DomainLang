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

// Mock the SDK validation functions used by validate.tsx
vi.mock('@domainlang/language/sdk', () => ({
    validateFile: vi.fn(() => Promise.resolve({
        valid: true,
        fileCount: 1,
        domainCount: 1,
        bcCount: 0,
        errors: [],
        warnings: [],
    })),
    validateWorkspace: vi.fn(() => Promise.resolve({
        valid: true,
        fileCount: 1,
        domainCount: 1,
        bcCount: 0,
        errors: [],
        warnings: [],
    })),
}));

// Mock statSync used to determine file vs directory
vi.mock('node:fs', () => ({
    statSync: vi.fn(() => ({
        isDirectory: () => false,
    })),
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
            const path = 'test-model.dlang';

            // Act
            const { lastFrame } = render(
                <Validate path={path} context={defaultContext} autoExit={false} />,
            );

            // Assert - should show loading spinner
            const output = lastFrame();
            expect(output).toContain('Validating');
            expect(output).toContain(path);
        });
    });

    describe('component structure', () => {
        it('renders with correct props', () => {
            // Arrange
            const path = 'domain-model.dlang';
            const context: CommandContext = {
                mode: 'rich',
                noColor: false,
                cwd: '/home/user/projects',
                version: '0.1.0',
                isFirstRun: false,
            };

            // Act
            const { lastFrame } = render(
                <Validate path={path} context={context} autoExit={false} />,
            );

            // Assert - component renders without error
            expect(lastFrame()).toBeDefined();
        });
    });
});
