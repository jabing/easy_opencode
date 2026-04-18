declare const Buffer: {
  isBuffer(value: unknown): boolean;
  byteLength(value: string, encoding?: string): number;
};

declare const __dirname: string;
declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
};

declare function require(id: string): any;
declare namespace require {
  let main: unknown;
}
declare const module: unknown;

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  execPath: string;
  platform: string;
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  stdin: { fd: number };
  cwd(): string;
  exit(code?: number): never;
};

declare function setTimeout(handler: (...args: any[]) => void, timeout?: number): any;
declare function clearTimeout(handle: any): void;

declare module 'fs' {
  export interface Dirent {
    name: string;
    isFile(): boolean;
    isDirectory(): boolean;
  }

  export interface Stats {
    mtimeMs: number;
    isFile(): boolean;
    isDirectory(): boolean;
  }

  export function readFileSync(path: string | number, encoding?: string): string;
  export function writeFileSync(path: string, data: string, encoding?: string): void;
  export function appendFileSync(path: string, data: string, encoding?: string): void;
  export function mkdirSync(path: string, options?: any): void;
  export function rmSync(path: string, options?: any): void;
  export function cpSync(source: string, destination: string, options?: any): void;
  export function unlinkSync(path: string): void;
  export function copyFileSync(source: string, destination: string): void;
  export function renameSync(source: string, destination: string): void;
  export function chmodSync(path: string, mode: number): void;
  export function mkdtempSync(prefix: string): string;
  export function readdirSync(path: string): string[];
  export function readdirSync(path: string, options: 'utf8'): string[];
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function readdirSync(path: string, options: { withFileTypes?: false } | string): string[];
  export function existsSync(path: string): boolean;
  export function statSync(path: string): Stats;
}

declare module 'path' {
  export function join(...paths: string[]): string;
  export function extname(p: string): string;
  export function basename(p: string): string;
  export function dirname(p: string): string;
  export function resolve(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function normalize(p: string): string;
  export const sep: string;
  export function isAbsolute(p: string): boolean;
}

declare module 'vm' {
  export class Script {
    constructor(code: string, options?: { filename?: string });
  }
}

declare module 'child_process' {
  export function spawn(command: string, args?: string[], options?: any): any;
  export function spawnSync(command: string, args?: string[], options?: any): any;
}

declare module 'crypto' {
  export function createHash(algorithm: string): {
    update(data: string): any;
    digest(encoding: string): string;
  };
  export function randomBytes(size: number): { toString(encoding: string): string };
}

declare module 'typescript' {
  const ts: any;
  export = ts;
}


declare module 'os' {
  export function tmpdir(): string;
  export function homedir(): string;
}

declare module 'readline' {
  export interface Interface {
    question(query: string, callback: (answer: string) => void): void;
    close(): void;
  }
  export function createInterface(options: { input: unknown, output: unknown }): Interface;
}
