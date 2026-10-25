/**
 * A guard for one kind of a union of actions or edits (`{ type }` objects), from the record of its types: a record,
 * so that the compiler refuses one left out (or one too many) when the kind gains a type.
 */
export function isOfTypes<Kind extends { readonly type: string }>(types: Readonly<Record<Kind['type'], true>>): (value: { readonly type: string }) => value is Kind {
  return (value): value is Kind => Object.prototype.hasOwnProperty.call(types, value.type);
}
