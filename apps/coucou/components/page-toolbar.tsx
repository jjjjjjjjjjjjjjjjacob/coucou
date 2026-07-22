import { Filter } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface PageToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  mobileFilterContent?: React.ReactNode;
}

function PageToolbar({ children, mobileFilterContent, className, ...props }: PageToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      {...props}
    >
      <div className="flex flex-1 items-center gap-3 overflow-x-auto pb-1 sm:pb-0">{children}</div>
      {mobileFilterContent ? (
        <div className="sm:hidden">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" aria-label="More filters">
                <Filter className="h-4 w-4" />
                Filters
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <div className="space-y-4">{mobileFilterContent}</div>
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
    </div>
  );
}

export { PageToolbar };
