/**
 * Theme manager for DomainLang CLI.
 * Manages active theme and provides dynamic semantic color access.
 * Inspired by Gemini CLI's ThemeManager pattern.
 * 
 * @module ui/themes/theme-manager
 */
import { 
    type SemanticColors, 
    type ThemeColors,
    darkTheme, 
    lightTheme,
    createSemanticColors,
} from './semantic-tokens.js';

/**
 * Theme type identifier.
 */
export type ThemeType = 'dark' | 'light';

/**
 * Theme definition with colors and semantic mappings.
 */
export interface Theme {
    /** Theme display name */
    name: string;
    /** Theme type (dark or light) */
    type: ThemeType;
    /** Base color palette */
    colors: ThemeColors;
    /** Semantic color mappings */
    semanticColors: SemanticColors;
}

/**
 * Create a theme from a name and color palette.
 */
function createTheme(name: string, colors: ThemeColors): Theme {
    return {
        name,
        type: colors.type,
        colors,
        semanticColors: createSemanticColors(colors),
    };
}

/**
 * Built-in themes for DomainLang CLI.
 */
export const themes = {
    dark: createTheme('DomainLang Dark', darkTheme),
    light: createTheme('DomainLang Light', lightTheme),
} as const;

/**
 * Detect terminal background color from environment.
 * Returns 'dark' or 'light' based on terminal settings.
 */
function detectTerminalTheme(): ThemeType {
    // Check COLORFGBG environment variable (format: "foreground;background")
    // Background values: 0-7 are dark, 8-15 are light
    const colorfgbg = process.env['COLORFGBG'];
    if (colorfgbg) {
        const parts = colorfgbg.split(';');
        if (parts.length >= 2) {
            const bg = Number.parseInt(parts[1] || '0', 10);
            return bg >= 8 ? 'light' : 'dark';
        }
    }

    // Check TERM_PROGRAM for known terminals with light defaults
    const termProgram = process.env['TERM_PROGRAM'];
    if (termProgram === 'Apple_Terminal' && process.platform === 'darwin') {
        // macOS Terminal.app defaults to light theme
        return 'light';
    }

    // Default to dark theme
    return 'dark';
}

/**
 * Default theme based on terminal detection.
 */
function getDefaultTheme(): Theme {
    const detected = detectTerminalTheme();
    return themes[detected];
}

/**
 * Theme manager singleton.
 * Manages active theme and provides dynamic color access.
 */
class ThemeManager {
    private activeTheme: Theme | null = null;

    /**
     * Set the active theme by name.
     * @param themeName - 'dark' or 'light'
     * @returns true if theme was set, false if theme not found
     */
    setActiveTheme(themeName: string | undefined): boolean {
        if (!themeName) {
            this.activeTheme = getDefaultTheme();
            return true;
        }

        const theme = this.findThemeByName(themeName);
        if (!theme) {
            return false;
        }
        
        this.activeTheme = theme;
        return true;
    }

    /**
     * Get the currently active theme.
     */
    getActiveTheme(): Theme {
        // Support NO_COLOR environment variable
        if (process.env['NO_COLOR']) {
            return this.createNoColorTheme();
        }
        // Lazy initialization - detect on first access
        this.activeTheme ??= getDefaultTheme();
        return this.activeTheme;
    }

    /**
     * Get semantic colors for the active theme.
     */
    getSemanticColors(): SemanticColors {
        return this.getActiveTheme().semanticColors;
    }

    /**
     * Get available theme names.
     */
    getAvailableThemes(): Array<{ name: string; type: ThemeType }> {
        return Object.values(themes).map(theme => ({
            name: theme.name,
            type: theme.type,
        }));
    }

    /**
     * Find a theme by name (case-insensitive).
     */
    private findThemeByName(name: string): Theme | undefined {
        const lowerName = name.toLowerCase();
        
        // Check exact match in themes object
        if (lowerName in themes) {
            return themes[lowerName as keyof typeof themes];
        }

        // Check by display name
        return Object.values(themes).find(
            t => t.name.toLowerCase() === lowerName
        );
    }

    /**
     * Create a no-color theme for accessibility.
     */
    private createNoColorTheme(): Theme {
        const noColor: ThemeColors = {
            type: 'dark',
            Foreground: '',
            Background: '',
            LightBlue: '',
            AccentBlue: '',
            AccentPurple: '',
            AccentCyan: '',
            AccentGreen: '',
            AccentYellow: '',
            AccentRed: '',
            DiffAdded: '',
            DiffRemoved: '',
            Comment: '',
            Gray: '',
            DarkGray: '',
            GradientColors: [],
        };
        return createTheme('No Color', noColor);
    }
}

/** Singleton theme manager instance */
export const themeManager = new ThemeManager();
