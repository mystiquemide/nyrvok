import { NextResponse } from "next/server";

/**
 * Serializes objects containing BigInt primitives safely for JSON delivery
 */
export function serializeBigInt<T>(data: T): unknown {
  return JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

/**
 * Returns a NextResponse with BigInt serialization handled automatically
 */
export function jsonResponse<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(serializeBigInt(data), init);
}
