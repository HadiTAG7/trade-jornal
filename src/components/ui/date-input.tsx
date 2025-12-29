import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface DateInputProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  dateFormat?: string;
}

export function DateInput({
  value,
  onChange,
  placeholder = "Select date",
  className,
  disabled = false,
  dateFormat = "MM/dd/yyyy",
}: DateInputProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [isOpen, setIsOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sync input value with external value
  React.useEffect(() => {
    if (value && isValid(value)) {
      setInputValue(format(value, dateFormat));
      setError(null);
    } else if (!value) {
      setInputValue("");
      setError(null);
    }
  }, [value, dateFormat]);

  const parseDate = (text: string): Date | null => {
    if (!text.trim()) return null;

    // Try parsing with the expected format first
    let parsed = parse(text, dateFormat, new Date());
    if (isValid(parsed)) return parsed;

    // Try common alternative formats
    const formats = [
      "yyyy-MM-dd",
      "MM/dd/yyyy",
      "MM-dd-yyyy",
      "dd/MM/yyyy",
      "M/d/yyyy",
      "M/d/yy",
      "MM/dd/yy",
    ];

    for (const fmt of formats) {
      parsed = parse(text, fmt, new Date());
      if (isValid(parsed)) return parsed;
    }

    return null;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputValue(text);

    if (!text.trim()) {
      setError(null);
      return;
    }

    const parsed = parseDate(text);
    if (parsed) {
      setError(null);
    } else {
      setError(`Invalid date format. Use ${dateFormat}`);
    }
  };

  const handleInputBlur = () => {
    if (!inputValue.trim()) {
      onChange(undefined);
      setError(null);
      return;
    }

    const parsed = parseDate(inputValue);
    if (parsed) {
      onChange(parsed);
      setInputValue(format(parsed, dateFormat));
      setError(null);
    } else {
      setError(`Invalid date format. Use ${dateFormat}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInputBlur();
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    onChange(date);
    if (date) {
      setInputValue(format(date, dateFormat));
    } else {
      setInputValue("");
    }
    setError(null);
    setIsOpen(false);
  };

  // Determine the month to display in calendar
  const calendarMonth = value && isValid(value) ? value : new Date();

  return (
    <div className={cn("relative", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <div className="relative">
          <Input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              "pr-10",
              error && "border-destructive focus-visible:ring-destructive"
            )}
          />
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              disabled={disabled}
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setIsOpen(true)}
            >
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
        </div>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleCalendarSelect}
            defaultMonth={calendarMonth}
            initialFocus
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}
    </div>
  );
}
