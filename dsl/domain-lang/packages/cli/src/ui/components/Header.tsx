/**
 * Header component with responsive ASCII art banner.
 * Shows branded header with version and tagline.
 * 
 * @module ui/components/Header
 */
import React from 'react';
import { Box, Text, useStdout } from 'ink';
import Gradient from 'ink-gradient';
import { tokens } from '../tokens.js';
import { colors, theme } from '../themes/colors.js';
import { getAsciiArt, type BannerContext } from './AsciiArt.js';

/**
 * Props for Header component.
 */
export interface HeaderProps {
    /** Version string to display */
    version: string;
    /** Banner context (affects rendering) */
    context?: BannerContext;
    /** Whether to show animated banner (first run) */
    animated?: boolean;
}

/**
 * Header component.
 * Displays responsive ASCII art banner with DomainLang branding.
 * 
 * @example
 * ```tsx
 * <Header version="2.0.0" />
 * <Header version="2.0.0" context="first-run" animated />
 * ```
 */
export const Header: React.FC<HeaderProps> = ({
    version,
    context = 'help',
    // animated is for future first-run animation support
    animated: _animated = false,
}) => {
    const { stdout } = useStdout();
    const width = stdout?.columns || 80;
    
    // Don't render if context is 'none'
    if (context === 'none') {
        return null;
    }

    // Get appropriate ASCII art for terminal width
    const { logo, wordmark } = getAsciiArt(width);
    
    // Determine if we should show minimal or full banner
    const isNarrow = width < 60;
    const isMedium = width >= 60 && width < 100;

    if (isNarrow) {
        // Minimal banner: logo with gradient + wordmark with theme color
        const gradientColors = [colors.brand.cyan, colors.brand.blue];
        
        return (
            <Box flexDirection="column" marginBottom={1}>
                <Text>
                    <Text bold>
                        <Gradient colors={gradientColors}>{logo}</Gradient>
                    </Text>
                    <Text> </Text>
                    <Text bold color={theme.text.primary}>{wordmark}</Text>
                    <Text color={theme.text.secondary}> v{version}</Text>
                </Text>
            </Box>
        );
    }

    if (isMedium) {
        // Medium banner: logo box with gradient + wordmark with theme color
        const gradientColors = [colors.brand.cyan, colors.brand.blue];
        const logoLines = logo.split('\n');
        
        return (
            <Box
                flexDirection="column"
                borderStyle={tokens.borders.style}
                borderColor={theme.border.default}
                paddingX={2}
                marginBottom={1}
            >
                <Box flexDirection="column">
                    {logoLines.map((line, idx) => (
                        <Box key={`logo-${line}-${idx}`}>
                            <Text bold>
                                <Gradient colors={gradientColors}>{line}</Gradient>
                            </Text>
                            {idx === 1 && <Text>  <Text bold color={theme.text.primary}>{wordmark}</Text>  <Text color={theme.text.secondary}>v{version}</Text></Text>}
                        </Box>
                    ))}
                </Box>
            </Box>
        );
    }

    // Wide banner: logo with gradient + wordmark with theme color
    const gradientColors = [colors.brand.cyan, colors.brand.blue];

    return (
        <Box
            flexDirection="column"
            borderStyle={tokens.borders.style}
            borderColor={theme.border.default}
            paddingX={2}
            paddingY={1}
            marginBottom={1}
        >
            {/* Side-by-side logo and wordmark */}
            <Box>
                <Text bold>
                    <Gradient colors={gradientColors}>{logo}</Gradient>
                </Text>
                <Text> </Text>
                <Text bold color={theme.text.primary}>{wordmark}</Text>
            </Box>
            
            {/* Footer with tagline and version */}
            <Box marginTop={1} justifyContent="space-between" width={70}>
                <Text color={theme.text.secondary}>DDD Modeling DSL</Text>
                <Text color={theme.text.secondary}>v{version}</Text>
            </Box>
        </Box>
    );
};
