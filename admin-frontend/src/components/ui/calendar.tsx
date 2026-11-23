import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DateRangeValue {
  from?: Date;
  to?: Date;
}

interface CalendarBaseProps {
  className?: string;
  numberOfMonths?: 1 | 2;
  defaultMonth?: Date;
}

interface CalendarSingleProps extends CalendarBaseProps {
  mode: 'single';
  selected?: Date;
  onSelect?: (date: Date) => void;
}

interface CalendarRangeProps extends CalendarBaseProps {
  mode: 'range';
  selected?: DateRangeValue;
  onSelect?: (range: DateRangeValue) => void;
}

type CalendarProps = CalendarSingleProps | CalendarRangeProps;

function isSameDay(a?: Date | null, b?: Date | null): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDayTime(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function buildMonthCells(year: number, month: number): Array<{ date: Date; outside: boolean }> {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: Array<{ date: Date; outside: boolean }> = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({
      date: new Date(year, month - 1, prevMonthDays - i),
      outside: true,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: new Date(year, month, d),
      outside: false,
    });
  }
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    cells.push({
      date: new Date(year, month + 1, d),
      outside: true,
    });
  }
  return cells;
}

export interface PickerSelectProps {
  ariaLabel: string;
  value: number;
  displayLabel: string;
  options: Array<{ value: number; label: string }>;
  onChange: (value: number) => void;
  side?: 'bottom' | 'top';
  triggerClassName?: string;
  menuClassName?: string;
}

export function PickerSelect({
  ariaLabel,
  value,
  displayLabel,
  options,
  onChange,
  side = 'bottom',
  triggerClassName,
  menuClassName,
}: PickerSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const list = listRef.current;
    if (list) {
      const activeEl = list.querySelector<HTMLElement>('[data-selected="true"]');
      if (activeEl) {
        list.scrollTop = activeEl.offsetTop - list.clientHeight / 2 + activeEl.clientHeight / 2;
      }
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, value]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium shadow-xs transition-colors hover:bg-accent/50 focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 cursor-pointer',
          triggerClassName,
        )}
      >
        <span className="select-none">{displayLabel}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          onWheel={(e) => e.stopPropagation()}
          className={cn(
            'absolute left-1/2 z-50 max-h-56 min-w-[84px] -translate-x-1/2 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md',
            side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
            menuClassName,
          )}
        >
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                data-selected={selected ? 'true' : undefined}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-sm px-2 py-1.5 text-left text-xs transition-colors cursor-pointer',
                  selected
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-popover-foreground hover:bg-accent/60 hover:text-accent-foreground',
                )}
              >
                <span>{opt.label}</span>
                {selected ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Calendar(props: CalendarProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language || 'zh-CN';
  const numberOfMonths = props.numberOfMonths ?? 1;
  const yearFirst = /^(zh|ja|ko)/i.test(locale);

  const initialAnchor =
    props.defaultMonth ??
    (props.mode === 'single' ? props.selected : props.selected?.from) ??
    new Date();

  const [viewYear, setViewYear] = useState(initialAnchor.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialAnchor.getMonth());
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  useEffect(() => {
    if (props.mode === 'single' && props.selected) {
      setViewYear(props.selected.getFullYear());
      setViewMonth(props.selected.getMonth());
    }
  }, [props.mode, props.mode === 'single' ? props.selected?.getTime() : undefined]);

  const weekdays = useMemo(() => {
    const base = new Date(2024, 0, 7); // Sunday
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
    return Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(base);
      d.setDate(base.getDate() + idx);
      return fmt.format(d);
    });
  }, [locale]);

  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'short' });
    return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2024, m, 1)));
  }, [locale]);

  const minYear = Math.min(1970, viewYear);
  const maxYear = Math.max(2099, viewYear + (numberOfMonths - 1));
  const yearOptions = useMemo(
    () =>
      Array.from({ length: maxYear - minYear + 1 }, (_, i) => {
        const y = minYear + i;
        return { value: y, label: String(y) };
      }),
    [minYear, maxYear],
  );
  const monthOptions = useMemo(
    () => monthNames.map((label, idx) => ({ value: idx, label })),
    [monthNames],
  );

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const setPanelYearMonth = (targetYear: number, targetMonth: number, offset: number) => {
    const base = new Date(targetYear, targetMonth - offset, 1);
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
  };

  const today = new Date();

  const handleDayClick = (date: Date) => {
    if (props.mode === 'single') {
      props.onSelect?.(date);
      return;
    }
    const { from, to } = props.selected ?? {};
    if (!from || (from && to)) {
      props.onSelect?.({ from: date, to: undefined });
    } else if (startOfDayTime(date) < startOfDayTime(from)) {
      props.onSelect?.({ from: date, to: from });
    } else {
      props.onSelect?.({ from, to: date });
    }
  };

  const monthsToRender = Array.from({ length: numberOfMonths }, (_, offset) => {
    const d = new Date(viewYear, viewMonth + offset, 1);
    return { year: d.getFullYear(), month: d.getMonth(), offset };
  });

  return (
    <div className={cn('select-none p-3', props.className)}>
      <div className={cn('flex flex-col gap-4', numberOfMonths === 2 && 'sm:flex-row sm:gap-4')}>
        {monthsToRender.map(({ year, month, offset }) => {
          const cells = buildMonthCells(year, month);
          const yearDropdown = (
            <PickerSelect
              ariaLabel="Year"
              value={year}
              displayLabel={String(year)}
              options={yearOptions}
              onChange={(nextY) => setPanelYearMonth(nextY, month, offset)}
              menuClassName="min-w-[88px]"
            />
          );
          const monthDropdown = (
            <PickerSelect
              ariaLabel="Month"
              value={month}
              displayLabel={monthNames[month]}
              options={monthOptions}
              onChange={(nextM) => setPanelYearMonth(year, nextM, offset)}
              menuClassName="min-w-[88px]"
            />
          );

          return (
            <div
              key={`${year}-${month}-${offset}`}
              className={cn(
                'w-[252px] space-y-2.5',
                numberOfMonths === 2 && offset === 1 && 'sm:border-l sm:pl-4 sm:w-[268px]',
              )}
            >
              <div className="flex items-center justify-between gap-1">
                {offset === 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => shiftMonth(-1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                ) : (
                  <div className="h-8 w-8 shrink-0" />
                )}

                <div className="flex items-center justify-center gap-1.5">
                  {yearFirst ? (
                    <>
                      {yearDropdown}
                      {monthDropdown}
                    </>
                  ) : (
                    <>
                      {monthDropdown}
                      {yearDropdown}
                    </>
                  )}
                </div>

                {offset === monthsToRender.length - 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => shiftMonth(1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <div className="h-8 w-8 shrink-0" />
                )}
              </div>

              <div className="grid grid-cols-7 gap-x-0 text-center text-[12px] font-normal text-muted-foreground">
                {weekdays.map((wd, i) => (
                  <div key={i} className="flex h-8 items-center justify-center">
                    {wd}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-x-0 gap-y-1">
                {cells.map(({ date, outside }, idx) => {
                  if (numberOfMonths === 2 && outside) {
                    return <div key={idx} className="h-8 w-9" />;
                  }

                  const dayTime = startOfDayTime(date);
                  const isToday = isSameDay(date, today);

                  let isSelected = false;
                  let isRangeStart = false;
                  let isRangeEnd = false;
                  let isInRange = false;

                  if (props.mode === 'single') {
                    isSelected = isSameDay(date, props.selected);
                  } else {
                    const from = props.selected?.from;
                    const to = props.selected?.to ?? (from && hoverDate ? hoverDate : undefined);
                    if (from && to) {
                      const minT = Math.min(startOfDayTime(from), startOfDayTime(to));
                      const maxT = Math.max(startOfDayTime(from), startOfDayTime(to));
                      isRangeStart = dayTime === minT;
                      isRangeEnd = dayTime === maxT;
                      isInRange = dayTime > minT && dayTime < maxT;
                      isSelected = isRangeStart || isRangeEnd;
                    } else if (from) {
                      isSelected = isSameDay(date, from);
                      isRangeStart = isSelected;
                      isRangeEnd = isSelected;
                    }
                  }

                  const isSingleRangeDay = isRangeStart && isRangeEnd;
                  const colIdx = idx % 7;

                  return (
                    <div
                      key={idx}
                      className={cn(
                        'flex h-8 w-9 items-center justify-center',
                        isInRange && 'bg-accent text-accent-foreground',
                        isInRange && colIdx === 0 && 'rounded-l-md',
                        isInRange && colIdx === 6 && 'rounded-r-md',
                        isRangeStart && !isSingleRangeDay && 'rounded-l-md bg-accent',
                        isRangeEnd && !isSingleRangeDay && 'rounded-r-md bg-accent',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleDayClick(date)}
                        onMouseEnter={() => {
                          if (props.mode === 'range' && props.selected?.from && !props.selected?.to) {
                            setHoverDate(date);
                          }
                        }}
                        onMouseLeave={() => {
                          if (hoverDate) setHoverDate(null);
                        }}
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-md text-xs transition-colors cursor-pointer',
                          outside && 'text-muted-foreground/40',
                          !outside && !isSelected && !isInRange && 'hover:bg-accent hover:text-accent-foreground',
                          isInRange && 'hover:bg-primary/20',
                          isToday && !isSelected && 'ring-1 ring-primary/60 font-semibold text-primary',
                          isSelected && 'bg-primary text-primary-foreground font-medium hover:bg-primary/90',
                        )}
                      >
                        {date.getDate()}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
