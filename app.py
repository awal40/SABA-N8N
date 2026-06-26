"""
app.py - Entry point aplikasi SABA-N8N.
Flask application factory, konfigurasi server, dan APScheduler.
"""

from flask import Flask
from config import Config
from routes import register_routes


def create_app():
    """Buat dan konfigurasi Flask app."""
    app = Flask(__name__)
    app.config.from_object(Config)
    
    # Memproses header proxy (untuk HTTPS di Hugging Face)
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
    
    # Register semua blueprint
    register_routes(app)
    
    # Temporary debug logs endpoint
    @app.route('/debug-logs')
    def debug_logs():
        import os
        log_files = {
            'supervisord': '/tmp/supervisord.log',
            'nginx_access': '/tmp/nginx_access.log',
            'nginx_error': '/tmp/nginx_error.log'
        }
        res = "<h1>Debug Logs</h1>"
        for name, path in log_files.items():
            res += f"<h2>{name} ({path})</h2>"
            if os.path.exists(path):
                try:
                    with open(path, 'r') as f:
                        lines = f.readlines()[-100:]  # Last 100 lines
                        res += f"<pre>{''.join(lines)}</pre>"
                except Exception as e:
                    res += f"<pre>Error reading file: {e}</pre>"
            else:
                res += f"<pre>File does not exist</pre>"
        return res
    
    # Setup APScheduler untuk auto-delete audio expired
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from services.supabase_service import cleanup_expired_audio

        scheduler = BackgroundScheduler()
        # Jalankan setiap hari jam 00:00
        scheduler.add_job(
            func=cleanup_expired_audio,
            trigger='cron',
            hour=0,
            minute=0,
            id='cleanup_expired_audio',
            replace_existing=True,
        )
        scheduler.start()
        print("[Scheduler] APScheduler started — audio cleanup setiap hari jam 00:00")

        # Shutdown scheduler saat app berhenti
        import atexit
        atexit.register(lambda: scheduler.shutdown())
    except ImportError:
        print("[Scheduler] APScheduler tidak terinstall, audio cleanup dinonaktifkan.")
    except Exception as e:
        print(f"[Scheduler] Gagal memulai scheduler: {e}")
    
    return app


# Buat instance app di level modul (dibutuhkan oleh gunicorn: `app:app`)
app = create_app()


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
