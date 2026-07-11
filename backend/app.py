from flask import Flask, request
from twilio.twiml.messaging_response import MessagingResponse

from property_search import search_properties
from gemini_helper import analyze_properties

app = Flask(__name__)


@app.route("/")
def home():
    return "Dubai Real Estate AI Bot Running"


@app.route("/whatsapp", methods=["POST"])
def whatsapp():

    user_message = request.form.get("Body", "")

    results = search_properties(user_message)

    response = MessagingResponse()

    if len(results) == 0:

        response.message(
            "No matching properties found.\n\n"
            "Try:\n"
            "• Apartment in JLT\n"
            "• Villa in Dubai Hills Estate\n"
            "• Penthouse in Downtown Dubai\n"
            "• Investment property"
        )

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
Metro Access: {row['Metro_Access']}
Developer: {row['Developer']}
Amenities Score: {row['Amenities_Score']}
----------------------------------------
"""

    try:

        ai_answer = analyze_properties(
            user_message,
            property_text
        )

        response.message(ai_answer)

    except Exception as e:

        print("Gemini Error:", e)

        fallback = "Top Matching Properties:\n\n"

        for _, row in results.iterrows():

            fallback += (
                f"{row['Property_Type']} | {row['Area']}\n"
                f"Beds: {row['Bedrooms']}\n"
                f"Price: AED {row['Price_AED']:,}\n"
                f"Yield: {row['Rental_Yield_%']}%\n\n"
            )

        response.message(fallback)

    return str(response)


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=8000,
        debug=True
    )