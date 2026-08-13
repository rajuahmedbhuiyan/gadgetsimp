/**
 * How middleware hands the resolved user to the render.
 *
 * Base64 because a header value is Latin-1 and a name is not - "Raju Ahmed" is
 * fine, "José" is not, and the mangling would be silent.
 */

import type { User } from "@/lib/api/types";

export const USER_HEADER = "x-gs-user";

export function encodeUserHeader(user: User): string {
  const bytes = new TextEncoder().encode(JSON.stringify(user));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeUserHeader(value: string | null | undefined): User | null {
  if (!value) return null;

  try {
    const bytes = Uint8Array.from(atob(value), (character) =>
      character.charCodeAt(0),
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as User;
  } catch {
    return null;
  }
}
