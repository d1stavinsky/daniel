"use client"

import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

type Option = { value: string; label: string }

type FieldSelectProps = {
  value: string
  onChange: (value: string) => void
  options: Option[]
  className?: string
  disabled?: boolean
  "aria-label"?: string
}

export function FieldSelect({ value, onChange, options, className, disabled, ...rest }: FieldSelectProps) {
  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={rest["aria-label"]}
        className="h-9 w-full appearance-none rounded-lg border border-border bg-background pr-3 pl-8 text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
    </div>
  )
}
