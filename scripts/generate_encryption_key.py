from __future__ import annotations

from cryptography.fernet import Fernet


def main() -> None:
  """
  Generate a Fernet key for ENCRYPTION_KEY and print it.

  Usage (在项目根目录运行):
      python scripts/generate_encryption_key.py
  然后把输出整行复制到 docker-compose.yml 或 .env 中的 ENCRYPTION_KEY。
  """
  key = Fernet.generate_key().decode("utf-8")
  print("ENCRYPTION_KEY=" + key)


if __name__ == "__main__":
  main()

