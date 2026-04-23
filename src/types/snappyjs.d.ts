declare module 'snappyjs' {
  export function compress(input: Uint8Array): Uint8Array;
  export function decompress(input: Uint8Array): Uint8Array;
}
