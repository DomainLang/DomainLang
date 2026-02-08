/**
 * Validate command - validates DomainLang model files.
 * Combines yargs CommandModule with Ink UI component.
 * 
 * @module commands/validate
 */
import type { CommandModule, Argv } from 'yargs';
import React, { useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import type { LangiumDocument } from 'langium';
import { URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { createDomainLangServices, type Model } from '@domainlang/language';
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
import type { CommandContext, ValidationResult, CommandError, CommandWarning } from './types.js';
import { resolve, extname, basename } from 'node:path';
import { defaultFileSystem, type FileSystemService } from '../services/filesystem.js';

/**
 * Props for Validate command component.
 */
export interface ValidateProps {
    /** File path to validate */
    file: string;
    /** Command context */
    context: CommandContext;
    /** Whether to auto-exit when command completes (default: true) */
    autoExit?: boolean;
}

/**
 * Convert Langium diagnostic to CommandError.
 */
function toCommandError(
    diagnostic: { message: string; range: { start: { line: number; character: number } } },
    file: string
): CommandError {
    return {
        code: 'VALIDATION_ERROR',
        message: diagnostic.message,
        file,
        line: diagnostic.range.start.line + 1,
        column: diagnostic.range.start.character + 1,
    };
}

/**
 * Convert Langium diagnostic to CommandWarning.
 */
function toCommandWarning(
    diagnostic: { message: string; range: { start: { line: number; character: number } } },
    file: string
): CommandWarning {
    return {
        code: 'VALIDATION_WARNING',
        message: diagnostic.message,
        file,
        line: diagnostic.range.start.line + 1,
    };
}

/**
 * Validate a model file and return results.
 */
async function validateModel(
    filePath: string,
    fs: FileSystemService = defaultFileSystem
): Promise<ValidationResult> {
    const services = createDomainLangServices(NodeFileSystem).DomainLang;
    const extensions = services.LanguageMetaData.fileExtensions;
    
    // Check file extension
    const ext = extname(filePath);
    if (!extensions.includes(ext)) {
        throw new Error(`Invalid file extension. Expected: ${extensions.join(', ')}`);
    }

    // Check file exists
    const resolvedPath = resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    // Parse and validate
    const document: LangiumDocument = await services.shared.workspace.LangiumDocuments
        .getOrCreateDocument(URI.file(resolvedPath));
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const diagnostics = document.diagnostics ?? [];
    const errors = diagnostics.filter(d => d.severity === 1);
    const warnings = diagnostics.filter(d => d.severity === 2);

    // Count model elements
    const model = document.parseResult?.value as Model | undefined;
    let domainCount = 0;
    let bcCount = 0;

    if (model?.children) {
        for (const element of model.children) {
            if (element.$type === 'Domain') {
                domainCount++;
            } else if (element.$type === 'BoundedContext') {
                bcCount++;
            }
        }
    }

    return {
        valid: errors.length === 0,
        fileCount: 1,
        domainCount,
        bcCount,
        errors: errors.map(e => toCommandError(e, filePath)),
        warnings: warnings.map(w => toCommandWarning(w, filePath)),
    };
}

/**
 * Validate command component.
 * Only renders in rich (Ink) mode.
 */
export const Validate: React.FC<ValidateProps> = ({ file, context: _context, autoExit = true }) => {
    const { status, result, error, elapsed } = useCommand(
        () => validateModel(file),
        [file],
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
        return <Spinner label={`Validating ${file}`} emoji="search" />;
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
    const fileName = basename(file);

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
export async function runValidate(file: string, context: CommandContext): Promise<void> {
    await runDirect(
        () => validateModel(file),
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
    file: string;
}

/** Validate command module for yargs */
export const validateCommand: CommandModule<object, ValidateArgs> = {
    command: 'validate <file>',
    describe: 'Validate model files',
    builder: (yargs: Argv) =>
        yargs.positional('file', {
            describe: 'File or directory to validate',
            type: 'string',
            demandOption: true,
        }) as Argv<ValidateArgs>,
    handler: async (argv) => {
        await runCommand(argv, {
            ink: (args, ctx) => <Validate file={args.file} context={ctx} />,
            direct: (args, ctx) => runValidate(args.file, ctx),
        });
    },
};
