declare module 'monaco-editor' {
  export namespace editor {
    interface ITextModel {
      getWordUntilPosition(position: Position): { word: string; startColumn: number; endColumn: number };
      getLineMaxColumn(lineNumber: number): number;
    }

    interface IMarkerData {
      message: string;
      severity: MarkerSeverity;
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    }

    interface IStandaloneCodeEditor {
      getModel(): ITextModel | null;
      getValue(): string;
      setValue(value: string): void;
    }

    interface IStandaloneEditorConstructionOptions {}

    function setModelMarkers(model: ITextModel, owner: string, markers: IMarkerData[]): void;
  }

  export namespace languages {
    enum CompletionItemKind {
      Keyword = 17,
      Function = 1,
    }
    enum CompletionItemInsertTextRule {
      InsertAsSnippet = 4,
    }
    interface CompletionItem {
      label: string;
      kind: CompletionItemKind;
      insertText: string;
      insertTextRules?: CompletionItemInsertTextRule;
      documentation?: string;
      range?: unknown;
    }
    interface CompletionList {
      suggestions: CompletionItem[];
    }
    interface CompletionItemProvider {
      provideCompletionItems(model: editor.ITextModel, position: Position): CompletionList;
    }
    function register(language: { id: string }): void;
    function setMonarchTokensProvider(languageId: string, languageDef: unknown): void;
    function registerCompletionItemProvider(languageId: string, provider: CompletionItemProvider): void;
  }

  export enum MarkerSeverity {
    Hint = 1,
    Info = 2,
    Warning = 4,
    Error = 8,
  }

  export class Position {
    lineNumber: number;
    column: number;
  }

  export interface IRange {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  }
}
