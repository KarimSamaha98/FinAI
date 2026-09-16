import { BadRequestException, ConflictException } from '@nestjs/common'

interface PostgresError {
  code?: string
  constraint_name?: string
}

function isPostgresError(error: unknown): error is PostgresError {
  return typeof error === 'object' && error !== null && 'code' in error
}

/**
 * Maps common Postgres constraint violations to Nest exceptions. Relied on
 * instead of pre-checking existence/uniqueness in application code — e.g. a
 * foreign-key violation on category_id also correctly rejects a category
 * that exists but isn't visible to the current tenant under RLS, since the
 * FK check's internal lookup respects RLS for the querying role.
 */
export function mapPostgresError(error: unknown): never {
  if (isPostgresError(error)) {
    if (error.code === '23505') {
      throw new ConflictException('A row with the same unique value already exists')
    }
    if (error.code === '23503') {
      throw new BadRequestException('Referenced row does not exist or is not accessible')
    }
  }
  throw error
}
