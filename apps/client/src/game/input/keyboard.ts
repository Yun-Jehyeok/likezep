export class KeyboardInput {
  private keys = new Set<string>();
  private chatFocused = false;

  constructor() {
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  private onKeyDown(e: KeyboardEvent) {
    this.keys.add(e.key.toLowerCase());
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.key.toLowerCase());
  }

  isDown(key: string): boolean {
    return !this.chatFocused && this.keys.has(key.toLowerCase());
  }

  setChatFocused(focused: boolean) {
    this.chatFocused = focused;
    if (focused) this.keys.clear();
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}
