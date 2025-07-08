# ZBD Pay Ramp Widget API Documentation

## Overview

The ZBD Pay Ramp Widget API provides endpoints for integrating ZBD's Bitcoin onramp widget functionality into the Wavlake platform. This allows users to purchase Bitcoin directly through the application.

## Base URL

All endpoints are prefixed with `/v1/ramp-widget`

## Authentication

All endpoints require user authentication via Firebase JWT token in the `Authorization` header:

```
Authorization: Bearer <firebase-jwt-token>
```

## Endpoints

### 1. Create Ramp Widget Session

**POST** `/v1/ramp-widget/session`

Creates a new ZBD Pay ramp widget session for the authenticated user.

#### Request Body

```json
{
  "email": "user@example.com",
  "amount": 100.0,
  "currency": "USD",
  "referenceId": "custom-reference-id"
}
```

#### Request Parameters

| Parameter   | Type   | Required | Description                                          |
| ----------- | ------ | -------- | ---------------------------------------------------- |
| email       | string | Yes      | User's email address (validated)                     |
| amount      | number | No       | Purchase amount in specified currency                |
| currency    | string | No       | Currency code (defaults to "USD")                    |
| referenceId | string | No       | Custom reference ID (auto-generated if not provided) |

#### Response (Success - 200)

```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "sessionToken": "zbd-session-token-here",
    "widgetUrl": "https://widget.zebedee.io/widget?token=...",
    "expiresAt": "2024-07-08T12:15:00Z"
  }
}
```

#### Response (Error - 400)

```json
{
  "success": false,
  "error": "Invalid email format",
  "code": "INVALID_EMAIL_FORMAT"
}
```

#### Response (Error - 500)

```json
{
  "success": false,
  "error": "Failed to create ramp widget session",
  "message": "Internal server error"
}
```

### 2. Get Ramp Widget Session Status

**GET** `/v1/ramp-widget/session/:sessionId`

Retrieves the current status of a ramp widget session.

#### URL Parameters

| Parameter | Type   | Required | Description                               |
| --------- | ------ | -------- | ----------------------------------------- |
| sessionId | string | Yes      | Session ID returned from session creation |

#### Response (Success - 200)

```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "widgetUrl": "https://widget.zebedee.io/widget?token=...",
    "expiresAt": "2024-07-08T12:15:00Z",
    "createdAt": "2024-07-08T12:00:00Z",
    "updatedAt": "2024-07-08T12:00:00Z"
  }
}
```

#### Session Status Values

| Status    | Description                              |
| --------- | ---------------------------------------- |
| pending   | Session created, waiting for user action |
| completed | Purchase completed successfully          |
| failed    | Purchase failed                          |
| expired   | Session expired (15 minutes timeout)     |

#### Response (Error - 404)

```json
{
  "success": false,
  "error": "Session not found",
  "code": "SESSION_NOT_FOUND"
}
```

### 3. ZBD Pay Webhook Callback

**POST** `/v1/ramp-widget/callback`

Handles webhook callbacks from ZBD Pay for purchase status updates.

**Note**: This endpoint is IP-restricted to ZBD production IPs only.

#### Request Body (from ZBD)

```json
{
  "reference_id": "user-123-session-456",
  "status": "completed",
  "amount": 100.0,
  "currency": "USD",
  "btc_amount": 0.0009234,
  "transaction_id": "zbd-tx-789",
  "metadata": {
    "userId": "user-123",
    "sessionId": "session-456",
    "amount": 100.0,
    "currency": "USD"
  }
}
```

#### Response (Success - 200)

```json
{
  "success": true,
  "message": "Callback processed successfully"
}
```

#### Response (Error - 400)

```json
{
  "success": false,
  "error": "Missing reference_id"
}
```

#### Response (Error - 404)

```json
{
  "success": false,
  "error": "Session not found"
}
```

## Database Schema

### RampWidgetSession Table

```sql
CREATE TABLE ramp_widget_session (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL,
  amount DOUBLE PRECISION,
  currency VARCHAR(10),
  reference_id VARCHAR(255) UNIQUE NOT NULL,
  session_token VARCHAR(255) NOT NULL,
  widget_url TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL,
  callback_data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES user(id)
);
```

### Indexes

- `idx_ramp_widget_session_user_id` on `user_id`
- `idx_ramp_widget_session_reference_id` on `reference_id`
- `idx_ramp_widget_session_status` on `status`

## Error Handling

### Common Error Codes

| Code                 | Description                      |
| -------------------- | -------------------------------- |
| INVALID_EMAIL        | Email is required                |
| INVALID_EMAIL_FORMAT | Invalid email format             |
| INVALID_AMOUNT       | Amount must be a positive number |
| MISSING_SESSION_ID   | Session ID is required           |
| SESSION_NOT_FOUND    | Session not found                |
| INTERNAL_ERROR       | Internal server error            |

### Security Features

- **IP Validation**: Webhook endpoint only accepts requests from ZBD production IPs
- **User Authorization**: Users can only access their own sessions
- **Input Validation**: All inputs are validated and sanitized
- **Session Expiration**: Sessions automatically expire after 15 minutes
- **Error Cleanup**: Failed sessions are automatically cleaned up

## Integration Example

### Frontend Implementation

```javascript
// Create a new ramp widget session
const createSession = async (email, amount = null) => {
  const response = await fetch("/v1/ramp-widget/session", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firebaseToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount,
      currency: "USD",
    }),
  });

  const data = await response.json();
  if (data.success) {
    // Open widget in WebView or iframe
    window.open(data.data.widgetUrl, "_blank");

    // Poll for session status
    pollSessionStatus(data.data.sessionId);
  }
};

// Poll session status
const pollSessionStatus = async (sessionId) => {
  const response = await fetch(`/v1/ramp-widget/session/${sessionId}`, {
    headers: {
      Authorization: `Bearer ${firebaseToken}`,
    },
  });

  const data = await response.json();
  if (data.success) {
    const { status } = data.data;

    if (status === "completed") {
      // Purchase completed
      showSuccessMessage();
    } else if (status === "failed" || status === "expired") {
      // Purchase failed or expired
      showErrorMessage();
    } else {
      // Still pending, continue polling
      setTimeout(() => pollSessionStatus(sessionId), 5000);
    }
  }
};
```

## Rate Limiting

- Session creation: Recommended to implement rate limiting per user
- Status checking: No rate limiting applied
- Webhooks: IP-restricted, no rate limiting needed

## Testing

- Development environment uses ZBD sandbox
- Webhook testing requires ngrok or similar tunneling service
- Use test email addresses for development

## Security Considerations

- All API keys stored server-side only
- Webhook signatures should be verified (if ZBD provides them)
- HTTPS required for all endpoints
- Session tokens are single-use and expire automatically
- Database cleanup handles failed or expired sessions
