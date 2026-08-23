import { Editor, useMonaco } from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import { setupQasmLanguage } from '../../ide/qasm-language';
import type { editor } from 'monaco-editor';
import { useTheme } from '../../hooks/useTheme';

interface EditorPanelProps {
  code: string;
  language: string;
  onChange: (value: string | undefined) => void;
  error?: { line?: number; message: string } | null;
}

export default function EditorPanel({ code, language, onChange, error }: EditorPanelProps) {
  const monaco = useMonaco();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const { theme } = useTheme();

  // Set up custom QASM language when monaco is available
  useEffect(() => {
    if (monaco) {
      setupQasmLanguage(monaco);
    }
  }, [monaco]);

  // Handle error markers
  useEffect(() => {
    if (!monaco || !editorRef.current) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    if (error && error.line && error.line > 0) {
      const marker: editor.IMarkerData = {
        message: error.message,
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: error.line,
        startColumn: 1,
        endLineNumber: error.line,
        endColumn: model.getLineMaxColumn(error.line),
      };
      monaco.editor.setModelMarkers(model, 'owner', [marker]);
    } else {
      monaco.editor.setModelMarkers(model, 'owner', []);
    }
  }, [error, monaco]);

  return (
    <div
      className="editor-panel"
      style={{
        width: '100%',
        height: '100%',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      <Editor
        height="100%"
        language={language}
        theme={theme === 'dark' ? 'vs-dark' : 'light'}
        value={code}
        onChange={onChange}
        onMount={(editor) => {
          editorRef.current = editor;
        }}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: 'var(--font-mono)',
          padding: { top: 16 },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          formatOnPaste: true,
        }}
      />
    </div>
  );
}
