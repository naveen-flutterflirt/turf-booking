# Authentication API Documentation

This document outlines the authentication flows for both **Customers** and **Owners** in the Turf Booking App. It covers both Standard (Manual) Sign-up and the new Google OAuth flow.

---

## 🛠️ Important Notes for Frontend Team

> [!IMPORTANT]  
> **Google OAuth Client ID**
> - When configuring your Google Sign-In library (like `@react-native-google-signin/google-signin`), you **must** pass the **Web Client ID** into the `webClientId` (or `serverClientId`) property. 
> - **Web Client ID:** `1090732856735-4mfrodeh15igjitpl7ha56uvmd31pa0h.apps.googleusercontent.com`
> - If you don't use this exact Web Client ID, the backend will reject the token!

> [!NOTE]
> All routes below should be prefixed with your backend URL (e.g., `http://YOUR_SERVER_IP:3000/auth/...`).

---

## 🧑‍💼 Customer Flows

### 1. Standard Manual Sign-up
Use this when the user fills out a registration form manually.
- **URL:** `POST /customer/signup`
- **Body:**
  ```json
  {
    "name": "Customer Name",
    "email": "customer@gmail.com", 
    "password": "customer123",
    "phone": "6299984431"
  }
  ```
- **Note:** This will trigger an email verification code to be sent to the user.

### 2. Google Sign-In (Initial Check)
Call this immediately after the user taps the Google button and you receive the `idToken`.
- **URL:** `POST /customer/google`
- **Body:**
  ```json
  {
    "idToken": "eyJhbGciOiJSUzI1NiIs..."
  }
  ```
- **Responses:**
  - **Scenario A (User already exists):** Returns a JWT token and logs them in.
    ```json
    { "success": true, "token": "JWT_TOKEN", "data": { ... } }
    ```
  - **Scenario B (New User):** Tells the frontend to show a "Complete Profile" screen.
    ```json
    { "success": true, "isNewUser": true, "data": { "email": "...", "name": "...", "idToken": "..." } }
    ```

### 3. Google Sign-Up (Complete Profile)
Call this after a *New User* (from Scenario B above) enters their phone number and password on the Complete Profile screen.
- **URL:** `POST /customer/google-signup`
- **Body:**
  ```json
  {
    "idToken": "eyJhbGciOiJSUzI1NiIs...",
    "phone": "6299984431",
    "password": "customer123",
    "name": "Customer Name" 
  }
  ```
- **Response:** Creates the account without requiring email verification and returns a JWT token.
  ```json
  { "success": true, "message": "Signed up with Google successfully", "token": "JWT_TOKEN" }
  ```

---

## 🏢 Owner Flows

### 1. Standard Manual Sign-up
Use this when the owner fills out a registration form manually.
- **URL:** `POST /owner/signup`
- **Body:**
  ```json
  {
    "name": "Owner Name",
    "email": "owner@gmail.com",
    "password": "owner123",
    "business_name": "owner-turfs",
    "phone": "6299974422"
  }
  ```
- **Note:** This will trigger an email verification code to be sent to the owner.

### 2. Google Sign-In (Initial Check)
Call this immediately after the owner taps the Google button and you receive the `idToken`.
- **URL:** `POST /owner/google`
- **Body:**
  ```json
  {
    "idToken": "eyJhbGciOiJSUzI1NiIs..."
  }
  ```
- **Responses:**
  - **Scenario A (User already exists):** Returns a JWT token and logs them in.
    ```json
    { "success": true, "token": "JWT_TOKEN", "data": { ... } }
    ```
  - **Scenario B (New User):** Tells the frontend to show a "Complete Profile" screen.
    ```json
    { "success": true, "isNewUser": true, "data": { "email": "...", "name": "...", "idToken": "..." } }
    ```

### 3. Google Sign-Up (Complete Profile)
Call this after a *New Owner* (from Scenario B above) enters their business name, phone number, and password on the Complete Profile screen.
- **URL:** `POST /owner/google-signup`
- **Body:**
  ```json
  {
    "idToken": "eyJhbGciOiJSUzI1NiIs...",
    "phone": "6299974422",
    "password": "owner123",
    "business_name": "owner-turfs",
    "name": "Owner Name" 
  }
  ```
- **Response:** Creates the account without requiring email verification and returns a JWT token.
  ```json
  { "success": true, "message": "Owner signed up with Google successfully", "token": "JWT_TOKEN" }
  ```
