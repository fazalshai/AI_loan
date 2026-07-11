import json
from gemini_helper import model

def extract_intent(message):

    prompt = f"""
Extract real estate search intent.

Return JSON only.

User:
{message}

Example:

{{
  "intent":"buy",
  "property_type":"apartment",
  "area":"jlt",
  "budget":null,
  "bedrooms":null
}}
"""

    response = model.generate_content(prompt)

    return json.loads(response.text)