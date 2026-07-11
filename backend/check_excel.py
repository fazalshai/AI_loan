import pandas as pd

df = pd.read_excel("Dubai_Real_Estate_Synthetic_200.xlsx")

print("\nColumns:\n")
print(df.columns.tolist())

print("\nFirst 5 rows:\n")
print(df.head())