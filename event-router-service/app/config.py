import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
    EVENT_BUS_NAME = os.getenv("EVENT_BRIDGE_BUS_NAME")
    MOMENTO_AUTH_TOKEN = os.getenv("MOMENTO_AUTH_TOKEN")
    MOMENTO_TOPIC_NAME = os.getenv("MOMENTO_TOPIC_NAME")
    MOMENTO_CACHE_NAME = os.getenv("MOMENTO_CACHE_NAME")

    REQUIRED_VARS = [
        "AWS_REGION",
        "EVENT_BUS_NAME",
        "MOMENTO_AUTH_TOKEN",
        "MOMENTO_TOPIC_NAME",
        "MOMENTO_CACHE_NAME",
    ]

    @classmethod
    def validate(cls):
        missing = [k for k in cls.REQUIRED_VARS if not getattr(cls, k)]
        if missing:
            raise RuntimeError(f"Missing required environment variables: {missing}")
