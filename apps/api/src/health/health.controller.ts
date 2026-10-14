import type { HealthResponse } from '@3dx/contracts';
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: 'ok', service: 'api' };
  }
}
