# src/core/telegram/listener.py

import time
import requests


class TelegramListener:
    def __init__(self, api, handler):
        self.api = api
        self.handler = handler
        self.running = False

    def start(self):
        self.running = True
        backoff = 2
        max_backoff = 60

        while self.running:
            try:
                updates = self.api.get_updates()

                backoff = 2

                for update in updates:
                    self.api.offset = update["update_id"] + 1
                    message = update.get("message")
                    if message:
                        self.handler.handle(message)

            except requests.exceptions.ReadTimeout:
                continue

            except requests.exceptions.ConnectionError:
                time.sleep(backoff)
                backoff = min(backoff * 2, max_backoff)

            except Exception:
                time.sleep(backoff)
                backoff = min(backoff * 2, max_backoff)

    def stop(self):
        self.running = False