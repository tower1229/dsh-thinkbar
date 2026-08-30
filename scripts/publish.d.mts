export function parseStableVersion(version: string): number[]

export function chooseReleaseVersion(current: string, publishedVersions: string[]): string

export function releaseFilename(name: string, version: string): string

export function main(argv?: string[]): Promise<void>
