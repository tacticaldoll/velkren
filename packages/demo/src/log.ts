export function appendLog(logList: HTMLElement, text: string): void {
  const item = document.createElement("li");
  item.textContent = text;
  logList.prepend(item);
}
