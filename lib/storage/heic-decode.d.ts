// heic-decode ships no types. Only the parts lib/storage/avatar-image.ts uses.
declare module "heic-decode" {
  interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }

  interface PendingImage {
    width: number;
    height: number;
    decode(): Promise<DecodedImage>;
  }

  interface Decode {
    (input: { buffer: Uint8Array }): Promise<DecodedImage>;
    all(input: { buffer: Uint8Array }): Promise<PendingImage[] & { dispose(): void }>;
  }

  const decode: Decode;
  export default decode;
}
