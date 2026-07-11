import os
from twilio.rest import Client

ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "AC_MOCK_ACCOUNT_SID")
AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "MOCK_AUTH_TOKEN")

client = Client(
    ACCOUNT_SID,
    AUTH_TOKEN
)

message = client.messages.create(
    from_="whatsapp:+14155238886",
    to="whatsapp:+919705681005",
    body="WhatsApp test from Python"
)

print(message.sid)