import { useState } from "react";

const OTP_LENGTH = 6;

export default function OtpField() {
  const [digits, setDigits] = useState(
    Array(OTP_LENGTH).fill("")
  );

  const handleChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);

    setDigits((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? digit : item
      )
    );
  };

  return (
    <fieldset className="w-full border-0 p-0 text-left">
      <legend className="text-[11px] leading-none font-extrabold tracking-[0.12em] text-[#24272B]">NHẬP MÃ OTP</legend>

      <div className="mt-2 grid w-full grid-cols-6 gap-1.5">
        {digits.map((digit, index) => (
          <input
            key={index}
            aria-label={`Chữ số OTP ${index + 1}`}
            className="h-12 w-full min-w-0 rounded-[9px] border border-transparent bg-[#D9F1E7] px-0 text-center text-[18px] font-semibold text-[#25292D] outline-none transition-[border-color,box-shadow] focus:border-[#168BFF] focus:shadow-[0_0_0_3px_rgba(22,139,255,0.14)]"
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(event) =>
              handleChange(index, event.target.value)
            }
          />
        ))}
      </div>

      <p className="mt-2 text-[11px] font-semibold text-[#676C72]">
        Mã OTP đã được gửi đến email của bạn.
      </p>
    </fieldset>
  );
}
