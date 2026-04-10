import React from "react";

import { cn } from "@/shared/lib/utils";

const EmployeeSelectionCheckbox = ({
  checked = false,
  onCheckedChange,
  className,
  ...props
}) => {
  return (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      className={cn(
        "h-4 w-4 shrink-0 rounded border border-input bg-background align-top accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
};

export default EmployeeSelectionCheckbox;
