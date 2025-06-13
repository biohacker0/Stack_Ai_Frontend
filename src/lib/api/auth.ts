import { apiRequest } from "./client";

// Get credentials from environment variables
const CREDENTIALS = {
  email: process.env.NEXT_PUBLIC_AUTH_EMAIL,
  password: process.env.NEXT_PUBLIC_AUTH_PASSWORD,
};

export async function login() {
  if (!CREDENTIALS.email || !CREDENTIALS.password) {
    throw new Error("Auth credentials are not defined in environment variables");
  }

  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify(CREDENTIALS),
  });
}

export async function checkAuthStatus() {
  return apiRequest("/auth/status");
}
