import { Prisma, PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

// Every DB round trip is expensive here (~200ms+ to the Supabase pooler), and Prisma's
// upsert, createMany and `include` all expand into multi-statement transactions. A plain
// `create` is a single INSERT ... RETURNING, so "create, and fall back to a lookup if it
// already exists" is the cheapest way to get-or-create a row.
export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}
