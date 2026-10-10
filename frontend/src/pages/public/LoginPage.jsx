import LoginForm from "../../components/auth/LoginForm"

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#EED9FA] px-4 py-8">
      <button
        className="fixed top-6 left-6 z-10 rounded-full border border-[#168BFF] bg-white px-4 py-2 text-[12px] font-extrabold tracking-[0.08em] text-[#292D31] shadow-[0_3px_0_rgba(22,139,255,0.2)] transition-colors hover:bg-[#F7F8F9] active:translate-y-px"
        type="button"
        onClick={() => window.history.back()}
      >
        ← TRỞ LẠI
      </button>
      <LoginForm />
    </div>
  )
}
