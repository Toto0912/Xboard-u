import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

export interface DynamicFieldSchema {
  type: string;
  label?: string;
  placeholder?: string;
  description?: string;
  value?: unknown;
  options?: Record<string, string> | Array<{ label: string; value: string }>;
}

interface DynamicConfigFieldsProps {
  schema: Record<string, DynamicFieldSchema>;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

function normalizeOptions(
  options: DynamicFieldSchema['options'],
): Array<{ label: string; value: string }> {
  if (!options) return [];
  if (Array.isArray(options)) {
    return options.map((o) => ({ label: String(o.label), value: String(o.value) }));
  }
  return Object.entries(options).map(([value, label]) => ({
    value,
    label: String(label),
  }));
}

export function DynamicConfigFields({
  schema,
  values,
  onChange,
}: DynamicConfigFieldsProps) {
  const entries = Object.entries(schema);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-4">
      {entries.map(([key, field]) => {
        const currentValue = values[key] ?? field.value ?? '';
        const type = (field.type || 'string').toLowerCase();
        const label = field.label || key;

        if (type === 'boolean' || type === 'switch') {
          return (
            <div
              key={key}
              className="flex items-start justify-between gap-4 rounded-lg border p-3"
            >
              <div className="space-y-0.5">
                <Label htmlFor={`dyn-${key}`}>{label}</Label>
                {field.description && (
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                )}
              </div>
              <Switch
                id={`dyn-${key}`}
                checked={Boolean(currentValue)}
                onCheckedChange={(checked) => onChange(key, checked)}
              />
            </div>
          );
        }

        if (type === 'select') {
          const opts = normalizeOptions(field.options);
          return (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`dyn-${key}`}>{label}</Label>
              <Select
                value={String(currentValue ?? '')}
                onValueChange={(v) => onChange(key, v)}
              >
                <SelectTrigger id={`dyn-${key}`}>
                  <SelectValue placeholder={field.placeholder || label} />
                </SelectTrigger>
                <SelectContent>
                  {opts.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
              )}
            </div>
          );
        }

        if (type === 'text' || type === 'textarea') {
          return (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`dyn-${key}`}>{label}</Label>
              <Textarea
                id={`dyn-${key}`}
                rows={4}
                placeholder={field.placeholder}
                value={String(currentValue ?? '')}
                onChange={(e) => onChange(key, e.target.value)}
              />
              {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
              )}
            </div>
          );
        }

        return (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`dyn-${key}`}>{label}</Label>
            <Input
              id={`dyn-${key}`}
              type={type === 'number' || type === 'integer' ? 'number' : 'text'}
              placeholder={field.placeholder}
              value={String(currentValue ?? '')}
              onChange={(e) =>
                onChange(
                  key,
                  type === 'number' || type === 'integer'
                    ? e.target.value === ''
                      ? ''
                      : Number(e.target.value)
                    : e.target.value,
                )
              }
            />
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
