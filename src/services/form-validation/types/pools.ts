import type { FormioCoreInput, FormioCoreResult } from '#app/services/form-validation/core/formio-core';

export interface ValidationPool {
  validate(payload: FormioCoreInput): Promise<FormioCoreResult>;
  onModuleDestroy?(): Promise<void> | void;
}
