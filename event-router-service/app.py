import os
from flask import Flask, jsonify
from momento import CredentialProvider, TopicClient, TopicConfigurations
import boto3
from dotenv import load_dotenv
import json
import logging
import threading

load_dotenv()

app = Flask(__name__)

# Initialize EventBridge client
eventbridge = boto3.client("events", region_name=os.environ.get("AWS_REGION"))
EVENT_BUS_NAME = os.environ["EVENT_BRIDGE_BUS_NAME"]


def handle_momento_message(subscription_item):
    try:
        raw_message = subscription_item.value
        app.logger.debug(f"Raw message from Momento: {raw_message}")

        # First decode
        message = json.loads(raw_message)
        if isinstance(message, str):
            message = json.loads(message)  # In case it's double-encoded

        app.logger.debug(f"Parsed Momento message: {message}")

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
                    "EventBusName": EVENT_BUS_NAME,
                }
            ]
        )

        app.logger.info(f"Forwarded {event_type} to EventBridge for player {player_id}")
        app.logger.debug(f"EventBridge response: {response}")

    except Exception as e:
        app.logger.error(f"Error handling Momento message: {e}")


def subscribe_to_momento_topic():
    auth_token = os.environ.get("MOMENTO_AUTH_TOKEN")
    topic_name = os.environ.get("MOMENTO_TOPIC_NAME")
    cache_name = os.environ.get("MOMENTO_CACHE_NAME")

    client = TopicClient(
        TopicConfigurations.Default.latest(),
        CredentialProvider.from_string(auth_token),
    )

    for message in client.subscribe(cache_name, topic_name):
        handle_momento_message(message)


@app.route("/health")
def health_check():
    return jsonify({"status": "healthy"}), 200


if __name__ == "__main__":
    # Start Momento subscription in a background thread
    logging.basicConfig(level=logging.DEBUG)

    # Start Momento subscription in background
    subscription_thread = threading.Thread(
        target=subscribe_to_momento_topic, daemon=True
    )
    subscription_thread.start()

    app.run(host="0.0.0.0", port=8000)
