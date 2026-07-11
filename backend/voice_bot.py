from flask import Flask, request
from twilio.twiml.voice_response import VoiceResponse, Gather

from property_search import search_properties
from gemini_helper import analyze_properties

app = Flask(__name__)


@app.route("/")
def home():
    return "Voice AI Running"


@app.route("/voice", methods=["GET", "POST"])
def voice():

    response = VoiceResponse()

    gather = Gather(
        input="speech",
        action="/process_speech",
        method="POST",
        timeout=5,
        speech_timeout="auto"
    )

    gather.say(
        "Hello Fazal. I am your Dubai real estate assistant. How can I help you today?",
        voice="alice"
    )

    response.append(gather)

    response.redirect("/voice")

    return str(response)


@app.route("/process_speech", methods=["POST"])
def process_speech():

    speech = request.form.get("SpeechResult", "")

    print("\n===================")
    print("USER SAID:", speech)
    print("===================\n")

    response = VoiceResponse()

    try:

        results = search_properties(speech)

        if len(results) == 0:

            response.say(
                "Sorry, I could not find matching properties. Please try another area or property type.",
                voice="alice"
            )

            response.redirect("/voice")

            return str(response)

        property_text = ""

        for _, row in results.iterrows():

            property_text += f"""
Property ID: {row['Property_ID']}
Area: {row['Area']}
Type: {row['Property_Type']}
Bedrooms: {row['Bedrooms']}
Bathrooms: {row['Bathrooms']}
Size: {row['Size_SqFt']} sqft
Price: AED {row['Price_AED']}
Rental Yield: {row['Rental_Yield_%']}%
Status: {row['Status']}
Developer: {row['Developer']}
Metro Access: {row['Metro_Access']}
Amenities Score: {row['Amenities_Score']}
----------------------------------
"""

        answer = analyze_properties(
            speech,
            property_text
        )

        print("\nAI ANSWER:")
        print(answer)

        gather = Gather(
            input="speech",
            action="/process_speech",
            method="POST",
            timeout=5,
            speech_timeout="auto"
        )

        gather.say(
            answer[:3000],
            voice="alice"
        )

        gather.say(
            "Do you have another property question?",
            voice="alice"
        )

        response.append(gather)

        response.redirect("/voice")

        return str(response)

    except Exception as e:

        print("ERROR:", e)

        response.say(
            "Sorry. The AI service is currently unavailable.",
            voice="alice"
        )

        response.redirect("/voice")

        return str(response)


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=8001,
        debug=False
    )