export const THEME_SOURCE: string

export function readThemeTokens(root?: string): Record<string, string>

export function requireHexThemeToken(tokens: Record<string, string>, name: string): string
