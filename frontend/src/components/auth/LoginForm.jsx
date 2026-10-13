import { useState } from "react";
import OtpField from "./OtpField";
import SubmitButton from "./SubmitButton";
import EmailField from "./EmailField";
import OtpButton from "./OtpButton";
import { requestLoginOtp, resendLoginOtp, verifyLoginOtp } from "../../services/auth-api";

const GMAIL_PATTERN = /^[^\s@]+@gmail\.com$/i;

export default function LoginForm() {
  const [otpSent, setOtpSent] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otp, setOtp] = useState("");

  const handleEmailChange = (value) => {
    setEmail(value);
    if (value.trim()) setEmailError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email.trim()) {
      setEmailError("Vui lòng nhập email.");
      return;
    }

    if (!GMAIL_PATTERN.test(email.trim())) {
      setEmailError("Email phải có định dạng địa chỉ@gmail.com.");
      return;
    }

    setBusy(true);
    setEmailError("");
    try {
      await requestLoginOtp(email.trim());
      setOtpSent(true);
      setMessage("Mã OTP đã được gửi đến email của bạn.");
    } catch (error) {
      setEmailError(error.message || "Không thể gửi OTP.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    setBusy(true);
    setOtpError("");
    setMessage("");
    try {
      const result = await verifyLoginOtp(email.trim(), otp);
      setMessage(result.message || "Đăng nhập thành công.");
    } catch (error) {
      setOtp("");
      setOtpError(error.message || "OTP không đúng.");
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    try {
      await resendLoginOtp(email.trim());
      setOtpError("");
      setMessage("Mã OTP mới đã được gửi.");
      return true;
    } catch (error) {
      setOtpError(error.message || "Không thể gửi lại OTP.");
      return false;
    }
  };

  return (
    <main className="flex h-[513px] w-[356px] max-w-full flex-col rounded-[18px] border border-[#168BFF] bg-white px-[34px] pt-[43px] pb-[31px] text-center shadow-[0_10px_30px_rgba(91,57,115,0.07)]">
      <h1 className="font-crayon text-[42px] leading-[1.05] font-normal tracking-[-0.02em] text-[#1F2328]">
        Chào mừng trở lại
      </h1>

      <form
        className="mt-[38px] flex flex-1 flex-col"
        noValidate
        onSubmit={otpSent ? handleVerify : handleSubmit}
      >
        {otpSent ? (
          <OtpField otp={otp} error={otpError} disabled={busy} onOtpChange={setOtp} onResend={handleResend} onEditEmail={() => { setOtpSent(false); setOtp(""); setMessage(""); }} />
        ) : (
          <EmailField
            value={email}
            onChange={handleEmailChange}
            error={emailError}
          />
        )}

        <div className="mt-5">
          {otpSent ? <SubmitButton disabled={busy || otp.length !== 6} /> : <OtpButton state={busy ? "disabled" : "default"} />}
          {message && <p className="mt-3 text-[12px] font-semibold text-[#168BFF]" role="status">{message}</p>}
        </div>

        <div className="mt-[27px]">
          <div className="flex w-full items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-[#DADDE1]" />
            <span className="text-[10px] font-extrabold tracking-[0.12em] whitespace-nowrap text-[#8A8D91]">
              TIẾP TỤC VỚI
            </span>
            <span className="h-px flex-1 bg-[#DADDE1]" />
          </div>
        </div>

        <div className="mt-[21px]">
          <button
            className="h-12 w-full rounded-[9px] border border-[#C9CDD2] bg-white text-[12px] font-extrabold tracking-[0.12em] text-[#292D31] transition-colors hover:bg-[#F7F8F9] active:bg-[#EDEFF1]"
            type="button"
          >
            GOOGLE
          </button>
        </div>

        <div className="mt-auto">
          <p className="m-0 text-[12px] font-semibold text-[#676C72]">
            Bạn chưa có tài khoản?{" "}
            <a
              className="font-extrabold tracking-[0.04em] text-[#F26722] underline-offset-3 hover:underline"
              href="#register"
            >
              ĐĂNG KÝ
            </a>
          </p>
        </div>
      </form>
    </main>
  );
}
