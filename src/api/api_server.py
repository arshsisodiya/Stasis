from flask import Flask
from flask_cors import CORS
from werkzeug.serving import make_server

from src.api.telegram_routes import telegram_bp
from src.api.wellbeing_routes import wellbeing_bp


def create_app():
    app = Flask(__name__)

    # Since this is local-only desktop app,
    # you can restrict CORS if needed
    CORS(app)

    app.register_blueprint(telegram_bp)
    app.register_blueprint(wellbeing_bp)

    return app


class APIServer:
    def __init__(self, host="127.0.0.1", port=7432):
        self.host = host
        self.port = port
        self.server = None
        self.app = create_app()

    def start(self):
        self.server = make_server(self.host, self.port, self.app)
        print(f"API running on http://{self.host}:{self.port}")
        self.server.serve_forever()

    def stop(self):
        if self.server:
            self.server.shutdown()