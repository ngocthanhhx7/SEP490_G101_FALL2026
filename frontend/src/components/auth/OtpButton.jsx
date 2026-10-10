const stateStyles = {
  default:
    "bg-[#FFCC32] shadow-[0_3px_0_#DBA900] hover:bg-[#FFD551] hover:shadow-[0_3px_0_#DBA900] active:translate-y-[2px] active:bg-[#F0B900] active:shadow-[0_1px_0_#C89900]",
  hover: "bg-[#FFD551] shadow-[0_3px_0_#DBA900]",
  pressed:
    "translate-y-[2px] bg-[#F0B900] shadow-[0_1px_0_#C89900]",
  disabled:
    "cursor-not-allowed bg-[#E9E1C8] text-[#999382] shadow-none",
};

export default function OtpButton({ state = "default" }) {
  return (
    <button
      className={`h-12 w-full rounded-full text-[12px] font-extrabold tracking-[0.12em] text-[#29291F] transition-[transform,background-color,box-shadow] ${stateStyles[state]}`}
      type="submit"
      disabled={state === "disabled"}
      data-state={state}
    >
      GỬI OTP
    </button>
  );
}

