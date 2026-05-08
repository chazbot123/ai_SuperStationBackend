const DEFAULT_MAIN_COMPANY_USER_ID = "cmotrwinc0000n4u9e265uccn";

export default function LegacyHomeFrame() {
  const searchParams = new URLSearchParams(window.location.search);
  if (!searchParams.get("userId")) {
    searchParams.set("userId", DEFAULT_MAIN_COMPANY_USER_ID);
  }
  const iframeSrc = `/legacy-home.html?${searchParams.toString()}`;

  return (
    <main className="legacy-home-shell">
      <iframe
        className="legacy-home-frame"
        src={iframeSrc}
        title="志林科技超级站旧稿恢复页"
      />
    </main>
  );
}
