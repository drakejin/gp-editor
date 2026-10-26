// i18n-exempt-file: argument problems for MCP clients, never shown in the app
// The subset of JSON Schema (2020-12) the tools' input schemas use, and a check of untrusted arguments against it: the
// first problem found, in words a model can act on.

export type JsonSchemaType = 'object' | 'string' | 'integer' | 'number' | 'boolean' | 'array';

export interface JsonSchema {
  readonly type: JsonSchemaType;
  readonly description?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly enum?: readonly (string | number)[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly items?: JsonSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly default?: string | number | boolean;
}

function article(type: JsonSchemaType): string {
  return type === 'integer' || type === 'object' || type === 'array' ? `an ${type}` : `a ${type}`;
}

function hasType(value: unknown, type: JsonSchemaType): boolean {
  switch (type) {
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
  }
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function numberProblem(schema: JsonSchema, value: number, path: string): string | undefined {
  if (schema.minimum !== undefined && value < schema.minimum) {
    return `${path} must be at least ${schema.minimum}`;
  }
  return schema.maximum !== undefined && value > schema.maximum ? `${path} must be at most ${schema.maximum}` : undefined;
}

function stringProblem(schema: JsonSchema, value: string, path: string): string | undefined {
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    return `${path} must have at least ${plural(schema.minLength, 'character')}`;
  }
  return schema.maxLength !== undefined && value.length > schema.maxLength ? `${path} must have at most ${plural(schema.maxLength, 'character')}` : undefined;
}

function arrayProblem(schema: JsonSchema, value: readonly unknown[], path: string): string | undefined {
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    return `${path} must have at least ${plural(schema.minItems, 'item')}`;
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    return `${path} must have at most ${plural(schema.maxItems, 'item')}`;
  }
  const { items } = schema;
  return items === undefined ? undefined : value.map((item, index) => schemaProblem(items, item, `${path}[${index}]`)).find((problem) => problem !== undefined);
}

function objectProblem(schema: JsonSchema, value: Readonly<Record<string, unknown>>, path: string): string | undefined {
  const properties = schema.properties ?? {};
  const missing = (schema.required ?? []).find((name) => value[name] === undefined);
  if (missing !== undefined) {
    return `${path}.${missing} is required`;
  }
  const names = Object.keys(value);
  const unknown = schema.additionalProperties === false ? names.find((name) => !Object.prototype.hasOwnProperty.call(properties, name)) : undefined;
  if (unknown !== undefined) {
    return `${path}.${unknown} is not a known argument`;
  }
  return names
    .map((name) => {
      const property = Object.prototype.hasOwnProperty.call(properties, name) ? properties[name] : undefined;
      return property === undefined ? undefined : schemaProblem(property, value[name], `${path}.${name}`);
    })
    .find((problem) => problem !== undefined);
}

/** The first way `value` does not fit `schema`, or undefined when it fits. */
export function schemaProblem(schema: JsonSchema, value: unknown, path = 'arguments'): string | undefined {
  if (!hasType(value, schema.type)) {
    return `${path} must be ${article(schema.type)}`;
  }
  if (schema.enum !== undefined && !schema.enum.includes(value as string | number)) {
    return `${path} must be one of ${schema.enum.map((choice) => JSON.stringify(choice)).join(', ')}`;
  }
  if (typeof value === 'number') {
    return numberProblem(schema, value, path);
  }
  if (typeof value === 'string') {
    return stringProblem(schema, value, path);
  }
  if (Array.isArray(value)) {
    return arrayProblem(schema, value, path);
  }
  return schema.type === 'object' ? objectProblem(schema, value as Readonly<Record<string, unknown>>, path) : undefined;
}
