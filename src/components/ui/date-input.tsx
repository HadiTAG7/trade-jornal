import * as React from "react";
import { format, parse, isValid, setMonth, setYear, getMonth, getYear } from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DayPicker } from "react-day-picker";
import { buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface DateInputProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  dateFormat?: string;
}

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Generate years from 2010 to current year + 1
const currentYear = new Date().getFullYear();
const years = Array.from({ length: currentYear - 2009 }, (_, i) => 2010 + i);

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
  const [displayMonth, setDisplayMonth] = React.useState<Date>(value || new Date());

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

  // Update display month when value changes
  React.useEffect(() => {
    if (value && isValid(value)) {
      setDisplayMonth(value);
    }
  }, [value]);

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
      setDisplayMonth(date);
    } else {
      setInputValue("");
    }
    setError(null);
    setIsOpen(false);
  };

  const handleMonthChange = (monthStr: string) => {
    const newMonth = parseInt(monthStr, 10);
    setDisplayMonth(setMonth(displayMonth, newMonth));
  };

  const handleYearChange = (yearStr: string) => {
    const newYear = parseInt(yearStr, 10);
    setDisplayMonth(setYear(displayMonth, newYear));
  };

  const handlePrevMonth = () => {
    setDisplayMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  };

  const handleNextMonth = () => {
    setDisplayMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  };

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
          <div className="p-3 pointer-events-auto">
            {/* Custom Header with Year/Month Selectors */}
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={handlePrevMonth}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex items-center gap-1">
                <Select
                  value={getMonth(displayMonth).toString()}
                  onValueChange={handleMonthChange}
                >
                  <SelectTrigger className="h-8 w-[110px] text-sm font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((month, index) => (
                      <SelectItem key={month} value={index.toString()}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select
                  value={getYear(displayMonth).toString()}
                  onValueChange={handleYearChange}
                >
                  <SelectTrigger className="h-8 w-[80px] text-sm font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={handleNextMonth}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Day Grid */}
            <DayPicker
              mode="single"
              selected={value}
              onSelect={handleCalendarSelect}
              month={displayMonth}
              onMonthChange={setDisplayMonth}
              showOutsideDays
              className="p-0"
              classNames={{
                months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                month: "space-y-4",
                caption: "hidden",
                nav: "hidden",
                table: "w-full border-collapse space-y-1",
                head_row: "flex",
                head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
                row: "flex w-full mt-2",
                cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
                day_range_end: "day-range-end",
                day_selected:
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                day_today: "bg-accent text-accent-foreground",
                day_outside:
                  "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
                day_disabled: "text-muted-foreground opacity-50",
                day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                day_hidden: "invisible",
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}
    </div>
  );
}
