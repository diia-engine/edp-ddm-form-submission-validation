import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as path from 'path';
import Piscina from 'piscina';
import type { FormioCoreInput, FormioCoreResult } from '#app/services/form-validation/core/formio-core';
import { AbortController } from 'node-abort-controller';
import type { ValidationPool } from '#app/services/form-validation/types/pools';

@Injectable()
export class ValidationPiscinaPool implements OnModuleDestroy, ValidationPool {
  private readonly pool: Piscina;
  constructor(
    private readonly minThreads: number,
    private readonly maxThreads: number,
    private readonly timeoutMs: number,
  ) {
    const workerPath = path.resolve(__dirname, 'validation.worker.js');
    this.pool = new Piscina({
      filename: workerPath,
      minThreads: this.minThreads,
      maxThreads: this.maxThreads,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.destroy();
  }

  async validate(payload: FormioCoreInput): Promise<FormioCoreResult> {
    const abortController = new AbortController();

    void setTimeout(() => {
      abortController.abort();
    }, this.timeoutMs);
    return this.pool.run(payload, { signal: abortController.signal }) as Promise<FormioCoreResult>;
  }
}
