const preventNativeContextMenu = (event: Event): void => {
  event.preventDefault();
};

const listenerOptions = { capture: true } as const;

export function disableNativeContextMenu(target: EventTarget = document): () => void {
  target.addEventListener("contextmenu", preventNativeContextMenu, listenerOptions);
  return () => target.removeEventListener("contextmenu", preventNativeContextMenu, listenerOptions);
}
