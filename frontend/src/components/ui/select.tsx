import * as React from "react"
import clsx from "clsx"
import { ChevronDownIcon } from '@heroicons/react/24/outline'

interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
  disabled?: boolean
  className?: string
}

interface SelectTriggerProps {
  children: React.ReactNode
  className?: string
}

interface SelectContentProps {
  children: React.ReactNode
  className?: string
}

interface SelectItemProps {
  value: string
  children: React.ReactNode
  className?: string
}

interface SelectValueProps {
  placeholder?: string
  className?: string
}

const SelectContext = React.createContext<{
  value: string
  onValueChange: (value: string) => void
  isOpen: boolean
  setIsOpen: (open: boolean) => void
} | null>(null)

export const Select: React.FC<SelectProps> = ({
  value,
  onValueChange,
  children,
  disabled = false,
  className
}) => {
  const [isOpen, setIsOpen] = React.useState(false)
  
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <SelectContext.Provider value={{ value, onValueChange, isOpen, setIsOpen }}>
      <div className={clsx("relative", className)}>
        {children}
      </div>
    </SelectContext.Provider>
  )
}

export const SelectTrigger: React.FC<SelectTriggerProps> = ({
  children,
  className
}) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectTrigger must be used within Select")

  const { isOpen, setIsOpen } = context

  return (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className={clsx(
        "flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {children}
      <ChevronDownIcon className={clsx("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
    </button>
  )
}

export const SelectValue: React.FC<SelectValueProps> = ({
  placeholder = "Select an option",
  className
}) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectValue must be used within Select")

  const { value } = context
  
  return (
    <span className={clsx("truncate", value ? "text-gray-900" : "text-gray-400", className)}>
      {value || placeholder}
    </span>
  )
}

export const SelectContent: React.FC<SelectContentProps> = ({
  children,
  className
}) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectContent must be used within Select")

  const { isOpen } = context

  if (!isOpen) return null

  return (
    <div className={clsx(
      "absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg",
      className
    )}>
      <div className="max-h-60 overflow-auto py-1">
        {children}
      </div>
    </div>
  )
}

export const SelectItem: React.FC<SelectItemProps> = ({
  value,
  children,
  className
}) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectItem must be used within Select")

  const { value: selectedValue, onValueChange, setIsOpen } = context

  const handleSelect = () => {
    onValueChange(value)
    setIsOpen(false)
  }

  return (
    <button
      type="button"
      onClick={handleSelect}
      className={clsx(
        "w-full px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none",
        selectedValue === value && "bg-blue-50 text-blue-900",
        className
      )}
    >
      {children}
    </button>
  )
}