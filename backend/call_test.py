import os
from twilio.rest import Client

ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "AC_MOCK_ACCOUNT_SID")
AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "MOCK_AUTH_TOKEN")


client = Client(
    ACCOUNT_SID,
    AUTH_TOKEN
)

call = client.calls.create(
    to="+971552384081",

    from_="+15102882417",
    url="https://sunrise-pendant-lion-journey.trycloudflare.com/voice"
)

print(call.sid)