export default function SubmitButton({ disabled = false }) {
  return (
    <button
      className="h-12 w-full rounded-full bg-[#FFCC32] text-[12px] font-extrabold tracking-[0.12em] text-[#29291F] shadow-[0_3px_0_#DBA900] transition-[transform,background-color,box-shadow] hover:bg-[#FFD551] hover:shadow-[0_3px_0_#DBA900] active:translate-y-[2px] active:bg-[#F0B900] active:shadow-[0_1px_0_#C89900] disabled:cursor-not-allowed disabled:bg-[#E9E1C8] disabled:text-[#999382] disabled:shadow-none"
      disabled={disabled}
      type="submit"
    >
      XÁC NHẬN
    </button>
  );
}
