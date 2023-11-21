import '../setup-env';
import { formioValidateCore, type FormioCoreResult } from '#app/services/form-validation/core/formio-core';
import type { FormSchema, FormSubmission } from '#app/types/forms';

type TaskInput = {
  schema: FormSchema;
  submission: FormSubmission;
  lang: string;
  i18nBundle: Record<string, unknown>;
};

export default async function validateTask(input: TaskInput): Promise<FormioCoreResult> {
  return formioValidateCore({
    schema: input.schema,
    submission: input.submission,
    lang: input.lang,
    i18nBundle: input.i18nBundle,
  });
}
