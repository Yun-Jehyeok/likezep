# coturn 설치 절차 (Ubuntu 22.04 / AWS EC2)

## 1. EC2 보안그룹 인바운드 규칙

| 타입 | 프로토콜 | 포트 | 설명 |
|------|----------|------|------|
| Custom TCP | TCP | 3478 | TURN 리스닝 (TCP) |
| Custom UDP | UDP | 3478 | TURN 리스닝 (UDP) |
| Custom UDP | UDP | 49152–65535 | TURN relay 포트 범위 |

> relay 포트 범위는 turnserver.conf의 `min-port` / `max-port` 와 반드시 일치해야 한다.

## 2. coturn 설치

```bash
sudo apt-get update
sudo apt-get install -y coturn
sudo systemctl enable coturn
```

## 3. 시크릿 생성

```bash
openssl rand -hex 32
# 출력값을 turnserver.conf의 static-auth-secret 과 서버 .env의 TURN_SECRET 에 동일하게 사용
```

## 4. 설정 파일 작성

```bash
# turnserver.conf.example 을 참고해 실제 값으로 교체
sudo cp /path/to/turnserver.conf.example /etc/turnserver.conf
sudo nano /etc/turnserver.conf
# <EC2_PUBLIC_IP>, <EC2_PRIVATE_IP>, <static-auth-secret> 교체
```

## 5. 기동 및 상태 확인

```bash
sudo systemctl restart coturn
sudo systemctl status coturn
```

## 6. 동작 테스트

```bash
# EC2 안에서 자체 테스트
turnutils_uclient -T -u testuser -w testpass 127.0.0.1

# 외부(로컬 PC)에서 EC2 퍼블릭 IP로 테스트
turnutils_uclient -T -p 3478 <EC2_PUBLIC_IP>
```

## 주의사항

- `static-auth-secret` 은 절대 커밋하지 않는다. `/etc/turnserver.conf` 에만 존재해야 한다.
- `external-ip` 누락 시 외부 relay 불가 — 가장 흔한 실패 원인.
- 보안그룹에서 UDP 49152–65535 미오픈 시 STUN은 되지만 TURN relay가 안 된다.
