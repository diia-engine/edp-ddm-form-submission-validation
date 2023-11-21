import { FormioCoreInput, FormioCoreResult, formioValidateCore } from '#app/services/form-validation/core/formio-core';
import type { ValidationPool } from '#app/services/form-validation/types/pools';

export class MockValidationPool implements ValidationPool {
  async validate(payload: FormioCoreInput): Promise<FormioCoreResult> {
    return formioValidateCore(payload);
  }
}
