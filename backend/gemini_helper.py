import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)

def analyze_properties(user_query, property_text):

    prompt = f"""
You are a Dubai real estate advisor.

User Query:
{user_query}

Properties:
{property_text}

Rules:
- Only use provided properties
- Never invent listings
- Never invent prices
- Keep answer under 150 words
"""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt
    )

    return response.text