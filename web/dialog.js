import { watch, nextTick, onUnmounted } from "vue";
export function useDialog(open, busy) {
  let previous;
  const keydown = (event) => {
    if (!open.value) return;
    if (event.key === "Escape" && !busy.value) {
      open.value = false;
      return;
    }
    if (event.key !== "Tab") return;
    const elements = [
      ...document.querySelectorAll(
        '[role="dialog"] button:not(:disabled),[role="dialog"] input:not(:disabled),[role="dialog"] textarea:not(:disabled),[role="dialog"] select:not(:disabled),[role="dialog"] summary',
      ),
    ].filter((el) => el.getClientRects().length);
    if (!elements.length) return;
    const first = elements[0],
      last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  watch(open, async (value) => {
    if (value) {
      previous = document.activeElement;
      document.body.style.overflow = "hidden";
      await nextTick();
      document
        .querySelector('[role="dialog"] input,[role="dialog"] select')
        ?.focus();
      document.addEventListener("keydown", keydown);
    } else {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    }
  });
  onUnmounted(() => {
    document.body.style.overflow = "";
    document.removeEventListener("keydown", keydown);
  });
}
