import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { ConfigService } from '@nestjs/config'
import multipart from '@fastify/multipart'
import { AppModule } from './app.module.js'
import type { Env } from './config/env.js'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())
  app.enableCors({ origin: true, credentials: true })
  app.setGlobalPrefix('api')
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } })

  const config = app.get(ConfigService<Env, true>)
  const port = config.get('PORT', { infer: true })

  await app.listen(port, '0.0.0.0')
  console.log(`API listening on port ${port}`)
}

bootstrap()
