import { useEffect, useRef } from 'react';
import 'monaco-editor/editor/common/services/treeViewsDndService.js';
import 'monaco-editor/editor/contrib/anchorSelect/browser/anchorSelect.js';
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard.js';
import 'monaco-editor/editor/contrib/codelens/browser/codelensController.js';
import 'monaco-editor/editor/contrib/comment/browser/comment.js';
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js';
import 'monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo.js';
import 'monaco-editor/editor/contrib/dnd/browser/dnd.js';
import 'monaco-editor/editor/contrib/find/browser/findController.js';
import 'monaco-editor/editor/contrib/folding/browser/folding.js';
import 'monaco-editor/editor/contrib/format/browser/formatActions.js';
import 'monaco-editor/editor/contrib/gotoError/browser/gotoError.js';
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution.js';
import 'monaco-editor/editor/contrib/indentation/browser/indentation.js';
import 'monaco-editor/editor/contrib/suggest/browser/suggestController.js';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/language/json/monaco.contribution.js';
import 'monaco-editor/language/html/monaco.contribution.js';
import 'monaco-editor/languages/definitions/html/register.js';
import 'monaco-editor/languages/definitions/yaml/register.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker.js?worker';
import { formatTemplate, getTemplateDiagnostics } from '@/lib/templateTools';

export type MonacoLanguage = 'json' | 'yaml' | 'html' | 'conf' | 'text';

interface MonacoEditorCoreProps {
  value: string;
  onChange: (value: string) => void;
  language: MonacoLanguage;
  height: string;
  readOnly?: boolean;
  isDark: boolean;
}

let monacoConfigured = false;

function ensureMonacoSetup(): void {
  if (monacoConfigured) return;
  monacoConfigured = true;

  (
    globalThis as typeof globalThis & {
      MonacoEnvironment?: {
        getWorker: (_workerId: string, label: string) => Worker;
      };
    }
  ).MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === 'json') return new JsonWorker();
      if (label === 'html') return new HtmlWorker();
      return new EditorWorker();
    },
  };

  monaco.editor.defineTheme('xboard-ocean-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#080f1d',
      'editorGutter.background': '#0b1425',
      'editor.lineHighlightBackground': '#132138',
      'editorLineNumber.foreground': '#5a7294',
    },
  });

  monaco.editor.defineTheme('xboard-milk-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#fffdf9',
      'editorGutter.background': '#f7f3eb',
      'editor.lineHighlightBackground': '#f3eee4',
      'editorLineNumber.foreground': '#9b9182',
    },
  });

  monaco.languages.register({ id: 'surge-conf' });
  monaco.languages.setMonarchTokensProvider('surge-conf', {
    tokenizer: {
      root: [
        [/^#!.*$/, 'metatag'],
        [/^\s*[#;].*$/, 'comment'],
        [/^\s*\[[^\]\n]+\]/, 'keyword'],
        [/^\s*[A-Za-z0-9_.-]+(?=\s*=)/, 'attribute.name'],
        [/\$[a-zA-Z_][a-zA-Z0-9_]*/, 'variable.predefined'],
        [/https?:\/\/[^\s,]+/, 'string'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],
        [
          /\b(?:DOMAIN-SUFFIX|DOMAIN-KEYWORD|DOMAIN-SET|DOMAIN|IP-CIDR6|IP-CIDR|GEOIP|RULE-SET|USER-AGENT|URL-REGEX|PROCESS-NAME|DEST-PORT|SRC-IP|IN-PORT|PROTOCOL|AND|OR|NOT|FINAL)\b/,
          'keyword',
        ],
        [
          /\b(?:DIRECT|REJECT|REJECT-TINYGIF|REJECT-DROP|Proxy|select|url-test|fallback|load-balance|ssid)\b/,
          'type.identifier',
        ],
        [/\b(?:true|false)\b/i, 'keyword'],
        [/\b\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?\b/, 'number'],
        [/\b\d+(?:\.\d+)?\b/, 'number'],
        [/[=:,]/, 'delimiter'],
      ],
    },
  });

  for (const [langId, toolKind] of [
    ['yaml', 'yaml'],
    ['surge-conf', 'conf'],
  ] as const) {
    monaco.languages.registerDocumentFormattingEditProvider(langId, {
      provideDocumentFormattingEdits(model) {
        try {
          const formatted = formatTemplate(toolKind, model.getValue());
          return [
            {
              range: model.getFullModelRange(),
              text: formatted,
            },
          ];
        } catch {
          return [];
        }
      },
    });
  }
}

function toMonacoLang(lang: MonacoLanguage): string {
  switch (lang) {
    case 'json':
      return 'json';
    case 'yaml':
      return 'yaml';
    case 'html':
      return 'html';
    case 'conf':
      return 'surge-conf';
    default:
      return 'plaintext';
  }
}

function updateCustomMarkers(
  model: monaco.editor.ITextModel,
  language: MonacoLanguage,
): void {
  if (language !== 'yaml' && language !== 'conf') {
    monaco.editor.setModelMarkers(model, 'xboard-validator', []);
    return;
  }

  const diagnostics = getTemplateDiagnostics(language, model.getValue());
  const markers: monaco.editor.IMarkerData[] = diagnostics.map((d) => ({
    severity: monaco.MarkerSeverity.Error,
    startLineNumber: d.startLineNumber,
    startColumn: d.startColumn,
    endLineNumber: d.endLineNumber,
    endColumn: d.endColumn,
    message: d.message,
  }));
  monaco.editor.setModelMarkers(model, 'xboard-validator', markers);
}

export default function MonacoEditorCore({
  value,
  onChange,
  language,
  height,
  readOnly = false,
  isDark,
}: MonacoEditorCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const onChangeRef = useRef(onChange);
  const languageRef = useRef(language);
  const markerTimerRef = useRef<number | null>(null);

  onChangeRef.current = onChange;
  languageRef.current = language;

  useEffect(() => {
    ensureMonacoSetup();
    const container = containerRef.current;
    if (!container) return;

    const model = monaco.editor.createModel(value, toMonacoLang(language));
    modelRef.current = model;

    const editor = monaco.editor.create(container, {
      model,
      theme: isDark ? 'xboard-ocean-dark' : 'xboard-milk-light',
      readOnly,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineHeight: 20,
      tabSize: 2,
      insertSpaces: true,
      wordWrap: 'off',
      folding: true,
      renderLineHighlight: 'line',
      padding: { top: 8, bottom: 8 },
    });
    editorRef.current = editor;

    updateCustomMarkers(model, language);

    const sub = model.onDidChangeContent(() => {
      const next = model.getValue();
      onChangeRef.current(next);

      if (markerTimerRef.current !== null) {
        window.clearTimeout(markerTimerRef.current);
      }
      markerTimerRef.current = window.setTimeout(() => {
        updateCustomMarkers(model, languageRef.current);
      }, 300);
    });

    return () => {
      if (markerTimerRef.current !== null) {
        window.clearTimeout(markerTimerRef.current);
      }
      sub.dispose();
      editor.dispose();
      model.dispose();
      editorRef.current = null;
      modelRef.current = null;
    };
    // Mount once per component instance; subsequent prop changes sync below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    monaco.editor.setTheme(isDark ? 'xboard-ocean-dark' : 'xboard-milk-light');
  }, [isDark]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    monaco.editor.setModelLanguage(model, toMonacoLang(language));
    updateCustomMarkers(model, language);
  }, [language]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    if (model.getValue() !== value) {
      model.setValue(value);
      updateCustomMarkers(model, languageRef.current);
    }
  }, [value]);

  return <div ref={containerRef} style={{ height }} className="w-full" />;
}
