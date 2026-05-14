export {};

declare global {
  /** Optional fields used by Node, Prisma, and HTTP libs on thrown errors. */
  interface Error {
    code?: string;
    statusCode?: number;
  }
}
