// Simple API client configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
if (!API_BASE_URL) {
  console.warn("NEXT_PUBLIC_API_BASE_URL is not defined. Using default API base URL.");
}

// Basic fetch wrapper with error handling
export async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  if (!API_BASE_URL) {
    throw new Error("API_BASE_URL is not defined in environment variables");
  }

  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    // Create a more detailed error object
    const error = new Error(`API Error: ${response.status}`);
    (error as any).status = response.status;
    (error as any).url = url;
    throw error;
  }

  return response.json();
}
