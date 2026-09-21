# Owner Authentication API Documentation (Web Frontend)

This guide provides everything the **Web Frontend Team** needs to implement both Standard Sign-up and Google Sign-in specifically for **Turf Owners**.

---

## 🚀 1. Google Client ID Setup (Web)

To use Google Sign-in on the web (e.g., React JS, Next.js, Vue, etc.), you must use the backend's Web Client ID.

> **Client ID to use in your frontend code:**
> `1090732856735-4mfrodeh15igjitpl7ha56uvmd31pa0h.apps.googleusercontent.com`

*Note: If you are using React on the web, we highly recommend the `@react-oauth/google` library.*

---

## 🔐 2. API Endpoints

All requests should be sent to your backend's base URL, for example: `http://YOUR_SERVER_IP:3000/auth`

### A. Google Sign-In (Initial Check)
Call this immediately after the owner clicks the Google Sign-in button on your website and you receive the `credential` (ID Token) from Google.

- **URL:** `POST /owner/google`
- **Body:**
  ```json
  {
    "idToken": "eyJhbGciOiJSUzI1NiIs..."
  }
  ```
- **Responses:**
  - **Scenario 1 (Owner already exists):** The backend logs them in and returns a token. Route the user to the Owner Dashboard.
    ```json
    { "success": true, "token": "JWT_TOKEN", "data": { ...owner_details } }
    ```
  - **Scenario 2 (New Owner):** The backend recognizes the email is new. It tells you to show a "Complete Profile" form.
    ```json
    { 
      "success": true, 
      "isNewUser": true, 
      "data": { 
        "email": "owner@gmail.com", 
        "name": "Owner Name", 
        "idToken": "eyJhbGciOiJ..." 
      } 
    }
    ```

---

### B. Google Sign-Up (Complete Profile Form)
When you receive the `isNewUser: true` response (Scenario 2 above), hide the Google button and show a form with the following fields:
- **Email:** Pre-fill this using `data.email` and make the input field `disabled` (unchangeable).
- **Name:** Pre-fill this using `data.name`, but keep it editable.
- **Business Name:** Empty text input (Required).
- **Phone:** Empty text input (Required).
- **Password:** Empty password input (Required).

Once the owner submits this form, send the data here:

- **URL:** `POST /owner/google-signup`
- **Body:**
  ```json
  {
    "idToken": "eyJhbGciOiJSUzI1NiIs...",
    "phone": "6299974422",
    "password": "SecurePassword123!",
    "business_name": "My Awesome Turf",
    "name": "Owner Name" 
  }
  ```
  *(Note: Send the `idToken` you saved from Step A instead of the email).*
- **Response:** The backend creates the account (skipping email verification) and logs them in.
  ```json
  { "success": true, "message": "Owner signed up with Google successfully", "token": "JWT_TOKEN" }
  ```

---

### C. Standard Manual Sign-up
Use this when the owner chooses to fill out your standard registration form manually, completely bypassing Google.

- **URL:** `POST /owner/signup`
- **Body:**
  ```json
  {
    "name": "Owner Name",
    "email": "owner@email.com",
    "password": "SecurePassword123!",
    "business_name": "My Awesome Turf",
    "phone": "6299974422"
  }
  ```
- **Response:** 
  - This endpoint will create an unverified account and trigger a 6-digit verification code to be sent to their email. 
  - You must route the user to an "Enter Verification Code" screen and use the `/verify-email` endpoint to complete their registration.
