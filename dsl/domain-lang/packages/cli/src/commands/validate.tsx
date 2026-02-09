/**
 * Validate command - validates DomainLang model files.
 * Combines yargs CommandModule with Ink UI component.
 * 
 * @module commands/validate
 */
import type { CommandModule, Argv } from 'yargs';
import React, { useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { 
    validateFile as validateFileSDK,
    validateWorkspace as validateWorkspaceSDK,
    type ValidationDiagnostic,
} from '@domainlang/language/sdk';
import { 
    Spinner, 
    StatusMessage, 
    Banner, 
    KeyValue,
    Divider,
} from '../ui/components/index.js';
import { theme } from '../ui/themes/colors.js';
import { EMOJI } from '../ui/themes/emoji.js';
import { useCommand } from '../ui/hooks/useCommand.js';
import { runDirect } from '../utils/run-direct.js';
import { runCommand } from './command-runner.js';
import type { CommandContext, CommandError, CommandWarning, ValidationResult } from './types.js';
import { basename, dirname, resolve } from 'node:path';
import { statSync } from 'node:fs';

/**
 * Props for Validate command component.
 */
export interface ValidateProps {
    /** File or directory path to validate (optional, defaults to cwd) */
    path?: string;
    /** Command context */
    context: CommandContext;
    /** Whether to auto-exit when command completes (default: true) */
    autoExit?: boolean;
}

/**
 * Convert SDK ValidationDiagnostic to CommandError.
 */
function toCommandError(diagnostic: ValidationDiagnostic): CommandError {
    return {
        code: 'VALIDATION_ERROR',
        message: diagnostic.message,
        file: diagnostic.file,
        line: diagnostic.line,
        column: diagnostic.column,
    };
}

/**
 * Convert SDK ValidationDiagnostic to CommandWarning.
 */
function toCommandWarning(diagnostic: ValidationDiagnostic): CommandWarning {
    return {
        code: 'VALIDATION_WARNING',
        message: diagnostic.message,
        file: diagnostic.file,
        line: diagnostic.line,
    };
}

/**
 * Validate a model file or workspace directory.
 * Determines the validation strategy based on the path type.
 * 
 * @param path - File path (.dlang), directory path, or undefined (uses cwd)
 * @returns Validation result
 */
async function validate(path?: string): Promise<ValidationResult> {
    // Default to current working directory if no path provided
    const targetPath = path ? resolve(path) : process.cwd();
    
    // Check if path exists and determine type
    let isDirectory: boolean;
    try {
        const stats = statSync(targetPath);
        isDirectory = stats.isDirectory();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Path not found: ${path ?? process.cwd()}\n${message}`);
    }
    
    // Validate workspace (directory) or single file
    if (isDirectory) {
        const sdkResult = await validateWorkspaceSDK(targetPath);
        
        return {
            valid: sdkResult.valid,
            fileCount: sdkResult.fileCount,
            domainCount: sdkResult.domainCount,
            bcCount: sdkResult.bcCount,
            errors: sdkResult.errors.map(toCommandError),
            warnings: sdkResult.warnings.map(toCommandWarning),
        };
    } else {
        // Single file validation
        const sdkResult = await validateFileSDK(targetPath, {
            workspaceDir: dirname(targetPath),
        });
        
        return {
            valid: sdkResult.valid,
            fileCount: sdkResult.fileCount,
            domainCount: sdkResult.domainCount,
            bcCount: sdkResult.bcCount,
            errors: sdkResult.errors.map(toCommandError),
            warnings: sdkResult.warnings.map(toCommandWarning),
        };
    }
}

/**
 * Validate command component.
 * Only renders in rich (Ink) mode.
 */
export const Validate: React.FC<ValidateProps> = ({ path, context: _context, autoExit = true }) => {
    const { status, result, error, elapsed } = useCommand(
        () => validate(path),
        [path],
    );
    const { exit } = useApp();

    // Exit when command completes (success or error)
    useEffect(() => {
        if (autoExit && (status === 'success' || status === 'error')) {
            // Small delay to ensure UI is rendered
            setTimeout(() => {
                exit();
            }, 100);
        }
    }, [status, exit, autoExit]);

    if (status === 'loading') {
        return <Spinner label={`Validating ${path ?? 'workspace'}`} emoji="search" />;
    }

    if (status === 'error') {
        return (
            <Box flexDirection="column">
                <StatusMessage type="error" message={error ?? 'Unknown error'} />
            </Box>
        );
    }

    // status === 'success' — result is guaranteed
    if (!result) return null;
    const r = result;
    const fileName = path ? basename(path) : 'workspace';

    return (
        <Box flexDirection="column">
            {/* Result banner */}
            <Banner 
                bannerText={r.valid 
                    ? `${EMOJI.success}Model validated successfully`
                    : `${EMOJI.error}Validation failed`
                }
                variant={r.valid ? 'success' : 'error'}
            />

            {/* File info */}
            <Box marginTop={1}>
                <Divider title="Summary" />
            </Box>
            <Box marginTop={1} marginLeft={1}>
                <KeyValue data={{
                    'File': fileName,
                    'Elements': `${r.domainCount} domain${r.domainCount === 1 ? '' : 's'}, ${r.bcCount} BC${r.bcCount === 1 ? '' : 's'}`,
                    'Errors': r.errors.length,
                    'Warnings': r.warnings.length,
                }} />
            </Box>

            {/* Errors */}
            {r.errors.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                    <Divider title={`Errors (${r.errors.length})`} />
                    {r.errors.map((err) => (
                        <Box key={`${err.file}:${err.line}:${err.column}`} marginLeft={1}>
                            <Text color={theme.status.error}>
                                {EMOJI.error}{err.file}:{err.line}:{err.column}
                            </Text>
                            <Text color={theme.text.secondary}> {err.message}</Text>
                        </Box>
                    ))}
                </Box>
            )}

            {/* Warnings */}
            {r.warnings.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                    <Divider title={`Warnings (${r.warnings.length})`} />
                    {r.warnings.map((warn) => (
                        <Box key={`${warn.file}:${warn.line}`} marginLeft={1}>
                            <Text color={theme.status.warning}>
                                {EMOJI.warning}{warn.file}:{warn.line}
                            </Text>
                            <Text color={theme.text.secondary}> {warn.message}</Text>
                        </Box>
                    ))}
                </Box>
            )}

            {/* Timing */}
            <Box marginTop={1}>
                <Text color={theme.text.secondary}>
                    {EMOJI.loading}Completed in {elapsed.toFixed(2)}s
                </Text>
            </Box>
        </Box>
    );
};

/**
 * Run validation without Ink (for --json and --quiet modes).
 */
export async function runValidate(path: string | undefined, context: CommandContext): Promise<void> {
    await runDirect(
        () => validate(path),
        context,
        {
            exitCode: r => (r.valid ? 0 : 1),
            json: r => ({ success: r.valid, ...r }),
            quiet: r => {
                const lines: string[] = [];
                for (const err of r.errors) {
                    lines.push(`${err.file}:${err.line}:${err.column}: error: ${err.message}`);
                }
                for (const warn of r.warnings) {
                    lines.push(`${warn.file}:${warn.line}: warning: ${warn.message}`);
                }
                return lines.join('\n');
            },
        },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// yargs CommandModule
// ─────────────────────────────────────────────────────────────────────────────

/** Command arguments */
export interface ValidateArgs {
    path?: string;
}

/** Validate command module for yargs */
export const validateCommand: CommandModule<object, ValidateArgs> = {
    command: 'validate [path]',
    describe: 'Validate .dlang files or workspaces with full LSP validation',
    builder: (yargs: Argv) =>
        yargs.positional('path', {
            describe: 'Path to validate: .dlang file, workspace directory, or omit for current directory',
            type: 'string',
            demandOption: false,
        }) as Argv<ValidateArgs>,
    handler: async (argv) => {
        await runCommand(argv, {
            ink: (args, ctx) => <Validate path={args.path} context={ctx} />,
            direct: (args, ctx) => runValidate(args.path, ctx),
        });
    },
};
