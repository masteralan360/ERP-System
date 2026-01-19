import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GlobalSearchProps {
    className?: string
    placeholder?: string
}

export function GlobalSearch({ className, placeholder = "Search..." }: GlobalSearchProps) {
    return (
        <div className={cn("relative w-full group", className)}>
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <input
                type="text"
                className={cn(
                    "flex h-9 w-full rounded-md border border-input bg-secondary/50 px-3 py-1 text-sm shadow-sm transition-all duration-300",
                    "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    "pl-9 text-center focus:text-left focus:bg-background/80"
                )}
                placeholder={placeholder}
                spellCheck={false}
            />
        </div>
    )
}
