export class DRACOLoader {
  _loadLibrary: (url: string, responseType: string) => Promise<string | ArrayBuffer> = async () => ''
  setDecoderConfig(): this { return this }
  setWorkerLimit(): this { return this }
  preload(): this { return this }
  dispose(): this { return this }
}
