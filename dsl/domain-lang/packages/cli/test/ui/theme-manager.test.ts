/**
 * Tests for ThemeManager.
 *
 * @module ui/theme-manager.test
 */
import { describe, test, expect, afterEach, vi } from 'vitest';
import { themes, themeManager } from '../../src/ui/themes/theme-manager.js';

describe('ThemeManager', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        // Reset by setting back to a default
        themeManager.setActiveTheme(undefined);
    });

    describe('setActiveTheme', () => {
        test('sets dark theme by name', () => {
            // Act
            const result = themeManager.setActiveTheme('dark');

            // Assert
            expect(result).toBe(true);
            expect(themeManager.getActiveTheme().type).toBe('dark');
        });

        test('sets light theme by name', () => {
            // Act
            const result = themeManager.setActiveTheme('light');

            // Assert
            expect(result).toBe(true);
            expect(themeManager.getActiveTheme().type).toBe('light');
        });

        test('returns false for unknown theme name', () => {
            // Act
            const result = themeManager.setActiveTheme('neon');

            // Assert
            expect(result).toBe(false);
        });

        test('auto-detects theme when name is undefined', () => {
            // Act
            const result = themeManager.setActiveTheme(undefined);

            // Assert
            expect(result).toBe(true);
            const theme = themeManager.getActiveTheme();
            expect(['dark', 'light']).toContain(theme.type);
        });
    });

    describe('getActiveTheme', () => {
        test('returns no-color theme when NO_COLOR is set', () => {
            // Arrange
            vi.stubEnv('NO_COLOR', '1');

            // Act
            const theme = themeManager.getActiveTheme();

            // Assert
            expect(theme.name).toBe('No Color');
            expect(theme.colors.Foreground).toBe('');
        });

        test('lazy-initializes on first access', () => {
            // Act
            const theme = themeManager.getActiveTheme();

            // Assert
            expect(theme).toBeDefined();
            expect(theme.name).toBeTruthy();
        });
    });

    describe('getSemanticColors', () => {
        test('returns semantic colors from active theme', () => {
            // Arrange
            themeManager.setActiveTheme('dark');

            // Act
            const colors = themeManager.getSemanticColors();

            // Assert
            expect(colors).toBeDefined();
            expect(colors).toHaveProperty('status.success');
            expect(colors).toHaveProperty('status.error');
            expect(colors).toHaveProperty('status.warning');
        });
    });

    describe('getAvailableThemes', () => {
        test('returns list of available themes', () => {
            // Act
            const available = themeManager.getAvailableThemes();

            // Assert
            expect(available.length).toBeGreaterThanOrEqual(2);
            expect(available.some(t => t.type === 'dark')).toBe(true);
            expect(available.some(t => t.type === 'light')).toBe(true);
        });
    });

    describe('themes constant', () => {
        test('provides dark and light themes', () => {
            // Assert
            expect(themes.dark).toBeDefined();
            expect(themes.dark.type).toBe('dark');
            expect(themes.light).toBeDefined();
            expect(themes.light.type).toBe('light');
        });
    });

    describe('terminal theme detection', () => {
        test('detects light theme from COLORFGBG with high background', () => {
            // Arrange
            vi.stubEnv('COLORFGBG', '0;15');

            // Act - reset to trigger detection
            themeManager.setActiveTheme(undefined);
            const theme = themeManager.getActiveTheme();

            // Assert
            expect(theme.type).toBe('light');
        });

        test('detects dark theme from COLORFGBG with low background', () => {
            // Arrange
            vi.stubEnv('COLORFGBG', '15;0');

            // Act
            themeManager.setActiveTheme(undefined);
            const theme = themeManager.getActiveTheme();

            // Assert
            expect(theme.type).toBe('dark');
        });

        test('defaults to dark theme without env hints', () => {
            // Arrange
            vi.stubEnv('COLORFGBG', '');
            vi.stubEnv('TERM_PROGRAM', '');

            // Act
            themeManager.setActiveTheme(undefined);
            const theme = themeManager.getActiveTheme();

            // Assert
            expect(theme.type).toBe('dark');
        });
    });
});
