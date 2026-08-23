declare module "microlighter" {
  export interface HighlightOptions {
    root?: ParentNode;
    selector?: string;
    languageAliases?: Record<string, string>;
  }

  export function highlightAll(
    options?: HighlightOptions
  ): Promise<HTMLElement[]>;
}
