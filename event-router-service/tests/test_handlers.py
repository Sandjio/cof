import unittest
from unittest.mock import patch, MagicMock
from app.handlers import handle_momento_message


class TestHandleMomentoMessage(unittest.TestCase):

    @patch("app.handlers.eventbridge.put_events")
    def test_valid_message(self, mock_put_events):
        mock_message = MagicMock()
        mock_message.value = '{"eventType": "player_joined", "playerId": "123", "timestamp": "2023-01-01T00:00:00Z", "payload": {"score": 50}}'
        handle_momento_message(mock_message)
        self.assertTrue(mock_put_events.called)

    @patch("app.handlers.eventbridge.put_events")
    def test_missing_fields(self, mock_put_events):
        mock_message = MagicMock()
        mock_message.value = '{"playerId": "123"}'
        with self.assertLogs(level="ERROR") as log:
            handle_momento_message(mock_message)
            self.assertIn("Missing required fields in event", log.output[0])
        self.assertFalse(mock_put_events.called)


if __name__ == "__main__":
    unittest.main()
