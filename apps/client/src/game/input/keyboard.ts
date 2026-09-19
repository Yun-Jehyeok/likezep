/**
 * 키보드 입력 추적기
 *
 * "눌린 키 집합(Set)"을 유지해 게임 루프에서 매 프레임 isDown()으로 폴링한다.
 * keydown/keyup 이벤트를 직접 쓰지 않고 집합을 쓰는 이유:
 * - 이벤트는 OS의 키 반복 지연(첫 이벤트 → 250ms → 반복)의 영향을 받는다
 * - 집합 방식은 키를 누르고 있는 동안 매 프레임 연속으로 이동 처리할 수 있다
 *
 * chatFocused 모드:
 * - 채팅창에 포커스가 있을 때 WASD를 누르면 채팅 입력으로 처리해야 한다
 * - chatFocused=true이면 isDown()이 항상 false를 반환해 이동을 막는다
 * - 포커스 진입 시 keys.clear()로 현재 눌린 키를 초기화해 오작동을 방지한다
 */
export class KeyboardInput {
  private keys = new Set<string>();   // 현재 눌려 있는 키 집합 (소문자 정규화)
  private chatFocused = false;

  constructor() {
    // this 바인딩: addEventListener에 전달할 때 this가 유실되지 않도록 미리 바인딩
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  private onKeyDown(e: KeyboardEvent) {
    // e.key를 소문자로 정규화해 isDown("w")와 isDown("W") 모두 동작하게 한다
    this.keys.add(e.key.toLowerCase());
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.key.toLowerCase());
  }

  /** 채팅 포커스 중이 아닐 때만 키 눌림 상태를 반환 */
  isDown(key: string): boolean {
    return !this.chatFocused && this.keys.has(key.toLowerCase());
  }

  /** 채팅 입력창 포커스 상태를 설정한다 */
  setChatFocused(focused: boolean) {
    this.chatFocused = focused;
    // 채팅창에 포커스가 가는 순간 눌린 키를 초기화
    // (예: 'd'를 누른 채로 채팅창을 클릭하면 keyup 이벤트가 안 와서 'd'가 계속 남을 수 있음)
    if (focused) this.keys.clear();
  }

  /** 컴포넌트 언마운트 시 이벤트 리스너를 반드시 제거해야 메모리 누수가 없다 */
  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}
