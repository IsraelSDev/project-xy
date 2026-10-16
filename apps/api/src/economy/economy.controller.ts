import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  BuyRequest,
  TransferRequest,
  type EconomyBuyResponse,
  type EconomyPurchaseResponse,
  type EconomyShopResponse,
  type EconomyTransactionResponse,
  type EconomyTransferResponse,
  type EconomyWalletResponse,
} from '@3dx/contracts';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZodBody } from '../common/zod-body.pipe.js';
import { EconomyService } from './economy.service.js';

const MINUTE = 60_000;

/** Carteira de créditos e loja de itens de avatar. */
@Controller('economy')
@UseGuards(SessionGuard)
export class EconomyController {
  constructor(private readonly economy: EconomyService) {}

  @Get('wallet')
  wallet(@CurrentUser() user: { id: string }): Promise<EconomyWalletResponse> {
    return this.economy.wallet(user.id);
  }

  @Get('shop')
  shop(): Promise<EconomyShopResponse> {
    return this.economy.shop();
  }

  @Post('buy')
  @RateLimit({ limit: 10, windowMs: MINUTE, by: 'ip' })
  buy(
    @CurrentUser() user: { id: string },
    @Body(new ZodBody(BuyRequest)) body: BuyRequest,
  ): Promise<EconomyBuyResponse> {
    return this.economy.buy(user.id, body);
  }

  @Post('transfer')
  @RateLimit({ limit: 10, windowMs: MINUTE, by: 'ip' })
  transfer(
    @CurrentUser() user: { id: string },
    @Body(new ZodBody(TransferRequest)) body: TransferRequest,
  ): Promise<EconomyTransferResponse> {
    return this.economy.transfer(user.id, body);
  }

  @Get('purchases')
  purchases(@CurrentUser() user: { id: string }): Promise<EconomyPurchaseResponse> {
    return this.economy.purchases(user.id);
  }

  @Get('transactions')
  transactions(@CurrentUser() user: { id: string }): Promise<EconomyTransactionResponse> {
    return this.economy.transactions(user.id);
  }
}
