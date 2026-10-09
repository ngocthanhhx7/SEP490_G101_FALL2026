import PrimaryButton from "./PrimaryButton";

export default function LoginCard() {
  return (
    <main className="flex h-[483px] w-[356px] max-w-full flex-col rounded-[18px] border border-[#168BFF] bg-white px-[34px] pt-[43px] pb-[31px] text-center shadow-[0_10px_30px_rgba(91,57,115,0.07)]">
      <h1 className="font-['Patrick_Hand'] text-[42px] leading-[1.05] font-normal tracking-[-0.02em] text-[#1F2328]">
        Chào mừng trở lại
      </h1>

      <form
        className="mt-[38px] flex flex-1 flex-col"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="flex w-full flex-col gap-2 text-left">
          <span className="text-[11px] leading-none font-extrabold tracking-[0.12em] text-[#24272B]">
            ĐỊA CHỈ EMAIL
          </span>

          <input
            className="h-12 w-full rounded-[9px] border border-transparent bg-[#D9F1E7] px-4 text-[14px] font-semibold text-[#25292D] outline-none transition-[border-color,box-shadow] placeholder:text-[#6B7772] placeholder:opacity-100 focus:border-[#168BFF] focus:shadow-[0_0_0_3px_rgba(22,139,255,0.14)]"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="hello@pawworld.com"
            aria-label="Địa chỉ email"
          />
        </label>

        <div className="mt-5">
          <PrimaryButton />
        </div>

        <div className="mt-[27px]">
          <div
            className="flex w-full items-center gap-3"
            aria-hidden="true"
          >
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

