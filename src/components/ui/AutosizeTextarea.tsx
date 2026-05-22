import { useEffect, useRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export default function AutosizeTextarea({ className, value, onChange, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      className={cn("resize-none overflow-hidden", className)}
      {...props}
    />
  );
}
