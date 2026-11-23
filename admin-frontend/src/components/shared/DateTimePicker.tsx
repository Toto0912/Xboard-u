import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar as CalendarIcon, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar, PickerSelect, type DateRangeValue } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const pad2 = (n: number) => String(n).padStart(2, '0');

function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatYmdHm(d: Date): string {
  return `${formatYmd(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseYmd(val?: string): Date | undefined {
  if (!val) return undefined;
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseYmdHm(val?: string): Date | undefined {
  if (!val) return undefined;
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return parseYmd(val);
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
  );
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export interface DateTimePreset {
  label: string;
  getValue: () => string;
}

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  presets?: DateTimePreset[];
  className?: string;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder,
  allowClear = false,
  presets,
  className,
}: DateTimePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const parsed = useMemo(() => parseYmdHm(value), [value]);
  const hour = parsed ? parsed.getHours() : 23;
  const minute = parsed ? parsed.getMinutes() : 59;

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);
  const hourOptions = useMemo(() => hours.map((h) => ({ value: h, label: pad2(h) })), [hours]);
  const minuteOptions = useMemo(() => minutes.map((m) => ({ value: m, label: pad2(m) })), [minutes]);

  const handleDateSelect = (date: Date) => {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
    onChange(formatYmdHm(next));
  };

  const handleHourChange = (nextHour: number) => {
    const base = parsed ?? new Date();
    const next = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      nextHour,
      parsed ? parsed.getMinutes() : 0,
    );
    onChange(formatYmdHm(next));
  };

  const handleMinuteChange = (nextMinute: number) => {
    const base = parsed ?? new Date();
    const next = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      parsed ? parsed.getHours() : 0,
      nextMinute,
    );
    onChange(formatYmdHm(next));
  };

  const displayValue = parsed ? formatYmdHm(parsed).replace('T', ' ') : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'h-9 w-full justify-start px-3 text-left font-mono text-xs font-normal',
            !displayValue && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="flex-1 truncate">
            {displayValue || placeholder || t('common.datePicker.selectDateTime')}
          </span>
          {allowClear && displayValue && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {presets && presets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b px-3 py-2.5">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  const nextVal = preset.getValue();
                  onChange(nextVal);
                  if (!nextVal) setOpen(false);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        )}

        <Calendar mode="single" selected={parsed} onSelect={handleDateSelect} />

        <div className="flex items-center justify-between gap-2 border-t px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <PickerSelect
              ariaLabel={t('common.datePicker.hour')}
              value={hour}
              displayLabel={pad2(hour)}
              options={hourOptions}
              onChange={handleHourChange}
              side="top"
              triggerClassName="h-7 font-mono"
              menuClassName="min-w-[68px] font-mono"
            />
            <span className="font-mono text-xs text-muted-foreground">:</span>
            <PickerSelect
              ariaLabel={t('common.datePicker.minute')}
              value={minute}
              displayLabel={pad2(minute)}
              options={minuteOptions}
              onChange={handleMinuteChange}
              side="top"
              triggerClassName="h-7 font-mono"
              menuClassName="min-w-[68px] font-mono"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onChange(formatYmdHm(new Date()))}
            >
              {t('common.datePicker.now')}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setOpen(false)}
            >
              {t('common.datePicker.done')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  allowClear = false,
  className,
}: DatePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => parseYmd(value), [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'h-9 w-full justify-start px-3 text-left font-mono text-xs font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="flex-1 truncate">
            {value || placeholder || t('common.datePicker.selectDate')}
          </span>
          {allowClear && value && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parsed}
          onSelect={(date) => {
            onChange(formatYmd(date));
            setOpen(false);
          }}
        />
        <div className="flex items-center justify-between border-t px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              onChange(formatYmd(new Date()));
              setOpen(false);
            }}
          >
            {t('common.datePicker.today')}
          </Button>
          {allowClear && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              {t('common.datePicker.clear')}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface DateRangePickerProps {
  value: { from: Date; to: Date };
  onChange: (value: { from: Date; to: Date }) => void;
  placeholder?: string;
  triggerLabel?: string;
  variant?: 'outline' | 'ghost';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function DateRangePicker({
  value,
  onChange,
  placeholder,
  triggerLabel,
  variant = 'outline',
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  className,
}: DateRangePickerProps) {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOnOpenChange) {
      controlledOnOpenChange(next);
    } else {
      setInternalOpen(next);
    }
  };
  const [draft, setDraft] = useState<DateRangeValue>({ from: value.from, to: value.to });

  const rangeText = value.from
    ? value.to
      ? `${formatYmd(value.from)} ~ ${formatYmd(value.to)}`
      : formatYmd(value.from)
    : placeholder || t('common.datePicker.selectDateRange');
  const label = triggerLabel ?? rangeText;

  const draftLabel = draft.from
    ? draft.to
      ? `${formatYmd(draft.from)} ~ ${formatYmd(draft.to)}`
      : `${formatYmd(draft.from)} → ...`
    : t('common.datePicker.selectDateRange');

  const applyQuickDays = (days: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86_400_000);
    onChange({ from, to });
    setOpen(false);
  };

  const applyThisMonth = () => {
    const to = new Date();
    const from = new Date(to.getFullYear(), to.getMonth(), 1);
    onChange({ from, to });
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setDraft({ from: value.from, to: value.to });
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size="sm"
          className={cn(
            'h-8 shrink-0 justify-start whitespace-nowrap px-2.5 text-left font-mono text-xs font-normal',
            className,
          )}
        >
          <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={value.from}
          selected={draft}
          onSelect={(next) => {
            setDraft(next);
            if (next.from && next.to) {
              onChange({ from: next.from, to: next.to });
              setOpen(false);
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-3 py-2 text-xs">
          <span className="font-mono text-muted-foreground">{draftLabel}</span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => applyQuickDays(7)}
            >
              {t('dashboard.last7d')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => applyQuickDays(30)}
            >
              {t('dashboard.last30d')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={applyThisMonth}
            >
              {t('dashboard.thisMonth')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function TimePicker({ value, onChange, className }: TimePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const [rawH, rawM] = (value || '00:00').split(':');
  const currentH = Number(rawH) || 0;
  const currentM = Number(rawM) || 0;

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'h-8 justify-start px-2.5 font-mono text-xs font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <Clock className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-60" />
          <span>{value || t('common.datePicker.selectTime')}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-2" align="start">
        <div className="grid grid-cols-2 gap-1.5">
          <div className="space-y-1">
            <div className="text-center text-[10px] font-medium text-muted-foreground">
              {t('common.datePicker.hour')}
            </div>
            <div
              className="h-44 space-y-0.5 overflow-y-auto rounded border p-1"
              onWheel={(e) => e.stopPropagation()}
            >
              {hours.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => onChange(`${pad2(h)}:${pad2(currentM)}`)}
                  className={cn(
                    'w-full rounded py-1 text-center font-mono text-xs transition-colors cursor-pointer',
                    h === currentH
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {pad2(h)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-center text-[10px] font-medium text-muted-foreground">
              {t('common.datePicker.minute')}
            </div>
            <div
              className="h-44 space-y-0.5 overflow-y-auto rounded border p-1"
              onWheel={(e) => e.stopPropagation()}
            >
              {minutes.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onChange(`${pad2(currentH)}:${pad2(m)}`);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full rounded py-1 text-center font-mono text-xs transition-colors cursor-pointer',
                    m === currentM
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {pad2(m)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
