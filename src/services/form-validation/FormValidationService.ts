import './setup-env';
import { Inject, Injectable } from '@nestjs/common';
import { FormComponent, FormSchema, FormSubmission } from '#app/types/forms';
import * as _ from 'lodash';
import * as bytes from 'bytes';
import {
  FileMaxSizeError,
  FormFieldValidationInput,
  FormValidationError,
  MissingFormComponentError,
  UnsupportedFileTypeError,
  FileData,
} from '#app/services/form-validation/types';
import { validateFilePattern } from '#app/services/form-validation/utils/mime';
import type { DeepReadonly } from '#app/types/utils';
import { convertSubmission, findComponents } from '#app/modules/form-submissions/utils';
import { I18N_PROVIDER_KEY } from '#app/modules/i18n/keys';
import type { i18n as I18n } from 'i18next';
import type { ValidationPool } from '#app/services/form-validation/types/pools';
import { VALIDATION_POOL_PROVIDER_KEY } from '#app/modules/form-submissions/keys';

const DEFAULT_MAX_FILE_SIZE = '100MB';
@Injectable()
export class FormValidationService {
  private lang: string;

  constructor(
    @Inject(I18N_PROVIDER_KEY) private readonly i18n: I18n,
    @Inject(VALIDATION_POOL_PROVIDER_KEY) private readonly validationPool: ValidationPool,
  ) {
    this.lang = this.i18n.language;
  }

  public async validate(
    formSchemaInput: DeepReadonly<FormSchema>,
    submissionInput: DeepReadonly<FormSubmission>,
  ): Promise<FormSubmission['data']> {
    const formSchema = _.cloneDeep<FormSchema>(formSchemaInput);
    let submission = _.cloneDeep<FormSubmission>(submissionInput);

    const normalizedFormSchema = {
      ...formSchema,
      components: this.normalizeComponents(formSchema.components),
    };

    submission = this.normalizeSubmission(normalizedFormSchema.components, submission);

    const i18nBundle = this.i18n.getResourceBundle(this.lang, 'validations');

    const payload = {
      schema: normalizedFormSchema,
      submission,
      lang: this.lang,
      i18nBundle,
    } as const;
    const result = await this.validationPool.validate(payload);
    if (result.ok) {
      return result.data;
    }

    throw new FormValidationError(result.details);
  }

  protected normalizeComponentType(type: string): string {
    // Remove 'Latest' and 'Legacy' parts of component types
    return type.replace(/(Latest|Legacy)$/g, '');
  }

  protected normalizeComponents(components: Array<FormComponent>): Array<FormComponent> {
    // Rename custom components, so they can be validated as default ones
    return components.map((component) => ({
      ...component,
      type: this.normalizeComponentType(component.type),
      ...(component.components ? { components: this.normalizeComponents(component.components) } : {}),
      ...(component.columns
        ? {
            columns: component.columns.map((column) => ({
              ...column,
              components: this.normalizeComponents(column.components),
            })),
          }
        : {}),
      ...(_.isArray(component.rows)
        ? {
            rows: component.rows.map((row) =>
              row.map((column) => ({ ...column, components: this.normalizeComponents(column.components) })),
            ),
          }
        : {}),
    }));
  }

  protected normalizeSubmission(components: Array<FormComponent>, formSubmission: FormSubmission): FormSubmission {
    let submission = _.cloneDeep(formSubmission);
    if (!submission.data) {
      submission.data = {};
    }

    submission = convertSubmission(components, submission, (value, component) => {
      if (component.type === 'day' && value) {
        return this.normalizeSubmissionDay(component, value as string);
      }

      return value;
    });

    submission = convertSubmission(components, submission, (value, component) => {
      if (component.type === 'file' && value) {
        return this.normalizeSubmissionFile(value as FileData);
      }

      return value;
    });

    submission = convertSubmission(components, submission, (value, component) => {
      if (component.type === 'textfield' && value) {
        return this.normalizeSubmissionTextField(component, value as string);
      }

      return value;
    });

    return submission;
  }

  private normalizeSubmissionTextField(component: FormComponent, data: string): string {
    const insertNumbersIntoMask = (numberValue: string, inputMask: string) => {
      let index = -1;
      return _.map(inputMask, (char) => {
        if (isNaN(+char)) {
          return char;
        }

        index += 1;
        return numberValue[index] || '';
      }).join('');
    };

    if (component.inputMask && component.phoneInput) {
      return insertNumbersIntoMask(data, component.inputMask);
    }
    return data;
  }

  private normalizeSubmissionDay(component: FormComponent, data: string): string {
    if (data?.split('-').length === 3) {
      const [year, month, day] = data.split('-');
      return (component.dayFirst ? [day, month, year] : [month, day, year]).join('/');
    }
    return data;
  }

  private normalizeSubmissionFile(data: FileData): FileData | [] {
    const isArray = _.isArray(data) && data.length;
    const file = (isArray ? data : [data || {}]) as FileData[];
    const { checksum, id } = file[0];

    if (!checksum || !id) {
      return [];
    }

    return data;
  }

  public validateFileMeta(
    formSchemaInput: Readonly<FormSchema>,
    documentKey: string,
    fileMeta: FormFieldValidationInput,
  ): boolean {
    // Copying values in order to avoid external data mutations
    const formSchema = _.cloneDeep<FormSchema>(formSchemaInput); // TODO: clone later

    const fileComponent = this._findComponentInComponents(formSchema.components, documentKey);
    if (!fileComponent) {
      throw new MissingFormComponentError(documentKey);
    }

    let result = true;
    result &&= this._validateFileSize(fileComponent, fileMeta.size);
    result &&= this._validateFileType(fileComponent, fileMeta);

    return result;
  }

  public checkFieldsExistence(formSchemaInput: Readonly<FormSchema>, fields: string[]): Map<string, boolean> {
    const result: Map<string, boolean> = new Map();
    fields.forEach((field) => {
      if (!result.has(field)) {
        result.set(field, !!this._findComponentInComponents(formSchemaInput.components, field));
      }
    });
    return result;
  }

  protected _findComponentInComponents(components: FormComponent[], key: string): FormComponent | null {
    const foundComponents = findComponents(components, (component: FormComponent) => component.key === key);
    if (foundComponents?.length) {
      return foundComponents[0];
    }
    return null;
  }

  protected _validateFileSize(component: FormComponent, size: number): boolean {
    const componentFileMaxSize = component.fileMaxSize || DEFAULT_MAX_FILE_SIZE;
    const fileSize = bytes.parse(size);
    const fileMaxSize = bytes.parse(componentFileMaxSize);
    if (fileSize > fileMaxSize) {
      throw new FileMaxSizeError(componentFileMaxSize);
    }
    return true;
  }

  protected _validateFileType(component: FormComponent, fileMeta: FormFieldValidationInput): boolean {
    const filePattern = component?.filePattern ?? '';
    const isAllowed: boolean = validateFilePattern(fileMeta, filePattern);
    if (isAllowed) {
      return isAllowed;
    }
    throw new UnsupportedFileTypeError(filePattern);
  }
}
