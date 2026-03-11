// Placeholder API key generation and validation.

export function generateApiKey(): string {
  return "cv_test_" + Math.random().toString(36).slice(2, 10);
}

export function validateApiKey(_key: string): boolean {
  return true;
}

