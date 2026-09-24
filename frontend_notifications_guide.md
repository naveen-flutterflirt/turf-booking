# Frontend Implementation Guide: Community & Chat Notifications

This document outlines all the new and updated real-time Socket events and offline FCM Push Notifications that the frontend team needs to handle for the Community and Chat features.

---

## 1. Prerequisites (Crucial for Push Notifications)
For any offline push notifications to work, the frontend MUST send the device's FCM token to the backend when the user logs in or registers. 
- Ensure the `fcm_token` is successfully saved in the PostgreSQL `users` table for the active user. If this is `null`, background notifications will fail.

---

## 2. Real-Time Socket Connections
Users should join their personal notification room as soon as they log into the app, and join the chat room when they open a specific community chat.

```javascript
// Connect to the socket server
const socket = io('YOUR_BACKEND_URL');

// 1. Join Personal Notification Room (Do this immediately on login)
socket.emit('register_user', userId); 

// 2. Join a specific Chat Room (Do this when opening a community chat)
socket.emit('join_chat_room', { roomId, userId });
```

---

## 3. Handling Notifications (Event by Event)

### A. User Requests to Join a Community
When a user requests to join the host's community broadcast.

* **FCM Push Notification (Offline):**
  * **Title:** "New Join Request!"
  * **Body:** "[User Name] requested to join your community."
  * **Data Payload:** `{ type: 'new_join_request', broadcastId: '...', requestId: '...' }`

* **Socket Event (Real-time):**
  * **Event Name:** `'new_join_request'`
  * **Payload Received:** `{ broadcastId: 123, userId: 789, requesterName: 'John Doe', requestId: 10 }`
  > **Note:** The `requestId` is provided so you can immediately call the "Accept Request" API.

### B. Host Accepts a Request to Join
When the host accepts a user's request to join a community broadcast.

* **FCM Push Notification (Offline):**
  * **Title:** "Request Accepted!"
  * **Body:** "Your request to join the match was accepted."
  * **Data Payload:** `{ type: 'request_accepted', broadcastId: '...', roomId: '...' }`

* **Socket Event (Real-time):**
  * **Event Name:** `'request_accepted'`
  * **Payload Received:** `{ broadcastId: 123, roomId: 456 }`

### C. New Chat Message Added 
When someone sends a message in a community chat room.

* **FCM Push Notification (Offline):**
  * **Title:** "New Message"
  * **Body:** *[First 50 characters of the message]*
  * **Data Payload:** `{ type: 'chat_message', roomId: '...' }`

* **Socket Event (Real-time):**
  * **Event Name:** `'receive_message'`
  * **Payload Received:** 
    ```json
    {
      "id": 1,
      "room_id": 456,
      "sender_id": 789,
      "message": "Hello everyone!",
      "created_at": "2026-09-24T10:00:00Z",
      "sender_name": "John Doe" 
    }
    ```
    > **Note:** The `sender_name` is now immediately available in this payload, so you can display the user's name directly in the chat interface without refreshing the history!

### D. Community Group Name Changed
When the host updates the name of the community chat room.

* **FCM Push Notification (Offline):**
  * **Title:** "Group Name Changed"
  * **Body:** "A community group name was changed to 'New Name'."
  * **Data Payload:** `{ type: 'group_name_updated', roomId: '...' }`

* **Socket Event (Real-time):**
  * **Event Name:** `'group_name_updated'`
  * **Payload Received:** `{ roomId: 456, newName: 'New Name' }`

### E. User Removed from Community
When the host removes a specific member from the community.

* **FCM Push Notification (Offline):**
  * **Title:** "Removed from Community"
  * **Body:** "You have been removed from the community group by the host."
  * **Data Payload:** `{ type: 'removed_from_chat', broadcastId: '...' }`

* **Socket Event (Real-time):**
  * **Event Name:** `'removed_from_chat'`
  * **Payload Received:** `{ roomId: 456, broadcastId: 123 }`

### F. Community Deleted by Host
When the host deletes the entire community broadcast.

* **FCM Push Notification (Offline):**
  * **Title:** "Community Deleted"
  * **Body:** "A community you joined has been deleted by the host."
  * **Data Payload:** `{ type: 'community_deleted', broadcastId: '...' }`

* **Socket Event (Real-time):**
  * **Event Name:** `'community_deleted'`
  * **Payload Received:** `{ broadcastId: 123 }`

---

## 4. Sending a Chat Message (Frontend to Backend)
To send a message so that it instantly triggers the above real-time broadcast and push notifications, emit this event:

```javascript
socket.emit('send_message', { 
  roomId: 456, 
  senderId: 789, 
  message: "Hello everyone!" 
});
```
