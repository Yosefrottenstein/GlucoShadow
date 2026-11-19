# Setting up your own Telnyx account (for emergency calls and cloud texts)

Telnyx charges your own account per text and call. GlucoShadow never pays. On Android, texts can instead go free from your SIM card, so Telnyx is then needed only for voice calls.

1. Create an account at telnyx.com and complete any identity verification it asks for. Add some balance (funds) to the account.
2. **Buy a phone number** (Numbers > Buy Numbers). Choose one that supports SMS and voice.
3. **Texts:** create a Messaging Profile (Messaging > Programmable Messaging) and assign your number to it.
   In the US, texts to other carriers also need 10DLC registration or toll-free verification, which takes an application and some waiting. Without it, messages can be blocked.
4. **Voice calls (optional):** create a TeXML Application (Voice > Programmable Voice) and assign your number to it. Copy the application's ID.
5. **API key:** create one in the portal (API Keys) and copy it right away.
6. In GlucoShadow open Settings > Emergency messages > **Telnyx account**. Enter the API key, your Telnyx number (with + and country code), and the application ID if you want calls. Save, then use the Test button.

Never share your API key with anyone. If you think it leaked, delete it in the portal and make a new one.
