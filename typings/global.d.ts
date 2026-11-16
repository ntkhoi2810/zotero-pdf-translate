declare const _globalThis: {
  [key: string]: any;
  Zotero: _ZoteroTypes.Zotero;
  crypto: Crypto;
  TextEncoder: typeof TextEncoder;
  ztoolkit: ZToolkit;
  addon: typeof addon;
};

declare type ZToolkit = ReturnType<
  typeof import("../src/utils/ztoolkit").createZToolkit
>;

declare const ztoolkit: ZToolkit;

declare const rootURI: string;

declare const addon: import("../src/addon").default;

declare const __env__: "production" | "development";

declare const PathUtils: {
  join: (...parts: string[]) => string;
};

declare const IOUtils: {
  exists: (path: string) => Promise<boolean>;
  readUTF8: (path: string) => Promise<string>;
  writeUTF8: (
    path: string,
    contents: string,
    options?: { tmpPath?: string },
  ) => Promise<void>;
  makeDirectory: (
    path: string,
    options?: { createAncestors?: boolean; ignoreExisting?: boolean },
  ) => Promise<void>;
};

declare class XULElementBase extends HTMLElement {
  get content(): DocumentFragment;
  init(): void;
  destroy(): void;
  connectedCallback(): void;
  disconnectedCallback(): void;
  attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string,
  ): void;
  _handleWindowUnload(): void;
  initialized: boolean;
  static get observedAttributes(): string[];
}

declare class MozXULElement {
  static parseXULToFragment(xul: string): DocumentFragment;
  static insertFTLIfNeeded(ftl: string): void;
}

declare namespace Zotero {
  const PDFTranslate: import("../src/addon").default;
}
