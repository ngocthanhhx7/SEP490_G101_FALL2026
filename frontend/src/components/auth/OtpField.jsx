import { useEffect, useRef, useState } from "react";

const OTP_LENGTH = 6;

export default function OtpField({ otp, error, disabled, onOtpChange, onResend, onEditEmail }) {
  const digits = Array.from({ length: OTP_LENGTH }, (_, index) => otp[index] || "");
  const [resendCountdown, setResendCountdown] = useState(0);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (resendCountdown === 0) return undefined;

    const timer = setInterval(() => {
      setResendCountdown((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCountdown]);

  const handleChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);

    onOtpChange(`${otp.slice(0, index)}${digit}${otp.slice(index + 1)}`.slice(0, OTP_LENGTH));

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, event) => {
    if (
      event.key === "Backspace" &&
      !digits[index] &&
      index > 0
    ) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResend = async (event) => {
    event.preventDefault();
    if (resendCountdown > 0 || disabled) return;
    if (await onResend()) setResendCountdown(60);
  };

  const handleEditEmail = (event) => {
    event.preventDefault();
    onEditEmail();
  };

  return (
    <fieldset className="w-full border-0 p-0 text-left">
      <legend className="text-[11px] leading-none font-extrabold tracking-[0.12em] text-[#24272B]">NHẬP MÃ OTP</legend>

      <div className="mt-2 grid w-full grid-cols-6 gap-1.5">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              inputRefs.current[index] = element;
            }}
            aria-label={`Chữ số OTP ${index + 1}`}
            className="h-12 w-full min-w-0 rounded-[9px] border border-transparent bg-[#D9F1E7] px-0 text-center text-[18px] font-semibold text-[#25292D] outline-none transition-[border-color,box-shadow] focus:border-[#168BFF] focus:shadow-[0_0_0_3px_rgba(22,139,255,0.14)]"
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            disabled={disabled}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onChange={(event) =>
              handleChange(index, event.target.value)
            }
          />
        ))}
      </div>

      <p className="mt-2 text-[11px] font-semibold text-[#676C72]">
        Mã OTP đã được gửi đến email của bạn.
      </p>
      {error && <p className="mt-2 text-[11px] font-semibold text-[#D93025]" role="alert">{error}</p>}
      <p className="mt-1 text-[11px] font-semibold text-[#676C72]">
        Không nhận được mã?{" "}
        {resendCountdown > 0 ? (
          <span aria-live="polite">Gửi lại sau {resendCountdown}s</span>
        ) : (
          <a
            className="font-extrabold text-[#F26722] underline-offset-3 hover:underline"
            href="#resend-otp"
            onClick={handleResend}
          >
            Gửi lại OTP
          </a>
        )}
        <span className="px-1 text-[#A2A5A8]">|</span>
        <a
          className="font-extrabold text-[#F26722] underline-offset-3 hover:underline"
          href="#enter-email"
          onClick={handleEditEmail}
        >
          Nhập lại Email
        </a>
      </p>
    </fieldset>
  );
}
