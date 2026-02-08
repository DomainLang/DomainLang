/**
 * Init command - initializes a new DomainLang project.
 * Combines yargs CommandModule with Ink UI component.
 * 
 * @module commands/init
 */
import type { CommandModule, Argv } from 'yargs';
import React, { useEffect } from 'react';
import { runCommand } from './command-runner.js';
import { Box, Text, useApp } from 'ink';
import { 
    Header,
    Spinner, 
    StatusMessage, 
    Banner,
    List,
} from '../ui/components/index.js';
import { theme } from '../ui/themes/colors.js';
import { EMOJI } from '../ui/themes/emoji.js';
import { useCommand } from '../ui/hooks/useCommand.js';
import { runDirect } from '../utils/run-direct.js';
import type { CommandContext } from './types.js';
import { resolve, basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultFileSystem, type FileSystemService } from '../services/filesystem.js';

/**
 * Props for Init command component.
 */
export interface InitProps {
    /** Target directory (defaults to current) */
    targetDir?: string;
    /** Whether to accept all defaults (non-interactive) */
    yes?: boolean;
    /** Command context (needed for version in header) */
    context: CommandContext;
    /** Whether to auto-exit when command completes (default: true) */
    autoExit?: boolean;
}

/**
 * Result of init operation.
 */
interface InitResult {
    projectPath: string;
    files: string[];
}

/**
 * Project configuration for initialization.
 */
interface ProjectConfig {
    name: string;
    version: string;
    entry: string;
}

/**
 * Get project configuration from target directory.
 */
function getProjectConfig(targetDir: string | undefined): ProjectConfig {
    const cwd = process.cwd();
    const projectName = targetDir ?? basename(cwd);

    return {
        name: projectName,
        version: '0.1.0',
        entry: 'index.dlang',
    };
}

/**
 * Resolve the templates directory.
 *
 * Uses a two-step resolution so templates are found regardless of whether the
 * CLI is run from source (vitest), from a local build (`out/`), or from a
 * global npm install where the package root may differ from the working
 * directory.
 *
 * Resolution order:
 *  1. Sibling `../templates` relative to the current module file
 *     → works for both `src/commands/init.tsx` and `out/commands/init.js`
 *  2. Walk up from the module location looking for `package.json` (the package
 *     root), then check `src/templates` and `out/templates` beneath it.
 */
function resolveTemplatesDir(fs: FileSystemService = defaultFileSystem): string {
    const moduleDir = dirname(fileURLToPath(import.meta.url));

    // 1. Relative sibling — covers source & build layouts
    const sibling = resolve(moduleDir, '..', 'templates');
    if (fs.existsSync(sibling)) {
        return sibling;
    }

    // 2. Walk up to the package root (contains package.json)
    let current = moduleDir;
    const root = resolve('/');
    while (current !== root) {
        if (fs.existsSync(join(current, 'package.json'))) {
            for (const sub of ['out/templates', 'src/templates']) {
                const candidate = resolve(current, sub);
                if (fs.existsSync(candidate)) {
                    return candidate;
                }
            }
            break;
        }
        current = dirname(current);
    }

    // If nothing found, return the sibling path so loadTemplate can report a
    // descriptive error when the file read fails.
    return sibling;
}

const TEMPLATES_DIR = resolveTemplatesDir();

/**
 * Load a template file and replace `{{key}}` placeholders with the supplied variables.
 *
 * @param templateName - Filename inside `src/templates/` (e.g. `model.yaml.tpl`)
 * @param variables - Key/value pairs to interpolate into the template
 * @param fs - Optional filesystem service for testability
 * @returns The rendered template string
 * @throws {Error} with a descriptive message when the template file is missing
 */
function loadTemplate(
    templateName: string,
    variables: Record<string, string> = {},
    fs: FileSystemService = defaultFileSystem
): string {
    const templatePath = join(TEMPLATES_DIR, templateName);
    if (!fs.existsSync(templatePath)) {
        throw new Error(
            `Template "${templateName}" not found at ${templatePath}. ` +
            'This may indicate a broken install — try reinstalling @domainlang/cli.',
        );
    }
    let content = fs.readFileSync(templatePath, 'utf-8');
    for (const [key, value] of Object.entries(variables)) {
        content = content.split(`{{${key}}}`).join(value);
    }
    return content;
}

/**
 * Create project files.
 */
async function createProject(
    config: ProjectConfig,
    targetPath: string,
    fs: FileSystemService = defaultFileSystem
): Promise<string[]> {
    const files: string[] = [];

    // Create target directory if needed
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }

    // Create model.yaml from template
    const modelYamlPath = resolve(targetPath, 'model.yaml');
    const modelYamlContent = loadTemplate('model.yaml.tpl', {
        name: config.name,
        version: config.version,
        entry: config.entry,
    }, fs);
    fs.writeFileSync(modelYamlPath, modelYamlContent, 'utf-8');
    files.push('model.yaml');

    // Create index.dlang from template
    const indexPath = resolve(targetPath, config.entry);
    const indexContent = loadTemplate('index.dlang.tpl', { name: config.name }, fs);
    fs.writeFileSync(indexPath, indexContent, 'utf-8');
    files.push(config.entry);

    // Create .gitignore from template
    const gitignorePath = resolve(targetPath, '.gitignore');
    fs.writeFileSync(gitignorePath, loadTemplate('gitignore.tpl', {}, fs), 'utf-8');
    files.push('.gitignore');

    // Create domains directory with .gitkeep
    const domainsPath = resolve(targetPath, 'domains');
    fs.mkdirSync(domainsPath, { recursive: true });
    const gitkeepPath = resolve(domainsPath, '.gitkeep');
    fs.writeFileSync(gitkeepPath, '', 'utf-8');
    files.push('domains/.gitkeep');

    return files;
}

/**
 * Initialize a new DomainLang project.
 */
async function initializeProject(
    targetDir: string | undefined,
    _yes: boolean,
    fs: FileSystemService = defaultFileSystem
): Promise<InitResult> {
    const cwd = process.cwd();
    const projectPath = targetDir ? resolve(cwd, targetDir) : cwd;
    const config = getProjectConfig(targetDir);

    // Check if directory exists and has files (if creating new directory)
    if (targetDir && fs.existsSync(projectPath)) {
        throw new Error(`Directory already exists: ${targetDir}`);
    }

    // Check if current directory already has model.yaml
    if (!targetDir && fs.existsSync(resolve(projectPath, 'model.yaml'))) {
        throw new Error('Project already initialized (model.yaml exists)');
    }

    // Create project files
    const files = await createProject(config, projectPath, fs);

    return { projectPath, files };
}

/**
 * Init command component.
 * Only renders in rich (Ink) mode.
 */
export const Init: React.FC<InitProps> = ({ targetDir, yes = false, context, autoExit = true }) => {
    const { status, result, error } = useCommand(
        () => initializeProject(targetDir, yes),
        [targetDir, yes],
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
        return (
            <Box flexDirection="column">
                <Header version={context.version} context="init" />
                <Spinner label="Creating project..." emoji="rocket" />
            </Box>
        );
    }

    if (status === 'error') {
        return (
            <Box flexDirection="column">
                <Header version={context.version} context="init" />
                <StatusMessage type="error" message={error ?? 'Unknown error'} />
            </Box>
        );
    }

    if (!result) return null;
    const r = result;
    const config = getProjectConfig(targetDir);

    return (
        <Box flexDirection="column">
            {/* Show full ASCII art banner on init */}
            <Header version={context.version} context="init" />
            
            {/* Success banner */}
            <Banner 
                bannerText="Project created successfully!" 
                variant="success"
            />

            {/* Created files */}
            <Box flexDirection="column" marginTop={1}>
                <Text color={theme.text.secondary}>Created files:</Text>
                <List
                    items={r.files.map(file => `  ${EMOJI.success} ${file}`)}
                />
            </Box>

            {/* Next steps */}
            <Box flexDirection="column" marginTop={1}>
                <Text color={theme.text.secondary}>{EMOJI.tip} Next steps:</Text>
                <Box flexDirection="column" marginLeft={2}>
                    {targetDir && (
                        <Text color={theme.text.primary}>  cd {config.name}</Text>
                    )}
                    <Text color={theme.text.primary}>  dlang validate {config.entry}</Text>
                </Box>
            </Box>
        </Box>
    );
};

/**
 * Run Init command programmatically (for non-Ink modes).
 */
export async function runInit(
    targetDir: string | undefined,
    yes: boolean,
    context: CommandContext
): Promise<void> {
    await runDirect(
        () => initializeProject(targetDir, yes),
        context,
        {
            json: r => ({ success: true, projectPath: r.projectPath, files: r.files }),
            quiet: () => 'Project created successfully',
        },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// yargs CommandModule
// ─────────────────────────────────────────────────────────────────────────────

/** Command arguments */
export interface InitArgs {
    directory?: string;
    yes?: boolean;
}

/** Init command module for yargs */
export const initCommand: CommandModule<object, InitArgs> = {
    command: 'init [directory]',
    describe: 'Initialize a new DomainLang project',
    builder: (yargs: Argv) =>
        yargs
            .positional('directory', {
                describe: 'Target directory (defaults to current)',
                type: 'string',
            })
            .option('yes', {
                alias: 'y',
                type: 'boolean',
                describe: 'Accept all defaults',
                default: false,
            }) as Argv<InitArgs>,
    handler: async (argv) => {
        await runCommand(argv, {
            ink: (args, ctx) => <Init targetDir={args.directory} yes={args.yes} context={ctx} />,
            direct: (args, ctx) => runInit(args.directory, args.yes ?? false, ctx),
        });
    },
};
