from gemini_helper import analyze_properties

result = analyze_properties(
    "apartment in jlt",
    """
Area: JLT
Type: Apartment
Price: AED 3000000 
Rental Yield: 8%
"""
)

print(result)