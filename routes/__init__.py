"""Routes package - Blueprint registration."""

from flask import Flask


def register_routes(app: Flask):
    """Daftarkan semua blueprint ke Flask app."""
    from routes.chat import chat_bp
    from routes.auth import auth_bp
    from routes.dashboard import dashboard_bp
    
    app.register_blueprint(auth_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(dashboard_bp)
