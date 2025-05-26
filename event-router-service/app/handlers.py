import json
import boto3
import logging
from app.config import Config


logger = logging.getLogger(__name__)
Config.validate()
eventbridge = boto3.client("events", region_name=Config.AWS_REGION)


def handle_momento_message(subscription_item: any) -> None:
    try:
        raw_message = subscription_item.value
        logger.debug(f"Raw message from Momento: {raw_message}")

        # First decode
        message = json.loads(raw_message)
        if isinstance(message, str):
            message = json.loads(message)  # In case it's double-encoded

        logger.debug(f"Parsed Momento message: {message}")

        # Extract standard fields
        event_type = message.get("eventType")
        player_id = message.get("playerId")
        timestamp = message.get("timestamp")
        payload = message.get("payload", {})

        if not all([event_type, player_id, timestamp]):
            raise ValueError("Missing required fields in event.")

        # Prepare detail for EventBridge
        detail = {
            "eventType": event_type,
            "playerId": player_id,
            "timestamp": timestamp,
            "payload": payload,
        }

        # Send to EventBridge
        response = eventbridge.put_events(
            Entries=[
                {
                    "Source": "event-router-service",
                    "DetailType": event_type,
                    "Detail": json.dumps(detail),
                    "EventBusName": Config.EVENT_BUS_NAME,
                }
            ]
        )

        logger.info(f"Forwarded {event_type} to EventBridge for player {player_id}")
        logger.debug(f"EventBridge response: {response}")

    except Exception as e:
        logger.error(f"Error handling Momento message: {e}")
