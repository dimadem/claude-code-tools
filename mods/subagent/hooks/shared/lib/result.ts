// Errors as values: Result<T, E> in place of a throw, settle (a promise as a
// Result), ignore (for `.catch` where a failure changes nothing) and unreachable
// (the end of a switch that names every kind).

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export async function settle<T>(promise: Promise<T>): Promise<Result<T, string>> {
  try {
    return ok(await promise)
  } catch (error) {
    return err(String(error))
  }
}

export function ignore(): void {}

export function unreachable(value: never): never {
  throw new Error(`unexpected value: ${JSON.stringify(value)}`)
}
