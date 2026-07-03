import * as monaco from 'monaco-editor';

export function setupQasmLanguage(monacoInstance: typeof monaco) {
  // Register a new language
  monacoInstance.languages.register({ id: 'qasm' });

  // Register a tokens provider for the language
  monacoInstance.languages.setMonarchTokensProvider('qasm', {
    keywords: [
      'OPENQASM', 'include', 'qreg', 'creg', 'measure', 'reset',
      'barrier', 'gate', 'opaque', 'if'
    ],

    operators: [
      '==', '!=', '->'
    ],

    symbols:  /[=><!~?:&|+\-*\/\^%]+/,

    tokenizer: {
      root: [
        // identifiers and keywords
        [/[a-z_$][\w$]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        [/[A-Z][\w\$]*/, 'type.identifier' ],  // to show class names nicely

        // whitespace
        { include: '@whitespace' },

        // delimiters and operators
        [/[{}()\[\]]/, '@brackets'],
        [/[<>](?!@symbols)/, '@brackets'],
        [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } } ],

        // numbers
        [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
        [/0[xX][0-9a-fA-F]+/, 'number.hex'],
        [/\d+/, 'number'],

        // delimiter: after number because of .\d floats
        [/[;,.]/, 'delimiter'],

        // strings
        [/"([^"\\]|\\.)*$/, 'string.invalid' ],  // non-teminated string
        [/"/,  { token: 'string.quote', bracket: '@open', next: '@string' } ],
      ],

      string: [
        [/[^\\"]+/,  'string'],
        [/\\./,      'string.escape.invalid'],
        [/"/,        { token: 'string.quote', bracket: '@close', next: '@pop' } ]
      ],

      whitespace: [
        [/[ \t\r\n]+/, 'white'],
        [/\/\*/,       'comment', '@comment' ],
        [/\/\/.*$/,    'comment'],
      ],

      comment: [
        [/[^\/*]+/, 'comment' ],
        [/\/\*/,    'comment', '@push' ],    // nested comment
        ["\\*/",    'comment', '@pop'  ],
        [/[\/*]/,   'comment' ]
      ],
    },
  });

  // Autocomplete basic QASM gates
  monacoInstance.languages.registerCompletionItemProvider('qasm', {
    provideCompletionItems: (model, position) => {
      const suggestions = [
        {
          label: 'OPENQASM',
          kind: monacoInstance.languages.CompletionItemKind.Keyword,
          insertText: 'OPENQASM 2.0;\ninclude "qelib1.inc";\n',
          documentation: 'OpenQASM Header',
        },
        {
          label: 'qreg',
          kind: monacoInstance.languages.CompletionItemKind.Keyword,
          insertText: 'qreg q[${1:5}];',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Quantum Register',
        },
        {
          label: 'creg',
          kind: monacoInstance.languages.CompletionItemKind.Keyword,
          insertText: 'creg c[${1:5}];',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Classical Register',
        },
        {
          label: 'measure',
          kind: monacoInstance.languages.CompletionItemKind.Keyword,
          insertText: 'measure q[${1:0}] -> c[${2:0}];',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Measurement',
        },
        {
          label: 'cx',
          kind: monacoInstance.languages.CompletionItemKind.Function,
          insertText: 'cx q[${1:0}], q[${2:1}];',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Controlled-NOT gate',
        },
        {
          label: 'h',
          kind: monacoInstance.languages.CompletionItemKind.Function,
          insertText: 'h q[${1:0}];',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Hadamard gate',
        },
        {
          label: 'rx',
          kind: monacoInstance.languages.CompletionItemKind.Function,
          insertText: 'rx(${1:pi/2}) q[${2:0}];',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'RX rotation',
        }
      ];
      return { suggestions: suggestions as any };
    }
  });
}
