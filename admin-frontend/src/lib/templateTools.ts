import { parseDocument } from 'yaml';

export type TemplateToolKind = 'json' | 'yaml' | 'conf';

export type ValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export interface TemplateDiagnostic {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
}

function validateConfSyntax(content: string): {
  sections: Set<string>;
  error?: { line: number; col: number; length: number; message: string };
} {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const sections = new Set<string>();
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }

    if (trimmed.startsWith('[')) {
      if (!trimmed.endsWith(']') || trimmed.length < 3) {
        const startCol = raw.indexOf('[') + 1;
        return {
          sections,
          error: {
            line: i + 1,
            col: startCol > 0 ? startCol : 1,
            length: Math.max(1, trimmed.length),
            message: `Line ${i + 1}: unclosed section header "${trimmed}"`,
          },
        };
      }
      currentSection = trimmed.slice(1, -1).trim().toLowerCase();
      sections.add(currentSection);
      continue;
    }

    if (currentSection === 'general' && !trimmed.includes('=')) {
      const firstNonSpace = raw.search(/\S/);
      return {
        sections,
        error: {
          line: i + 1,
          col: firstNonSpace >= 0 ? firstNonSpace + 1 : 1,
          length: Math.max(1, trimmed.length),
          message: `Line ${i + 1}: expected "key = value" inside [General]`,
        },
      };
    }
  }

  return { sections };
}

export function getTemplateDiagnostics(
  kind: TemplateToolKind,
  content: string,
): TemplateDiagnostic[] {
  if (!content.trim()) {
    return [
      {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 2,
        message: 'Template content is empty',
      },
    ];
  }

  if (kind === 'json') {
    try {
      const parsed: unknown = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return [
          {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 2,
            message: 'JSON root must be an object',
          },
        ];
      }
      return [];
    } catch (err) {
      return [
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 2,
          message: err instanceof Error ? err.message : 'Invalid JSON',
        },
      ];
    }
  }

  if (kind === 'yaml') {
    try {
      const doc = parseDocument(content, { uniqueKeys: true });
      if (doc.errors.length > 0) {
        return doc.errors.map((err) => {
          const start = err.linePos?.[0] ?? { line: 1, col: 1 };
          const end = err.linePos?.[1] ?? {
            line: start.line,
            col: start.col + 1,
          };
          return {
            startLineNumber: start.line,
            startColumn: start.col,
            endLineNumber: end.line,
            endColumn: Math.max(end.col, start.col + 1),
            message: err.message,
          };
        });
      }
      const js = doc.toJS();
      if (!js || typeof js !== 'object' || Array.isArray(js)) {
        return [
          {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 2,
            message: 'YAML root must be a mapping object',
          },
        ];
      }
      return [];
    } catch (err) {
      return [
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 2,
          message: err instanceof Error ? err.message : 'Invalid YAML',
        },
      ];
    }
  }

  const { sections, error } = validateConfSyntax(content);
  if (error) {
    return [
      {
        startLineNumber: error.line,
        startColumn: error.col,
        endLineNumber: error.line,
        endColumn: error.col + error.length,
        message: error.message,
      },
    ];
  }

  const diagnostics: TemplateDiagnostic[] = [];
  const missingSections = ['proxy', 'proxy group', 'rule'].filter(
    (s) => !sections.has(s),
  );
  if (missingSections.length > 0) {
    diagnostics.push({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2,
      message: `Missing required sections: ${missingSections.map((s) => `[${s}]`).join(', ')}`,
    });
  }

  const missingPlaceholders = ['$proxies', '$proxy_group'].filter(
    (p) => !content.includes(p),
  );
  if (missingPlaceholders.length > 0) {
    diagnostics.push({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2,
      message: `Missing required placeholders: ${missingPlaceholders.join(', ')}`,
    });
  }

  return diagnostics;
}

export function validateTemplate(
  kind: TemplateToolKind,
  content: string,
): ValidationResult {
  const diagnostics = getTemplateDiagnostics(kind, content);
  if (diagnostics.length > 0) {
    return { ok: false, message: diagnostics[0].message };
  }
  return { ok: true };
}

export function formatTemplate(kind: TemplateToolKind, content: string): string {
  if (!content.trim()) {
    throw new Error('Template content is empty');
  }

  if (kind === 'json') {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON root must be an object');
    }
    return `${JSON.stringify(parsed, null, 2)}\n`;
  }

  if (kind === 'yaml') {
    const doc = parseDocument(content, { uniqueKeys: true });
    if (doc.errors.length > 0) {
      const first = doc.errors[0];
      const pos = first.linePos?.[0];
      const loc = pos ? `Line ${pos.line}, Col ${pos.col}: ` : '';
      throw new Error(`${loc}${first.message}`);
    }
    return doc.toString({ indent: 2, lineWidth: 0 });
  }

  const { error } = validateConfSyntax(content);
  if (error) {
    throw new Error(error.message);
  }

  const rawLines = content.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];

  for (const rawLine of rawLines) {
    const line = rawLine.replace(/[ \t]+$/g, '');
    const trimmed = line.trim();

    if (!trimmed) {
      if (out.length > 0 && out[out.length - 1] !== '') {
        out.push('');
      }
      continue;
    }

    const isSection = trimmed.startsWith('[') && trimmed.endsWith(']');
    if (isSection && out.length > 0) {
      const prev = out[out.length - 1];
      if (prev !== '' && !prev.trim().startsWith('#')) {
        out.push('');
      }
    }

    out.push(line);
  }

  while (out.length > 0 && out[out.length - 1] === '') {
    out.pop();
  }

  return `${out.join('\n')}\n`;
}
