import { Global, Module } from '@nestjs/common';
import { NotifyService } from './notify.service.js';

/** Aviso em tempo real (push). Global: qualquer módulo injeta `NotifyService` sem importá-lo. */
@Global()
@Module({ providers: [NotifyService], exports: [NotifyService] })
export class NotifyModule {}
