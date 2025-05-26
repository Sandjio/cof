import threading
import logging
from app import create_app
from app.subscriber import subscribe_to_momento_topic


logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = create_app()

if __name__ == "__main__":
    # Start Momento subscription in background
    subscription_thread = threading.Thread(
        target=subscribe_to_momento_topic, daemon=True
    )
    subscription_thread.start()

    app.run(host="0.0.0.0", port=8000)
