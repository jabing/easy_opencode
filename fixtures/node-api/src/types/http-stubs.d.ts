declare module 'express' {
  export type Request = Record<string, unknown>;
  export type Response = { json(body: unknown): void };
  export type Router = { get(path: string, handler: (req: Request, res: Response) => void): void };
  export type Express = { use(router: unknown): void };
  export function Router(): Router;
  export default function express(): Express;
}

declare module 'supertest' {
  type Response = { status: number; body: Record<string, unknown> };
  type RequestBuilder = { get(path: string): Promise<Response> };
  export default function request(app: unknown): RequestBuilder;
}
