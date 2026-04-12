declare module 'diff' {
  interface ArrayChange<T> {
    value: T[]
    added?: boolean
    removed?: boolean
    count?: number
  }

  export function diffArrays<T>(oldArr: T[], newArr: T[]): ArrayChange<T>[]
}
