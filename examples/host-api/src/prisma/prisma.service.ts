import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma-client';

/**
 * Prisma 客户端单例。生成的 Client 位于 `src/generated/prisma-client`（schema 的
 * 自定义 output），规避 pnpm 隔离 node_modules 下默认输出路径的解析问题。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
