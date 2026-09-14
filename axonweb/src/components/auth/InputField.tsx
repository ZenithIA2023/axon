import React from "react";

// Campo de texto com ícone das telas de auth. Era duplicado em Login e Signup.
export type InputFieldProps = {
  icon: React.ElementType;
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function InputField({
  icon: Icon,
  label,
  type = "text",
  placeholder,
  value,
  onChange,
}: InputFieldProps) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>

      <div className="flex min-h-10 items-center gap-3 rounded-2xl border border-[#7b2cbf]/20 bg-[#fbf8ff] px-3.5 dark:border-white/10 dark:bg-[#191722] text-[#5b21b6] dark:text-white/78 transition focus-within:border-[#7b2cbf]/45 focus-within:bg-white dark:focus-within:border-[#a855f7]/45 dark:focus-within:bg-[#211c2d]">
        <Icon className="h-4 w-4 shrink-0 text-[#7b2cbf] dark:text-[#d8b4fe]/85" />

        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required
          className="auth-input w-full bg-transparent text-[0.72rem] font-medium text-[#4c1d95] outline-none placeholder:text-[#7b2cbf]/42 dark:text-white/82 dark:placeholder:text-white/38"
        />
      </div>
    </label>
  );
}
