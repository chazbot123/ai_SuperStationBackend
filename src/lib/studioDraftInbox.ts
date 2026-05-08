export function emitDraftInboxFly(fromElement: HTMLElement | null, emoji = "🖼️") {
  if (!fromElement || typeof window === "undefined") {
    return;
  }

  const rect = fromElement.getBoundingClientRect();
  window.dispatchEvent(
    new CustomEvent("studio:draft-fly", {
      detail: {
        emoji,
        fromX: rect.left + rect.width / 2,
        fromY: rect.top + rect.height / 2,
      },
    })
  );
}
