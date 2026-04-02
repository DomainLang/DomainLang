/**
 * ThemedGradient component for gradient text rendering.
 * Uses DomainLang brand colors: cyan → magenta → yellow.
 * 
 * @module ui/components/ThemedGradient
 */
import React from 'react';
import Gradient from 'ink-gradient';
import { Text } from 'ink';
import { colors } from '../themes/colors.js';

/**
 * Props for ThemedGradient component.
 */
export interface ThemedGradientProps {
    /** Text content to apply gradient to */
    children: string;
    /** Custom gradient colors (default: brand gradient) */
    gradient?: readonly string[];
    /** Whether to render as bold text */
    bold?: boolean;
}

/**
 * ThemedGradient component.
 * Renders text with DomainLang's brand gradient (cyan → magenta → yellow).
 * 
 * @example
 * ```tsx
 * <ThemedGradient>DomainLang</ThemedGradient>
 * <ThemedGradient bold>DOMAIN</ThemedGradient>
 * ```
 */
export const ThemedGradient: React.FC<ThemedGradientProps> = ({
    children,
    gradient = colors.gradient,
    bold = false,
}) => {
    // ink-gradient expects a mutable array
    const gradientColors = [...gradient] as string[];

    if (bold) {
        return (
            <Text bold>
                <Gradient colors={gradientColors}>{children}</Gradient>
            </Text>
        );
    }

    return <Gradient colors={gradientColors}>{children}</Gradient>;
};
