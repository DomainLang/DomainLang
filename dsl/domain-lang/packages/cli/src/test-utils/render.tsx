/**
 * Test utilities for DomainLang CLI components.
 * Provides render helpers for Ink components following Gemini CLI patterns.
 * 
 * Includes automatic cleanup of unmounted Ink renders to prevent memory leaks.
 * Import {@link cleanup} and call it in `afterEach`, or use the global setup
 * file (`test/setup.ts`) which does this automatically.
 * 
 * @module test-utils/render
 */
import { render as inkRender } from 'ink-testing-library';
import { Box } from 'ink';
import React, { useState, act } from 'react';

/**
 * Tracks all active Ink render instances for cleanup.
 * Each `render()` call pushes its unmount function here.
 * Call {@link cleanup} to unmount all active renders.
 */
const activeRenders: Array<() => void> = [];

/**
 * Unmount all active Ink render instances and clear the tracking list.
 * Call this in `afterEach` to prevent React tree and timer leaks.
 * This follows the same pattern as `@testing-library/react`'s cleanup.
 */
export function cleanup(): void {
    for (const unmountFn of activeRenders) {
        try {
            unmountFn();
        } catch {
            // Ignore errors during cleanup (component may already be unmounted)
        }
    }
    activeRenders.length = 0;
}

/**
 * Wrapper around Ink's built-in render (compatible with React 19).
 * Automatically tracks the render for cleanup via {@link cleanup}.
 * @param tree - React element to render
 * @param terminalWidth - Optional terminal width to simulate
 */
export const render = (
    tree: React.ReactElement,
    terminalWidth?: number,
): ReturnType<typeof inkRender> => {
    let renderResult: ReturnType<typeof inkRender> = undefined as unknown as ReturnType<typeof inkRender>;
    
    act(() => {
        renderResult = inkRender(tree);
    });

    if (terminalWidth !== undefined && renderResult?.stdout) {
        // Override the columns getter to simulate terminal width
        Object.defineProperty(renderResult.stdout, 'columns', {
            get: () => terminalWidth,
            configurable: true,
        });

        // Trigger a rerender so Ink can pick up the new terminal width
        act(() => {
            renderResult.rerender(tree);
        });
    }

    const originalUnmount = renderResult.unmount;
    const originalRerender = renderResult.rerender;

    let unmounted = false;
    const wrappedUnmount = (): void => {
        if (!unmounted) {
            unmounted = true;
            act(() => {
                originalUnmount();
            });
        }
    };

    // Track this render for automatic cleanup
    activeRenders.push(wrappedUnmount);

    return {
        ...renderResult,
        unmount: wrappedUnmount,
        rerender: (newTree: React.ReactElement) => {
            act(() => {
                originalRerender(newTree);
            });
        },
    };
};

/**
 * Default test context values.
 */
export const defaultTestContext = {
    version: '1.0.0-test',
    isFirstRun: false,
    mode: 'rich' as const,
    noColor: false,
};

/**
 * Render a component with standard providers and context.
 * @param component - React element to render
 * @param options - Render options
 */
export const renderWithProviders = (
    component: React.ReactElement,
    options: {
        width?: number;
    } = {},
): ReturnType<typeof render> => {
    const { width = 80 } = options;

    return render(
        <Box width={width} flexDirection="column">
            {component}
        </Box>,
        width,
    );
};

/**
 * Result from renderHook.
 */
interface RenderHookResult<Result, Props> {
    /** Current result from the hook */
    result: { current: Result };
    /** Rerender with new props */
    rerender: (props?: Props) => void;
    /** Unmount the hook */
    unmount: () => void;
}

/**
 * Render a React hook for testing.
 * Similar to @testing-library/react-hooks but for Ink.
 * 
 * @param renderCallback - Function that calls the hook
 * @param options - Optional initial props and wrapper
 */
export function renderHook<Result, Props = undefined>(
    renderCallback: (props: Props) => Result,
    options?: {
        initialProps?: Props;
        wrapper?: React.ComponentType<{ children: React.ReactNode }>;
    },
): RenderHookResult<Result, Props> {
    const result = { current: undefined as unknown as Result };
    let currentProps = options?.initialProps as Props;

    function TestComponent({
        renderCallback: callback,
        props,
    }: {
        renderCallback: (props: Props) => Result;
        props: Props;
    }): null {
        result.current = callback(props);
        return null;
    }

    const Wrapper = options?.wrapper ?? (({ children }: { children: React.ReactNode }) => <>{children}</>);

    let inkRerender: (tree: React.ReactElement) => void = () => { /* no-op */ };
    let unmount: () => void = () => { /* no-op */ };

    act(() => {
        const renderResult = render(
            <Wrapper>
                <TestComponent renderCallback={renderCallback} props={currentProps} />
            </Wrapper>,
        );
        inkRerender = renderResult.rerender;
        unmount = renderResult.unmount;
    });

    function rerender(props?: Props): void {
        if (arguments.length > 0) {
            currentProps = props as Props;
        }
        act(() => {
            inkRerender(
                <Wrapper>
                    <TestComponent renderCallback={renderCallback} props={currentProps} />
                </Wrapper>,
            );
        });
    }

    return { result, rerender, unmount };
}

/**
 * Render a hook with providers.
 */
export function renderHookWithProviders<Result, Props = undefined>(
    renderCallback: (props: Props) => Result,
    options: {
        initialProps?: Props;
        wrapper?: React.ComponentType<{ children: React.ReactNode }>;
        width?: number;
    } = {},
): RenderHookResult<Result, Props> {
    const result = { current: undefined as unknown as Result };

    let setPropsFn: ((props: Props) => void) | undefined;

    function TestComponent({ initialProps }: { initialProps: Props }): null {
        const [props, setProps] = useState(initialProps);
        setPropsFn = setProps;
        result.current = renderCallback(props);
        return null;
    }

    const Wrapper = options.wrapper ?? (({ children }: { children: React.ReactNode }) => <>{children}</>);

    let renderResult: ReturnType<typeof render>;

    act(() => {
        renderResult = renderWithProviders(
            <Wrapper>
                <TestComponent initialProps={options.initialProps as Props} />
            </Wrapper>,
            { width: options.width },
        );
    });

    function rerender(newProps?: Props): void {
        act(() => {
            if (setPropsFn && newProps) {
                setPropsFn(newProps);
            }
        });
    }

    return {
        result,
        rerender,
        unmount: () => {
            act(() => {
                renderResult.unmount();
            });
        },
    };
}

/**
 * Wait for a condition to be true.
 * Useful for testing async state changes.
 */
export async function waitFor(
    condition: () => boolean,
    options: { timeout?: number; interval?: number } = {},
): Promise<void> {
    const { timeout = 1000, interval = 50 } = options;
    const start = Date.now();

    while (!condition()) {
        if (Date.now() - start > timeout) {
            throw new Error('waitFor timeout');
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
}

/**
 * Flush pending async React effects.
 * Use this instead of waitUntilExit() in tests to let useEffect/useCommand settle.
 */
export async function flushAsync(): Promise<void> {
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
    });
}

/**
 * Clean ANSI escape codes from output for easier assertions.
 */
export function stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}
