/** Creates independent default rows for object-list schema fields. */
import type { JsonRecord } from "./editor-contracts.js";
import { setPath } from "./editor-object-path.js";

type ObjectListItemField = {
  readonly id?: string;
  readonly path?: string;
  readonly defaultValue?: unknown;
  readonly enumValues?: readonly string[];
  readonly required?: boolean;
  readonly kind?: string;
};

type ObjectListField = {
  readonly itemFields?: readonly ObjectListItemField[];
};

export function emptyObjectListRow(field: ObjectListField): JsonRecord {
  const row: JsonRecord = {};
  for (const itemField of field.itemFields ?? []) {
    const defaultValue = defaultObjectListItemValue(itemField);
    if (defaultValue === undefined) {
      continue;
    }
    if (itemField.path !== undefined) {
      setPath(row, itemField.path, structuredClone(defaultValue) as unknown);
    } else if (itemField.id !== undefined) {
      row[itemField.id] = structuredClone(defaultValue) as unknown;
    }
  }
  return row;
}

function defaultObjectListItemValue(field: ObjectListItemField): unknown {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }
  const enumValue = field.enumValues?.[0];
  if (enumValue !== undefined) {
    return enumValue;
  }
  if (field.required === false) {
    return undefined;
  }
  return defaultValueForKind(field.kind, field.required === true);
}

function defaultValueForKind(kind: string | undefined, required: boolean): unknown {
  const defaultValues: Record<string, unknown> = {
    boolean: false,
    integer: 0,
    number: 0,
    array: [],
    object: {},
  };
  return defaultValues[kind ?? ""] ?? (required ? "" : undefined);
}
