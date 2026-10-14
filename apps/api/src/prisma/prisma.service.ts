import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { readRequired } from '../config';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: readRequired('DATABASE_URL') }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
