export const bundledLanguages = {}

export async function createHighlighter() {
    return {
        getLoadedLanguages: () => [],
        codeToTokens: (code) => ({
            tokens: code.split('\n').map((line) => [{ content: line }]),
            bg: 'transparent',
            fg: 'inherit',
        }),
    }
}
