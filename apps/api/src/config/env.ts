import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
})

export type Env = z.infer<typeof EnvSchema>

export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config)
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`)
  }
  return result.data
}
