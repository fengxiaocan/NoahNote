import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type ControlProps = { className?: string };

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & ControlProps>(function TextField({ className = "", ...props }, ref) {
  return <input {...props} ref={ref} className={["ui-text-field", className].filter(Boolean).join(" ")} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & ControlProps>(function TextArea({ className = "", ...props }, ref) {
  return <textarea {...props} ref={ref} className={["ui-text-area", className].filter(Boolean).join(" ")} />;
});

export const SelectField = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & ControlProps>(function SelectField({ className = "", ...props }, ref) {
  return <select {...props} ref={ref} className={["ui-select-field", className].filter(Boolean).join(" ")} />;
});

export function Field({ label, children, hint, error, className = "" }: { label: ReactNode; children: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string }) {
  return <label className={["ui-field", className].filter(Boolean).join(" ")}>
    <span className="ui-field-label">{label}</span>
    {children}
    {hint ? <span className="ui-field-hint">{hint}</span> : null}
    {error ? <span className="ui-field-error" role="alert">{error}</span> : null}
  </label>;
}
