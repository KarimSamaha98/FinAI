import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { FastifyRequest } from 'fastify'
import type { Env } from '../../config/env.js'

export interface AuthenticatedRequest extends FastifyRequest {
  userId: string
}

/**
 * Supabase Auth signs user session tokens asymmetrically (ES256) and
 * publishes the verification key at this well-known JWKS endpoint — this is
 * the current recommended verification method and works identically against
 * both local `supabase start` and a real cloud project. `createRemoteJWKSet`
 * caches the key set and re-fetches only on a `kid` cache miss, so this must
 * be constructed once and reused, not per-request.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>

  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {
    const supabaseUrl = this.config.get('SUPABASE_URL', { infer: true })
    this.jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`))
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token')
    }

    const token = authHeader.slice('Bearer '.length)
    try {
      const { payload } = await jwtVerify(token, this.jwks)
      if (!payload.sub) {
        throw new UnauthorizedException('Invalid token payload')
      }
      request.userId = payload.sub
      return true
    } catch {
      throw new UnauthorizedException('Invalid or expired token')
    }
  }
}
