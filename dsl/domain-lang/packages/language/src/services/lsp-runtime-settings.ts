/**
 * Runtime LSP settings configured by the VS Code client.
 *
 * Defaults are conservative (both disabled) and can be updated via
 * initialization options and workspace configuration changes.
 */
export interface DomainLangLspRuntimeSettings {
    /** Enables import resolution trace logging. */
    traceImports: boolean;
    /** Enables info-level/timing logs. Warnings/errors are always logged. */
    infoLogs: boolean;
}

let runtimeSettings: DomainLangLspRuntimeSettings = {
    traceImports: false,
    infoLogs: false,
};

/**
 * Updates runtime settings.
 */
export function setLspRuntimeSettings(next: Partial<DomainLangLspRuntimeSettings>): void {
    runtimeSettings = {
        ...runtimeSettings,
        ...next,
    };
}

/**
 * Returns current runtime settings.
 */
export function getLspRuntimeSettings(): DomainLangLspRuntimeSettings {
    return runtimeSettings;
}
