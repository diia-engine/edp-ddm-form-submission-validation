import { Formio } from 'formiojs';
import * as _ from 'lodash';
import * as entities from 'html-entities';
import type { FormSchema, FormSubmission } from '#app/types/forms';
import type { ValidationErrorDetailsItem } from '#app/services/form-validation/types';

export type FormioCoreInput = {
  schema: FormSchema;
  submission: FormSubmission;
  lang: string;
  i18nBundle: Record<string, unknown>;
};

export type FormioCoreSuccess = { ok: true; data: FormSubmission['data'] };
export type FormioCoreFailure = { ok: false; details: ValidationErrorDetailsItem[] };
export type FormioCoreResult = FormioCoreSuccess | FormioCoreFailure;

export async function formioValidateCore(input: FormioCoreInput): Promise<FormioCoreResult> {
  const { schema, submission, lang, i18nBundle } = input;

  const unsets: Array<{ key: string; data: unknown }> = [];
  let unsetsEnabled = false;

  const isEmptyData = _.isEmpty(submission.data);

  const form = await Formio.createForm(schema, {
    server: true,
    language: lang,
    i18n: {
      [lang]: i18nBundle,
    },
    hooks: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setDataValue(this: any, value: never, key: string, data: never) {
        if (!unsetsEnabled) {
          return value;
        }
        // Check if this component is not persistent.
        if (
          Object.prototype.hasOwnProperty.call(this.component, 'persistent') &&
          (!this.component.persistent || this.component.persistent === 'client-only')
        ) {
          unsets.push({ key, data });
          // Check if this component is conditionally hidden and does not set clearOnHide to false.
        } else if (
          (!Object.prototype.hasOwnProperty.call(this.component, 'clearOnHide') || this.component.clearOnHide) &&
          (!this.conditionallyVisible() || !this.parentVisible)
        ) {
          // unsets.push({ key, data });
        } else if (this.component.type === 'password' && value === this.defaultValue) {
          unsets.push({ key, data });
        }
        return value;
      },
    },
  });
  // Set the validation config.
  try {
    form.validator.config = {
      // db: this.model, // TODO: might be needed in future
      // token: this.token, // TODO: might be needed in future
      form: schema,
      submission,
    };
    // Set the submission data
    form.data = submission.data;

    // Perform calculations and conditions.
    form.calculateValue();
    form.checkConditions();
    // Reset the data
    form.data = {};

    // Set the value to the submission.
    unsetsEnabled = true;
    form.setValue(submission, {
      sanitize: true,
    });

    // Check the validity of the form.
    const isValid: boolean = await form.checkAsyncValidity(null, true);
    if (isValid) {
      // Clear the non-persistent fields.
      unsets.forEach((unset) => _.unset(unset.data, unset.key));
      const data = isEmptyData ? {} : form.data;
      return { ok: true, data };
    }

    const details: Array<ValidationErrorDetailsItem> = [];
    form.errors.forEach((error: { messages: ValidationErrorDetailsItem[] }) =>
      error.messages.forEach((message) => details.push({ ...message, message: entities.decode(message.message) })),
    );
    return { ok: false, details };
  } finally {
    // fix for memory leak
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (Formio as any).forms[form.id];
  }
}
