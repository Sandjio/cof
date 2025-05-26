import logging
from momento import CredentialProvider, TopicClient, TopicConfigurations
from app.handlers import handle_momento_message
from app.config import Config

logger = logging.getLogger(__name__)


def subscribe_to_momento_topic() -> None:
    try:
        client = TopicClient(
            TopicConfigurations.Default.latest(),
            CredentialProvider.from_string(Config.MOMENTO_AUTH_TOKEN),
        )

        for message in client.subscribe(
            Config.MOMENTO_CACHE_NAME, Config.MOMENTO_TOPIC_NAME
        ):
            handle_momento_message(message)
    except Exception as e:
        logger.error(f"Subscription error: {e}")
