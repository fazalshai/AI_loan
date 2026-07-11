import pandas as pd

df = pd.read_excel("Dubai_Real_Estate_Synthetic_200.xlsx")

def search_properties(message):

    msg = message.lower()

    results = df.copy()

    # Property Type
    for ptype in ["apartment", "villa", "penthouse"]:
        if ptype in msg:
            results = results[
                results["Property_Type"].str.lower() == ptype
            ]

    # Area
    for area in df["Area"].unique():

        if str(area).lower() in msg:

            results = results[
                results["Area"].str.lower() == str(area).lower()
            ]

    return results.head(5)