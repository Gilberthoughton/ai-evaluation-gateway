export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export interface Cursor {
  createdAt: string;
  id: string;
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Encodes a keyset cursor (createdAt + id) into an opaque, URL-safe token. */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`).toString('base64url');
}

export function decodeCursor(token: string | undefined): Cursor | null {
  if (!token) return null;
  const [createdAt, id] = Buffer.from(token, 'base64url').toString('utf8').split('|');
  return createdAt && id ? { createdAt, id } : null;
}
