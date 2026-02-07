/**
 * ASCII art definitions for DomainLang CLI branding.
 * Logo: I> icon (stylized D from SVG) + DomainLang wordmark
 * Colors from SVG: #00e5fc (cyan) and #027fff (darker blue)
 * 
 * @module ui/components/AsciiArt
 */

/**
 * ASCII art logo for wide terminals (≥100 cols).
 * The I> icon part only (receives cyan gradient).
 */
export const ASCII_LOGO_WIDE = `
██╗██╗     
██║╚██╗    
██║ ╚██╗   
██║ ██╔╝   
██║██╔╝    
╚═╝╚═╝     

`.trim();

/**
 * ASCII art wordmark for wide terminals (≥100 cols).
 * The "DomainLang" text part (receives theme color).
 */
export const ASCII_WORDMARK_WIDE = `
██████╗  ██████╗ ███╗   ███╗ █████╗ ██╗███╗   ██╗██╗      █████╗ ███╗   ██╗ ██████╗
██╔══██╗██╔═══██╗████╗ ████║██╔══██╗██║████╗  ██║██║     ██╔══██╗████╗  ██║██╔════╝
██║  ██║██║   ██║██╔████╔██║███████║██║██╔██╗ ██║██║     ███████║██╔██╗ ██║██║  ███╗
██║  ██║██║   ██║██║╚██╔╝██║██╔══██║██║██║╚██╗██║██║     ██╔══██║██║╚██╗██║██║   ██║
██████╔╝╚██████╔╝██║ ╚═╝ ██║██║  ██║██║██║ ╚████║███████╗██║  ██║██║ ╚████║╚██████╔╝
╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝

`.trim();

/**
 * ASCII art logo for medium terminals (60-99 cols).
 * Boxed I> icon (receives cyan gradient).
 */
export const ASCII_LOGO_MEDIUM = `
╔════╗
║ I> ║
╚════╝
`.trim();

/**
 * ASCII art wordmark for medium terminals (60-99 cols).
 * "DomainLang" text (receives theme color).
 */
export const ASCII_WORDMARK_MEDIUM = 'DOMAINLANG';

/**
 * ASCII art logo for narrow terminals (<60 cols).
 * Minimal I> icon (receives cyan gradient).
 */
export const ASCII_LOGO_NARROW = 'I>';

/**
 * ASCII art wordmark for narrow terminals (<60 cols).
 * "DomainLang" text (receives theme color).
 */
export const ASCII_WORDMARK_NARROW = 'DomainLang';

/**
 * Cube characters for the stacked 3D cubes logo.
 * Each cube has top/front/side faces.
 */
export const CUBE_CHARS = {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
    topLeftRound: '╭',
    topRightRound: '╮',
    bottomLeftRound: '╰',
    bottomRightRound: '╯',
    diagonal: '╱',
} as const;

/**
 * Get appropriate ASCII art logo and wordmark based on terminal width.
 * @param width - Terminal width in columns
 * @returns Object with logo and wordmark strings
 */
export function getAsciiArt(width: number): { logo: string; wordmark: string } {
    if (width >= 100) {
        return { logo: ASCII_LOGO_WIDE, wordmark: ASCII_WORDMARK_WIDE };
    }
    if (width >= 60) {
        return { logo: ASCII_LOGO_MEDIUM, wordmark: ASCII_WORDMARK_MEDIUM };
    }
    return { logo: ASCII_LOGO_NARROW, wordmark: ASCII_WORDMARK_NARROW };
}

/**
 * Get the appropriate banner type for a command.
 */
export type BannerContext = 'first-run' | 'help' | 'init' | 'none';

/**
 * Determine if a banner should be shown for the given command.
 * @param command - The CLI command being executed
 * @param isFirstRun - Whether this is the first time the CLI is run
 * @returns The type of banner to show
 */
export function getBannerContext(command: string | undefined, isFirstRun: boolean): BannerContext {
    // First run always shows animated banner
    if (isFirstRun) {
        return 'first-run';
    }

    // These commands show static banner
    if (!command || command === 'help' || command === '--help' || command === '-h') {
        return 'help';
    }
    if (command === 'init') {
        return 'init';
    }

    // Other commands don't show banner
    return 'none';
}