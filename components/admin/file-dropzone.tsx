"use client"

import { useRef, useState } from "react"
import { UploadCloud } from "lucide-react"
import { cn } from "@/lib/utils"

type FileDropzoneProps = {
  onFiles: (fileNames: string[]) => void
  label?: string
  accept?: string
  disabled?: boolean
}

export function FileDropzone({
  onFiles,
  label = "גררו קובץ לכאן או לחצו לבחירה",
  accept = "application/pdf,image/*",
  disabled = false,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    onFiles(Array.from(list).map((f) => f.name))
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(e) => {
        if (disabled) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (disabled) return
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-4 text-center transition-colors",
        disabled
          ? "cursor-not-allowed border-border/60 opacity-50"
          : "cursor-pointer border-border hover:border-primary/60 hover:bg-primary/5",
        dragging && "border-primary bg-primary/10",
      )}
    >
      <UploadCloud
        className={cn("size-5", dragging ? "text-primary" : "text-muted-foreground")}
        aria-hidden="true"
      />
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ""
        }}
      />
    </div>
  )
}
