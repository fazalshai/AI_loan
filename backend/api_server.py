import os
import re
import json
import pandas as pd
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from dotenv import load_dotenv
from google import genai
import requests

# Load environment variables (force override to ensure new key is loaded)
load_dotenv(override=True)

print("=" * 60)
print("Startup - Loaded ELEVENLABS_API_KEY Prefix:", os.getenv("ELEVENLABS_API_KEY")[:10] if os.getenv("ELEVENLABS_API_KEY") else "None")
print("Startup - Loaded ELEVENLABS_VOICE_ID:", os.getenv("ELEVENLABS_VOICE_ID"))
print("=" * 60)

app = Flask(__name__)
# Enable CORS for frontend cross-origin requests
CORS(app)

# Initialize Gemini Client
gemini_key = os.getenv("GEMINI_API_KEY")
if not gemini_key:
    gemini_key = "AIzaSyDbSCTtY42VRjHMDDjjW0deEmq91Dv8BhM"

client = genai.Client(api_key=gemini_key)

# Excel Data Paths (Resolve relative to current file to be completely portable)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REAL_ESTATE_PATH = os.path.join(BASE_DIR, "Dubai_Real_Estate_Synthetic_200.xlsx")
LOAN_PATH = os.path.join(BASE_DIR, "Dubai_Loan_Assistance_Synthetic_200.xlsx")

# Fallback to parent directory if spreadsheets are in root
if not os.path.exists(REAL_ESTATE_PATH):
    REAL_ESTATE_PATH = os.path.join(os.path.dirname(BASE_DIR), "Dubai_Real_Estate_Synthetic_200.xlsx")
if not os.path.exists(LOAN_PATH):
    LOAN_PATH = os.path.join(os.path.dirname(BASE_DIR), "Dubai_Loan_Assistance_Synthetic_200.xlsx")

# Load Datasets
try:
    df_properties = pd.read_excel(REAL_ESTATE_PATH)
    print("Successfully loaded real estate data. Rows:", len(df_properties))
except Exception as e:
    print("Error loading real estate data, creating mock dataframe:", e)
    df_properties = pd.DataFrame(columns=['Property_ID', 'Area', 'Property_Type', 'Bedrooms', 'Bathrooms', 'Size_SqFt', 'Price_AED', 'Rental_Yield_%', 'Status', 'Metro_Access', 'Developer', 'Amenities_Score'])

try:
    df_loans = pd.read_excel(LOAN_PATH)
    print("Successfully loaded loan database. Rows:", len(df_loans))
except Exception as e:
    print("Error loading loan data, creating mock dataframe:", e)
    df_loans = pd.DataFrame(columns=['Customer_ID', 'Age', 'Nationality', 'Employment_Status', 'Company_Category', 'Monthly_Salary_AED', 'Credit_Score', 'Existing_Liabilities_AED', 'Down_Payment_AED', 'Property_Price_AED', 'Loan_Amount_AED', 'Loan_Tenure_Years', 'Debt_To_Income_Ratio', 'Property_Area', 'Property_Type', 'Financing_Status', 'Risk_Level', 'Loan_Approved', 'Max_Eligible_Loan_AED', 'Monthly_EMI_AED'])


def search_properties_advanced(query_text):
    """
    Search properties using keywords: Area, Property Type, Bedrooms, and Price constraints.
    """
    msg = query_text.lower()
    results = df_properties.copy()
    
    # 1. Property Type
    for ptype in ["apartment", "villa", "penthouse"]:
        if ptype in msg:
            results = results[results["Property_Type"].str.lower() == ptype]
            break
            
    # 2. Area Matching
    for area in df_properties["Area"].unique():
        if str(area).lower() in msg:
            results = results[results["Area"].str.lower() == str(area).lower()]
            break
            
    # 3. Bedroom Count
    bed_match = re.search(r'(\d+)\s*(?:bed|bedroom|br)', msg)
    if bed_match:
        beds = int(bed_match.group(1))
        results = results[results["Bedrooms"] == beds]
        
    # 4. Budget Filters (e.g. "under 3 million" or "less than 2000000")
    price_limit = None
    if "under" in msg or "less than" in msg or "below" in msg:
        millions = re.search(r'(\d+(?:\.\d+)?)\s*m', msg)
        if millions:
            price_limit = float(millions.group(1)) * 1_000_000
        else:
            number = re.search(r'(\d[\d\s,]*\d)', msg)
            if number:
                clean_num = re.sub(r'[\s,]', '', number.group(1))
                price_limit = float(clean_num)
                
    if price_limit:
        results = results[results["Price_AED"] <= price_limit]
        
    return results.head(6)


def evaluate_loan_eligibility(msg):
    """
    Extract loan factors from user message and match historical approved loan references.
    """
    msg_clean = msg.lower()
    
    salary_match = re.search(r'(?:salary|earning|earn|income|income of)\s*(?:aed|aed\s*)?(\d+[\d\s,]*\d)', msg_clean)
    credit_match = re.search(r'(?:credit|credit score|score|score of)\s*(\d{3})', msg_clean)
    liabilities_match = re.search(r'(?:liabilities|liability|debts|loans|emi|debt|paying)\s*(?:aed|aed\s*)?(\d+[\d\s,]*\d)', msg_clean)
    age_match = re.search(r'(?:age|age of|i am|years old)\s*(\d{2})', msg_clean)
    price_match = re.search(r'(?:property|price|home value|buying a)\s*(?:aed|aed\s*)?(\d+[\d\s,]*\d)', msg_clean)
    
    salary = None
    credit_score = 650
    liabilities = 0
    age = 35
    property_price = 1_500_000
    
    if salary_match:
        salary = float(re.sub(r'[\s,]', '', salary_match.group(1)))
    if credit_match:
        credit_score = int(credit_match.group(1))
    if liabilities_match:
        liabilities = float(re.sub(r'[\s,]', '', liabilities_match.group(1)))
    if age_match:
        age = int(age_match.group(1))
    if price_match:
        property_price = float(re.sub(r'[\s,]', '', price_match.group(1)))
        
    if not salary:
        return None
        
    interest_rate = 0.045
    tenure_years = min(25, 65 - age)
    if tenure_years <= 5:
        tenure_years = 15
        
    max_monthly_emi = (salary * 0.5) - liabilities
    if max_monthly_emi < 0:
        max_monthly_emi = salary * 0.1
        
    r_monthly = interest_rate / 12
    n_months = tenure_years * 12
    max_loan = max_monthly_emi * (1 - (1 + r_monthly) ** -n_months) / r_monthly
    max_loan = round(max_loan)
    
    min_down_payment = property_price * 0.20
    loan_amount = property_price - min_down_payment
    
    if loan_amount > 0:
        emi = loan_amount * r_monthly * ((1 + r_monthly) ** n_months) / (((1 + r_monthly) ** n_months) - 1)
        emi = round(emi)
    else:
        emi = 0
        
    dti = ((emi + liabilities) / salary) * 100
    approved = "Approved" if dti <= 50 and credit_score >= 600 else "Declined"
    
    ref_cases = df_loans[df_loans["Loan_Approved"] == "Y"] if "Loan_Approved" in df_loans.columns else df_loans
    ref_cases = ref_cases[
        (ref_cases["Monthly_Salary_AED"] >= salary * 0.7) & 
        (ref_cases["Monthly_Salary_AED"] <= salary * 1.3)
    ]
    ref_cases = ref_cases[ref_cases["Credit_Score"] >= credit_score - 100]
    
    ref_records = []
    for _, row in ref_cases.head(3).iterrows():
        ref_records.append({
            "Customer_ID": row.get("Customer_ID", "CUST_REF"),
            "Age": int(row.get("Age", 35)),
            "Nationality": str(row.get("Nationality", "Expat")),
            "Monthly_Salary": int(row.get("Monthly_Salary_AED", 25000)),
            "Credit_Score": int(row.get("Credit_Score", 700)),
            "Max_Loan_AED": int(row.get("Max_Eligible_Loan_AED", 0)) if not pd.isna(row.get("Max_Eligible_Loan_AED")) else 0,
            "Monthly_EMI_AED": int(row.get("Monthly_EMI_AED", 0)) if not pd.isna(row.get("Monthly_EMI_AED")) else 0,
            "Loan_Approved": "Yes"
        })
        
    return {
        "user_profile": {
            "salary": salary,
            "credit_score": credit_score,
            "liabilities": liabilities,
            "age": age,
            "property_price": property_price
        },
        "calculation": {
            "max_eligible_loan": max_loan,
            "required_down_payment": min_down_payment,
            "requested_loan_amount": loan_amount,
            "monthly_emi": emi,
            "dti_ratio": round(dti, 1),
            "status": approved
        },
        "references": ref_records
    }


# Global conversation session memory
CALL_SESSIONS = {
    "real_estate": {
        "greeting_done": False,
        "active_property": None,
        "previous_queries": []
    },
    "loan": {
        "greeting_done": False,
        "active_loan": None,
        "user_profile": {},
        "previous_queries": []
    }
}

import datetime

def save_call_log(agent, user_msg, agent_resp, lang, response_time_ms):
    log_path = "/Users/fazal/Documents/team/backend/call_logs.json"
    
    # Identify intent
    intent = "general_inquiry"
    user_lower = user_msg.lower()
    if "hello" in user_lower or "hi" in user_lower or "صباح" in user_lower or "مرحبا" in user_lower:
        intent = "greeting"
    elif any(k in user_lower for k in ["price", "buy", "cost", "apartment", "villa", "rent", "سعر", "شقة", "فيلا"]):
        intent = "property_search"
    elif any(k in user_lower for k in ["loan", "mortgage", "emi", "salary", "قرض", "راتب", "تمويل"]):
        intent = "loan_assessment"
        
    log_entry = {
        "timestamp": datetime.datetime.now().isoformat(),
        "agent": agent,
        "user_message": user_msg,
        "agent_response": agent_resp,
        "language": lang,
        "intent": intent,
        "response_time_ms": response_time_ms
    }
    
    logs = []
    if os.path.exists(log_path):
        try:
            with open(log_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    logs = json.loads(content)
                    if not isinstance(logs, list):
                        logs = []
        except Exception as e:
            print("Error reading call logs file, resetting logs list:", e)
            
    logs.append(log_entry)
    
    try:
        with open(log_path, "w", encoding="utf-8") as f:
            json.dump(logs, f, indent=2, ensure_ascii=False)
        print(f"[LOGGER] Log successfully saved to {log_path}")
    except Exception as e:
        print("Error writing call logs:", e)


@app.route("/api/chat", methods=["POST"])
def chat():
    import time
    start_time = time.time()
    
    data = request.json or {}
    message = data.get("message", "")
    agent = data.get("agent", "real_estate")  # "real_estate" or "loan"
    language_override = data.get("language")   # "en" or "ar" (optional override)
    history = data.get("history", [])         # [{sender: 'user'|'agent', text: ''}]
    
    # 1. Auto-Reset state tracker if conversation history is empty (new call picked up)
    if len(history) == 0:
        if agent == "real_estate":
            CALL_SESSIONS["real_estate"] = {
                "greeting_done": False,
                "active_property": None,
                "previous_queries": []
            }
        else:
            CALL_SESSIONS["loan"] = {
                "greeting_done": False,
                "active_loan": None,
                "user_profile": {},
                "previous_queries": []
            }
        print(f"[{agent.upper()} SESSION] Reset session context memory due to empty chat history.")

    # 2. Auto-Detect Language (Arabic Unicode range check)
    has_arabic_chars = bool(re.search(r'[\u0600-\u06FF]', message))
    detected_lang = "ar" if has_arabic_chars else "en"
    
    # Use override if provided
    lang = language_override if language_override in ["en", "ar"] else detected_lang
    opposite_lang = "ar" if lang == "en" else "en"

    # Safety Filter: Avoid responding to empty, short, or standalone filler transcript noise
    clean_message = re.sub(r'[.,\/#!$%\^&\*;:{}=\-_`~()?]', '', message).strip().lower()
    IGNORE_FILLERS = {"hi", "hello", "hmm", "uh", "this", "this is", "مرحبا", "أهلاً", "نعم", "yes", "no", "لا"}
    if len(clean_message) < 3 or clean_message in IGNORE_FILLERS:
        print(f"[CHAT FILTER] Ignored short/filler user utterance: '{message}'")
        return jsonify({
            "detected_language": detected_lang,
            "active_language": lang,
            "text": "",
            "translation": {
                "user_translated": "",
                "ai_translated": ""
            },
            "data": None,
            "status": "ignored"
        })

    # Build history context
    history_text = ""
    for h in history[-5:]:
        role = "User" if h.get("sender") == "user" else "Agent"
        history_text += f"{role}: {h.get('text')}\n"
        
    response_payload = {
        "detected_language": detected_lang,
        "active_language": lang
    }
    
    # Check if the welcome/greeting is already done
    is_greeted = CALL_SESSIONS[agent]["greeting_done"]
    if len(history) >= 1: # If history contains even 1 message (the welcome), greeting is complete
        CALL_SESSIONS[agent]["greeting_done"] = True
        is_greeted = True
        
    if agent == "real_estate":
        matched_df = search_properties_advanced(message)
        properties_list = []
        property_context = ""
        
        # Save new matched property focus in session memory
        if not matched_df.empty:
            row = matched_df.iloc[0]
            active_prop = {
                "id": str(row['Property_ID']),
                "area": str(row['Area']),
                "type": str(row['Property_Type']),
                "bedrooms": int(row['Bedrooms']),
                "bathrooms": int(row['Bathrooms']),
                "price": int(row['Price_AED']),
                "yield": float(row['Rental_Yield_%']),
                "metro": str(row['Metro_Access']),
                "developer": str(row['Developer']),
                "amenities": int(row['Amenities_Score'])
            }
            CALL_SESSIONS["real_estate"]["active_property"] = active_prop
            
            for _, r in matched_df.iterrows():
                prop = {
                    "id": str(r['Property_ID']),
                    "area": str(r['Area']),
                    "type": str(r['Property_Type']),
                    "bedrooms": int(r['Bedrooms']),
                    "bathrooms": int(r['Bathrooms']),
                    "price": int(r['Price_AED']),
                    "yield": float(r['Rental_Yield_%']),
                    "metro": str(r['Metro_Access']),
                    "developer": str(r['Developer']),
                    "amenities": int(r['Amenities_Score'])
                }
                properties_list.append(prop)
                property_context += f"- ID: {prop['id']}, Area: {prop['area']}, Type: {prop['type']}, {prop['bedrooms']} Bed, Price AED {prop['price']:,}, Yield: {prop['yield']}%, Metro Access: {prop['metro']}, Developer: {prop['developer']}\n"
            response_payload["data"] = properties_list
        else:
            # Match follow-up context using session memory
            active_prop = CALL_SESSIONS["real_estate"]["active_property"]
            if active_prop:
                property_context = f"- Active property previously discussed: ID: {active_prop['id']}, Area: {active_prop['area']}, Type: {active_prop['type']}, {active_prop['bedrooms']} Bed, Price AED {active_prop['price']:,}, Yield: {active_prop['yield']}%, Metro Access: {active_prop['metro']}, Developer: {active_prop['developer']}\n"
                response_payload["data"] = [active_prop]
                print(f"[REAL_ESTATE SESSION] Active property focus resolved from session memory: ID {active_prop['id']}")
            else:
                property_context = "No properties are currently under discussion or match the user query."

        # Setup System Instructions based on greeting states
        if lang == "ar":
            greeting_rule = (
                "قاعدة صارمة: التعريف بنفسك انتهى تماماً. لا تقل أبداً 'مرحبا' أو 'أنا راج' أو أي تعريف. انتقل مباشرة للإجابة على طلب العميل."
                if is_greeted else
                "هذه بداية المكالمة. رحب بالعميل وعرّف بنفسك باسم راج، مستشاره العقاري في دبي."
            )
            system_prompt = f"""
أنت راج، خبير عقارات متميز ومرح في دبي. تحدث بلغة عربية خليجية طبيعية وبسيطة كأنك في مكالمة هاتفية حقيقية.
{greeting_rule}

المعلومات المتاحة فقط من قاعدة بيانات العقارات لدينا:
{property_context}

التعليمات الهامة جداً للمحادثة الهاتفية:
1. تكلم بجمل قصيرة جداً ومبسطة (أقل من 35 كلمة، جملة أو جملتين كحد أقصى!).
2. لا تقل أبداً 'مرحبا' أو 'أنا راج' أو أي كلام تعريفي بعد الرسالة الأولى.
3. لا تسرد قوائم أو أرقام تعريفية (Property ID) أو تفاصيل فنية إلا إذا طلبها العميل تحديداً.
4. اقترح عقاراً واحداً فقط بشكل طبيعي واختم بسؤال قصير جذاب.
5. إذا طلب العميل عقاراً في مدينة أخرى غير دبي، أشر بلطف أن قوائمنا في دبي واقترح أقرب بديل.
6. التاريخ والمحادثة السابقة:
{history_text}
"""
        else:
            greeting_rule = (
                "STRICT RULE: The call introduction is 100% COMPLETE. NEVER say 'Hello', 'Hi', 'I am Raj', or any form of self-introduction. Jump directly into answering the user's question or request. Treat this as mid-conversation."
                if is_greeted else
                "This is the very start of the call. Greet the user warmly and introduce yourself as Raj, your Dubai property advisor."
            )
            system_prompt = f"""
You are Raj, a friendly and premium real estate advisor in Dubai. You are speaking on a live phone call.
{greeting_rule}

Available property listings from our database:
{property_context}

CRITICAL RULES FOR NATURAL PHONE CONVERSATION:
1. Keep your response extremely brief, casual, and human-like (under 40 words, 1-2 sentences max!).
2. NEVER say "Hello", "Hi", "Raj here", or re-introduce yourself under ANY circumstances after the first turn.
3. Never read property IDs, amenities scores, bathroom counts, or raw tables. Speak in natural flowing sentences.
4. Pitch ONLY one property naturally and end with a brief, engaging question (e.g., "I have a lovely one-bedroom in JLT for 1.2 million AED. Would you like to hear more about it?").
5. Note: Our listings are in Dubai only. If user asks about another city, acknowledge it briefly and suggest the closest Dubai option.
6. Dialog history:
{history_text}
"""
            
    else:
        # Loan Agent context memory merging
        # First, evaluate eligibility for current query
        loan_eval = evaluate_loan_eligibility(message)
        
        # Merge session profile details if present
        if loan_eval:
            CALL_SESSIONS["loan"]["user_profile"].update(loan_eval["user_profile"])
            
        session_profile = CALL_SESSIONS["loan"]["user_profile"]
        if session_profile:
            # Re-evaluate with merged attributes to maintain context across turns
            merged_query = f"Salary {session_profile.get('salary', '')} Age {session_profile.get('age', '')} Credit {session_profile.get('credit_score', '')} Liabilities {session_profile.get('liabilities', '')} Price {session_profile.get('property_price', '')} {message}"
            loan_eval = evaluate_loan_eligibility(merged_query)
            if loan_eval:
                CALL_SESSIONS["loan"]["user_profile"].update(loan_eval["user_profile"])
                
        loan_context = ""
        if loan_eval:
            response_payload["data"] = loan_eval
            calc = loan_eval["calculation"]
            profile = loan_eval["user_profile"]
            
            loan_context = f"""
Calculated Eligibility Profile:
- User Salary: AED {profile['salary']:,}
- Age: {profile['age']}
- Credit Score: {profile['credit_score']}
- Max Eligible Loan: AED {calc['max_eligible_loan']:,}
- Requested Property Price: AED {profile['property_price']:,}
- Min Down Payment Required (20%): AED {calc['required_down_payment']:,}
- Monthly EMI: AED {calc['monthly_emi']:,}
- Debt-To-Income (DTI) Ratio: {calc['dti_ratio']}%
- Decision: {calc['status']} (Note: In UAE, DTI must be <= 50% for loan approval)
"""
            if loan_eval["references"]:
                loan_context += "\nApproved historical benchmark profiles for reference:\n"
                for idx, ref in enumerate(loan_eval["references"]):
                    loan_context += f"{idx+1}. Customer {ref['Customer_ID']}: Age {ref['Age']}, Salary AED {ref['Monthly_Salary']:,}, Credit Score {ref['Credit_Score']}, EMI AED {ref['Monthly_EMI_AED']:,}\n"
        else:
            loan_context = "The user has not provided their salary or profile details yet. Ask them for their Monthly Salary, Age, Credit Score, and existing monthly liabilities to perform a mortgage assessment."
            
        # System Prompt
        if lang == "ar":
            greeting_rule = (
                "لقد تم الترحيب بالعميل والتعريف بنفسك مسبقاً. لا تعيد التعريف بنفسك أو تقولي 'أنا فارس' أو 'أهلاً بك' مجدداً. ناقش وضعه المالي أو تفاصيل القرض مباشرة."
                if is_greeted else
                "هذه بداية المكالمة. رحب بالعميل وعرّف بنفسك باسم فارس، مستشارك لقروض التمويل العقاري في دبي."
            )
            system_prompt = f"""
أنت فارس، مستشار تمويل وقروض عقارية خبير وودود في دبي. تحدث بلغة عربية طبيعية ولهجة خليجية مبسطة ومريحة للمكالمات الهاتفية.
{greeting_rule}

نتائج التحليل العقاري والمالي:
{loan_context}

التعليمات الهامة جداً للمحادثة الهاتفية:
1. تكلم باختصار شديد وبشكل طبيعي (أقل من 35 كلمة، جملة أو جملتين كحد أقصى!).
2. إذا كانت التفاصيل المالية ناقصة، اطلب الراتب الشهري بطريقة ودية وبسيطة دون تعقيد.
3. لا تقرأ أرقاماً طويلة أو نسب معقدة دفعة واحدة. اختصر واختم بسؤال جذاب وبسيط.
4. إذا كان كلام العميل مجرد تحية أو سؤال "من معي؟" دون التطرق للقروض والتمويل، أجب بلطف ومودة طبيعية دون طلب تفاصيل راتبه أو إجراء حسابات التمويل فوراً.
5. التاريخ والمحادثة السابقة:
{history_text}
"""
        else:
            greeting_rule = (
                "The initial greeting and introduction are ALREADY COMPLETE. You have introduced yourself. Do NOT say 'Hello! I am Faris' or greet again. Speak naturally as if the conversation is ongoing."
                if is_greeted else
                "This is the start of the call. Greet the user and introduce yourself as Faris, their Dubai mortgage advisor."
            )
            system_prompt = f"""
You are Faris, a friendly and reassuring mortgage specialist in Dubai. You are speaking on a live phone call.
{greeting_rule}

Loan/EMI Analysis context:
{loan_context}

CRITICAL RULES FOR NATURAL PHONE CONVERSATION:
1. Keep your response extremely short, conversational, and human-like (under 40 words, 1-2 sentences max!).
2. Do not recite long math formulas or dry lists of numbers. Explain the maximum eligible loan or ask for missing salary details in a friendly, helpful way.
3. Always end with a warm, natural question to keep the caller engaged.
4. If the user is only greeting you or asking who you are without mentioning loans or finance, respond naturally and politely WITHOUT immediately asking for their salary, credit score, or performing mortgage assessments.
5. Dialogue history:
{history_text}
"""

    gemini_instructions = f"""
{system_prompt}

You must return a JSON response containing three fields:
1. "response": The advisor's response text in {lang.upper()}.
2. "user_translation": Translate the user's input "{message}" into {opposite_lang.upper()}.
3. "response_translation": Translate the advisor's response text into {opposite_lang.upper()}.

Format your output exactly as a JSON object, e.g.:
{{
  "response": "...",
  "user_translation": "...",
  "response_translation": "..."
}}
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                {"role": "user", "parts": [{"text": gemini_instructions}]}
            ],
            config={
                "response_mime_type": "application/json"
            }
        )
        
        parsed = json.loads(response.text)
        response_payload["text"] = parsed.get("response", "")
        response_payload["translation"] = {
            "user_translated": parsed.get("user_translation", ""),
            "ai_translated": parsed.get("response_translation", "")
        }
        
        # Save structured log entries
        response_time_ms = int((time.time() - start_time) * 1000)
        save_call_log(agent, message, response_payload["text"], lang, response_time_ms)
        
    except Exception as e:
        print("Gemini Generation/JSON Parsing Error:", e)
        fallback_text = "Sorry, I am facing an issue. Please try again." if lang == "en" else "عذراً، أواجه مشكلة حالياً. أرجو المحاولة مجدداً."
        response_payload["text"] = fallback_text
        response_payload["translation"] = {
            "user_translated": message,
            "ai_translated": fallback_text
        }
            
    return jsonify(response_payload)


@app.route("/api/data", methods=["GET"])
def get_data():
    """
    Exposes raw spreadsheet records for database explorer default loading.
    """
    agent_type = request.args.get("agent", "real_estate")
    try:
        if agent_type == "real_estate":
            data_subset = df_properties.head(30).fillna("").to_dict(orient="records")
            formatted = []
            for row in data_subset:
                formatted.append({
                    "id": str(row.get('Property_ID', '')),
                    "area": str(row.get('Area', '')),
                    "type": str(row.get('Property_Type', '')),
                    "bedrooms": int(row.get('Bedrooms', 0)) if row.get('Bedrooms') != "" else 0,
                    "bathrooms": int(row.get('Bathrooms', 0)) if row.get('Bathrooms') != "" else 0,
                    "price": int(row.get('Price_AED', 0)) if row.get('Price_AED') != "" else 0,
                    "yield": float(row.get('Rental_Yield_%', 0)) if row.get('Rental_Yield_%') != "" else 0.0,
                    "metro": str(row.get('Metro_Access', '')),
                    "developer": str(row.get('Developer', ''))
                })
            return jsonify({"data": formatted})
        else:
            data_subset = df_loans.head(30).fillna("").to_dict(orient="records")
            formatted = []
            for row in data_subset:
                formatted.append({
                    "Customer_ID": str(row.get('Customer_ID', '')),
                    "Age": int(row.get('Age', 0)) if row.get('Age') != "" else 0,
                    "Nationality": str(row.get('Nationality', '')),
                    "Monthly_Salary": int(row.get('Monthly_Salary_AED', 0)) if row.get('Monthly_Salary_AED') != "" else 0,
                    "Credit_Score": int(row.get('Credit_Score', 0)) if row.get('Credit_Score') != "" else 0,
                    "Monthly_EMI_AED": int(row.get('Monthly_EMI_AED', 0)) if row.get('Monthly_EMI_AED') != "" else 0,
                    "Loan_Approved": str(row.get('Loan_Approved', ''))
                })
            return jsonify({"data": formatted})
    except Exception as e:
        print("Error serving spreadsheet rows:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/tts", methods=["POST", "GET"])
def tts():
    """
    Proxy text-to-speech requests to ElevenLabs API if key is provided.
    Supports GET (for native browser HTML5 audio element streaming) and POST.
    """
    default_voice = os.getenv("ELEVENLABS_VOICE_ID", "wJ5MX7uuKXZwFqGdWM4N")
    model_id = os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2")

    api_key = os.getenv("ELEVENLABS_API_KEY")

    if request.method == "GET":
        text = request.args.get("text", "")
        voice_id = request.args.get("voice_id") or default_voice
    else:
        data = request.json or {}
        text = data.get("text", "")
        voice_id = data.get("voice_id") or default_voice
    
    if not api_key:
        return jsonify({"error": "ElevenLabs API Key not found. Please set ELEVENLABS_API_KEY in the server's .env file."}), 400
        
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": api_key
    }
    
    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": {
            "stability": 0.75,
            "similarity_boost": 0.75
        }
    }
    
    try:
        res = requests.post(url, json=payload, headers=headers)
        
        print("=" * 60)
        print("ElevenLabs Status:", res.status_code)
        print("ElevenLabs Response:")
        print(res.text)
        print("=" * 60)

        if res.status_code == 200:
            return Response(
                res.content,
                mimetype="audio/mpeg",
                headers={
                    "Content-Length": str(len(res.content)),
                    "Accept-Ranges": "bytes"
                }
            )
        else:
            return jsonify({"error": f"ElevenLabs API Error: {res.text}"}), res.status_code
    except Exception as e:
        return jsonify({"error": f"Failed to connect to ElevenLabs: {str(e)}"}), 500


@app.route("/api/analyze-call", methods=["POST"])
def analyze_call():
    """
    Saves the complete conversation history of a call and applies Gemini
    to analyze/classify the client as a Legit Client or a Time Waster.
    Saves to completed_sessions.json.
    """
    data = request.json or {}
    agent_type = data.get("agent", "real_estate")
    duration = data.get("duration", 0)
    history = data.get("history", [])

    # Format transcript text
    transcript_lines = []
    for m in history:
        sender_label = "Agent (Raj)" if agent_type == "real_estate" else "Agent (Faris)"
        if m.get("sender") == "user":
            sender_label = "User"
        transcript_lines.append(f"{sender_label}: {m.get('text', '')}")
    transcript_text = "\n".join(transcript_lines)

    agent_name = "Raj (Dubai Real Estate Advisor)" if agent_type == "real_estate" else "Faris (Dubai Mortgage Specialist)"

    analysis_prompt = f"""
You are an expert sales manager, customer relationship manager, and lead qualification specialist for a premium Dubai real estate and mortgage consultancy.
Analyze the following phone conversation transcript between a real-estate/mortgage assistant ({agent_name}) and a caller.

Call Context:
- Agent Type: {agent_type}
- Call Duration: {duration} seconds

Conversation Transcript:
{transcript_text}

Analyze the user's intent and classify them into one of these categories:
- "Legit Client": The user shows serious interest. Signs include: mentioning a real budget (e.g. 1 million AED, 800k), specifying property types (apartment, villa, townhouse), asking about locations in Dubai (JLT, Downtown Dubai, Dubai Hills, etc.), responsive to questions, asking about mortgage options/yields, or seeking genuine help.
- "Time Waster": The user is playing around, testing the system instructions, making jokes, claiming unrealistic budgets (e.g. "1 dirham"), repeating the same greetings without any query, or refusing to interact.

Extract details:
- budget: The budget mentioned by the user (or "Not specified")
- location_preferences: List of areas in Dubai mentioned by the user
- property_type: Type of property they want (apartment, villa, townhouse, etc. or "Not specified")
- loan_viability: If mortgage agent, details on salary/viability. If real estate, details on whether they need a loan.

Return your response EXACTLY as a JSON object with this structure:
{{
  "classification": "Legit Client" | "Time Waster",
  "confidence_score": 0.0 to 1.0,
  "executive_summary": "A 1-2 sentence overview of the conversation and caller's intent.",
  "extracted_information": {{
    "budget": "...",
    "location_preferences": ["...", "..."],
    "property_type": "...",
    "loan_viability": "..."
  }},
  "suggested_next_steps": "A clear action item for the sales team."
}}
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                {"role": "user", "parts": [{"text": analysis_prompt}]}
            ],
            config={
                "response_mime_type": "application/json"
            }
        )
        
        analysis_result = json.loads(response.text)
    except Exception as e:
        print("[ANALYZE] Gemini/JSON error:", e)
        analysis_result = {
            "classification": "Legit Client" if len(history) > 3 else "Time Waster",
            "confidence_score": 0.5,
            "executive_summary": f"Could not perform LLM analysis due to error: {str(e)}",
            "extracted_information": {
                "budget": "Not specified",
                "location_preferences": [],
                "property_type": "Not specified",
                "loan_viability": "Not specified"
            },
            "suggested_next_steps": "Review transcript manually."
        }

    # Save to completed_sessions.json
    sessions_path = "/Users/fazal/Documents/team/backend/completed_sessions.json"
    session_entry = {
        "timestamp": datetime.datetime.now().isoformat(),
        "agent": agent_type,
        "duration_seconds": duration,
        "transcript": transcript_lines,
        "analysis": analysis_result
    }

    sessions = []
    if os.path.exists(sessions_path):
        try:
            with open(sessions_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    sessions = json.loads(content)
                    if not isinstance(sessions, list):
                        sessions = []
        except Exception as e:
            print("[ANALYZE] Error reading sessions file:", e)

    sessions.append(session_entry)

    try:
        with open(sessions_path, "w", encoding="utf-8") as f:
            json.dump(sessions, f, indent=2, ensure_ascii=False)
        print(f"[ANALYZE] Saved session to {sessions_path}")
    except Exception as e:
        print("[ANALYZE] Error saving session file:", e)

    return jsonify({
        "status": "success",
        "analysis": analysis_result
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    is_debug = "PORT" not in os.environ
    app.run(host="0.0.0.0", port=port, debug=is_debug)

