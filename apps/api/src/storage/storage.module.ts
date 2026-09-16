import { Global, Inject, Injectable, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Env } from '../config/env.js'

export const SUPABASE_ADMIN_CLIENT = Symbol('SUPABASE_ADMIN_CLIENT')
export const IMPORTS_BUCKET = 'imports'

@Injectable()
export class StorageService {
  constructor(@Inject(SUPABASE_ADMIN_CLIENT) private readonly client: SupabaseClient) {}

  async upload(path: string, buffer: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client.storage.from(IMPORTS_BUCKET).upload(path, buffer, { contentType })
    if (error) throw error
  }

  async download(path: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(IMPORTS_BUCKET).download(path)
    if (error) throw error
    return Buffer.from(await data.arrayBuffer())
  }
}

@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_ADMIN_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createClient(config.get('SUPABASE_URL', { infer: true }), config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true })),
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
