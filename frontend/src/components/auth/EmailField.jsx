export default function EmailField({ value, onChange, error }) {
  return (
    <label className="flex w-full flex-col gap-2 text-left">
      <span className="text-[11px] leading-none font-extrabold tracking-[0.12em] text-[#24272B]">
        ĐỊA CHỈ EMAIL
      </span>

      <input
        className="h-12 w-full rounded-[9px] border border-transparent bg-[#D9F1E7] px-4 text-[14px] font-semibold text-[#25292D] outline-none transition-[border-color,box-shadow] placeholder:text-[#6B7772] placeholder:opacity-100 focus:border-[#168BFF] focus:shadow-[0_0_0_3px_rgba(22,139,255,0.14)]"
        name="email"
        type="email"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "email-error" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="email"
        placeholder="hello@pawworld.com"
        aria-label="Địa chỉ email"
      />
      {error && (
        <span id="email-error" className="text-left text-[11px] font-semibold text-[#D93025]">
          Vui lòng nhập email.
        </span>
      )}
    </label>
  );
}

