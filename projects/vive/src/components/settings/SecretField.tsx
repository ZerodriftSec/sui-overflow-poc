import { useState } from "react";

export interface SecretFieldProps {
  label: string;
  id: string;
  value: string;
  placeholder: string;
  hint?: React.ReactNode;
  onChange: (value: string) => void;
  readOnly?: boolean;
  ref?: React.Ref<HTMLInputElement>;
}

export function SecretField({
  label,
  id,
  value,
  placeholder,
  hint,
  onChange,
  readOnly = false,
  ref,
}: SecretFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-border bg-input px-3 py-2 pr-16 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring read-only:cursor-default read-only:opacity-80"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
