/**
 * Safely logs data without exposing sensitive information
 */
export const safeLog = (message: string, data?: any) => {
  if (!data) {
    console.log(message);
    return;
  }

  // Create safe version of data for logging
  const safeData = { ...data };
  if (typeof safeData === "object" && safeData !== null) {
    // Redact potential secret values
    if ("SecretString" in safeData) {
      safeData.SecretString = "[REDACTED]";
    }
  }

  console.log(
    message,
    typeof safeData === "object" ? JSON.stringify(safeData) : safeData
  );
};
