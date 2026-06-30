"use client";

import * as React from "react";

/**
 * withFieldId — associate a `<label htmlFor={id}>` with its control (audit #16).
 *
 * The rebuild's per-page `Field` helpers wrap an arbitrary child control
 * (`<input>`, `<textarea>`, or the custom `SelectInput`). To make the label
 * programmatically point at that control we clone the single child element and
 * inject the generated `id` — unless the child already carries an `id` (then we
 * leave it alone so an explicit id always wins).
 *
 * Custom wrappers (e.g. `SelectInput`) must forward the injected `id` down to
 * their underlying form control for this to take effect; native elements get it
 * directly.
 *
 * Usage inside a `Field` helper:
 *   const id = React.useId();
 *   <label htmlFor={id}>…</label>
 *   {withFieldId(children, id)}
 */
export function withFieldId(children: React.ReactNode, id: string): React.ReactNode {
  if (!React.isValidElement(children)) return children;
  const existing = (children.props as { id?: string }).id;
  if (existing) return children;
  return React.cloneElement(children as React.ReactElement<{ id?: string }>, { id });
}
